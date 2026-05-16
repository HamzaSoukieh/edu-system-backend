const mongoose = require("mongoose");
const Assessment = require("../models/Assessment");
const AssessmentResult = require("../models/AssessmentResult");
const ClassLevel = require("../models/ClassLevel");
const ClassStudentAssignment = require("../models/ClassStudentAssignment");
const Enrollment = require("../models/Enrollment");
const Institution = require("../models/Institution");
const MemberProfile = require("../models/MemberProfile");
const Membership = require("../models/Membership");
const SchoolAcademicPolicy = require("../models/SchoolAcademicPolicy");
const SchoolClass = require("../models/SchoolClass");
const SchoolFinalOutcome = require("../models/SchoolFinalOutcome");
const Section = require("../models/Section");
const Subject = require("../models/Subject");
const User = require("../models/User");
const { ROLE_PERMISSIONS } = require("../auth/permissions");
const schoolAcademicPolicyService = require("./schoolAcademicPolicyService");
const schoolOutcomeService = require("./schoolOutcomeService");
const schoolPromotionService = require("./schoolPromotionService");

const ACTIVE_MEMBERSHIP_STATUS = Membership.schema.path("status").defaultValue;
const ACTIVE_CLASS_ASSIGNMENT_STATUS = ClassStudentAssignment.schema.path("status").defaultValue;
const ACTIVE_ENROLLMENT_STATUS = Enrollment.schema.path("status").defaultValue;
const SCHOOL_PROMOTION_DASHBOARD_PERMISSION = "class.manage";
const SCHOOL_PROMOTION_ROW_CONCURRENCY_LIMIT = 5;
const PUBLISHED_ASSESSMENT_STATUS = "published";
const SCHOOL_POLICY_EPSILON = 1e-9;
const ASSESSMENT_SELECT_FIELDS = "_id institutionId sectionId maxScore weight status";
const ASSESSMENT_RESULT_SELECT_FIELDS =
    "_id institutionId sectionId assessmentId enrollmentId studentMemberId score";
const PROMOTING_DECISIONS = ["promoted", "conditional_promotion"];
const DASHBOARD_DECISION_VALUES = [
    "promoted",
    "repeat_year",
    "conditional_promotion",
    "manual_review",
    "incomplete",
    "no_final_outcome_yet",
];
const SCHOOL_FINAL_OUTCOME_SELECT_FIELDS =
    "_id institutionId academicYearId classLevelId schoolClassId studentMembershipId outcomeSnapshot calculatedDecision calculatedReasonCodes calculatedWarnings finalDecision finalReasonCodes finalWarnings override status finalizedAt";
const SAFE_WARNING_ID_FIELDS = [
    "academicYearId",
    "semesterId",
    "subjectId",
    "sectionId",
    "assessmentId",
    "enrollmentId",
    "studentMembershipId",
    "schoolClassId",
    "classLevelId",
];

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

function normalizeComputedNumber(value, { digits = 12 } = {}) {
    if (!Number.isFinite(value)) {
        return value;
    }

    const roundedValue = Number(value.toFixed(digits));
    const nearestInteger = Math.round(roundedValue);
    if (Math.abs(roundedValue - nearestInteger) <= SCHOOL_POLICY_EPSILON) {
        return nearestInteger;
    }

    return Math.abs(roundedValue) <= SCHOOL_POLICY_EPSILON ? 0 : roundedValue;
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

function parseOptionalBoolean(rawValue, fieldName) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
        return null;
    }

    if (rawValue === true || rawValue === "true") {
        return true;
    }

    if (rawValue === false || rawValue === "false") {
        return false;
    }

    throw createError(400, `${fieldName} must be true or false`);
}

function normalizeWarning(
    warning,
    {
        fallbackCode = "DASHBOARD_WARNING",
        fallbackMessage = "Additional dashboard review is required.",
    } = {}
) {
    if (typeof warning === "string") {
        return {
            code: fallbackCode,
            message: warning.trim() || fallbackMessage,
        };
    }

    if (!warning || typeof warning !== "object" || Array.isArray(warning)) {
        return {
            code: fallbackCode,
            message: fallbackMessage,
        };
    }

    const normalized = {
        code: normalizeString(warning.code) || normalizeString(warning.reasonCode) || fallbackCode,
        message: normalizeString(warning.message) || fallbackMessage,
    };

    for (const field of SAFE_WARNING_ID_FIELDS) {
        const normalizedValue = normalizeId(warning[field]);
        if (normalizedValue) {
            normalized[field] = normalizedValue;
        }
    }

    return normalized;
}

function normalizeWarnings(warnings = [], options = {}) {
    const sourceWarnings = Array.isArray(warnings) ? warnings : warnings ? [warnings] : [];
    return sourceWarnings.map((warning) => normalizeWarning(warning, options));
}

function validatePromotionDashboardQuery(query = {}) {
    const decision = normalizeLowerString(query.decision);
    if (decision && !DASHBOARD_DECISION_VALUES.includes(decision)) {
        throw createError(400, `decision must be one of: ${DASHBOARD_DECISION_VALUES.join(", ")}`);
    }

    return {
        decision: decision || null,
        schoolClassId:
            query.schoolClassId === undefined
                ? null
                : validateObjectId(query.schoolClassId, "schoolClassId"),
        classLevelId:
            query.classLevelId === undefined
                ? null
                : validateObjectId(query.classLevelId, "classLevelId"),
        complete: parseOptionalBoolean(query.complete, "complete"),
        hasMissingResults: parseOptionalBoolean(query.hasMissingResults, "hasMissingResults"),
        finalized: parseOptionalBoolean(query.finalized, "finalized"),
        search: normalizeLowerString(query.search),
        page: parsePositiveInteger(query.page, 1, 1),
        limit: parsePositiveInteger(query.limit, 25, 1, 50),
    };
}

