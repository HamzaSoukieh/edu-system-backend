const mongoose = require("mongoose");
const SchoolAcademicPolicy = require("../models/SchoolAcademicPolicy");
const ClassLevel = require("../models/ClassLevel");
const Semester = require("../models/Semester");
const Subject = require("../models/Subject");
const { ensureSchoolInstitution } = require("./classLevelService");
const { validateAcademicYearReference } = require("./academicYearService");

const SCHOOL_ACADEMIC_POLICY_STATUSES = ["draft", "active", "archived"];
const SCHOOL_ACADEMIC_POLICY_GRADING_MODES = ["percentage"];
const SCHOOL_ACADEMIC_POLICY_YEAR_CALCULATION_METHODS = ["weighted_semesters"];
const SCHOOL_ACADEMIC_POLICY_SUBJECT_FAIL_ACTIONS = [
    "warning",
    "manual_review",
    "repeat_year",
];
const SCHOOL_ACADEMIC_POLICY_PROMOTION_DECISIONS = [
    "promoted",
    "repeat_year",
    "conditional_promotion",
    "manual_review",
];
const SCHOOL_POLICY_EPSILON = 1e-9;
const SCHOOL_ACADEMIC_POLICY_SELECT_FIELDS =
    "_id institutionId name status appliesTo gradingRules aggregationRules failureRules promotionRules audit createdAt updatedAt";

function createError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeString(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim();
}

function normalizeLowerString(value) {
    return normalizeString(value).toLowerCase();
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

function validateInstitutionId(institutionId) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }
}

function validateActorUserId(actorUserId) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }
}

function validatePolicyName(rawValue) {
    const name = normalizeString(rawValue);
    if (!name) {
        throw createError(400, "name is required");
    }

    if (name.length > 120) {
        throw createError(400, "name must be at most 120 characters");
    }

    return name;
}

function validatePolicyStatus(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : "draft";
    }

    const status = normalizeLowerString(rawValue);
    if (!SCHOOL_ACADEMIC_POLICY_STATUSES.includes(status)) {
        throw createError(400, "status must be draft, active, or archived");
    }

    return status;
}

function validateEnum(rawValue, fieldName, allowedValues, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        if (allowUndefined) {
            return undefined;
        }

        throw createError(400, `${fieldName} is required`);
    }

    const value = normalizeLowerString(rawValue);
    if (!allowedValues.includes(value)) {
        throw createError(400, `${fieldName} is invalid`);
    }

    return value;
}

function validateObjectIdField(rawValue, fieldName, { allowUndefined = false, allowNull = false } = {}) {
    if (rawValue === undefined) {
        if (allowUndefined) {
            return undefined;
        }

        throw createError(400, `${fieldName} is required`);
    }

    const value = normalizeId(rawValue);
    if (!value) {
        if (allowNull) {
            return null;
        }

        throw createError(400, `${fieldName} is invalid`);
    }

    if (!isValidObjectId(value)) {
        throw createError(400, `${fieldName} is invalid`);
    }

    return value;
}

function validateBooleanField(rawValue, fieldName, { allowUndefined = false, defaultValue } = {}) {
    if (rawValue === undefined) {
        if (allowUndefined) {
            return defaultValue;
        }

        throw createError(400, `${fieldName} is required`);
    }

    if (typeof rawValue !== "boolean") {
        throw createError(400, `${fieldName} must be a boolean`);
    }

    return rawValue;
}

function validatePositiveNumber(rawValue, fieldName, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        if (allowUndefined) {
            return undefined;
        }

        throw createError(400, `${fieldName} is required`);
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value) || value <= 0) {
        throw createError(400, `${fieldName} must be a positive number`);
    }

    return value;
}

function validateBoundedNumber(rawValue, fieldName, { allowUndefined = false, min = 0, max } = {}) {
    if (rawValue === undefined) {
        if (allowUndefined) {
            return undefined;
        }

        throw createError(400, `${fieldName} is required`);
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < min) {
        throw createError(400, `${fieldName} must be a number >= ${min}`);
    }

    if (max !== undefined && value > max) {
        throw createError(400, `${fieldName} must be <= ${max}`);
    }

    return value;
}

