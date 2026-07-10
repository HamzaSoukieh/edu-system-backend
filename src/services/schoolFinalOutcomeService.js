const mongoose = require("mongoose");
const ClassLevel = require("../models/ClassLevel");
const ClassStudentAssignment = require("../models/ClassStudentAssignment");
const Membership = require("../models/Membership");
const SchoolAcademicPolicy = require("../models/SchoolAcademicPolicy");
const SchoolClass = require("../models/SchoolClass");
const SchoolFinalOutcome = require("../models/SchoolFinalOutcome");
const { ROLE_PERMISSIONS } = require("../auth/permissions");
const schoolAcademicPolicyService = require("./schoolAcademicPolicyService");
const schoolOutcomeService = require("./schoolOutcomeService");
const schoolPromotionService = require("./schoolPromotionService");
const { ensureSchoolInstitution } = require("./classLevelService");
const { recordAuditLog } = require("./auditService");

const SCHOOL_FINAL_OUTCOME_STATUSES = ["draft", "finalized", "cancelled"];
const SCHOOL_FINAL_OUTCOME_MANAGE_PERMISSION = "class.manage";
const ACTIVE_CLASS_ASSIGNMENT_STATUS = ClassStudentAssignment.schema.path("status").defaultValue;
const ACTIVE_MEMBERSHIP_STATUS = Membership.schema.path("status").defaultValue;
const MANUAL_OVERRIDE_REASON_CODE = "MANUAL_OVERRIDE";
const ACADEMIC_PROFILE_ACCESS_MODES = {
    self: "self",
    staff: "staff",
};
const SCHOOL_FINAL_OUTCOME_SELECT_FIELDS =
    "_id institutionId academicYearId classLevelId schoolClassId studentMembershipId policy outcomeSnapshot calculatedDecision calculatedReasons calculatedReasonCodes calculatedWarnings finalDecision finalReasons finalReasonCodes finalWarnings override status finalizedBy finalizedAt audit createdAt updatedAt";

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
    if (typeof value !== "string") {
        return "";
    }

    return value.trim();
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

function validateActorUserId(actorUserId) {
    const normalized = normalizeId(actorUserId);
    if (!normalized || !isValidObjectId(normalized)) {
        throw createError(401, "Unauthorized");
    }

    return normalized;
}