function validateInstructorSectionDashboardQuery(query = {}) {
    if (query.decision !== undefined) {
        throw createError(400, "decision is not supported for instructor section dashboard");
    }

    if (query.finalized !== undefined) {
        throw createError(400, "finalized is not supported for instructor section dashboard");
    }

    return {
        schoolClassId:
            query.schoolClassId === undefined
                ? null
                : validateObjectId(query.schoolClassId, "schoolClassId"),
        classLevelId:
            query.classLevelId === undefined
                ? null
                : validateObjectId(query.classLevelId, "classLevelId"),
        complete: parseOptionalBoolean(query.complete, "complete"),
        hasMissingResults: parseOptionalBoolean(query.hasMissingResults, "hasMissingResults"),
        search: normalizeLowerString(query.search),
        page: parsePositiveInteger(query.page, 1, 1),
        limit: parsePositiveInteger(query.limit, 25, 1, 50),
    };
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

    if (actorMembership.status !== undefined && actorMembership.status !== ACTIVE_MEMBERSHIP_STATUS) {
        throw createError(403, "Membership is not active");
    }
}

function ensureInstitutionDashboardAccess(context) {
    ensureActorMembership(context);

    if (!hasRolePermission(context.actorMembership.role, SCHOOL_PROMOTION_DASHBOARD_PERMISSION)) {
        throw createError(403, "Permission denied");
    }
}

function ensureInstructorDashboardAccess(context) {
    ensureActorMembership(context);

    if (context.actorMembership.role !== "instructor") {
        throw createError(403, "Only instructors can access their school promotion dashboard");
    }
}

async function ensureSchoolInstitution(institutionId) {
    const institution = await Institution.findOne({ _id: institutionId }).select("_id type").lean();
    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (institution.type !== "school") {
        throw createError(409, "School promotion dashboard is only supported for school institutions");
    }

    return institution;
}

function getPolicySemesterIds(policy) {
    return (policy?.aggregationRules?.semesterWeights || [])
        .map((row) => normalizeId(row.semesterId))
        .filter(Boolean);
}

async function loadAcademicYearSemesterIds({ institutionId, academicYearId }) {
    const policies = await SchoolAcademicPolicy.find({
        institutionId,
        status: "active",
        "appliesTo.academicYearId": academicYearId,
    })
        .select("aggregationRules")
        .lean();

    return [
        ...new Set(
            policies
                .flatMap((policy) => getPolicySemesterIds(policy))
                .filter(Boolean)
        ),
    ];
}

async function loadInstructorSections({ institutionId, instructorMembershipId, semesterIds }) {
    if (!Array.isArray(semesterIds) || !semesterIds.length) {
        return [];
    }

    return Section.find({
        institutionId,
        instructorMemberId: instructorMembershipId,
        semesterId: { $in: semesterIds },
        schoolClassId: { $ne: null },
    })
        .select("_id institutionId semesterId subjectId schoolClassId code title name instructorMemberId")
        .sort({ semesterId: 1, code: 1, _id: 1 })
        .lean();
}

async function loadActiveSectionEnrollments({ institutionId, sectionIds }) {
    if (!Array.isArray(sectionIds) || !sectionIds.length) {
        return [];
    }

    return Enrollment.find({
        institutionId,
        sectionId: { $in: sectionIds },
        status: ACTIVE_ENROLLMENT_STATUS,
    })
        .select("_id institutionId sectionId studentMemberId status")
        .lean();
}

function buildProfileMaps({ profiles = [], users = [] }) {
    return {
        profileByMembershipId: new Map(
            profiles.map((profile) => [normalizeId(profile.membershipId), profile]).filter(([id]) => Boolean(id))
        ),
        userById: new Map(users.map((user) => [normalizeId(user._id), user]).filter(([id]) => Boolean(id))),
    };
}

function studentMatchesSearch({ profile, user, search }) {
    if (!search) {
        return true;
    }

    const fullName = (profile?.fullName || "").toLowerCase();
    const email = (user?.email || "").toLowerCase();
    return fullName.includes(search) || email.includes(search);
}

async function loadCandidateStudentMemberships({ institutionId, filters, scopedStudentIds = null }) {
    if (scopedStudentIds instanceof Set && !scopedStudentIds.size) {
        return [];
    }

    const membershipQuery = {
        institutionId,
        role: "student",
        status: ACTIVE_MEMBERSHIP_STATUS,
    };

    if (scopedStudentIds instanceof Set) {
        membershipQuery._id = { $in: [...scopedStudentIds] };
    }

    const memberships = await Membership.find(membershipQuery)
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
            .select("_id membershipId fullName fullNameNormalized")
            .lean(),
        User.find({
            _id: { $in: memberships.map((membership) => membership.userId) },
        })
            .select("_id email")
            .lean(),
    ]);
    const { profileByMembershipId, userById } = buildProfileMaps({ profiles, users });

    return memberships
        .map((membership) => ({
            membership,
            profile: profileByMembershipId.get(normalizeId(membership._id)) || null,
            user: userById.get(normalizeId(membership.userId)) || null,
        }))
        .filter((student) =>
            studentMatchesSearch({
                ...student,
                search: filters.search,
            })
        );
}