function validatePositiveInteger(rawValue, fieldName, { allowUndefined = false } = {}) {
    if (rawValue === undefined || rawValue === null) {
        if (allowUndefined) {
            return undefined;
        }

        throw createError(400, `${fieldName} is required`);
    }

    const value = Number(rawValue);
    if (!Number.isInteger(value) || value <= 0) {
        throw createError(400, `${fieldName} must be a positive integer`);
    }

    return value;
}

function sortSemesterWeights(weights) {
    return [...weights].sort((left, right) => {
        const leftId = normalizeId(left.semesterId);
        const rightId = normalizeId(right.semesterId);
        return leftId.localeCompare(rightId);
    });
}

function sortCriticalSubjectRules(rules) {
    return [...rules].sort((left, right) => {
        const leftId = normalizeId(left.subjectId);
        const rightId = normalizeId(right.subjectId);
        return leftId.localeCompare(rightId);
    });
}

function validateAppliesTo(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        if (allowUndefined) {
            return undefined;
        }

        throw createError(400, "appliesTo is required");
    }

    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        throw createError(400, "appliesTo must be an object");
    }

    const academicYearId = validateObjectIdField(rawValue.academicYearId, "appliesTo.academicYearId");
    const schoolStageId = validateObjectIdField(rawValue.schoolStageId, "appliesTo.schoolStageId", {
        allowUndefined: true,
        allowNull: true,
    });
    const classLevelId = validateObjectIdField(rawValue.classLevelId, "appliesTo.classLevelId", {
        allowUndefined: true,
        allowNull: true,
    });

    return {
        academicYearId,
        schoolStageId: schoolStageId || null,
        classLevelId: classLevelId || null,
    };
}

function validateGradingRules(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        if (allowUndefined) {
            return undefined;
        }

        throw createError(400, "gradingRules is required");
    }

    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        throw createError(400, "gradingRules must be an object");
    }

    const gradingMode = validateEnum(
        rawValue.gradingMode,
        "gradingRules.gradingMode",
        SCHOOL_ACADEMIC_POLICY_GRADING_MODES
    );
    const scaleMax = validatePositiveNumber(rawValue.scaleMax, "gradingRules.scaleMax");
    const subjectPassMinPercentage = validateBoundedNumber(
        rawValue.subjectPassMinPercentage,
        "gradingRules.subjectPassMinPercentage",
        { min: 0, max: scaleMax }
    );
    const yearPassMinPercentage = validateBoundedNumber(
        rawValue.yearPassMinPercentage,
        "gradingRules.yearPassMinPercentage",
        { min: 0, max: scaleMax }
    );

    return {
        gradingMode,
        scaleMax,
        subjectPassMinPercentage,
        yearPassMinPercentage,
    };
}

function validateSemesterWeights(rawValue, yearCalculationMethod) {
    if (yearCalculationMethod !== "weighted_semesters") {
        return [];
    }

    if (!Array.isArray(rawValue) || !rawValue.length) {
        throw createError(
            400,
            "aggregationRules.semesterWeights must be a non-empty array when yearCalculationMethod is weighted_semesters"
        );
    }

    const seenSemesterIds = new Set();
    const semesterWeights = rawValue.map((weightRow, index) => {
        if (!weightRow || typeof weightRow !== "object" || Array.isArray(weightRow)) {
            throw createError(400, `aggregationRules.semesterWeights[${index}] must be an object`);
        }

        const semesterId = validateObjectIdField(
            weightRow.semesterId,
            `aggregationRules.semesterWeights[${index}].semesterId`
        );
        if (seenSemesterIds.has(semesterId)) {
            throw createError(400, "aggregationRules.semesterWeights must not contain duplicate semesterIds");
        }

        seenSemesterIds.add(semesterId);

        return {
            semesterId,
            weight: validatePositiveNumber(
                weightRow.weight,
                `aggregationRules.semesterWeights[${index}].weight`
            ),
        };
    });

    const totalWeight = semesterWeights.reduce((sum, row) => sum + row.weight, 0);
    if (Math.abs(totalWeight - 100) > SCHOOL_POLICY_EPSILON) {
        throw createError(400, "aggregationRules.semesterWeights total must equal 100");
    }

    return sortSemesterWeights(semesterWeights);
}

