const mongoose = require("mongoose");
const { ROLE_PERMISSIONS } = require("../auth/permissions");
const { resolveScopedResponsibilities } = require("../auth/scopedResponsibilities");
const Assessment = require("../models/Assessment");
const AssessmentResult = require("../models/AssessmentResult");
const AttendanceRecord = require("../models/AttendanceRecord");
const ClassLevel = require("../models/ClassLevel");
const Department = require("../models/Department");
const Enrollment = require("../models/Enrollment");
const Institution = require("../models/Institution");
const MemberProfile = require("../models/MemberProfile");
const Membership = require("../models/Membership");
const SchoolClass = require("../models/SchoolClass");
const Section = require("../models/Section");
const SectionSession = require("../models/SectionSession");
const Subject = require("../models/Subject");
const User = require("../models/User");
const universityAcademicOutcomeService = require("./universityAcademicOutcomeService");
const {
    resolveAcademicStanding,
    resolveAcademicStandingRules,
} = require("./universityAcademicStandingService");

const ACTIVE_MEMBERSHIP_STATUS = Membership.schema.path("status").defaultValue;
const ACTIVE_ENROLLMENT_STATUS = Enrollment.schema.path("status").defaultValue;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const DEFAULT_ATTENDANCE_POLICY_SUMMARY = Object.freeze({
    warnAfterAbsences: 3,
    dropAfterAbsences: 5,
    lateToAbsenceRatio: 3,
    excusedCountsAsAbsence: false,
});
const RISK_LEVELS = ["good", "warning", "high", "unknown"];

function createError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeId(value) {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed || null;
    }

    if (typeof value.toString === "function") {
        const normalized = value.toString().trim();
        return normalized || null;
    }

    return null;
}

function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeLowerString(value) {
    return normalizeString(value).toLowerCase();
}

function isValidObjectId(value) {
    const normalized = normalizeId(value);
    return Boolean(normalized) && mongoose.Types.ObjectId.isValid(normalized);
}

function validateObjectId(value, fieldName) {
    const normalized = normalizeId(value);
    if (!normalized || !isValidObjectId(normalized)) {
        throw createError(400, `${fieldName} is invalid`);
    }

    return normalized;
}

function parsePositiveInteger(rawValue, fallback, min, max) {
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < min) {
        return fallback;
    }

    return max !== undefined && parsed > max ? max : parsed;
}

function uniqueIds(values) {
    return [...new Set(values.map(normalizeId).filter(Boolean))];
}

function hasRolePermission(role, permission) {
    return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

function ensureActorMembership({ institutionId, actorUserId, actorMembership }) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (normalizeId(actorMembership.institutionId) !== normalizeId(institutionId)) {
        throw createError(403, "Institution access denied");
    }

    if (normalizeId(actorMembership.userId) !== normalizeId(actorUserId)) {
        throw createError(403, "Institution access denied");
    }

    if (actorMembership.status !== ACTIVE_MEMBERSHIP_STATUS) {
        throw createError(403, "Institution access denied");
    }
}

async function loadInstitution(institutionId) {
    const institution = await Institution.findOne({ _id: institutionId })
        .select("_id ownerUserId type policies")
        .lean();
    if (!institution) {
        throw createError(404, "Institution not found");
    }

    return institution;
}

async function loadActiveStudentMembershipIds(institutionId) {
    const memberships = await Membership.find({
        institutionId,
        role: "student",
        status: ACTIVE_MEMBERSHIP_STATUS,
    })
        .select("_id")
        .lean();

    return uniqueIds(memberships.map((membership) => membership._id));
}

async function loadActiveEnrollmentScope({ institutionId, sectionIds = null, studentMemberIds = null }) {
    const query = {
        institutionId,
        status: ACTIVE_ENROLLMENT_STATUS,
    };

    if (Array.isArray(sectionIds)) {
        if (!sectionIds.length) {
            return {
                studentMemberIds: [],
                sectionIds: [],
            };
        }
        query.sectionId = { $in: sectionIds };
    }

    if (Array.isArray(studentMemberIds)) {
        if (!studentMemberIds.length) {
            return {
                studentMemberIds: [],
                sectionIds: [],
            };
        }
        query.studentMemberId = { $in: studentMemberIds };
    }

    const enrollments = await Enrollment.find(query)
        .select("_id sectionId studentMemberId")
        .lean();

    return {
        studentMemberIds: uniqueIds(enrollments.map((enrollment) => enrollment.studentMemberId)),
        sectionIds: uniqueIds(enrollments.map((enrollment) => enrollment.sectionId)),
    };
}

async function loadActiveEnrollments({ institutionId, sectionIds = null, studentMemberIds = null }) {
    const query = {
        institutionId,
        status: ACTIVE_ENROLLMENT_STATUS,
    };

    if (Array.isArray(sectionIds)) {
        if (!sectionIds.length) {
            return [];
        }
        query.sectionId = { $in: sectionIds };
    }

    if (Array.isArray(studentMemberIds)) {
        if (!studentMemberIds.length) {
            return [];
        }
        query.studentMemberId = { $in: studentMemberIds };
    }

    return Enrollment.find(query)
        .select("_id sectionId studentMemberId")
        .lean();
}