async function loadClassContextMaps({ institutionId, studentMembershipIds, semesterIds }) {
    const semesterOrderById = new Map(
        (Array.isArray(semesterIds) ? semesterIds : [])
            .map((semesterId, index) => [normalizeId(semesterId), index])
            .filter(([semesterId]) => Boolean(semesterId))
    );

    if (!studentMembershipIds.length || !semesterIds.length) {
        return {
            assignmentsByStudentId: new Map(),
            schoolClassById: new Map(),
            classLevelById: new Map(),
            semesterOrderById,
        };
    }

    const assignments = await ClassStudentAssignment.find({
        institutionId,
        studentMemberId: { $in: studentMembershipIds },
        semesterId: { $in: semesterIds },
        status: ACTIVE_CLASS_ASSIGNMENT_STATUS,
    })
        .select("_id institutionId semesterId classId studentMemberId status")
        .sort({ semesterId: 1, _id: 1 })
        .lean();

    const assignmentsByStudentId = new Map();
    for (const assignment of assignments) {
        const studentId = normalizeId(assignment.studentMemberId);
        if (!studentId) {
            continue;
        }

        if (!assignmentsByStudentId.has(studentId)) {
            assignmentsByStudentId.set(studentId, []);
        }

        assignmentsByStudentId.get(studentId).push(assignment);
    }

    const schoolClassIds = [...new Set(assignments.map((assignment) => normalizeId(assignment.classId)).filter(Boolean))];
    const schoolClasses = schoolClassIds.length
        ? await SchoolClass.find({
              institutionId,
              _id: { $in: schoolClassIds },
          })
              .select("_id institutionId classLevelId name code status")
              .lean()
        : [];
    const classLevelIds = [
        ...new Set(schoolClasses.map((schoolClass) => normalizeId(schoolClass.classLevelId)).filter(Boolean)),
    ];
    const classLevels = classLevelIds.length
        ? await ClassLevel.find({
              institutionId,
              _id: { $in: classLevelIds },
          })
              .select("_id institutionId name code status")
              .lean()
        : [];

    return {
        assignmentsByStudentId,
        schoolClassById: new Map(schoolClasses.map((schoolClass) => [normalizeId(schoolClass._id), schoolClass])),
        classLevelById: new Map(classLevels.map((classLevel) => [normalizeId(classLevel._id), classLevel])),
        semesterOrderById,
    };
}

async function loadFinalOutcomeMap({ institutionId, academicYearId, studentMembershipIds }) {
    if (!studentMembershipIds.length) {
        return new Map();
    }

    const outcomes = await SchoolFinalOutcome.find({
        institutionId,
        academicYearId,
        studentMembershipId: { $in: studentMembershipIds },
        status: { $ne: "cancelled" },
    })
        .select(SCHOOL_FINAL_OUTCOME_SELECT_FIELDS)
        .lean();

    return new Map(
        outcomes
            .map((outcome) => [normalizeId(outcome.studentMembershipId), outcome])
            .filter(([studentMembershipId]) => Boolean(studentMembershipId))
    );
}

function getAssignmentSortKey(assignment, semesterOrderById = new Map()) {
    const semesterId = normalizeId(assignment?.semesterId);
    const semesterOrder = semesterOrderById.has(semesterId) ? semesterOrderById.get(semesterId) : -1;
    return {
        semesterOrder,
        assignmentId: normalizeId(assignment?._id) || "",
    };
}

function compareAssignmentsByAcademicYearOrder(left, right, semesterOrderById = new Map()) {
    const leftSortKey = getAssignmentSortKey(left, semesterOrderById);
    const rightSortKey = getAssignmentSortKey(right, semesterOrderById);

    return (
        leftSortKey.semesterOrder - rightSortKey.semesterOrder ||
        leftSortKey.assignmentId.localeCompare(rightSortKey.assignmentId)
    );
}

function resolveClassContext({
    studentMembershipId,
    assignmentsByStudentId,
    schoolClassById,
    classLevelById,
    semesterOrderById,
}) {
    const assignments = assignmentsByStudentId.get(studentMembershipId) || [];
    if (!assignments.length) {
        return {
            errorCode: "no_class_assignment_for_academic_year",
            warning: {
                code: "NO_CLASS_ASSIGNMENT_FOR_ACADEMIC_YEAR",
                message: "No active class assignment was found for this student in the academic year.",
            },
        };
    }

    const assignmentsBySemesterId = new Map();
    for (const assignment of assignments) {
        const semesterId = normalizeId(assignment.semesterId);
        if (!semesterId) {
            continue;
        }

        if (!assignmentsBySemesterId.has(semesterId)) {
            assignmentsBySemesterId.set(semesterId, []);
        }

        assignmentsBySemesterId.get(semesterId).push(assignment);
    }

    for (const semesterAssignments of assignmentsBySemesterId.values()) {
        const sameSemesterClassIds = [
            ...new Set(semesterAssignments.map((assignment) => normalizeId(assignment.classId)).filter(Boolean)),
        ];
        if (sameSemesterClassIds.length > 1) {
            return {
                errorCode: "ambiguous_class_assignments_for_semester",
                warning: {
                    code: "AMBIGUOUS_CLASS_ASSIGNMENTS_FOR_SEMESTER",
                    message: "Student has multiple active class assignments in the same semester.",
                    studentMembershipId,
                    semesterId: normalizeId(semesterAssignments[0]?.semesterId),
                },
            };
        }
    }

    // Transfers across semesters are allowed for dashboard purposes. For yearly live
    // calculation, use the latest resolvable active assignment in the policy semesters.
    const latestAssignment = [...assignments].sort((left, right) =>
        compareAssignmentsByAcademicYearOrder(right, left, semesterOrderById)
    )[0];
    const classId = normalizeId(latestAssignment?.classId);
    if (!classId) {
        return {
            errorCode: "class_assignment_missing_class",
            warning: {
                code: "CLASS_ASSIGNMENT_MISSING_CLASS",
                message: "The latest class assignment is missing a class reference.",
                studentMembershipId,
            },
        };
    }

    const schoolClass = schoolClassById.get(classId) || null;
    if (!schoolClass) {
        return {
            errorCode: "class_not_found_for_assignment",
            warning: {
                code: "CLASS_NOT_FOUND_FOR_ASSIGNMENT",
                message: "The assigned class was not found.",
                studentMembershipId,
                schoolClassId: classId,
            },
        };
    }

    const classLevel = classLevelById.get(normalizeId(schoolClass.classLevelId)) || null;
    if (!classLevel) {
        return {
            errorCode: "class_level_not_found_for_assignment",
            warning: {
                code: "CLASS_LEVEL_NOT_FOUND_FOR_ASSIGNMENT",
                message: "The assigned class level was not found.",
                studentMembershipId,
                schoolClassId: normalizeId(schoolClass._id),
                classLevelId: normalizeId(schoolClass.classLevelId),
            },
        };
    }

    return {
        assignments,
        schoolClass,
        classLevel,
    };
}