function validateAggregationRules(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        if (allowUndefined) {
            return undefined;
        }

        throw createError(400, "aggregationRules is required");
    }

    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        throw createError(400, "aggregationRules must be an object");
    }

    const yearCalculationMethod = validateEnum(
        rawValue.yearCalculationMethod,
        "aggregationRules.yearCalculationMethod",
        SCHOOL_ACADEMIC_POLICY_YEAR_CALCULATION_METHODS
    );
    const semesterWeights = validateSemesterWeights(rawValue.semesterWeights, yearCalculationMethod);

    return {
        yearCalculationMethod,
        semesterWeights,
    };
}

function validateCriticalSubjectRules(rawValue) {
    if (rawValue === undefined) {
        return [];
    }

    if (!Array.isArray(rawValue)) {
        throw createError(400, "failureRules.criticalSubjectRules must be an array");
    }

    const seenSubjectIds = new Set();
    const criticalSubjectRules = rawValue.map((rule, index) => {
        if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
            throw createError(400, `failureRules.criticalSubjectRules[${index}] must be an object`);
        }

        const subjectId = validateObjectIdField(
            rule.subjectId,
            `failureRules.criticalSubjectRules[${index}].subjectId`
        );
        if (seenSubjectIds.has(subjectId)) {
            throw createError(400, "failureRules.criticalSubjectRules must not contain duplicate subjectIds");
        }

        seenSubjectIds.add(subjectId);

        return {
            subjectId,
            failAction: validateEnum(
                rule.failAction,
                `failureRules.criticalSubjectRules[${index}].failAction`,
                SCHOOL_ACADEMIC_POLICY_SUBJECT_FAIL_ACTIONS
            ),
        };
    });

    return sortCriticalSubjectRules(criticalSubjectRules);
}

function validateFailureRules(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        if (allowUndefined) {
            return undefined;
        }

        throw createError(400, "failureRules is required");
    }

    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        throw createError(400, "failureRules must be an object");
    }

    return {
        failIfAnyCriticalSubjectFailed: validateBooleanField(
            rawValue.failIfAnyCriticalSubjectFailed,
            "failureRules.failIfAnyCriticalSubjectFailed",
            { allowUndefined: true, defaultValue: false }
        ),
        criticalSubjectRules: validateCriticalSubjectRules(rawValue.criticalSubjectRules),
        failIfFailedSubjectCountAtLeast:
            rawValue.failIfFailedSubjectCountAtLeast === undefined ||
            rawValue.failIfFailedSubjectCountAtLeast === null
                ? null
                : validatePositiveInteger(
                      rawValue.failIfFailedSubjectCountAtLeast,
                      "failureRules.failIfFailedSubjectCountAtLeast"
                  ),
        countCriticalSubjectsInFailedSubjectTotal:
            validateBooleanField(
                rawValue.countCriticalSubjectsInFailedSubjectTotal,
                "failureRules.countCriticalSubjectsInFailedSubjectTotal",
                { allowUndefined: true, defaultValue: true }
            ),
    };
}

function validatePromotionDecisionAvailability({
    passDecision,
    failDecision,
    allowConditionalPromotion,
    allowManualReview,
}) {
    const decisions = [
        { fieldName: "promotionRules.passDecision", value: passDecision },
        { fieldName: "promotionRules.failDecision", value: failDecision },
    ];

    if (!allowConditionalPromotion) {
        const conditionalDecision = decisions.find((decision) => decision.value === "conditional_promotion");
        if (conditionalDecision) {
            throw createError(
                400,
                `${conditionalDecision.fieldName} cannot be conditional_promotion when promotionRules.allowConditionalPromotion is false`
            );
        }
    }

    if (!allowManualReview) {
        const manualReviewDecision = decisions.find((decision) => decision.value === "manual_review");
        if (manualReviewDecision) {
            throw createError(
                400,
                `${manualReviewDecision.fieldName} cannot be manual_review when promotionRules.allowManualReview is false`
            );
        }
    }
}