async function deriveSectionScope({ institutionId, sectionIds, studentMemberIds = null }) {
    if (!sectionIds.length) {
        return {
            subjectIds: [],
            sectionIds: [],
            studentMemberIds: [],
            departmentIds: [],
            classLevelIds: [],
            schoolClassIds: [],
        };
    }

    const sections = await Section.find({
        institutionId,
        _id: { $in: sectionIds },
    })
        .select("_id subjectId schoolClassId")
        .lean();
    const tenantSectionIds = uniqueIds(sections.map((section) => section._id));
    const sectionSubjectIds = uniqueIds(sections.map((section) => section.subjectId));
    const rawSchoolClassIds = uniqueIds(sections.map((section) => section.schoolClassId));

    if (!tenantSectionIds.length) {
        return {
            subjectIds: [],
            sectionIds: [],
            studentMemberIds: [],
            departmentIds: [],
            classLevelIds: [],
            schoolClassIds: [],
        };
    }

    const [subjects, schoolClasses, enrollmentScope] = await Promise.all([
        sectionSubjectIds.length
            ? Subject.find({
                  institutionId,
                  _id: { $in: sectionSubjectIds },
              })
                  .select("_id departmentId classLevelId")
                  .lean()
            : [],
        rawSchoolClassIds.length
            ? SchoolClass.find({
                  institutionId,
                  _id: { $in: rawSchoolClassIds },
              })
                  .select("_id classLevelId")
                  .lean()
            : [],
        loadActiveEnrollmentScope({
            institutionId,
            sectionIds: tenantSectionIds,
            studentMemberIds,
        }),
    ]);

    return {
        subjectIds: uniqueIds(subjects.map((subject) => subject._id)),
        sectionIds: tenantSectionIds,
        studentMemberIds: enrollmentScope.studentMemberIds,
        departmentIds: uniqueIds(subjects.map((subject) => subject.departmentId)),
        classLevelIds: uniqueIds([
            ...subjects.map((subject) => subject.classLevelId),
            ...schoolClasses.map((schoolClass) => schoolClass.classLevelId),
        ]),
        schoolClassIds: uniqueIds(schoolClasses.map((schoolClass) => schoolClass._id)),
    };
}

async function deriveDepartmentScope({ institutionId, departmentIds }) {
    if (!departmentIds.length) {
        return {
            departmentIds: [],
            subjectIds: [],
            sectionIds: [],
            studentMemberIds: [],
        };
    }

    const departments = await Department.find({
        institutionId,
        _id: { $in: departmentIds },
    })
        .select("_id")
        .lean();
    const tenantDepartmentIds = uniqueIds(departments.map((department) => department._id));
    if (!tenantDepartmentIds.length) {
        return {
            departmentIds: [],
            subjectIds: [],
            sectionIds: [],
            studentMemberIds: [],
        };
    }

    const subjects = await Subject.find({
        institutionId,
        departmentId: { $in: tenantDepartmentIds },
    })
        .select("_id departmentId classLevelId")
        .lean();
    const subjectIds = uniqueIds(subjects.map((subject) => subject._id));

    const sections = subjectIds.length
        ? await Section.find({
              institutionId,
              subjectId: { $in: subjectIds },
          })
              .select("_id subjectId schoolClassId")
              .lean()
        : [];
    const sectionIds = uniqueIds(sections.map((section) => section._id));
    const enrollmentScope = await loadActiveEnrollmentScope({ institutionId, sectionIds });

    return {
        departmentIds: tenantDepartmentIds,
        subjectIds,
        sectionIds,
        studentMemberIds: enrollmentScope.studentMemberIds,
    };
}

async function deriveClassLevelScope({ institutionId, classLevelIds }) {
    if (!classLevelIds.length) {
        return {
            subjectIds: [],
            sectionIds: [],
            schoolClassIds: [],
            studentMemberIds: [],
            classLevelIds: [],
        };
    }

    const existingClassLevels = await ClassLevel.find({
        institutionId,
        _id: { $in: classLevelIds },
    })
        .select("_id")
        .lean();
    const tenantClassLevelIds = uniqueIds(existingClassLevels.map((classLevel) => classLevel._id));
    if (!tenantClassLevelIds.length) {
        return {
            subjectIds: [],
            sectionIds: [],
            schoolClassIds: [],
            studentMemberIds: [],
            classLevelIds: [],
        };
    }

    const [subjects, schoolClasses] = await Promise.all([
        Subject.find({
            institutionId,
            classLevelId: { $in: tenantClassLevelIds },
        })
            .select("_id classLevelId departmentId")
            .lean(),
        SchoolClass.find({
            institutionId,
            classLevelId: { $in: tenantClassLevelIds },
        })
            .select("_id classLevelId")
            .lean(),
    ]);

    const subjectIds = uniqueIds(subjects.map((subject) => subject._id));
    const schoolClassIds = uniqueIds(schoolClasses.map((schoolClass) => schoolClass._id));
    const sectionConditions = [];
    if (subjectIds.length) {
        sectionConditions.push({ subjectId: { $in: subjectIds } });
    }
    if (schoolClassIds.length) {
        sectionConditions.push({ schoolClassId: { $in: schoolClassIds } });
    }

    const sections = sectionConditions.length
        ? await Section.find({
              institutionId,
              $or: sectionConditions,
          })
              .select("_id subjectId schoolClassId")
              .lean()
        : [];
    const sectionIds = uniqueIds(sections.map((section) => section._id));
    const enrollmentScope = await loadActiveEnrollmentScope({ institutionId, sectionIds });

    return {
        subjectIds,
        sectionIds,
        schoolClassIds,
        studentMemberIds: enrollmentScope.studentMemberIds,
        classLevelIds: tenantClassLevelIds,
    };
}