function isAllowedToPromote(decision) {
    return PROMOTING_DECISIONS.includes(decision);
}

function buildNoFinalOutcomeRow({ student, academicYearId, context = {}, warning = null }) {
    const studentMembershipId = normalizeId(student.membership._id);
    const warnings = normalizeWarnings(warning ? [warning] : [], {
        fallbackCode: "NO_FINAL_OUTCOME_YET",
        fallbackMessage: "No final outcome or live promotion calculation is available for this student.",
    });
    return {
        studentMembershipId,
        name: student.profile?.fullName || null,
        email: student.user?.email || null,
        academicYearId,
        schoolClassId: normalizeId(context.schoolClass?._id),
        classLevelId: normalizeId(context.classLevel?._id),
        yearlyAveragePercentage: null,
        failedSubjectCount: 0,
        criticalFailedSubjects: [],
        complete: false,
        hasMissingResults: false,
        finalized: false,
        decisionSource: "no_final_outcome",
        decision: "no_final_outcome_yet",
        calculatedDecision: null,
        finalDecision: null,
        finalOutcomeStatus: null,
        isOverridden: false,
        allowedToPromote: false,
        reasonCodes: warnings.map((item) => item.code),
        warnings,
    };
}

function buildFinalOutcomeRow({ student, academicYearId, finalOutcome }) {
    const studentMembershipId = normalizeId(student.membership._id);
    const warnings = normalizeWarnings(finalOutcome.finalWarnings || [], {
        fallbackCode: "FINAL_OUTCOME_WARNING",
        fallbackMessage: "Final outcome includes a warning.",
    });
    return {
        studentMembershipId,
        name: student.profile?.fullName || null,
        email: student.user?.email || null,
        academicYearId,
        schoolClassId: normalizeId(finalOutcome.schoolClassId),
        classLevelId: normalizeId(finalOutcome.classLevelId),
        yearlyAveragePercentage: finalOutcome.outcomeSnapshot?.yearlyAveragePercentage ?? null,
        failedSubjectCount: finalOutcome.outcomeSnapshot?.failedSubjectCount ?? 0,
        criticalFailedSubjects: finalOutcome.outcomeSnapshot?.criticalFailedSubjects || [],
        complete: finalOutcome.outcomeSnapshot?.complete === true,
        hasMissingResults: finalOutcome.outcomeSnapshot?.hasMissingResults === true,
        finalized: true,
        decisionSource: "final_outcome",
        decision: finalOutcome.finalDecision,
        calculatedDecision: finalOutcome.calculatedDecision || null,
        finalDecision: finalOutcome.finalDecision || null,
        finalOutcomeStatus: finalOutcome.status || null,
        isOverridden: finalOutcome.override?.isOverridden === true,
        allowedToPromote: isAllowedToPromote(finalOutcome.finalDecision),
        reasonCodes: finalOutcome.finalReasonCodes || [],
        warnings,
    };
}

async function buildLivePromotionRow({ institutionId, academicYearId, student, context }) {
    const studentMembershipId = normalizeId(student.membership._id);
    const resolved = await schoolAcademicPolicyService.resolveSchoolAcademicPolicyForClassLevel({
        institutionId,
        academicYearId,
        schoolStageId: null,
        classLevelId: context.classLevel._id,
    });

    if (!resolved.policy) {
        return buildNoFinalOutcomeRow({
            student,
            academicYearId,
            context,
            warning: {
                code: "ACTIVE_SCHOOL_POLICY_NOT_FOUND",
                message: "Active school academic policy was not found for this class level and academic year.",
            },
        });
    }

    const studentYearOutcome = await schoolOutcomeService.calculateSchoolStudentYearOutcome({
        institutionId,
        studentMembershipId,
        academicYearId,
        classLevelId: context.classLevel._id,
        policy: resolved.policy,
    });
    const promotionDecision = schoolPromotionService.resolveSchoolPromotionDecision({
        studentYearOutcome,
        policy: resolved.policy,
    });
    const incomplete =
        studentYearOutcome.complete !== true ||
        studentYearOutcome.hasMissingResults === true ||
        (studentYearOutcome.missingResults || []).length > 0;
    const warnings = normalizeWarnings(
        [...(studentYearOutcome.missingResults || []), ...(promotionDecision.warnings || [])],
        {
            fallbackCode: "LIVE_PROMOTION_WARNING",
            fallbackMessage: "Live promotion calculation includes a warning.",
        }
    );

    return {
        studentMembershipId,
        name: student.profile?.fullName || null,
        email: student.user?.email || null,
        academicYearId,
        schoolClassId: normalizeId(context.schoolClass._id),
        classLevelId: normalizeId(context.classLevel._id),
        yearlyAveragePercentage: studentYearOutcome.yearlyAveragePercentage ?? null,
        failedSubjectCount: studentYearOutcome.failedSubjectCount ?? 0,
        criticalFailedSubjects: studentYearOutcome.criticalFailedSubjects || [],
        complete: studentYearOutcome.complete === true,
        hasMissingResults: studentYearOutcome.hasMissingResults === true,
        finalized: false,
        decisionSource: "live_promotion_calculation",
        decision: incomplete ? "incomplete" : promotionDecision.decision,
        calculatedDecision: promotionDecision.decision,
        finalDecision: null,
        finalOutcomeStatus: null,
        isOverridden: false,
        allowedToPromote: !incomplete && promotionDecision.allowedToPromote === true,
        reasonCodes: promotionDecision.reasonCodes || [],
        warnings,
    };
}