function validatePromotionRules(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        if (allowUndefined) {
            return undefined;
        }

        throw createError(400, "promotionRules is required");
    }

    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        throw createError(400, "promotionRules must be an object");
    }

    const promotionRules = {
        enabled: validateBooleanField(rawValue.enabled, "promotionRules.enabled", {
            allowUndefined: true,
            defaultValue: true,
        }),
        passDecision: validateEnum(
            rawValue.passDecision,
            "promotionRules.passDecision",
            SCHOOL_ACADEMIC_POLICY_PROMOTION_DECISIONS
        ),
        failDecision: validateEnum(
            rawValue.failDecision,
            "promotionRules.failDecision",
            SCHOOL_ACADEMIC_POLICY_PROMOTION_DECISIONS
        ),
        allowConditionalPromotion: validateBooleanField(
            rawValue.allowConditionalPromotion,
            "promotionRules.allowConditionalPromotion",
            { allowUndefined: true, defaultValue: false }
        ),
        allowManualReview: validateBooleanField(rawValue.allowManualReview, "promotionRules.allowManualReview", {
            allowUndefined: true,
            defaultValue: true,
        }),
    };

    validatePromotionDecisionAvailability(promotionRules);

    return promotionRules;
}

function validateCreateSchoolAcademicPolicyInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    return {
        name: validatePolicyName(payload.name),
        status: validatePolicyStatus(payload.status),
        appliesTo: validateAppliesTo(payload.appliesTo),
        gradingRules: validateGradingRules(payload.gradingRules),
        aggregationRules: validateAggregationRules(payload.aggregationRules),
        failureRules: validateFailureRules(payload.failureRules),
        promotionRules: validatePromotionRules(payload.promotionRules),
    };
}

function validateUpdateSchoolAcademicPolicyInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const allowedFields = [
        "name",
        "status",
        "appliesTo",
        "gradingRules",
        "aggregationRules",
        "failureRules",
        "promotionRules",
    ];
    const invalidFields = Object.keys(payload).filter((field) => !allowedFields.includes(field));
    if (invalidFields.length) {
        throw createError(400, `Cannot update: ${invalidFields.join(", ")}`);
    }

    if (!Object.keys(payload).length) {
        throw createError(400, "At least one field must be provided");
    }

    return payload;
}

function validateListSchoolAcademicPoliciesQuery(query) {
    const status = normalizeLowerString(query?.status);
    if (status && ![...SCHOOL_ACADEMIC_POLICY_STATUSES, "all"].includes(status)) {
        throw createError(400, "status must be draft, active, archived, or all");
    }

    const academicYearId = query?.academicYearId
        ? validateObjectIdField(query.academicYearId, "academicYearId")
        : null;
    const schoolStageId =
        query?.schoolStageId !== undefined
            ? validateObjectIdField(query.schoolStageId, "schoolStageId", { allowNull: true })
            : undefined;
    const classLevelId =
        query?.classLevelId !== undefined
            ? validateObjectIdField(query.classLevelId, "classLevelId", { allowNull: true })
            : undefined;

    return {
        status: status || "all",
        academicYearId,
        schoolStageId,
        classLevelId,
    };
}

function normalizePolicyDocumentForValidation(policyDocument) {
    const source = typeof policyDocument?.toObject === "function" ? policyDocument.toObject() : policyDocument;

    return {
        name: source.name,
        status: source.status,
        appliesTo: {
            academicYearId: normalizeId(source.appliesTo?.academicYearId),
            schoolStageId: normalizeId(source.appliesTo?.schoolStageId),
            classLevelId: normalizeId(source.appliesTo?.classLevelId),
        },
        gradingRules: {
            gradingMode: source.gradingRules?.gradingMode,
            scaleMax: source.gradingRules?.scaleMax,
            subjectPassMinPercentage: source.gradingRules?.subjectPassMinPercentage,
            yearPassMinPercentage: source.gradingRules?.yearPassMinPercentage,
        },
        aggregationRules: {
            yearCalculationMethod: source.aggregationRules?.yearCalculationMethod,
            semesterWeights: (source.aggregationRules?.semesterWeights || []).map((row) => ({
                semesterId: normalizeId(row.semesterId),
                weight: row.weight,
            })),
        },
        failureRules: {
            failIfAnyCriticalSubjectFailed: source.failureRules?.failIfAnyCriticalSubjectFailed,
            criticalSubjectRules: (source.failureRules?.criticalSubjectRules || []).map((row) => ({
                subjectId: normalizeId(row.subjectId),
                failAction: row.failAction,
            })),
            failIfFailedSubjectCountAtLeast: source.failureRules?.failIfFailedSubjectCountAtLeast,
            countCriticalSubjectsInFailedSubjectTotal: source.failureRules?.countCriticalSubjectsInFailedSubjectTotal,
        },
        promotionRules: {
            enabled: source.promotionRules?.enabled,
            passDecision: source.promotionRules?.passDecision,
            failDecision: source.promotionRules?.failDecision,
            allowConditionalPromotion: source.promotionRules?.allowConditionalPromotion,
            allowManualReview: source.promotionRules?.allowManualReview,
        },
    };
}

