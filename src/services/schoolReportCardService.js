const mongoose = require("mongoose");
const ClassLevel = require("../models/ClassLevel");
const ClassStudentAssignment = require("../models/ClassStudentAssignment");
const MemberProfile = require("../models/MemberProfile");
const Membership = require("../models/Membership");
const SchoolAcademicPolicy = require("../models/SchoolAcademicPolicy");
const SchoolClass = require("../models/SchoolClass");
const Section = require("../models/Section");
const Semester = require("../models/Semester");
const Subject = require("../models/Subject");
const User = require("../models/User");
const { ROLE_PERMISSIONS } = require("../auth/permissions");
const schoolAcademicPolicyService = require("./schoolAcademicPolicyService");
const schoolOutcomeService = require("./schoolOutcomeService");
const schoolPromotionService = require("./schoolPromotionService");
const { ensureSchoolInstitution } = require("./classLevelService");

const SCHOOL_ACADEMIC_POLICY_SELECT_FIELDS =
    "_id institutionId name status appliesTo gradingRules aggregationRules failureRules promotionRules createdAt updatedAt";
const ACTIVE_CLASS_ASSIGNMENT_STATUS = ClassStudentAssignment.schema.path("status").defaultValue;
const ACTIVE_SUBJECT_STATUS = Subject.schema.path("status").defaultValue;
const REPORT_CARD_READ_PERMISSION = "class.manage";

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

function includesNormalizedId(values = [], value) {
    const normalizedValue = normalizeId(value);
    return values.map(normalizeId).includes(normalizedValue);
}

function buildBasicWarning({ code, message, details = {} }) {
    return {
        code,
        message,
        ...details,
    };
}

function hasRolePermission(role, permission) {
    return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

function ensureStaffReportAccess({ institutionId, actorUserId, actorMembership }) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    const actorInstitutionId = normalizeId(actorMembership.institutionId);
    if (!actorInstitutionId || actorInstitutionId !== normalizeId(institutionId)) {
        throw createError(403, "Institution access denied");
    }

    if (!hasRolePermission(actorMembership.role, REPORT_CARD_READ_PERMISSION)) {
        throw createError(403, "Permission denied");
    }
}

function calculateAverage(values = []) {
    const usableValues = values.filter((value) => Number.isFinite(value));
    if (!usableValues.length) {
        return null;
    }

    return usableValues.reduce((sum, value) => sum + value, 0) / usableValues.length;
}

function buildCompletionState(missingResults = []) {
    const hasMissingResults = missingResults.length > 0;
    return {
        hasMissingResults,
        complete: !hasMissingResults,
    };
}

function normalizePolicy(policy, resolutionLevel = null) {
    if (!policy) {
        return null;
    }

    return {
        id: normalizeId(policy.id || policy._id),
        name: policy.name,
        status: policy.status,
        resolutionLevel,
        appliesTo: {
            academicYearId: normalizeId(policy.appliesTo?.academicYearId),
            schoolStageId: normalizeId(policy.appliesTo?.schoolStageId),
            classLevelId: normalizeId(policy.appliesTo?.classLevelId),
        },
        gradingRules: policy.gradingRules,
        aggregationRules: {
            ...policy.aggregationRules,
            semesterWeights: (policy.aggregationRules?.semesterWeights || []).map((row) => ({
                semesterId: normalizeId(row.semesterId),
                weight: row.weight,
            })),
        },
        failureRules: {
            ...policy.failureRules,
            criticalSubjectRules: (policy.failureRules?.criticalSubjectRules || []).map((row) => ({
                subjectId: normalizeId(row.subjectId),
                failAction: row.failAction,
            })),
        },
        promotionRules: policy.promotionRules,
    };
}

function buildStudentSummary({ membership, profile, user }) {
    return {
        membershipId: normalizeId(membership?._id),
        fullName: profile?.fullName || null,
        email: user?.email || null,
        status: membership?.status || null,
    };
}

function buildClassLevelSummary(classLevel) {
    return {
        id: normalizeId(classLevel?._id),
        name: classLevel?.name || null,
        code: classLevel?.code || null,
    };
}

function buildSchoolClassSummary(schoolClass) {
    return {
        id: normalizeId(schoolClass?._id),
        name: schoolClass?.name || null,
        code: schoolClass?.code || null,
        classLevelId: normalizeId(schoolClass?.classLevelId),
    };
}