async function buildStudentPromotionRow({
    institutionId,
    academicYearId,
    student,
    finalOutcomeByStudentId,
    classContextMaps,
}) {
    const studentMembershipId = normalizeId(student.membership._id);
    const finalOutcome = finalOutcomeByStudentId.get(studentMembershipId) || null;
    if (finalOutcome) {
        return buildFinalOutcomeRow({
            student,
            academicYearId,
            finalOutcome,
        });
    }

    const context = resolveClassContext({
        studentMembershipId,
        ...classContextMaps,
    });
    if (context.errorCode) {
        return buildNoFinalOutcomeRow({
            student,
            academicYearId,
            warning: context.warning,
        });
    }

    try {
        return await buildLivePromotionRow({
            institutionId,
            academicYearId,
            student,
            context,
        });
    } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 409) {
            return buildNoFinalOutcomeRow({
                student,
                academicYearId,
                context,
                warning: {
                    code: "LIVE_PROMOTION_CALCULATION_UNAVAILABLE",
                    message: error.message || "Live promotion calculation is unavailable for this student.",
                },
            });
        }

        throw error;
    }
}

function calculateWeightedContribution({ score, maxScore, weight }) {
    if (
        !Number.isFinite(score) ||
        !Number.isFinite(maxScore) ||
        maxScore <= 0 ||
        !Number.isFinite(weight) ||
        weight <= 0
    ) {
        return 0;
    }

    return (score / maxScore) * weight;
}

function calculatePercentage({ earnedWeightedScore, applicableWeightTotal }) {
    if (!Number.isFinite(earnedWeightedScore) || !Number.isFinite(applicableWeightTotal) || applicableWeightTotal <= 0) {
        return null;
    }

    return normalizeComputedNumber((earnedWeightedScore / applicableWeightTotal) * 100);
}

function validateAssessmentConfigurationForSectionDashboard({
    assessment,
    academicYearId,
    subjectId,
    semesterId,
    enrollmentId,
    studentMembershipId,
}) {
    const maxScore = Number(assessment?.maxScore);
    const weight = Number(assessment?.weight);
    const invalidFields = [];

    if (!Number.isFinite(maxScore) || maxScore <= 0) {
        invalidFields.push("maxScore");
    }

    if (!Number.isFinite(weight) || weight <= 0) {
        invalidFields.push("weight");
    }

    if (invalidFields.length) {
        return {
            valid: false,
            maxScore: null,
            weight: null,
            warning: normalizeWarning({
                code: "invalid_assessment_configuration",
                academicYearId,
                subjectId,
                semesterId,
                sectionId: assessment?.sectionId,
                assessmentId: assessment?._id,
                enrollmentId,
                studentMembershipId,
                message: `Published assessment has invalid ${invalidFields.join(" and ")} configuration.`,
            }),
        };
    }

    return {
        valid: true,
        maxScore,
        weight,
        warning: null,
    };
}

function getSubjectPassMinPercentage(policy) {
    const subjectPassMinPercentage = Number(policy?.gradingRules?.subjectPassMinPercentage);
    if (!Number.isFinite(subjectPassMinPercentage)) {
        return null;
    }

    return subjectPassMinPercentage;
}

async function calculateInstructorSectionOutcome({ institutionId, academicYearId, section, enrollment, policy }) {
    const subjectPassMinPercentage = getSubjectPassMinPercentage(policy);
    if (!Number.isFinite(subjectPassMinPercentage)) {
        return {
            percentage: null,
            passed: false,
            complete: false,
            hasMissingResults: true,
            missingResults: normalizeWarnings(
                [
                    {
                        code: "POLICY_SUBJECT_PASS_THRESHOLD_MISSING",
                        message: "The active school academic policy is missing a subject pass threshold.",
                        academicYearId,
                        semesterId: section.semesterId,
                        sectionId: section._id,
                        subjectId: section.subjectId,
                        enrollmentId: enrollment._id,
                        studentMembershipId: enrollment.studentMemberId,
                    },
                ],
                { fallbackCode: "POLICY_SUBJECT_PASS_THRESHOLD_MISSING" }
            ),
        };
    }

    const assessments = await Assessment.find({
        institutionId,
        sectionId: section._id,
        status: PUBLISHED_ASSESSMENT_STATUS,
    })
        .select(ASSESSMENT_SELECT_FIELDS)
        .sort({ assessmentDate: 1, createdAt: 1, _id: 1 })
        .lean();

    if (!assessments.length) {
        const missingResults = normalizeWarnings([
            {
                code: "no_published_assessments",
                message: "No published assessments were found for this section.",
                academicYearId,
                semesterId: section.semesterId,
                sectionId: section._id,
                subjectId: section.subjectId,
                enrollmentId: enrollment._id,
                studentMembershipId: enrollment.studentMemberId,
            },
        ]);
        return {
            percentage: null,
            passed: false,
            complete: false,
            hasMissingResults: true,
            missingResults,
        };
    }

    const results = await AssessmentResult.find({
        institutionId,
        enrollmentId: enrollment._id,
        sectionId: section._id,
        studentMemberId: enrollment.studentMemberId,
        assessmentId: { $in: assessments.map((assessment) => assessment._id) },
    })
        .select(ASSESSMENT_RESULT_SELECT_FIELDS)
        .lean();
    const resultByAssessmentId = new Map(results.map((result) => [normalizeId(result.assessmentId), result]));
    const missingResults = [];
    let applicableWeightTotal = 0;
    let earnedWeightedScore = 0;

    for (const assessment of assessments) {
        const assessmentConfig = validateAssessmentConfigurationForSectionDashboard({
            assessment,
            academicYearId,
            subjectId: section.subjectId,
            semesterId: section.semesterId,
            enrollmentId: enrollment._id,
            studentMembershipId: enrollment.studentMemberId,
        });

        if (!assessmentConfig.valid) {
            missingResults.push(assessmentConfig.warning);
            continue;
        }

        const result = resultByAssessmentId.get(normalizeId(assessment._id)) || null;
        const score = Number(result?.score);
        if (!result || !Number.isFinite(score)) {
            missingResults.push(
                normalizeWarning({
                    code: "missing_assessment_result",
                    message: "A published assessment is missing a recorded score for this student.",
                    academicYearId,
                    semesterId: section.semesterId,
                    sectionId: section._id,
                    subjectId: section.subjectId,
                    assessmentId: assessment._id,
                    enrollmentId: enrollment._id,
                    studentMembershipId: enrollment.studentMemberId,
                })
            );
            continue;
        }

        applicableWeightTotal += assessmentConfig.weight;
        earnedWeightedScore += calculateWeightedContribution({
            score,
            maxScore: assessmentConfig.maxScore,
            weight: assessmentConfig.weight,
        });
    }

    const percentage = calculatePercentage({
        earnedWeightedScore,
        applicableWeightTotal,
    });
    const complete = missingResults.length === 0;
    const passed = complete && percentage !== null && percentage >= subjectPassMinPercentage - SCHOOL_POLICY_EPSILON;

    return {
        percentage,
        passed,
        complete,
        hasMissingResults: missingResults.length > 0,
        missingResults,
    };
}