function buildValidatedSchoolAcademicPolicyPayload(payload) {
    return validateCreateSchoolAcademicPolicyInput(payload);
}

function mergeNestedObject(baseValue, patchValue) {
    if (patchValue === undefined) {
        return baseValue;
    }

    if (!patchValue || typeof patchValue !== "object" || Array.isArray(patchValue)) {
        return patchValue;
    }

    return {
        ...(baseValue || {}),
        ...patchValue,
    };
}

function buildValidatedUpdatedSchoolAcademicPolicy(existingPolicy, payload) {
    validateUpdateSchoolAcademicPolicyInput(payload);

    const base = normalizePolicyDocumentForValidation(existingPolicy);
    const mergedPayload = {
        ...base,
        ...payload,
        appliesTo: mergeNestedObject(base.appliesTo, payload.appliesTo),
        gradingRules: mergeNestedObject(base.gradingRules, payload.gradingRules),
        aggregationRules: mergeNestedObject(base.aggregationRules, payload.aggregationRules),
        failureRules: mergeNestedObject(base.failureRules, payload.failureRules),
        promotionRules: mergeNestedObject(base.promotionRules, payload.promotionRules),
    };

    return buildValidatedSchoolAcademicPolicyPayload(mergedPayload);
}

async function ensureClassLevelExistsIfProvided({ institutionId, classLevelId }) {
    if (!classLevelId) {
        return null;
    }

    const classLevel = await ClassLevel.findOne({
        _id: classLevelId,
        institutionId,
    })
        .select("_id status")
        .lean();

    if (!classLevel) {
        throw createError(404, "Class level not found");
    }

    return classLevel;
}

async function ensureSemesterWeightsExist({ institutionId, policyInput }) {
    const semesterWeights = policyInput.aggregationRules?.semesterWeights || [];
    if (!Array.isArray(semesterWeights)) {
        throw createError(400, "aggregationRules.semesterWeights must be an array");
    }

    if (!semesterWeights.length) {
        return;
    }

    const seenSemesterIds = new Set();
    const semesterIds = semesterWeights.map((row, index) => {
        const semesterId = validateObjectIdField(
            row?.semesterId,
            `aggregationRules.semesterWeights[${index}].semesterId`
        );

        if (seenSemesterIds.has(semesterId)) {
            throw createError(400, "aggregationRules.semesterWeights must not contain duplicate semesterIds");
        }

        seenSemesterIds.add(semesterId);
        return semesterId;
    });

    const semesters = await Semester.find({
        institutionId,
        _id: { $in: semesterIds },
    })
        .select("_id academicYearId")
        .lean();

    if (semesters.length !== semesterIds.length) {
        throw createError(404, "One or more semesterWeights.semesterId values were not found");
    }

    const academicYearId = normalizeId(policyInput.appliesTo.academicYearId);
    const hasDifferentAcademicYear = semesters.some(
        (semester) =>
            semester.academicYearId &&
            normalizeId(semester.academicYearId) !== academicYearId
    );

    if (hasDifferentAcademicYear) {
        throw createError(400, "aggregationRules.semesterWeights must belong to appliesTo.academicYearId");
    }
}

async function ensureCriticalSubjectsExist({ institutionId, policyInput }) {
    const { criticalSubjectRules } = policyInput.failureRules;
    if (!criticalSubjectRules.length) {
        return;
    }

    const subjectIds = criticalSubjectRules.map((rule) => rule.subjectId);
    const subjects = await Subject.find({
        institutionId,
        _id: { $in: subjectIds },
    })
        .select("_id classLevelId departmentId")
        .lean();

    if (subjects.length !== subjectIds.length) {
        throw createError(404, "One or more failureRules.criticalSubjectRules.subjectId values were not found");
    }

    const hasUniversitySubject = subjects.some((subject) => Boolean(subject.departmentId));
    if (hasUniversitySubject) {
        throw createError(400, "failureRules.criticalSubjectRules may only reference school subjects");
    }

    const scopedClassLevelId = policyInput.appliesTo.classLevelId;
    if (scopedClassLevelId) {
        const hasDifferentClassLevelSubject = subjects.some(
            (subject) => normalizeId(subject.classLevelId) !== scopedClassLevelId
        );

        if (hasDifferentClassLevelSubject) {
            throw createError(
                400,
                "failureRules.criticalSubjectRules must reference subjects from appliesTo.classLevelId"
            );
        }
    }
}