function buildSemesterSummary(semester) {
    return {
        id: normalizeId(semester?._id),
        name: semester?.name || null,
        startDate: semester?.startDate || null,
        endDate: semester?.endDate || null,
        status: semester?.status || null,
    };
}

function buildAcademicYearSummary(academicYearId) {
    return {
        id: normalizeId(academicYearId),
    };
}

function getPolicySemesterIds(policy) {
    return (policy?.aggregationRules?.semesterWeights || [])
        .map((row) => normalizeId(row.semesterId))
        .filter(Boolean);
}

function collectMissingResultsFromSubjects(subjects = []) {
    return subjects.flatMap((subject) => (Array.isArray(subject.missingResults) ? subject.missingResults : []));
}

async function loadStudentMaps({ institutionId, studentMembershipIds }) {
    const uniqueStudentMembershipIds = [...new Set(studentMembershipIds.map(normalizeId).filter(Boolean))];
    if (!uniqueStudentMembershipIds.length) {
        return {
            membershipById: new Map(),
            profileByMembershipId: new Map(),
            userById: new Map(),
        };
    }

    const [memberships, profiles] = await Promise.all([
        Membership.find({
            _id: { $in: uniqueStudentMembershipIds },
            institutionId,
            role: "student",
        })
            .select("_id userId role status")
            .lean(),
        MemberProfile.find({
            membershipId: { $in: uniqueStudentMembershipIds },
            institutionId,
        })
            .select("_id membershipId fullName")
            .lean(),
    ]);

    const membershipById = new Map(memberships.map((membership) => [normalizeId(membership._id), membership]));
    const profileByMembershipId = new Map(
        profiles.map((profile) => [normalizeId(profile.membershipId), profile])
    );
    const userIds = [...new Set(memberships.map((membership) => normalizeId(membership.userId)).filter(Boolean))];
    const users = userIds.length
        ? await User.find({
              _id: { $in: userIds },
          })
              .select("_id email")
              .lean()
        : [];
    const userById = new Map(users.map((user) => [normalizeId(user._id), user]));

    return {
        membershipById,
        profileByMembershipId,
        userById,
    };
}

async function loadStudentSummary({ institutionId, studentMembershipId }) {
    const { membershipById, profileByMembershipId, userById } = await loadStudentMaps({
        institutionId,
        studentMembershipIds: [studentMembershipId],
    });
    const membership = membershipById.get(normalizeId(studentMembershipId)) || null;
    if (!membership) {
        throw createError(404, "Student member not found");
    }

    const profile = profileByMembershipId.get(normalizeId(studentMembershipId)) || null;
    const user = membership.userId ? userById.get(normalizeId(membership.userId)) || null : null;
    return buildStudentSummary({ membership, profile, user });
}

async function loadSemester({ institutionId, semesterId }) {
    const semester = await Semester.findOne({
        _id: semesterId,
        institutionId,
    })
        .select("_id institutionId name startDate endDate status")
        .lean();

    if (!semester) {
        throw createError(404, "Semester not found");
    }

    return semester;
}

async function loadSchoolClass({ institutionId, schoolClassId }) {
    const schoolClass = await SchoolClass.findOne({
        _id: schoolClassId,
        institutionId,
    })
        .select("_id institutionId classLevelId name code status")
        .lean();

    if (!schoolClass) {
        throw createError(404, "Class not found");
    }

    return schoolClass;
}

async function loadClassLevel({ institutionId, classLevelId }) {
    const classLevel = await ClassLevel.findOne({
        _id: classLevelId,
        institutionId,
    })
        .select("_id institutionId name code status")
        .lean();

    if (!classLevel) {
        throw createError(404, "Class level not found");
    }

    return classLevel;
}

async function resolveStudentClassContextForSemester({ institutionId, studentMembershipId, semesterId }) {
    const assignment = await ClassStudentAssignment.findOne({
        institutionId,
        semesterId,
        studentMemberId: studentMembershipId,
        status: ACTIVE_CLASS_ASSIGNMENT_STATUS,
    })
        .select("_id institutionId semesterId classId studentMemberId status")
        .lean();

    if (!assignment) {
        throw createError(404, "Student class assignment not found for this semester");
    }

    const schoolClass = await loadSchoolClass({
        institutionId,
        schoolClassId: assignment.classId,
    });
    const classLevel = await loadClassLevel({
        institutionId,
        classLevelId: schoolClass.classLevelId,
    });

    return {
        assignment,
        schoolClass,
        classLevel,
    };
}