async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    }

    const workerCount = Math.min(Math.max(limit, 1), items.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
}

function createPromotionSummary() {
    return {
        totalStudents: 0,
        promoted: 0,
        repeat_year: 0,
        conditional_promotion: 0,
        manual_review: 0,
        incomplete: 0,
        no_final_outcome_yet: 0,
        finalized: 0,
        live: 0,
    };
}

function applyReportFilters(row, filters) {
    if (filters.decision && row.decision !== filters.decision) {
        return false;
    }

    if (filters.schoolClassId && row.schoolClassId !== filters.schoolClassId) {
        return false;
    }

    if (filters.classLevelId && row.classLevelId !== filters.classLevelId) {
        return false;
    }

    if (filters.complete !== null && row.complete !== filters.complete) {
        return false;
    }

    if (filters.hasMissingResults !== null && row.hasMissingResults !== filters.hasMissingResults) {
        return false;
    }

    if (filters.finalized !== null && row.finalized !== filters.finalized) {
        return false;
    }

    return true;
}

function sortPromotionRows(left, right) {
    const leftName = (left.name || left.email || left.studentMembershipId || "").toLowerCase();
    const rightName = (right.name || right.email || right.studentMembershipId || "").toLowerCase();
    return leftName.localeCompare(rightName) || left.studentMembershipId.localeCompare(right.studentMembershipId);
}

function applyInstructorSectionFilters(row, filters) {
    if (filters.schoolClassId && row.schoolClassId !== filters.schoolClassId) {
        return false;
    }

    if (filters.classLevelId && row.classLevelId !== filters.classLevelId) {
        return false;
    }

    if (filters.complete !== null && row.complete !== filters.complete) {
        return false;
    }

    if (filters.hasMissingResults !== null && row.hasMissingResults !== filters.hasMissingResults) {
        return false;
    }

    if (filters.search) {
        const name = (row.name || "").toLowerCase();
        const email = (row.email || "").toLowerCase();
        if (!name.includes(filters.search) && !email.includes(filters.search)) {
            return false;
        }
    }

    return true;
}

function sortInstructorSectionRows(left, right) {
    const leftName = (left.name || left.email || left.studentMembershipId || "").toLowerCase();
    const rightName = (right.name || right.email || right.studentMembershipId || "").toLowerCase();
    return (
        leftName.localeCompare(rightName) ||
        (left.sectionName || left.sectionId || "").localeCompare(right.sectionName || right.sectionId || "") ||
        left.studentMembershipId.localeCompare(right.studentMembershipId)
    );
}

function createInstructorSectionSummary() {
    return {
        totalRows: 0,
        totalStudents: 0,
        sections: 0,
        complete: 0,
        incomplete: 0,
        passed: 0,
        failed: 0,
        hasMissingResults: 0,
    };
}

async function loadInstructorSectionContext({ institutionId, sections, enrollments }) {
    const studentMembershipIds = [
        ...new Set(enrollments.map((enrollment) => normalizeId(enrollment.studentMemberId)).filter(Boolean)),
    ];
    const schoolClassIds = [
        ...new Set(sections.map((section) => normalizeId(section.schoolClassId)).filter(Boolean)),
    ];
    const subjectIds = [...new Set(sections.map((section) => normalizeId(section.subjectId)).filter(Boolean))];

    const [memberships, profiles, schoolClasses, subjects] = await Promise.all([
        studentMembershipIds.length
            ? Membership.find({
                  institutionId,
                  _id: { $in: studentMembershipIds },
                  role: "student",
                  status: ACTIVE_MEMBERSHIP_STATUS,
              })
                  .select("_id institutionId userId role status")
                  .lean()
            : [],
        studentMembershipIds.length
            ? MemberProfile.find({
                  institutionId,
                  membershipId: { $in: studentMembershipIds },
              })
                  .select("_id membershipId fullName fullNameNormalized")
                  .lean()
            : [],
        schoolClassIds.length
            ? SchoolClass.find({
                  institutionId,
                  _id: { $in: schoolClassIds },
              })
                  .select("_id institutionId classLevelId name code status")
                  .lean()
            : [],
        subjectIds.length
            ? Subject.find({
                  institutionId,
                  _id: { $in: subjectIds },
              })
                  .select("_id institutionId classLevelId departmentId name code status")
                  .lean()
            : [],
    ]);
    const userIds = memberships.map((membership) => normalizeId(membership.userId)).filter(Boolean);
    const loadedUsers = userIds.length
        ? await User.find({
              _id: { $in: userIds },
          })
              .select("_id email")
              .lean()
        : [];
    const classLevelIds = [
        ...new Set(schoolClasses.map((schoolClass) => normalizeId(schoolClass.classLevelId)).filter(Boolean)),
    ];
    const classLevels = classLevelIds.length
        ? await ClassLevel.find({
              institutionId,
              _id: { $in: classLevelIds },
          })
              .select("_id institutionId name code status")
              .lean()
        : [];

    return {
        membershipById: new Map(memberships.map((membership) => [normalizeId(membership._id), membership])),
        profileByMembershipId: new Map(profiles.map((profile) => [normalizeId(profile.membershipId), profile])),
        userById: new Map(loadedUsers.map((user) => [normalizeId(user._id), user])),
        schoolClassById: new Map(schoolClasses.map((schoolClass) => [normalizeId(schoolClass._id), schoolClass])),
        classLevelById: new Map(classLevels.map((classLevel) => [normalizeId(classLevel._id), classLevel])),
        subjectById: new Map(subjects.map((subject) => [normalizeId(subject._id), subject])),
    };
}