async function validateSchoolAcademicPolicyScopeAndReferences({ institutionId, policyInput }) {
    await validateAcademicYearReference({
        institutionId,
        academicYearId: policyInput.appliesTo.academicYearId,
    });
    await ensureClassLevelExistsIfProvided({
        institutionId,
        classLevelId: policyInput.appliesTo.classLevelId,
    });
    await ensureSemesterWeightsExist({
        institutionId,
        policyInput,
    });
    await ensureCriticalSubjectsExist({
        institutionId,
        policyInput,
    });
}

function buildActivePolicyScopeQuery({ institutionId, appliesTo, excludePolicyId = null }) {
    const query = {
        institutionId,
        status: "active",
        "appliesTo.academicYearId": appliesTo.academicYearId,
        "appliesTo.schoolStageId": appliesTo.schoolStageId || null,
        "appliesTo.classLevelId": appliesTo.classLevelId || null,
    };

    if (excludePolicyId) {
        query._id = { $ne: excludePolicyId };
    }

    return query;
}

async function ensureNoActivePolicyConflict({ institutionId, appliesTo, excludePolicyId = null }) {
    const existingPolicy = await SchoolAcademicPolicy.findOne(
        buildActivePolicyScopeQuery({ institutionId, appliesTo, excludePolicyId })
    )
        .select("_id")
        .lean();

    if (existingPolicy) {
        throw createError(409, "An active school academic policy already exists for this exact scope");
    }
}

function toSchoolAcademicPolicyResponse(policy) {
    return {
        id: policy._id.toString(),
        institutionId: policy.institutionId.toString(),
        name: policy.name,
        status: policy.status,
        appliesTo: {
            academicYearId: normalizeId(policy.appliesTo?.academicYearId),
            schoolStageId: normalizeId(policy.appliesTo?.schoolStageId),
            classLevelId: normalizeId(policy.appliesTo?.classLevelId),
        },
        gradingRules: {
            gradingMode: policy.gradingRules.gradingMode,
            scaleMax: policy.gradingRules.scaleMax,
            subjectPassMinPercentage: policy.gradingRules.subjectPassMinPercentage,
            yearPassMinPercentage: policy.gradingRules.yearPassMinPercentage,
        },
        aggregationRules: {
            yearCalculationMethod: policy.aggregationRules.yearCalculationMethod,
            semesterWeights: (policy.aggregationRules.semesterWeights || []).map((row) => ({
                semesterId: normalizeId(row.semesterId),
                weight: row.weight,
            })),
        },
        failureRules: {
            failIfAnyCriticalSubjectFailed: policy.failureRules.failIfAnyCriticalSubjectFailed,
            criticalSubjectRules: (policy.failureRules.criticalSubjectRules || []).map((row) => ({
                subjectId: normalizeId(row.subjectId),
                failAction: row.failAction,
            })),
            failIfFailedSubjectCountAtLeast: policy.failureRules.failIfFailedSubjectCountAtLeast,
            countCriticalSubjectsInFailedSubjectTotal: policy.failureRules.countCriticalSubjectsInFailedSubjectTotal,
        },
        promotionRules: {
            enabled: policy.promotionRules.enabled,
            passDecision: policy.promotionRules.passDecision,
            failDecision: policy.promotionRules.failDecision,
            allowConditionalPromotion: policy.promotionRules.allowConditionalPromotion,
            allowManualReview: policy.promotionRules.allowManualReview,
        },
        audit: {
            createdBy: normalizeId(policy.audit?.createdBy),
            updatedBy: normalizeId(policy.audit?.updatedBy),
        },
        createdAt: policy.createdAt,
        updatedAt: policy.updatedAt,
    };
}