async function loadActivePolicySemesterIdsForAcademicYear({ institutionId, academicYearId }) {
    const policies = await SchoolAcademicPolicy.find({
        institutionId,
        status: "active",
        "appliesTo.academicYearId": academicYearId,
    })
        .select("aggregationRules")
        .lean();

    const semesterIds = [
        ...new Set(
            policies
                .flatMap((policy) => getPolicySemesterIds(policy))
                .filter(Boolean)
        ),
    ];

    if (!semesterIds.length) {
        throw createError(404, "Active school academic policy not found for this academic year");
    }

    return semesterIds;
}

async function resolveStudentClassContextForAcademicYear({ institutionId, studentMembershipId, academicYearId }) {
    const semesterIds = await loadActivePolicySemesterIdsForAcademicYear({
        institutionId,
        academicYearId,
    });
    const assignments = await ClassStudentAssignment.find({
        institutionId,
        studentMemberId: studentMembershipId,
        semesterId: { $in: semesterIds },
        status: ACTIVE_CLASS_ASSIGNMENT_STATUS,
    })
        .select("_id institutionId semesterId classId studentMemberId status")
        .sort({ semesterId: 1, _id: 1 })
        .lean();

    if (!assignments.length) {
        throw createError(404, "Student class assignment not found for this academic year");
    }

    const classIds = [...new Set(assignments.map((assignment) => normalizeId(assignment.classId)).filter(Boolean))];
    if (classIds.length !== 1) {
        throw createError(409, "Student has multiple class assignments for this academic year");
    }

    const schoolClass = await loadSchoolClass({
        institutionId,
        schoolClassId: classIds[0],
    });
    const classLevel = await loadClassLevel({
        institutionId,
        classLevelId: schoolClass.classLevelId,
    });

    return {
        assignments,
        schoolClass,
        classLevel,
        semesterIds,
    };
}

async function resolveActivePolicyForClassYear({ institutionId, academicYearId, classLevelId }) {
    const resolved = await schoolAcademicPolicyService.resolveSchoolAcademicPolicyForClassLevel({
        institutionId,
        academicYearId,
        schoolStageId: null,
        classLevelId,
    });

    if (!resolved.policy) {
        throw createError(404, "Active school academic policy not found for this class level and academic year");
    }

    return {
        policy: resolved.policy,
        resolutionLevel: resolved.resolutionLevel,
    };
}

async function resolveActivePolicyForSemesterClassLevel({ institutionId, semesterId, classLevelId }) {
    const classLevelPolicy = await SchoolAcademicPolicy.findOne({
        institutionId,
        status: "active",
        "aggregationRules.semesterWeights.semesterId": semesterId,
        "appliesTo.classLevelId": classLevelId,
        "appliesTo.schoolStageId": null,
    })
        .select(SCHOOL_ACADEMIC_POLICY_SELECT_FIELDS)
        .lean();

    if (classLevelPolicy) {
        return {
            policy: normalizePolicy(classLevelPolicy, "class_level"),
            resolutionLevel: "class_level",
        };
    }

    const academicYearPolicy = await SchoolAcademicPolicy.findOne({
        institutionId,
        status: "active",
        "aggregationRules.semesterWeights.semesterId": semesterId,
        "appliesTo.classLevelId": null,
        "appliesTo.schoolStageId": null,
    })
        .select(SCHOOL_ACADEMIC_POLICY_SELECT_FIELDS)
        .lean();

    if (academicYearPolicy) {
        return {
            policy: normalizePolicy(academicYearPolicy, "academic_year"),
            resolutionLevel: "academic_year",
        };
    }

    throw createError(404, "Active school academic policy not found for this semester and class level");
}

async function loadSubjectsForClassSemester({ institutionId, schoolClassId, classLevelId, semesterId }) {
    const sections = await Section.find({
        institutionId,
        schoolClassId,
        semesterId,
    })
        .select("_id subjectId")
        .lean();
    const subjectIds = [...new Set(sections.map((section) => normalizeId(section.subjectId)).filter(Boolean))];
    if (!subjectIds.length) {
        return [];
    }

    return Subject.find({
        institutionId,
        _id: { $in: subjectIds },
        classLevelId,
        departmentId: null,
        status: ACTIVE_SUBJECT_STATUS,
    })
        .select("_id institutionId classLevelId departmentId name code status")
        .sort({ name: 1, code: 1, _id: 1 })
        .lean();
}