async function buildInstructorSectionRow({
    institutionId,
    academicYearId,
    enrollment,
    section,
    context,
    policyCache,
}) {
    const studentMembershipId = normalizeId(enrollment.studentMemberId);
    const membership = context.membershipById.get(studentMembershipId) || null;
    if (!membership) {
        return null;
    }

    const profile = context.profileByMembershipId.get(studentMembershipId) || null;
    const user = context.userById.get(normalizeId(membership.userId)) || null;
    const schoolClass = context.schoolClassById.get(normalizeId(section.schoolClassId)) || null;
    const classLevel = schoolClass
        ? context.classLevelById.get(normalizeId(schoolClass.classLevelId)) || null
        : null;
    const subject = context.subjectById.get(normalizeId(section.subjectId)) || null;
    const warnings = [];
    let outcome = {
        percentage: null,
        passed: false,
        complete: false,
        hasMissingResults: true,
        missingResults: [],
    };

    if (!schoolClass || !classLevel || !subject) {
        warnings.push(
            normalizeWarning({
                code: "INSTRUCTOR_SECTION_CONTEXT_INCOMPLETE",
                message: "Section class, class level, or subject context is incomplete.",
                academicYearId,
                semesterId: section.semesterId,
                sectionId: section._id,
                subjectId: section.subjectId,
                enrollmentId: enrollment._id,
                studentMembershipId,
                schoolClassId: section.schoolClassId,
                classLevelId: schoolClass?.classLevelId,
            })
        );
    } else {
        const classLevelId = normalizeId(classLevel._id);
        if (!policyCache.has(classLevelId)) {
            policyCache.set(
                classLevelId,
                schoolAcademicPolicyService.resolveSchoolAcademicPolicyForClassLevel({
                    institutionId,
                    academicYearId,
                    schoolStageId: null,
                    classLevelId,
                })
            );
        }

        const resolved = await policyCache.get(classLevelId);
        if (!resolved.policy) {
            warnings.push(
                normalizeWarning({
                    code: "ACTIVE_SCHOOL_POLICY_NOT_FOUND",
                    message: "Active school academic policy was not found for this class level and academic year.",
                    academicYearId,
                    semesterId: section.semesterId,
                    sectionId: section._id,
                    subjectId: section.subjectId,
                    enrollmentId: enrollment._id,
                    studentMembershipId,
                    schoolClassId: section.schoolClassId,
                    classLevelId,
                })
            );
        } else {
            outcome = await calculateInstructorSectionOutcome({
                institutionId,
                academicYearId,
                section,
                enrollment,
                policy: resolved.policy,
            });
        }
    }

    const missingResults = normalizeWarnings(outcome.missingResults || [], {
        fallbackCode: "SECTION_OUTCOME_WARNING",
        fallbackMessage: "Section outcome includes a warning.",
    });
    const rowWarnings = normalizeWarnings([...warnings, ...missingResults], {
        fallbackCode: "SECTION_OUTCOME_WARNING",
        fallbackMessage: "Section outcome includes a warning.",
    });

    return {
        studentMembershipId,
        name: profile?.fullName || null,
        email: user?.email || null,
        academicYearId,
        semesterId: normalizeId(section.semesterId),
        sectionId: normalizeId(section._id),
        sectionName: section.title || section.name || section.code || null,
        subjectId: normalizeId(section.subjectId),
        subjectName: subject?.name || null,
        schoolClassId: normalizeId(section.schoolClassId),
        classLevelId: normalizeId(classLevel?._id),
        percentage: outcome.percentage,
        passed: outcome.passed === true,
        complete: outcome.complete === true,
        hasMissingResults: outcome.hasMissingResults === true || rowWarnings.length > 0,
        missingResults,
        warnings: rowWarnings,
    };
}