async function loadSchoolAcademicPolicyRecord({ institutionId, policyId }) {
    if (!policyId || !isValidObjectId(policyId)) {
        throw createError(400, "Invalid policyId");
    }

    const policy = await SchoolAcademicPolicy.findOne({
        _id: policyId,
        institutionId,
    }).select(SCHOOL_ACADEMIC_POLICY_SELECT_FIELDS);

    if (!policy) {
        throw createError(404, "School academic policy not found");
    }

    return policy;
}

async function createSchoolAcademicPolicy({ institutionId, actorUserId, payload }) {
    validateInstitutionId(institutionId);
    validateActorUserId(actorUserId);
    await ensureSchoolInstitution(institutionId);

    const policyInput = buildValidatedSchoolAcademicPolicyPayload(payload);
    await validateSchoolAcademicPolicyScopeAndReferences({
        institutionId,
        policyInput,
    });

    if (policyInput.status === "active") {
        await ensureNoActivePolicyConflict({
            institutionId,
            appliesTo: policyInput.appliesTo,
        });
    }

    const policy = await SchoolAcademicPolicy.create({
        institutionId,
        ...policyInput,
        audit: {
            createdBy: actorUserId,
            updatedBy: actorUserId,
        },
    });

    return {
        schoolAcademicPolicy: toSchoolAcademicPolicyResponse(policy),
    };
}

async function listSchoolAcademicPolicies({ institutionId, query = {} }) {
    validateInstitutionId(institutionId);
    await ensureSchoolInstitution(institutionId);

    const filters = validateListSchoolAcademicPoliciesQuery(query);
    const mongoQuery = {
        institutionId,
    };

    if (filters.status !== "all") {
        mongoQuery.status = filters.status;
    }

    if (filters.academicYearId) {
        mongoQuery["appliesTo.academicYearId"] = filters.academicYearId;
    }

    if (filters.schoolStageId !== undefined) {
        mongoQuery["appliesTo.schoolStageId"] = filters.schoolStageId || null;
    }

    if (filters.classLevelId !== undefined) {
        mongoQuery["appliesTo.classLevelId"] = filters.classLevelId || null;
    }

    const policies = await SchoolAcademicPolicy.find(mongoQuery)
        .select(SCHOOL_ACADEMIC_POLICY_SELECT_FIELDS)
        .sort({
            "appliesTo.academicYearId": -1,
            "appliesTo.schoolStageId": 1,
            "appliesTo.classLevelId": 1,
            createdAt: -1,
        })
        .lean();

    return {
        schoolAcademicPolicies: policies.map(toSchoolAcademicPolicyResponse),
    };
}

async function getSchoolAcademicPolicyById({ institutionId, policyId }) {
    validateInstitutionId(institutionId);
    await ensureSchoolInstitution(institutionId);

    const policy = await loadSchoolAcademicPolicyRecord({ institutionId, policyId });

    return {
        schoolAcademicPolicy: toSchoolAcademicPolicyResponse(policy),
    };
}

async function updateSchoolAcademicPolicy({ institutionId, policyId, actorUserId, payload }) {
    validateInstitutionId(institutionId);
    validateActorUserId(actorUserId);
    await ensureSchoolInstitution(institutionId);

    const policy = await loadSchoolAcademicPolicyRecord({ institutionId, policyId });
    const policyInput = buildValidatedUpdatedSchoolAcademicPolicy(policy, payload);

    await validateSchoolAcademicPolicyScopeAndReferences({
        institutionId,
        policyInput,
    });

    if (policyInput.status === "active") {
        await ensureNoActivePolicyConflict({
            institutionId,
            appliesTo: policyInput.appliesTo,
            excludePolicyId: policy._id.toString(),
        });
    }

    policy.name = policyInput.name;
    policy.status = policyInput.status;
    policy.appliesTo = policyInput.appliesTo;
    policy.gradingRules = policyInput.gradingRules;
    policy.aggregationRules = policyInput.aggregationRules;
    policy.failureRules = policyInput.failureRules;
    policy.promotionRules = policyInput.promotionRules;
    policy.audit = {
        ...policy.audit,
        updatedBy: actorUserId,
    };

    await policy.save();

    return {
        schoolAcademicPolicy: toSchoolAcademicPolicyResponse(policy),
    };
}