async function loadSubjectsByIds({ institutionId, subjectIds }) {
    const normalizedSubjectIds = [...new Set(subjectIds.map(normalizeId).filter(Boolean))];
    if (!normalizedSubjectIds.length) {
        return new Map();
    }

    const subjects = await Subject.find({
        institutionId,
        _id: { $in: normalizedSubjectIds },
        departmentId: null,
    })
        .select("_id name code classLevelId departmentId")
        .lean();

    return new Map(subjects.map((subject) => [normalizeId(subject._id), subject]));
}

function buildSemesterSubjectItem({ subject, outcome }) {
    return {
        subjectId: normalizeId(subject?._id || outcome.subjectId),
        subjectName: subject?.name || null,
        subjectCode: subject?.code || null,
        percentage: outcome.percentage,
        passed: outcome.passed,
        failed: outcome.failed,
        passedBasedOnAvailableResults: outcome.passedBasedOnAvailableResults,
        failedBasedOnAvailableResults: outcome.failedBasedOnAvailableResults,
        complete: outcome.complete,
        hasMissingResults: outcome.hasMissingResults,
        missingResults: outcome.missingResults || [],
    };
}

function buildYearSubjectItem({ subject, outcome, policy }) {
    return {
        subjectId: normalizeId(outcome.subjectId),
        subjectName: subject?.name || null,
        subjectCode: subject?.code || null,
        semesterResults: (outcome.semesterBreakdown || []).map((semesterOutcome) => ({
            semesterId: normalizeId(semesterOutcome.semesterId),
            weight: semesterOutcome.weight,
            percentage: semesterOutcome.percentage,
            passed: semesterOutcome.passed,
            failed: semesterOutcome.failed,
            passedBasedOnAvailableResults: semesterOutcome.passedBasedOnAvailableResults,
            failedBasedOnAvailableResults: semesterOutcome.failedBasedOnAvailableResults,
            complete: semesterOutcome.complete,
            hasMissingResults: semesterOutcome.hasMissingResults,
            missingResults: semesterOutcome.missingResults || [],
        })),
        yearlyPercentage: outcome.yearlyPercentage,
        passed: outcome.passed,
        failed: outcome.failed,
        passedBasedOnAvailableResults: outcome.passedBasedOnAvailableResults,
        failedBasedOnAvailableResults: outcome.failedBasedOnAvailableResults,
        complete: outcome.complete,
        hasMissingResults: outcome.hasMissingResults,
        isCritical: schoolOutcomeService.isCriticalSubject({
            subjectId: outcome.subjectId,
            policy,
        }),
        missingResults: outcome.missingResults || [],
    };
}

async function buildYearlyReportCardPayload({
    institutionId,
    studentMembershipId,
    academicYearId,
    schoolClass,
    classLevel,
    policy,
    resolutionLevel,
}) {
    const studentYearOutcome = await schoolOutcomeService.calculateSchoolStudentYearOutcome({
        institutionId,
        studentMembershipId,
        academicYearId,
        classLevelId: classLevel._id,
        policy,
    });
    const promotionDecision = schoolPromotionService.resolveSchoolPromotionDecision({
        studentYearOutcome,
        policy,
    });
    const subjectById = await loadSubjectsByIds({
        institutionId,
        subjectIds: studentYearOutcome.subjects.map((subjectOutcome) => subjectOutcome.subjectId),
    });
    const subjects = studentYearOutcome.subjects.map((subjectOutcome) =>
        buildYearSubjectItem({
            subject: subjectById.get(normalizeId(subjectOutcome.subjectId)) || null,
            outcome: subjectOutcome,
            policy,
        })
    );
    const missingResults = collectMissingResultsFromSubjects(subjects);

    return {
        academicYear: buildAcademicYearSummary(academicYearId),
        classLevel: buildClassLevelSummary(classLevel),
        schoolClass: buildSchoolClassSummary(schoolClass),
        policy: normalizePolicy(policy, resolutionLevel),
        subjects,
        yearlyAveragePercentage: studentYearOutcome.yearlyAveragePercentage,
        failedSubjectCount: studentYearOutcome.failedSubjectCount,
        criticalFailedSubjects: studentYearOutcome.criticalFailedSubjects,
        promotionDecision,
        complete: studentYearOutcome.complete,
        hasMissingResults: studentYearOutcome.hasMissingResults,
        warnings: [...missingResults, ...promotionDecision.warnings],
    };
}