async function buildInstructorSectionDashboardReport({
    institutionId,
    academicYearId,
    actorUserId,
    actorMembership,
    query = {},
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedAcademicYearId = validateObjectId(academicYearId, "academicYearId");
    const filters = validateInstructorSectionDashboardQuery(query);

    ensureInstructorDashboardAccess({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });
    await ensureSchoolInstitution(normalizedInstitutionId);

    const semesterIds = await loadAcademicYearSemesterIds({
        institutionId: normalizedInstitutionId,
        academicYearId: normalizedAcademicYearId,
    });
    const sections = await loadInstructorSections({
        institutionId: normalizedInstitutionId,
        instructorMembershipId: normalizeId(actorMembership._id),
        semesterIds,
    });
    const enrollments = await loadActiveSectionEnrollments({
        institutionId: normalizedInstitutionId,
        sectionIds: sections.map((section) => section._id),
    });
    const sectionById = new Map(sections.map((section) => [normalizeId(section._id), section]));
    const context = await loadInstructorSectionContext({
        institutionId: normalizedInstitutionId,
        sections,
        enrollments,
    });
    const policyCache = new Map();

    const candidateRows = await mapWithConcurrency(
        enrollments,
        SCHOOL_PROMOTION_ROW_CONCURRENCY_LIMIT,
        (enrollment) => {
            const section = sectionById.get(normalizeId(enrollment.sectionId));
            if (!section) {
                return null;
            }

            return buildInstructorSectionRow({
                institutionId: normalizedInstitutionId,
                academicYearId: normalizedAcademicYearId,
                enrollment,
                section,
                context,
                policyCache,
            });
        }
    );
    const rows = candidateRows.filter(Boolean).filter((row) => applyInstructorSectionFilters(row, filters));
    rows.sort(sortInstructorSectionRows);

    const sectionOutcomeSummary = createInstructorSectionSummary();
    sectionOutcomeSummary.totalRows = rows.length;
    sectionOutcomeSummary.totalStudents = new Set(rows.map((row) => row.studentMembershipId)).size;
    sectionOutcomeSummary.sections = new Set(rows.map((row) => row.sectionId)).size;
    for (const row of rows) {
        if (row.complete) {
            sectionOutcomeSummary.complete += 1;
        } else {
            sectionOutcomeSummary.incomplete += 1;
        }

        if (row.passed) {
            sectionOutcomeSummary.passed += 1;
        } else if (row.complete) {
            sectionOutcomeSummary.failed += 1;
        }

        if (row.hasMissingResults) {
            sectionOutcomeSummary.hasMissingResults += 1;
        }
    }

    const offset = (filters.page - 1) * filters.limit;
    const paginatedRows = rows.slice(offset, offset + filters.limit);
    const totalPages = rows.length === 0 ? 0 : Math.ceil(rows.length / filters.limit);

    return {
        sectionOutcomeSummary,
        sectionOutcomes: paginatedRows,
        pagination: {
            page: filters.page,
            limit: filters.limit,
            total: rows.length,
            totalPages,
        },
    };
}

async function buildPromotionDashboardReport({
    institutionId,
    academicYearId,
    actorUserId,
    actorMembership,
    query = {},
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedAcademicYearId = validateObjectId(academicYearId, "academicYearId");
    const filters = validatePromotionDashboardQuery(query);

    ensureInstitutionDashboardAccess({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });

    await ensureSchoolInstitution(normalizedInstitutionId);

    const semesterIds = await loadAcademicYearSemesterIds({
        institutionId: normalizedInstitutionId,
        academicYearId: normalizedAcademicYearId,
    });
    const candidateStudents = await loadCandidateStudentMemberships({
        institutionId: normalizedInstitutionId,
        filters,
    });
    const studentMembershipIds = candidateStudents
        .map((student) => normalizeId(student.membership._id))
        .filter(Boolean);
    const [classContextMaps, finalOutcomeByStudentId] = await Promise.all([
        loadClassContextMaps({
            institutionId: normalizedInstitutionId,
            studentMembershipIds,
            semesterIds,
        }),
        loadFinalOutcomeMap({
            institutionId: normalizedInstitutionId,
            academicYearId: normalizedAcademicYearId,
            studentMembershipIds,
        }),
    ]);

    // School promotion dashboard rows are live projections unless a final outcome exists.
    // Larger schools may eventually benefit from batch aggregation or year-close snapshots.
    const candidateRows = await mapWithConcurrency(
        candidateStudents,
        SCHOOL_PROMOTION_ROW_CONCURRENCY_LIMIT,
        (student) =>
            buildStudentPromotionRow({
                institutionId: normalizedInstitutionId,
                academicYearId: normalizedAcademicYearId,
                student,
                finalOutcomeByStudentId,
                classContextMaps,
            })
    );

    const rows = candidateRows.filter((row) => applyReportFilters(row, filters));
    rows.sort(sortPromotionRows);

    const promotionSummary = createPromotionSummary();
    promotionSummary.totalStudents = rows.length;
    for (const row of rows) {
        if (Object.prototype.hasOwnProperty.call(promotionSummary, row.decision)) {
            promotionSummary[row.decision] += 1;
        }

        if (row.finalized) {
            promotionSummary.finalized += 1;
        } else {
            promotionSummary.live += 1;
        }
    }

    const offset = (filters.page - 1) * filters.limit;
    const paginatedRows = rows.slice(offset, offset + filters.limit);
    const totalPages = rows.length === 0 ? 0 : Math.ceil(rows.length / filters.limit);

    return {
        promotionSummary,
        students: paginatedRows,
        pagination: {
            page: filters.page,
            limit: filters.limit,
            total: rows.length,
            totalPages,
        },
    };
}

async function summarizeSchoolPromotionDashboard(args) {
    const report = await buildPromotionDashboardReport(args);
    return {
        promotionSummary: report.promotionSummary,
    };
}

async function listSchoolPromotionDashboardStudents(args) {
    return buildPromotionDashboardReport(args);
}

async function summarizeMySchoolPromotionDashboard(args) {
    const report = await buildInstructorSectionDashboardReport(args);
    return {
        sectionOutcomeSummary: report.sectionOutcomeSummary,
    };
}

async function listMySchoolPromotionDashboardStudents(args) {
    return buildInstructorSectionDashboardReport(args);
}

module.exports = {
    DASHBOARD_DECISION_VALUES,
    listMySchoolPromotionDashboardStudents,
    listSchoolPromotionDashboardStudents,
    summarizeMySchoolPromotionDashboard,
    summarizeSchoolPromotionDashboard,
    validateInstructorSectionDashboardQuery,
    validatePromotionDashboardQuery,
};