async function archiveSchoolAcademicPolicy({ institutionId, policyId, actorUserId }) {
    validateInstitutionId(institutionId);
    validateActorUserId(actorUserId);
    await ensureSchoolInstitution(institutionId);

    const policy = await loadSchoolAcademicPolicyRecord({ institutionId, policyId });
    policy.status = "archived";
    policy.audit = {
        ...policy.audit,
        updatedBy: actorUserId,
    };

    await policy.save();

    return {
        schoolAcademicPolicy: toSchoolAcademicPolicyResponse(policy),
    };
}

function buildResolverQuery({ institutionId, academicYearId, schoolStageId = null, classLevelId = null }) {
    return {
        institutionId,
        status: "active",
        "appliesTo.academicYearId": academicYearId,
        "appliesTo.schoolStageId": schoolStageId,
        "appliesTo.classLevelId": classLevelId,
    };
}

async function resolveSchoolAcademicPolicyForClassLevel({
    institutionId,
    academicYearId,
    schoolStageId,
    classLevelId,
}) {
    validateInstitutionId(institutionId);
    await ensureSchoolInstitution(institutionId);

    const normalizedAcademicYearId = validateObjectIdField(academicYearId, "academicYearId");
    const normalizedSchoolStageId = validateObjectIdField(schoolStageId, "schoolStageId", {
        allowUndefined: true,
        allowNull: true,
    });
    const normalizedClassLevelId = validateObjectIdField(classLevelId, "classLevelId", {
        allowUndefined: true,
        allowNull: true,
    });

    if (normalizedClassLevelId) {
        await ensureClassLevelExistsIfProvided({
            institutionId,
            classLevelId: normalizedClassLevelId,
        });
    }

    const resolverCandidates = [
        {
            resolutionLevel: "class_level",
            query: buildResolverQuery({
                institutionId,
                academicYearId: normalizedAcademicYearId,
                schoolStageId: normalizedSchoolStageId || null,
                classLevelId: normalizedClassLevelId,
            }),
            enabled: Boolean(normalizedClassLevelId),
        },
        {
            resolutionLevel: "class_level",
            query: buildResolverQuery({
                institutionId,
                academicYearId: normalizedAcademicYearId,
                schoolStageId: null,
                classLevelId: normalizedClassLevelId,
            }),
            enabled: Boolean(normalizedClassLevelId && normalizedSchoolStageId),
        },
        {
            resolutionLevel: "school_stage",
            query: buildResolverQuery({
                institutionId,
                academicYearId: normalizedAcademicYearId,
                schoolStageId: normalizedSchoolStageId || null,
                classLevelId: null,
            }),
            enabled: Boolean(normalizedSchoolStageId),
        },
        {
            resolutionLevel: "academic_year",
            query: buildResolverQuery({
                institutionId,
                academicYearId: normalizedAcademicYearId,
                schoolStageId: null,
                classLevelId: null,
            }),
            enabled: true,
        },
    ];

    for (const candidate of resolverCandidates) {
        if (!candidate.enabled) {
            continue;
        }

        const policy = await SchoolAcademicPolicy.findOne(candidate.query)
            .select(SCHOOL_ACADEMIC_POLICY_SELECT_FIELDS)
            .lean();

        if (policy) {
            return {
                policy: toSchoolAcademicPolicyResponse(policy),
                resolutionLevel: candidate.resolutionLevel,
            };
        }
    }

    return {
        policy: null,
        resolutionLevel: null,
    };
}

module.exports = {
    SCHOOL_ACADEMIC_POLICY_STATUSES,
    SCHOOL_ACADEMIC_POLICY_GRADING_MODES,
    SCHOOL_ACADEMIC_POLICY_YEAR_CALCULATION_METHODS,
    SCHOOL_ACADEMIC_POLICY_SUBJECT_FAIL_ACTIONS,
    SCHOOL_ACADEMIC_POLICY_PROMOTION_DECISIONS,
    validateCreateSchoolAcademicPolicyInput,
    createSchoolAcademicPolicy,
    listSchoolAcademicPolicies,
    getSchoolAcademicPolicyById,
    updateSchoolAcademicPolicy,
    archiveSchoolAcademicPolicy,
    resolveSchoolAcademicPolicyForClassLevel,
};