async function getStudentSemesterReportCard({
    institutionId,
    studentMembershipId,
    semesterId,
    actorUserId,
    actorMembership,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedStudentMembershipId = validateObjectId(studentMembershipId, "studentMembershipId");
    const normalizedSemesterId = validateObjectId(semesterId, "semesterId");
    ensureStaffReportAccess({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });
    await ensureSchoolInstitution(normalizedInstitutionId);

    const [student, semester, classContext] = await Promise.all([
        loadStudentSummary({
            institutionId: normalizedInstitutionId,
            studentMembershipId: normalizedStudentMembershipId,
        }),
        loadSemester({
            institutionId: normalizedInstitutionId,
            semesterId: normalizedSemesterId,
        }),
        resolveStudentClassContextForSemester({
            institutionId: normalizedInstitutionId,
            studentMembershipId: normalizedStudentMembershipId,
            semesterId: normalizedSemesterId,
        }),
    ]);
    const { policy, resolutionLevel } = await resolveActivePolicyForSemesterClassLevel({
        institutionId: normalizedInstitutionId,
        semesterId: normalizedSemesterId,
        classLevelId: classContext.classLevel._id,
    });
    const subjects = await loadSubjectsForClassSemester({
        institutionId: normalizedInstitutionId,
        schoolClassId: classContext.schoolClass._id,
        classLevelId: classContext.classLevel._id,
        semesterId: normalizedSemesterId,
    });

    const subjectRows = [];
    for (const subject of subjects) {
        const outcome = await schoolOutcomeService.calculateSchoolSubjectSemesterOutcome({
            institutionId: normalizedInstitutionId,
            studentMembershipId: normalizedStudentMembershipId,
            subjectId: subject._id,
            semesterId: normalizedSemesterId,
            policy,
        });

        subjectRows.push(buildSemesterSubjectItem({ subject, outcome }));
    }

    const missingResults = collectMissingResultsFromSubjects(subjectRows);
    const warnings = [...missingResults];
    if (!subjectRows.length) {
        warnings.push(
            buildBasicWarning({
                code: "no_school_subjects",
                message: "No active school subjects were found for this class and semester.",
            })
        );
    }
    const completionState = buildCompletionState(warnings);

    return {
        reportCard: {
            student,
            semester: buildSemesterSummary(semester),
            classLevel: buildClassLevelSummary(classContext.classLevel),
            schoolClass: buildSchoolClassSummary(classContext.schoolClass),
            policy: normalizePolicy(policy, resolutionLevel),
            subjects: subjectRows,
            semesterAveragePercentage: calculateAverage(subjectRows.map((subject) => subject.percentage)),
            ...completionState,
            warnings,
        },
    };
}

async function getStudentYearlyReportCard({
    institutionId,
    studentMembershipId,
    academicYearId,
    actorUserId,
    actorMembership,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedStudentMembershipId = validateObjectId(studentMembershipId, "studentMembershipId");
    const normalizedAcademicYearId = validateObjectId(academicYearId, "academicYearId");
    ensureStaffReportAccess({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });
    await ensureSchoolInstitution(normalizedInstitutionId);

    const [student, classContext] = await Promise.all([
        loadStudentSummary({
            institutionId: normalizedInstitutionId,
            studentMembershipId: normalizedStudentMembershipId,
        }),
        resolveStudentClassContextForAcademicYear({
            institutionId: normalizedInstitutionId,
            studentMembershipId: normalizedStudentMembershipId,
            academicYearId: normalizedAcademicYearId,
        }),
    ]);
    const { policy, resolutionLevel } = await resolveActivePolicyForClassYear({
        institutionId: normalizedInstitutionId,
        academicYearId: normalizedAcademicYearId,
        classLevelId: classContext.classLevel._id,
    });
    const reportCard = await buildYearlyReportCardPayload({
        institutionId: normalizedInstitutionId,
        studentMembershipId: normalizedStudentMembershipId,
        academicYearId: normalizedAcademicYearId,
        schoolClass: classContext.schoolClass,
        classLevel: classContext.classLevel,
        policy,
        resolutionLevel,
    });

    return {
        reportCard: {
            student,
            ...reportCard,
        },
    };
}

async function getClassPromotionSummary({
    institutionId,
    schoolClassId,
    academicYearId,
    actorUserId,
    actorMembership,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedSchoolClassId = validateObjectId(schoolClassId, "schoolClassId");
    const normalizedAcademicYearId = validateObjectId(academicYearId, "academicYearId");
    ensureStaffReportAccess({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });
    await ensureSchoolInstitution(normalizedInstitutionId);

    const schoolClass = await loadSchoolClass({
        institutionId: normalizedInstitutionId,
        schoolClassId: normalizedSchoolClassId,
    });
    const classLevel = await loadClassLevel({
        institutionId: normalizedInstitutionId,
        classLevelId: schoolClass.classLevelId,
    });
    const { policy, resolutionLevel } = await resolveActivePolicyForClassYear({
        institutionId: normalizedInstitutionId,
        academicYearId: normalizedAcademicYearId,
        classLevelId: classLevel._id,
    });
    const semesterIds = getPolicySemesterIds(policy);
    const assignments = await ClassStudentAssignment.find({
        institutionId: normalizedInstitutionId,
        classId: normalizedSchoolClassId,
        semesterId: { $in: semesterIds },
        status: ACTIVE_CLASS_ASSIGNMENT_STATUS,
    })
        .select("_id institutionId semesterId classId studentMemberId status")
        .sort({ semesterId: 1, createdAt: 1, _id: 1 })
        .lean();
    const studentMembershipIds = [
        ...new Set(assignments.map((assignment) => normalizeId(assignment.studentMemberId)).filter(Boolean)),
    ];
    const { membershipById, profileByMembershipId, userById } = await loadStudentMaps({
        institutionId: normalizedInstitutionId,
        studentMembershipIds,
    });

    const students = [];
    for (const studentMembershipId of studentMembershipIds) {
        const membership = membershipById.get(studentMembershipId);
        if (!membership) {
            continue;
        }

        const studentYearOutcome = await schoolOutcomeService.calculateSchoolStudentYearOutcome({
            institutionId: normalizedInstitutionId,
            studentMembershipId,
            academicYearId: normalizedAcademicYearId,
            classLevelId: classLevel._id,
            policy,
        });
        const promotionDecision = schoolPromotionService.resolveSchoolPromotionDecision({
            studentYearOutcome,
            policy,
        });
        const profile = profileByMembershipId.get(studentMembershipId) || null;
        const user = membership.userId ? userById.get(normalizeId(membership.userId)) || null : null;

        students.push({
            studentMembershipId,
            studentName: profile?.fullName || null,
            studentEmail: user?.email || null,
            yearlyAveragePercentage: studentYearOutcome.yearlyAveragePercentage,
            failedSubjectCount: studentYearOutcome.failedSubjectCount,
            criticalFailedSubjects: studentYearOutcome.criticalFailedSubjects,
            decision: promotionDecision.decision,
            allowedToPromote: promotionDecision.allowedToPromote,
            reasonCodes: promotionDecision.reasonCodes,
            warnings: [...studentYearOutcome.missingResults, ...promotionDecision.warnings],
            complete: studentYearOutcome.complete,
            hasMissingResults: studentYearOutcome.hasMissingResults,
        });
    }

    students.sort((left, right) => {
        const leftName = (left.studentName || left.studentEmail || "").toLowerCase();
        const rightName = (right.studentName || right.studentEmail || "").toLowerCase();
        const nameOrder = leftName.localeCompare(rightName);
        if (nameOrder !== 0) {
            return nameOrder;
        }

        return left.studentMembershipId.localeCompare(right.studentMembershipId);
    });

    return {
        promotionSummary: {
            schoolClass: buildSchoolClassSummary(schoolClass),
            classLevel: buildClassLevelSummary(classLevel),
            academicYear: buildAcademicYearSummary(normalizedAcademicYearId),
            policy: normalizePolicy(policy, resolutionLevel),
            students,
        },
    };
}

module.exports = {
    getStudentSemesterReportCard,
    getStudentYearlyReportCard,
    getClassPromotionSummary,
};