function hasRolePermission(role, permission) {
    return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

function validateAccessMode(accessMode) {
    if (!Object.values(ACADEMIC_PROFILE_ACCESS_MODES).includes(accessMode)) {
        throw createError(400, "accessMode is invalid");
    }

    return accessMode;
}

function ensureFinalOutcomeReadAccess({
    institutionId,
    studentMembershipId,
    actorUserId,
    actorMembership,
    accessMode = ACADEMIC_PROFILE_ACCESS_MODES.staff,
}) {
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

    const normalizedAccessMode = validateAccessMode(accessMode);
    if (normalizedAccessMode === ACADEMIC_PROFILE_ACCESS_MODES.self) {
        if (actorMembership.role !== "student") {
            throw createError(403, "Only students can view their own final outcome");
        }

        if (actorMembership.status !== undefined && actorMembership.status !== ACTIVE_MEMBERSHIP_STATUS) {
            throw createError(403, "Only active students can view their own final outcome");
        }

        if (normalizeId(actorMembership._id) !== normalizeId(studentMembershipId)) {
            throw createError(403, "Students can only view their own final outcome");
        }

        return;
    }

    if (!hasRolePermission(actorMembership.role, SCHOOL_FINAL_OUTCOME_MANAGE_PERMISSION)) {
        throw createError(403, "Permission denied");
    }
}

function ensureStaffFinalOutcomeAccess({ institutionId, actorUserId, actorMembership }) {
    ensureFinalOutcomeReadAccess({
        institutionId,
        actorUserId,
        actorMembership,
        accessMode: ACADEMIC_PROFILE_ACCESS_MODES.staff,
    });
}

function getPolicySemesterIds(policy) {
    return (policy?.aggregationRules?.semesterWeights || [])
        .map((row) => normalizeId(row.semesterId))
        .filter(Boolean);
}

function validatePromotionDecision(value, fieldName) {
    const decision = normalizeString(value).toLowerCase();
    if (!schoolAcademicPolicyService.SCHOOL_ACADEMIC_POLICY_PROMOTION_DECISIONS.includes(decision)) {
        throw createError(400, `${fieldName} is invalid`);
    }

    return decision;
}

function validateOverrideReason(value, fieldName) {
    const reason = normalizeString(value);
    if (!reason) {
        throw createError(400, `${fieldName} is required`);
    }

    if (reason.length > 1000) {
        throw createError(400, `${fieldName} must be at most 1000 characters`);
    }

    return reason;
}

function validateFinalizePayload(payload = {}) {
    if (payload === undefined || payload === null) {
        return null;
    }

    if (typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    if (payload.override === undefined || payload.override === null) {
        return null;
    }

    if (typeof payload.override !== "object" || Array.isArray(payload.override)) {
        throw createError(400, "override must be an object");
    }

    return {
        finalDecision: validatePromotionDecision(payload.override.finalDecision, "override.finalDecision"),
        reason: validateOverrideReason(payload.override.reason, "override.reason"),
    };
}

function validateOverridePayload(payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const source = payload.override && typeof payload.override === "object" && !Array.isArray(payload.override)
        ? payload.override
        : payload;

    return {
        finalDecision: validatePromotionDecision(source.finalDecision, "finalDecision"),
        reason: validateOverrideReason(source.reason, "reason"),
    };
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

function buildOutcomeSnapshot(studentYearOutcome) {
    return {
        yearlyAveragePercentage: studentYearOutcome.yearlyAveragePercentage ?? null,
        failedSubjectCount: studentYearOutcome.failedSubjectCount ?? 0,
        criticalFailedSubjects: studentYearOutcome.criticalFailedSubjects || [],
        complete: studentYearOutcome.complete === true,
        hasMissingResults: studentYearOutcome.hasMissingResults === true,
        missingResults: studentYearOutcome.missingResults || [],
    };
}

function buildPolicySnapshot({ policy, resolutionLevel }) {
    return {
        policyId: validateObjectId(policy.id || policy._id, "policy.id"),
        policyName: policy.name,
        resolutionLevel: resolutionLevel || null,
    };
}

function buildManualOverrideReason({ reason, actorUserId }) {
    return {
        code: MANUAL_OVERRIDE_REASON_CODE,
        message: "Final school outcome decision was manually overridden.",
        reason,
        actorUserId: normalizeId(actorUserId),
    };
}

function buildFinalDecisionFields({ calculatedDecision, overrideInput = null, actorUserId, now }) {
    if (!overrideInput) {
        return {
            finalDecision: calculatedDecision.decision,
            finalReasons: calculatedDecision.reasons || [],
            finalReasonCodes: calculatedDecision.reasonCodes || [],
            finalWarnings: calculatedDecision.warnings || [],
            override: {
                isOverridden: false,
                overriddenBy: null,
                overriddenAt: null,
                reason: null,
            },
        };
    }

    const overrideReason = buildManualOverrideReason({
        reason: overrideInput.reason,
        actorUserId,
    });

    return {
        finalDecision: overrideInput.finalDecision,
        finalReasons: [...(calculatedDecision.reasons || []), overrideReason],
        finalReasonCodes: [
            ...new Set([...(calculatedDecision.reasonCodes || []), MANUAL_OVERRIDE_REASON_CODE]),
        ],
        finalWarnings: calculatedDecision.warnings || [],
        override: {
            isOverridden: true,
            overriddenBy: actorUserId,
            overriddenAt: now,
            reason: overrideInput.reason,
        },
    };
}

async function ensureNoExistingFinalOutcome({ institutionId, academicYearId, studentMembershipId }) {
    const existingOutcome = await SchoolFinalOutcome.findOne({
        institutionId,
        academicYearId,
        studentMembershipId,
        status: { $ne: "cancelled" },
    })
        .select("_id")
        .lean();

    if (existingOutcome) {
        throw createError(409, "A non-cancelled school final outcome already exists for this student and academic year");
    }
}

function toSchoolFinalOutcomeResponse(outcome) {
    return {
        id: normalizeId(outcome._id),
        institutionId: normalizeId(outcome.institutionId),
        academicYearId: normalizeId(outcome.academicYearId),
        classLevelId: normalizeId(outcome.classLevelId),
        schoolClassId: normalizeId(outcome.schoolClassId),
        studentMembershipId: normalizeId(outcome.studentMembershipId),
        policy: {
            policyId: normalizeId(outcome.policy?.policyId),
            policyName: outcome.policy?.policyName || null,
            resolutionLevel: outcome.policy?.resolutionLevel || null,
        },
        outcomeSnapshot: {
            yearlyAveragePercentage: outcome.outcomeSnapshot?.yearlyAveragePercentage ?? null,
            failedSubjectCount: outcome.outcomeSnapshot?.failedSubjectCount ?? 0,
            criticalFailedSubjects: outcome.outcomeSnapshot?.criticalFailedSubjects || [],
            complete: outcome.outcomeSnapshot?.complete === true,
            hasMissingResults: outcome.outcomeSnapshot?.hasMissingResults === true,
            missingResults: outcome.outcomeSnapshot?.missingResults || [],
        },
        calculatedDecision: outcome.calculatedDecision,
        calculatedReasons: outcome.calculatedReasons || [],
        calculatedReasonCodes: outcome.calculatedReasonCodes || [],
        calculatedWarnings: outcome.calculatedWarnings || [],
        finalDecision: outcome.finalDecision,
        finalReasons: outcome.finalReasons || [],
        finalReasonCodes: outcome.finalReasonCodes || [],
        finalWarnings: outcome.finalWarnings || [],
        override: {
            isOverridden: outcome.override?.isOverridden === true,
            overriddenBy: normalizeId(outcome.override?.overriddenBy),
            overriddenAt: outcome.override?.overriddenAt || null,
            reason: outcome.override?.reason || null,
        },
        status: outcome.status,
        finalizedBy: normalizeId(outcome.finalizedBy),
        finalizedAt: outcome.finalizedAt || null,
        audit: {
            createdBy: normalizeId(outcome.audit?.createdBy),
            updatedBy: normalizeId(outcome.audit?.updatedBy),
        },
        createdAt: outcome.createdAt,
        updatedAt: outcome.updatedAt,
    };
}

async function loadSchoolFinalOutcomeRecord({ institutionId, outcomeId }) {
    const normalizedOutcomeId = validateObjectId(outcomeId, "outcomeId");
    const outcome = await SchoolFinalOutcome.findOne({
        _id: normalizedOutcomeId,
        institutionId,
    }).select(SCHOOL_FINAL_OUTCOME_SELECT_FIELDS);

    if (!outcome) {
        throw createError(404, "School final outcome not found");
    }

    return outcome;
}

async function finalizeSchoolStudentYearOutcome({
    institutionId,
    studentMembershipId,
    academicYearId,
    actorUserId,
    actorMembership,
    payload = {},
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedStudentMembershipId = validateObjectId(studentMembershipId, "studentMembershipId");
    const normalizedAcademicYearId = validateObjectId(academicYearId, "academicYearId");
    const normalizedActorUserId = validateActorUserId(actorUserId);
    const overrideInput = validateFinalizePayload(payload);
    ensureStaffFinalOutcomeAccess({
        institutionId: normalizedInstitutionId,
        actorUserId: normalizedActorUserId,
        actorMembership,
    });
    await ensureSchoolInstitution(normalizedInstitutionId);
    await ensureNoExistingFinalOutcome({
        institutionId: normalizedInstitutionId,
        academicYearId: normalizedAcademicYearId,
        studentMembershipId: normalizedStudentMembershipId,
    });

    const classContext = await resolveStudentClassContextForAcademicYear({
        institutionId: normalizedInstitutionId,
        studentMembershipId: normalizedStudentMembershipId,
        academicYearId: normalizedAcademicYearId,
    });
    const { policy, resolutionLevel } = await resolveActivePolicyForClassYear({
        institutionId: normalizedInstitutionId,
        academicYearId: normalizedAcademicYearId,
        classLevelId: classContext.classLevel._id,
    });
    const studentYearOutcome = await schoolOutcomeService.calculateSchoolStudentYearOutcome({
        institutionId: normalizedInstitutionId,
        studentMembershipId: normalizedStudentMembershipId,
        academicYearId: normalizedAcademicYearId,
        classLevelId: classContext.classLevel._id,
        policy,
    });
    const calculatedDecision = schoolPromotionService.resolveSchoolPromotionDecision({
        studentYearOutcome,
        policy,
    });
    const now = new Date();
    const finalDecisionFields = buildFinalDecisionFields({
        calculatedDecision,
        overrideInput,
        actorUserId: normalizedActorUserId,
        now,
    });

    let outcome;
    try {
        outcome = await SchoolFinalOutcome.create({
            institutionId: normalizedInstitutionId,
            academicYearId: normalizedAcademicYearId,
            classLevelId: classContext.classLevel._id,
            schoolClassId: classContext.schoolClass._id,
            studentMembershipId: normalizedStudentMembershipId,
            policy: buildPolicySnapshot({ policy, resolutionLevel }),
            outcomeSnapshot: buildOutcomeSnapshot(studentYearOutcome),
            calculatedDecision: calculatedDecision.decision,
            calculatedReasons: calculatedDecision.reasons || [],
            calculatedReasonCodes: calculatedDecision.reasonCodes || [],
            calculatedWarnings: calculatedDecision.warnings || [],
            ...finalDecisionFields,
            status: "finalized",
            finalizedBy: normalizedActorUserId,
            finalizedAt: now,
            audit: {
                createdBy: normalizedActorUserId,
                updatedBy: normalizedActorUserId,
            },
        });
    } catch (error) {
        if (error?.code === 11000) {
            throw createError(
                409,
                "A finalized school final outcome already exists for this student and academic year"
            );
        }

        throw error;
    }

    return {
        schoolFinalOutcome: toSchoolFinalOutcomeResponse(outcome),
    };
}

async function overrideSchoolFinalOutcome({
    institutionId,
    outcomeId,
    actorUserId,
    actorMembership,
    payload = {},
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedActorUserId = validateActorUserId(actorUserId);
    const overrideInput = validateOverridePayload(payload);
    ensureStaffFinalOutcomeAccess({
        institutionId: normalizedInstitutionId,
        actorUserId: normalizedActorUserId,
        actorMembership,
    });
    await ensureSchoolInstitution(normalizedInstitutionId);

    const outcome = await loadSchoolFinalOutcomeRecord({
        institutionId: normalizedInstitutionId,
        outcomeId,
    });

    if (outcome.status === "cancelled") {
        throw createError(409, "Cancelled school final outcomes cannot be overridden");
    }

    const calculatedDecision = {
        decision: outcome.calculatedDecision,
        reasons: outcome.calculatedReasons || [],
        reasonCodes: outcome.calculatedReasonCodes || [],
        warnings: outcome.calculatedWarnings || [],
    };
    const finalDecisionFields = buildFinalDecisionFields({
        calculatedDecision,
        overrideInput,
        actorUserId: normalizedActorUserId,
        now: new Date(),
    });

    outcome.finalDecision = finalDecisionFields.finalDecision;
    outcome.finalReasons = finalDecisionFields.finalReasons;
    outcome.finalReasonCodes = finalDecisionFields.finalReasonCodes;
    outcome.finalWarnings = finalDecisionFields.finalWarnings;
    outcome.override = finalDecisionFields.override;
    outcome.audit = {
        ...outcome.audit,
        updatedBy: normalizedActorUserId,
    };

    await outcome.save();

    // SEC-15: a final-outcome override changes a student's academic decision —
    // audit it (actor, before/after decision).
    await recordAuditLog({
        institutionId: normalizedInstitutionId,
        actorUserId: normalizedActorUserId,
        action: "school.final_outcome.overridden",
        entityType: "SchoolFinalOutcome",
        entityId: outcome._id,
        metadata: {
            from: calculatedDecision.decision,
            to: finalDecisionFields.finalDecision,
            studentMembershipId: outcome.studentMembershipId
                ? outcome.studentMembershipId.toString()
                : null,
        },
    });

    return {
        schoolFinalOutcome: toSchoolFinalOutcomeResponse(outcome),
    };
}

async function getSchoolFinalOutcomeForStudentYear({
    institutionId,
    studentMembershipId,
    academicYearId,
    actorUserId,
    actorMembership,
    accessMode = ACADEMIC_PROFILE_ACCESS_MODES.staff,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedStudentMembershipId = validateObjectId(studentMembershipId, "studentMembershipId");
    const normalizedAcademicYearId = validateObjectId(academicYearId, "academicYearId");
    const normalizedActorUserId = validateActorUserId(actorUserId);
    ensureFinalOutcomeReadAccess({
        institutionId: normalizedInstitutionId,
        studentMembershipId: normalizedStudentMembershipId,
        actorUserId: normalizedActorUserId,
        actorMembership,
        accessMode,
    });
    await ensureSchoolInstitution(normalizedInstitutionId);

    const outcome = await SchoolFinalOutcome.findOne({
        institutionId: normalizedInstitutionId,
        studentMembershipId: normalizedStudentMembershipId,
        academicYearId: normalizedAcademicYearId,
        status: { $ne: "cancelled" },
    })
        .select(SCHOOL_FINAL_OUTCOME_SELECT_FIELDS)
        .lean();

    if (!outcome) {
        throw createError(404, "School final outcome not found");
    }

    return {
        schoolFinalOutcome: toSchoolFinalOutcomeResponse(outcome),
    };
}

module.exports = {
    SCHOOL_FINAL_OUTCOME_STATUSES,
    MANUAL_OVERRIDE_REASON_CODE,
    finalizeSchoolStudentYearOutcome,
    overrideSchoolFinalOutcome,
    getSchoolFinalOutcomeForStudentYear,
};