function mergeScopes(scopes) {
    return {
        institutionWide: scopes.some((scope) => scope.institutionWide),
        studentMemberIds: uniqueIds(scopes.flatMap((scope) => scope.studentMemberIds || [])),
        sectionIds: uniqueIds(scopes.flatMap((scope) => scope.sectionIds || [])),
        subjectIds: uniqueIds(scopes.flatMap((scope) => scope.subjectIds || [])),
        departmentIds: uniqueIds(scopes.flatMap((scope) => scope.departmentIds || [])),
        classLevelIds: uniqueIds(scopes.flatMap((scope) => scope.classLevelIds || [])),
        schoolClassIds: uniqueIds(scopes.flatMap((scope) => scope.schoolClassIds || [])),
    };
}

async function resolveAcademicOversightStudentScope({
    institutionId,
    actorUserId,
    actorMembership,
    permission,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    ensureActorMembership({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });

    const institution = await loadInstitution(normalizedInstitutionId);
    const actorId = normalizeId(actorUserId);
    const isOwner = normalizeId(institution.ownerUserId) === actorId;
    const isAdmin = hasRolePermission(actorMembership.role, "membership.manage");

    if (isOwner || isAdmin) {
        const studentMemberIds = await loadActiveStudentMembershipIds(normalizedInstitutionId);
        const enrollmentScope = await loadActiveEnrollmentScope({
            institutionId: normalizedInstitutionId,
            studentMemberIds,
        });

        return {
            institution,
            scope: {
                institutionWide: true,
                studentMemberIds,
                sectionIds: enrollmentScope.sectionIds,
                subjectIds: [],
                departmentIds: [],
                classLevelIds: [],
                schoolClassIds: [],
            },
        };
    }

    if (actorMembership.role === "student") {
        throw createError(403, "Permission denied");
    }

    const assignments = await resolveScopedResponsibilities({
        institutionId: normalizedInstitutionId,
        userId: actorId,
        responsibilityTypes: ["head"],
        scopeTypes: ["institution", "department", "classLevel"],
        permission,
    });

    if (!assignments.length) {
        throw createError(403, "Permission denied");
    }

    const scopes = [];
    const validInstitutionAssignment = assignments.some(
        (assignment) =>
            assignment.scopeType === "institution" &&
            normalizeId(assignment.scopeId) === normalizedInstitutionId
    );

    if (validInstitutionAssignment) {
        const studentMemberIds = await loadActiveStudentMembershipIds(normalizedInstitutionId);
        const enrollmentScope = await loadActiveEnrollmentScope({
            institutionId: normalizedInstitutionId,
            studentMemberIds,
        });
        scopes.push({
            institutionWide: true,
            studentMemberIds,
            sectionIds: enrollmentScope.sectionIds,
        });
    }

    const departmentIds = uniqueIds(
        assignments
            .filter((assignment) => assignment.scopeType === "department")
            .map((assignment) => assignment.scopeId)
    );
    if (departmentIds.length) {
        const departmentScope = await deriveDepartmentScope({
            institutionId: normalizedInstitutionId,
            departmentIds,
        });
        scopes.push({
            ...departmentScope,
        });
    }

    const classLevelIds = uniqueIds(
        assignments
            .filter((assignment) => assignment.scopeType === "classLevel")
            .map((assignment) => assignment.scopeId)
    );
    if (classLevelIds.length) {
        const classLevelScope = await deriveClassLevelScope({
            institutionId: normalizedInstitutionId,
            classLevelIds,
        });
        scopes.push({
            ...classLevelScope,
        });
    }

    const scope = mergeScopes(scopes);
    if (!scope.institutionWide && !scope.studentMemberIds.length) {
        return {
            institution,
            scope,
        };
    }

    return {
        institution,
        scope,
    };
}

function normalizeAttendancePolicyThreshold(value, defaultValue) {
    return Number.isInteger(value) && value >= 0 ? value : defaultValue;
}

function normalizeAttendanceLateToAbsenceRatio(value) {
    return Number.isInteger(value) && value >= 1
        ? value
        : DEFAULT_ATTENDANCE_POLICY_SUMMARY.lateToAbsenceRatio;
}

function resolveAttendancePolicySummary(policies = {}) {
    const source = policies && typeof policies === "object" && !Array.isArray(policies) ? policies : {};

    return {
        warnAfterAbsences: normalizeAttendancePolicyThreshold(
            source.warnAfterAbsences,
            DEFAULT_ATTENDANCE_POLICY_SUMMARY.warnAfterAbsences
        ),
        dropAfterAbsences: normalizeAttendancePolicyThreshold(
            source.dropAfterAbsences,
            DEFAULT_ATTENDANCE_POLICY_SUMMARY.dropAfterAbsences
        ),
        lateToAbsenceRatio: normalizeAttendanceLateToAbsenceRatio(source.lateToAbsenceRatio),
        excusedCountsAsAbsence:
            typeof source.excusedCountsAsAbsence === "boolean"
                ? source.excusedCountsAsAbsence
                : DEFAULT_ATTENDANCE_POLICY_SUMMARY.excusedCountsAsAbsence,
    };
}

function createAttendanceMetrics() {
    return {
        presentCount: 0,
        absentCount: 0,
        lateCount: 0,
        excusedCount: 0,
        totalCount: 0,
    };
}

function appendAttendanceStatus(metrics, status) {
    metrics.totalCount += 1;
    if (status === "present") {
        metrics.presentCount += 1;
    } else if (status === "absent") {
        metrics.absentCount += 1;
    } else if (status === "late") {
        metrics.lateCount += 1;
    } else if (status === "excused") {
        metrics.excusedCount += 1;
    }
}

function buildAttendanceRisk(metrics, attendancePolicySummary) {
    const lateAbsenceEquivalent = Math.floor(metrics.lateCount / attendancePolicySummary.lateToAbsenceRatio);
    const effectiveAbsences =
        metrics.absentCount +
        lateAbsenceEquivalent +
        (attendancePolicySummary.excusedCountsAsAbsence ? metrics.excusedCount : 0);

    const reasons = [];
    let level = "good";
    if (metrics.totalCount === 0) {
        level = "unknown";
        reasons.push("no_closed_attendance_records");
    }

    if (attendancePolicySummary.dropAfterAbsences > 0 && effectiveAbsences >= attendancePolicySummary.dropAfterAbsences) {
        level = "high";
        reasons.push("attendance_drop_risk_threshold_reached");
    } else if (
        attendancePolicySummary.warnAfterAbsences > 0 &&
        effectiveAbsences >= attendancePolicySummary.warnAfterAbsences
    ) {
        level = "warning";
        reasons.push("attendance_warning_threshold_reached");
    }

    return {
        level,
        absences: metrics.absentCount,
        lateCount: metrics.lateCount,
        excusedCount: metrics.excusedCount,
        effectiveAbsences,
        threshold: {
            warnAfterAbsences: attendancePolicySummary.warnAfterAbsences,
            dropAfterAbsences: attendancePolicySummary.dropAfterAbsences,
            lateToAbsenceRatio: attendancePolicySummary.lateToAbsenceRatio,
            excusedCountsAsAbsence: attendancePolicySummary.excusedCountsAsAbsence,
        },
        reasons,
    };
}

function createGradeAccumulator() {
    return {
        earnedWeightedScore: 0,
        applicableWeightTotal: 0,
        missingResults: 0,
        failedAssessments: 0,
        invalidAssessments: 0,
        assessmentCount: 0,
    };
}

function buildGradeRisk(accumulator) {
    const reasons = [];
    let currentAverage = null;
    if (accumulator.applicableWeightTotal > 0) {
        currentAverage = Math.round((accumulator.earnedWeightedScore / accumulator.applicableWeightTotal) * 10000) / 100;
    }

    if (accumulator.assessmentCount === 0) {
        reasons.push("no_published_assessments");
    }

    if (accumulator.missingResults > 0) {
        reasons.push("missing_published_assessment_results");
    }

    if (accumulator.failedAssessments > 0) {
        reasons.push("failed_published_assessments");
    }

    if (accumulator.invalidAssessments > 0) {
        reasons.push("invalid_published_assessment_configuration");
    }

    let level = "unknown";
    if (currentAverage !== null || accumulator.missingResults > 0 || accumulator.failedAssessments > 0) {
        level = "good";
        if (accumulator.missingResults > 0 || accumulator.failedAssessments > 0 || (currentAverage !== null && currentAverage < 60)) {
            level = "high";
        } else if (currentAverage !== null && currentAverage < 70) {
            level = "warning";
        }
    }

    return {
        level,
        currentAverage,
        missingResults: accumulator.missingResults,
        failedAssessments: accumulator.failedAssessments,
        reasons,
    };
}

function combineRiskLevel({ attendanceRisk, gradeRisk, academicStanding }) {
    if (
        attendanceRisk.level === "high" ||
        gradeRisk.level === "high" ||
        ["suspension", "review_required"].includes(academicStanding?.standing)
    ) {
        return "high";
    }

    if (
        attendanceRisk.level === "warning" ||
        gradeRisk.level === "warning" ||
        ["academic_warning", "probation"].includes(academicStanding?.standing)
    ) {
        return "warning";
    }

    if (
        attendanceRisk.level === "unknown" ||
        gradeRisk.level === "unknown" ||
        academicStanding?.dataUnavailable ||
        (academicStanding && !academicStanding.standing)
    ) {
        return "unknown";
    }

    return "good";
}

async function applyTrustedQueryFilters({ institutionId, scope, query = {} }) {
    const intersectIds = (left, right) => {
        const rightSet = new Set(right);
        return left.filter((value) => rightSet.has(value));
    };
    const intersectScope = (currentScope, filterScope) => {
        const mergeDimension = (fieldName) => {
            const currentValues = currentScope[fieldName] || [];
            const filterValues = filterScope[fieldName] || [];

            if (currentScope.institutionWide && !currentValues.length) {
                return filterValues;
            }

            return intersectIds(currentValues, filterValues);
        };

        const nextScope = {
            institutionWide: currentScope.institutionWide && filterScope.institutionWide,
            studentMemberIds: intersectIds(
                currentScope.studentMemberIds || [],
                filterScope.studentMemberIds || []
            ),
            sectionIds: mergeDimension("sectionIds"),
            subjectIds: mergeDimension("subjectIds"),
            departmentIds: mergeDimension("departmentIds"),
            classLevelIds: mergeDimension("classLevelIds"),
            schoolClassIds: mergeDimension("schoolClassIds"),
        };

        const requiresSharedSection = (filterScope.sectionIds || []).length > 0;

        if (requiresSharedSection && !nextScope.sectionIds.length) {
            nextScope.studentMemberIds = [];
        }

        return nextScope;
    };

    let filteredScope = scope;
    let hasFilter = false;

    if (normalizeString(query.departmentId)) {
        const departmentId = validateObjectId(query.departmentId, "departmentId");
        const departmentScope = await deriveDepartmentScope({
            institutionId,
            departmentIds: [departmentId],
        });
        filteredScope = intersectScope(filteredScope, {
            institutionWide: false,
            ...departmentScope,
        });
        hasFilter = true;
    }

    if (normalizeString(query.classLevelId)) {
        const classLevelId = validateObjectId(query.classLevelId, "classLevelId");
        const classLevelScope = await deriveClassLevelScope({
            institutionId,
            classLevelIds: [classLevelId],
        });
        filteredScope = intersectScope(filteredScope, {
            institutionWide: false,
            ...classLevelScope,
        });
        hasFilter = true;
    }

    if (normalizeString(query.sectionId)) {
        const sectionId = validateObjectId(query.sectionId, "sectionId");
        const sectionScope = await deriveSectionScope({
            institutionId,
            sectionIds: [sectionId],
        });
        filteredScope = intersectScope(filteredScope, {
            institutionWide: false,
            ...sectionScope,
        });
        hasFilter = true;
    }

    if (normalizeString(query.studentMemberId)) {
        const studentMemberId = validateObjectId(query.studentMemberId, "studentMemberId");
        const membership = await Membership.findOne({
            _id: studentMemberId,
            institutionId,
            role: "student",
            status: ACTIVE_MEMBERSHIP_STATUS,
        })
            .select("_id")
            .lean();
        if (!membership) {
            filteredScope = intersectScope(filteredScope, {
                institutionWide: false,
                studentMemberIds: [],
                sectionIds: [],
                subjectIds: [],
                departmentIds: [],
                classLevelIds: [],
                schoolClassIds: [],
            });
        } else {
            const enrollmentScope = await loadActiveEnrollmentScope({
                institutionId,
                studentMemberIds: [studentMemberId],
            });
            const sectionScope = await deriveSectionScope({
                institutionId,
                sectionIds: enrollmentScope.sectionIds,
                studentMemberIds: [studentMemberId],
            });
            filteredScope = intersectScope(filteredScope, {
                institutionWide: false,
                ...sectionScope,
                studentMemberIds: [studentMemberId],
            });
        }
        hasFilter = true;
    }

    return hasFilter ? filteredScope : scope;
}

function validateListQuery(query = {}) {
    const riskLevel = normalizeLowerString(query.riskLevel);
    if (riskLevel && !RISK_LEVELS.includes(riskLevel)) {
        throw createError(400, `riskLevel must be one of: ${RISK_LEVELS.join(", ")}`);
    }

    return {
        search: normalizeLowerString(query.search),
        riskLevel: riskLevel || null,
        standing: normalizeLowerString(query.standing) || null,
        page: parsePositiveInteger(query.page, DEFAULT_PAGE, 1),
        limit: parsePositiveInteger(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
    };
}

function studentMatchesSearch(student, search) {
    if (!search) {
        return true;
    }

    const haystack = [
        student.profile?.fullName,
        student.profile?.fullNameNormalized,
        student.user?.email,
        normalizeId(student.membership._id),
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return haystack.includes(search);
}

async function loadStudents({ institutionId, studentMemberIds, search }) {
    if (!studentMemberIds.length) {
        return [];
    }

    const memberships = await Membership.find({
        _id: { $in: studentMemberIds },
        institutionId,
        role: "student",
        status: ACTIVE_MEMBERSHIP_STATUS,
    })
        .select("_id institutionId userId role status joinedAt")
        .lean();

    if (!memberships.length) {
        return [];
    }

    const [profiles, users] = await Promise.all([
        MemberProfile.find({
            institutionId,
            membershipId: { $in: memberships.map((membership) => membership._id) },
        })
            .select("_id membershipId userId fullName fullNameNormalized firstName lastName profilePictureUrl")
            .lean(),
        User.find({
            _id: { $in: memberships.map((membership) => membership.userId) },
        })
            .select("_id email status")
            .lean(),
    ]);

    const profileByMembershipId = new Map(
        profiles.map((profile) => [normalizeId(profile.membershipId), profile])
    );
    const userById = new Map(users.map((user) => [normalizeId(user._id), user]));

    return memberships
        .map((membership) => ({
            membership,
            profile: profileByMembershipId.get(normalizeId(membership._id)) || null,
            user: userById.get(normalizeId(membership.userId)) || null,
        }))
        .filter((student) => studentMatchesSearch(student, search));
}

async function loadAttendanceRiskByStudent({ institutionId, studentMemberIds, sectionIds, attendancePolicySummary }) {
    const metricsByStudentId = new Map(
        studentMemberIds.map((studentMemberId) => [studentMemberId, createAttendanceMetrics()])
    );
    if (!studentMemberIds.length || !sectionIds.length) {
        return new Map(
            studentMemberIds.map((studentMemberId) => [
                studentMemberId,
                buildAttendanceRisk(metricsByStudentId.get(studentMemberId), attendancePolicySummary),
            ])
        );
    }

    const activeEnrollments = await loadActiveEnrollments({
        institutionId,
        sectionIds,
        studentMemberIds,
    });
    const enrolledSectionIdsByStudentId = new Map(
        studentMemberIds.map((studentMemberId) => [studentMemberId, new Set()])
    );
    for (const enrollment of activeEnrollments) {
        const studentMemberId = normalizeId(enrollment.studentMemberId);
        const sectionId = normalizeId(enrollment.sectionId);
        if (!studentMemberId || !sectionId) {
            continue;
        }
        if (!enrolledSectionIdsByStudentId.has(studentMemberId)) {
            enrolledSectionIdsByStudentId.set(studentMemberId, new Set());
        }
        enrolledSectionIdsByStudentId.get(studentMemberId).add(sectionId);
    }
    const enrolledSectionIds = uniqueIds(activeEnrollments.map((enrollment) => enrollment.sectionId));
    if (!enrolledSectionIds.length) {
        return new Map(
            studentMemberIds.map((studentMemberId) => [
                studentMemberId,
                buildAttendanceRisk(metricsByStudentId.get(studentMemberId), attendancePolicySummary),
            ])
        );
    }

    const sessions = await SectionSession.find({
        institutionId,
        sectionId: { $in: enrolledSectionIds },
        status: { $ne: "cancelled" },
        attendanceState: "closed",
    })
        .select("_id")
        .lean();
    const sessionIds = uniqueIds(sessions.map((session) => session._id));
    if (sessionIds.length) {
        const records = await AttendanceRecord.find({
            institutionId,
            sectionId: { $in: enrolledSectionIds },
            sectionSessionId: { $in: sessionIds },
            studentMemberId: { $in: studentMemberIds },
        })
            .select("_id sectionId studentMemberId attendanceStatus")
            .lean();

        for (const record of records) {
            const studentMemberId = normalizeId(record.studentMemberId);
            const sectionId = normalizeId(record.sectionId);
            if (!enrolledSectionIdsByStudentId.get(studentMemberId)?.has(sectionId)) {
                continue;
            }
            if (!metricsByStudentId.has(studentMemberId)) {
                metricsByStudentId.set(studentMemberId, createAttendanceMetrics());
            }
            appendAttendanceStatus(metricsByStudentId.get(studentMemberId), record.attendanceStatus);
        }
    }

    return new Map(
        studentMemberIds.map((studentMemberId) => [
            studentMemberId,
            buildAttendanceRisk(metricsByStudentId.get(studentMemberId) || createAttendanceMetrics(), attendancePolicySummary),
        ])
    );
}

async function loadGradeRiskByStudent({ institutionId, studentMemberIds, sectionIds }) {
    const accumulatorsByStudentId = new Map(
        studentMemberIds.map((studentMemberId) => [studentMemberId, createGradeAccumulator()])
    );
    if (!studentMemberIds.length || !sectionIds.length) {
        return new Map(
            studentMemberIds.map((studentMemberId) => [
                studentMemberId,
                buildGradeRisk(accumulatorsByStudentId.get(studentMemberId)),
            ])
        );
    }

    const activeEnrollments = await loadActiveEnrollments({
        institutionId,
        sectionIds,
        studentMemberIds,
    });
    const enrolledSectionIdsByStudentId = new Map(
        studentMemberIds.map((studentMemberId) => [studentMemberId, new Set()])
    );
    for (const enrollment of activeEnrollments) {
        const studentMemberId = normalizeId(enrollment.studentMemberId);
        const sectionId = normalizeId(enrollment.sectionId);
        if (!studentMemberId || !sectionId) {
            continue;
        }
        if (!enrolledSectionIdsByStudentId.has(studentMemberId)) {
            enrolledSectionIdsByStudentId.set(studentMemberId, new Set());
        }
        enrolledSectionIdsByStudentId.get(studentMemberId).add(sectionId);
    }
    const enrolledSectionIds = uniqueIds(activeEnrollments.map((enrollment) => enrollment.sectionId));
    if (!enrolledSectionIds.length) {
        return new Map(
            studentMemberIds.map((studentMemberId) => [
                studentMemberId,
                buildGradeRisk(accumulatorsByStudentId.get(studentMemberId)),
            ])
        );
    }

    const assessments = await Assessment.find({
        institutionId,
        sectionId: { $in: enrolledSectionIds },
        status: "published",
    })
        .select("_id sectionId maxScore weight")
        .lean();
    if (!assessments.length) {
        return new Map(
            studentMemberIds.map((studentMemberId) => [
                studentMemberId,
                buildGradeRisk(accumulatorsByStudentId.get(studentMemberId)),
            ])
        );
    }

    const results = await AssessmentResult.find({
        institutionId,
        sectionId: { $in: enrolledSectionIds },
        assessmentId: { $in: assessments.map((assessment) => assessment._id) },
        studentMemberId: { $in: studentMemberIds },
    })
        .select("_id assessmentId studentMemberId score")
        .lean();
    const resultByAssessmentAndStudent = new Map(
        results.map((result) => [
            `${normalizeId(result.assessmentId)}:${normalizeId(result.studentMemberId)}`,
            result,
        ])
    );

    for (const studentMemberId of studentMemberIds) {
        const accumulator = accumulatorsByStudentId.get(studentMemberId) || createGradeAccumulator();
        const enrolledSectionIdsForStudent = enrolledSectionIdsByStudentId.get(studentMemberId) || new Set();
        for (const assessment of assessments) {
            if (!enrolledSectionIdsForStudent.has(normalizeId(assessment.sectionId))) {
                continue;
            }

            accumulator.assessmentCount += 1;
            const maxScore = Number(assessment.maxScore);
            const weight = Number(assessment.weight);
            if (!Number.isFinite(maxScore) || maxScore <= 0 || !Number.isFinite(weight) || weight <= 0) {
                accumulator.invalidAssessments += 1;
                continue;
            }

            const result = resultByAssessmentAndStudent.get(`${normalizeId(assessment._id)}:${studentMemberId}`);
            const score = Number(result?.score);
            if (!result || !Number.isFinite(score)) {
                accumulator.missingResults += 1;
                continue;
            }

            const percentage = score / maxScore;
            accumulator.earnedWeightedScore += percentage * weight;
            accumulator.applicableWeightTotal += weight;
            if (percentage < 0.6) {
                accumulator.failedAssessments += 1;
            }
        }
    }

    return new Map(
        studentMemberIds.map((studentMemberId) => [
            studentMemberId,
            buildGradeRisk(accumulatorsByStudentId.get(studentMemberId) || createGradeAccumulator()),
        ])
    );
}

function buildCompactAcademicStanding(standing, { dataUnavailable = false } = {}) {
    if (!standing) {
        return {
            standing: null,
            requiresReview: false,
            reason: null,
            dataUnavailable,
        };
    }

    return {
        standing: standing.standing || null,
        requiresReview: Boolean(standing.requiresAdvisorReview),
        reason: Array.isArray(standing.reasonCodes) ? standing.reasonCodes[0] || null : null,
        dataUnavailable,
    };
}

async function buildStandingAndProfile({ institution, institutionId, studentMemberId, membership }) {
    if (institution.type !== "university") {
        return {
            academicStanding: buildCompactAcademicStanding(null),
            academicProfile: {
                program: null,
                department: null,
                classLevel: null,
                gpa: null,
                credits: null,
                status: membership.status,
                dataUnavailable: false,
            },
        };
    }

    try {
        const outcomeResult = await universityAcademicOutcomeService.listStudentAcademicOutcomes({
            institutionId,
            studentMemberId,
        });
        const standing = resolveAcademicStanding({
            academicStandingRules: resolveAcademicStandingRules(outcomeResult),
            summary: outcomeResult.summary || {},
            outcomes: outcomeResult.outcomes || [],
            excluded: outcomeResult.excluded || [],
            warnings: outcomeResult.warnings || [],
        });

        return {
            academicStanding: buildCompactAcademicStanding(standing),
            academicProfile: {
                program: null,
                department: null,
                classLevel: null,
                gpa: outcomeResult.summary?.cumulativeGpa ?? null,
                credits: {
                    earned: outcomeResult.summary?.totalEarnedCreditHours ?? null,
                    attempted: outcomeResult.summary?.totalAttemptedCreditHours ?? null,
                },
                status: membership.status,
                dataUnavailable: false,
            },
        };
    } catch (_error) {
        // TODO/verify: route this to a shared internal logger if/when the repo adds one.
        return {
            academicStanding: buildCompactAcademicStanding(null, { dataUnavailable: true }),
            academicProfile: {
                program: null,
                department: null,
                classLevel: null,
                gpa: null,
                credits: null,
                status: membership.status,
                dataUnavailable: true,
            },
        };
    }
}

async function buildStudentRows({
    institution,
    institutionId,
    scope,
    queryFilters,
    includeAcademicProfile = false,
    includeAcademicStanding = false,
    useAcademicStandingForRisk = false,
}) {
    const students = await loadStudents({
        institutionId,
        studentMemberIds: scope.studentMemberIds,
        search: queryFilters.search,
    });
    const studentMemberIds = students.map((student) => normalizeId(student.membership._id));
    const attendancePolicySummary = resolveAttendancePolicySummary(institution.policies || {});
    const [attendanceRiskByStudentId, gradeRiskByStudentId] = await Promise.all([
        loadAttendanceRiskByStudent({
            institutionId,
            studentMemberIds,
            sectionIds: scope.sectionIds,
            attendancePolicySummary,
        }),
        loadGradeRiskByStudent({
            institutionId,
            studentMemberIds,
            sectionIds: scope.sectionIds,
        }),
    ]);

    const rows = [];
    for (const student of students) {
        const studentMemberId = normalizeId(student.membership._id);
        const shouldLoadAcademicData =
            includeAcademicProfile || includeAcademicStanding || useAcademicStandingForRisk || queryFilters.standing;
        const academicData = shouldLoadAcademicData
            ? await buildStandingAndProfile({
                  institution,
                  institutionId,
                  studentMemberId,
                  membership: student.membership,
              })
            : {
                  academicStanding: null,
                  academicProfile: null,
              };
        const attendanceRisk = attendanceRiskByStudentId.get(studentMemberId) || buildAttendanceRisk(
            createAttendanceMetrics(),
            attendancePolicySummary
        );
        const gradeRisk = gradeRiskByStudentId.get(studentMemberId) || buildGradeRisk(createGradeAccumulator());
        const riskLevel = combineRiskLevel({
            attendanceRisk,
            gradeRisk,
            academicStanding: useAcademicStandingForRisk ? academicData.academicStanding : null,
        });

        const row = {
            student: {
                id: studentMemberId,
                userId: normalizeId(student.membership.userId),
                name: student.profile?.fullName || null,
                email: student.user?.email || null,
            },
            riskLevel,
            attendanceRisk,
            gradeRisk,
            reasons: uniqueIds([
                ...attendanceRisk.reasons,
                ...gradeRisk.reasons,
                useAcademicStandingForRisk ? academicData.academicStanding?.reason : null,
            ]),
        };

        if (includeAcademicStanding) {
            row.academicStanding = academicData.academicStanding;
        }

        if (includeAcademicProfile) {
            row.academicProfile = academicData.academicProfile;
        }

        rows.push(row);
    }

    return rows
        .filter((row) => !queryFilters.riskLevel || row.riskLevel === queryFilters.riskLevel)
        .filter((row) => !queryFilters.standing || row.academicStanding?.standing === queryFilters.standing)
        .sort((left, right) => {
            const leftName = (left.student.name || left.student.email || left.student.id).toLowerCase();
            const rightName = (right.student.name || right.student.email || right.student.id).toLowerCase();
            return leftName.localeCompare(rightName) || left.student.id.localeCompare(right.student.id);
        });
}

function buildRiskSummary(rows) {
    const summary = {
        totalStudents: rows.length,
        riskLevels: {
            good: 0,
            warning: 0,
            high: 0,
            unknown: 0,
        },
        attendanceRisk: {
            good: 0,
            warning: 0,
            high: 0,
            unknown: 0,
        },
        gradeRisk: {
            good: 0,
            warning: 0,
            high: 0,
            unknown: 0,
        },
        standingSummary: {},
    };

    for (const row of rows) {
        if (Object.prototype.hasOwnProperty.call(summary.riskLevels, row.riskLevel)) {
            summary.riskLevels[row.riskLevel] += 1;
        }
        if (Object.prototype.hasOwnProperty.call(summary.attendanceRisk, row.attendanceRisk.level)) {
            summary.attendanceRisk[row.attendanceRisk.level] += 1;
        }
        if (Object.prototype.hasOwnProperty.call(summary.gradeRisk, row.gradeRisk.level)) {
            summary.gradeRisk[row.gradeRisk.level] += 1;
        }
        if (row.academicStanding) {
            const standing = row.academicStanding.standing || "none";
            summary.standingSummary[standing] = (summary.standingSummary[standing] || 0) + 1;
        }
    }

    return summary;
}

async function buildRowsForRequest({
    institutionId,
    actorUserId,
    actorMembership,
    permission,
    query = {},
    includeAcademicProfile = false,
    includeAcademicStanding = false,
    useAcademicStandingForRisk = false,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const { institution, scope } = await resolveAcademicOversightStudentScope({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
        permission,
    });
    const queryFilters = validateListQuery(query);
    if (queryFilters.standing && !includeAcademicStanding && !useAcademicStandingForRisk) {
        throw createError(403, "academicStanding.read_scope is required for standing filter");
    }
    const filteredScope = await applyTrustedQueryFilters({
        institutionId: normalizedInstitutionId,
        scope,
        query,
    });
    const rows = await buildStudentRows({
        institution,
        institutionId: normalizedInstitutionId,
        scope: filteredScope,
        queryFilters,
        includeAcademicProfile,
        includeAcademicStanding,
        useAcademicStandingForRisk,
    });

    return {
        institution,
        scope: filteredScope,
        rows,
        queryFilters,
    };
}

async function getAcademicOversightRiskSummary({
    institutionId,
    actorUserId,
    actorMembership,
    query = {},
}) {
    const { scope, rows } = await buildRowsForRequest({
        institutionId,
        actorUserId,
        actorMembership,
        permission: "academicRisk.read_scope",
        query,
    });

    return {
        academicRiskSummary: buildRiskSummary(rows),
        scope: {
            institutionWide: scope.institutionWide,
            studentCount: scope.studentMemberIds.length,
            sectionCount: scope.sectionIds.length,
        },
    };
}

async function listAcademicOversightStudents({
    institutionId,
    actorUserId,
    actorMembership,
    query = {},
}) {
    const { scope, rows, queryFilters } = await buildRowsForRequest({
        institutionId,
        actorUserId,
        actorMembership,
        permission: "academicRisk.read_scope",
        query,
    });

    const offset = (queryFilters.page - 1) * queryFilters.limit;
    const students = rows.slice(offset, offset + queryFilters.limit);

    return {
        students,
        academicRiskSummary: buildRiskSummary(rows),
        scope: {
            institutionWide: scope.institutionWide,
            studentCount: scope.studentMemberIds.length,
            sectionCount: scope.sectionIds.length,
        },
        pagination: {
            page: queryFilters.page,
            limit: queryFilters.limit,
            total: rows.length,
            totalPages: rows.length === 0 ? 0 : Math.ceil(rows.length / queryFilters.limit),
        },
    };
}

async function getAcademicOversightStudent({
    institutionId,
    studentMemberId,
    actorUserId,
    actorMembership,
    query = {},
}) {
    const normalizedStudentMemberId = validateObjectId(studentMemberId, "studentMemberId");
    const { scope, rows } = await buildRowsForRequest({
        institutionId,
        actorUserId,
        actorMembership,
        permission: "academicProfile.read_scope",
        query: {
            studentMemberId: normalizedStudentMemberId,
        },
        includeAcademicProfile: true,
    });

    if (!scope.studentMemberIds.includes(normalizedStudentMemberId)) {
        throw createError(403, "Student is outside academic oversight scope");
    }

    const student = rows.find((row) => row.student.id === normalizedStudentMemberId);
    if (!student) {
        throw createError(404, "Student not found");
    }

    return {
        student,
    };
}

async function getAcademicOversightStudentStanding({
    institutionId,
    studentMemberId,
    actorUserId,
    actorMembership,
    query = {},
}) {
    const normalizedStudentMemberId = validateObjectId(studentMemberId, "studentMemberId");
    const { scope, rows } = await buildRowsForRequest({
        institutionId,
        actorUserId,
        actorMembership,
        permission: "academicStanding.read_scope",
        query: {
            ...query,
            studentMemberId: normalizedStudentMemberId,
        },
        includeAcademicStanding: true,
        useAcademicStandingForRisk: true,
    });

    if (!scope.studentMemberIds.includes(normalizedStudentMemberId)) {
        throw createError(403, "Student is outside academic oversight scope");
    }

    const student = rows.find((row) => row.student.id === normalizedStudentMemberId);
    if (!student) {
        throw createError(404, "Student not found");
    }

    return {
        student,
    };
}

module.exports = {
    resolveAcademicOversightStudentScope,
    getAcademicOversightRiskSummary,
    listAcademicOversightStudents,
    getAcademicOversightStudent,
    getAcademicOversightStudentStanding,
    resolveAttendancePolicySummary,
};
