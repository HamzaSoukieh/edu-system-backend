const mongoose = require("mongoose");
const InstitutionAcademicPolicy = require("../models/InstitutionAcademicPolicy");
const Institution = require("../models/Institution");
const Semester = require("../models/Semester");
const Section = require("../models/Section");
const Assessment = require("../models/Assessment");

const ACADEMIC_POLICY_STATUSES = ["draft", "active", "archived"];
const RESOLVABLE_POLICY_STATUSES = ["active", "archived"];
const ACADEMIC_POLICY_SELECT_FIELDS =
    "_id institutionId name status effectiveFromSemesterId minimumEnrollmentCreditHours defaultMaxCreditHours overloadMinGpa overloadMaxCreditHours outcomeThresholds gpaBands createdByUserId updatedByUserId createdAt updatedAt";
const GPA_SCALE_MAX = 4;
const POLICY_EPSILON = 1e-9;

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
    if (!value) {
        return null;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed || null;
    }

    if (typeof value.toString === "function") {
        const asString = value.toString().trim();
        return asString || null;
    }

    return null;
}

function isValidObjectId(value) {
    const normalized = normalizeId(value);
    return Boolean(normalized) && mongoose.Types.ObjectId.isValid(normalized);
}

function isDuplicateKeyError(error) {
    return Boolean(error) && error.name === "MongoServerError" && error.code === 11000;
}

function formatDateOnly(value) {
    return value.toISOString().slice(0, 10);
}

function normalizePolicyName(rawValue) {
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
    if (!ACADEMIC_POLICY_STATUSES.includes(status)) {
        throw createError(400, "status must be draft, active, or archived");
    }

    return status;
}

function validateIntegerField(rawValue, fieldName, { allowUndefined = false, min = 0 } = {}) {
    if (rawValue === undefined) {
        if (allowUndefined) {
            return undefined;
        }

        throw createError(400, `${fieldName} is required`);
    }

    if (!Number.isInteger(rawValue) || rawValue < min) {
        throw createError(400, `${fieldName} must be an integer >= ${min}`);
    }

    return rawValue;
}

function validateBoundedNumber(rawValue, fieldName, { allowUndefined = false, min = 0, max = null } = {}) {
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

    if (max !== null && value > max) {
        throw createError(400, `${fieldName} must be <= ${max}`);
    }

    return value;
}

function normalizeSemesterObjectId(rawValue, fieldName, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : null;
    }

    const value = normalizeId(rawValue);
    if (!value || !isValidObjectId(value)) {
        throw createError(400, `${fieldName} is invalid`);
    }

    return value;
}

function readThresholdValue(rawValue, primaryField, legacyField) {
    if (rawValue?.[primaryField] !== undefined) {
        return rawValue[primaryField];
    }

    return rawValue?.[legacyField];
}

function validateOutcomeThresholds(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        if (allowUndefined) {
            return undefined;
        }

        throw createError(400, "outcomeThresholds is required");
    }

    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        throw createError(400, "outcomeThresholds must be an object");
    }

    const failedMaxPercentage = validateBoundedNumber(
        rawValue.failedMaxPercentage,
        "outcomeThresholds.failedMaxPercentage",
        { min: 0, max: 100 }
    );
    const improvableMinPercentage = validateBoundedNumber(
        readThresholdValue(rawValue, "improvableMinPercentage", "reEnrollableMinPercentage"),
        "outcomeThresholds.improvableMinPercentage",
        { min: 0, max: 100 }
    );
    const improvableMaxPercentage = validateBoundedNumber(
        readThresholdValue(rawValue, "improvableMaxPercentage", "reEnrollableMaxPercentage"),
        "outcomeThresholds.improvableMaxPercentage",
        { min: 0, max: 100 }
    );
    const finalPassMinPercentage = validateBoundedNumber(
        rawValue.finalPassMinPercentage,
        "outcomeThresholds.finalPassMinPercentage",
        { min: 0, max: 100 }
    );

    if (!(failedMaxPercentage < improvableMinPercentage)) {
        throw createError(
            400,
            "outcomeThresholds.failedMaxPercentage must be < outcomeThresholds.improvableMinPercentage"
        );
    }

    if (!(improvableMinPercentage <= improvableMaxPercentage)) {
        throw createError(
            400,
            "outcomeThresholds.improvableMinPercentage must be <= outcomeThresholds.improvableMaxPercentage"
        );
    }

    if (!(improvableMaxPercentage < finalPassMinPercentage)) {
        throw createError(
            400,
            "outcomeThresholds.improvableMaxPercentage must be < outcomeThresholds.finalPassMinPercentage"
        );
    }

    return {
        failedMaxPercentage,
        improvableMinPercentage,
        improvableMaxPercentage,
        finalPassMinPercentage,
    };
}

function sortBandsAscending(gpaBands) {
    return [...gpaBands].sort((left, right) => {
        if (Math.abs(left.minPercentage - right.minPercentage) > POLICY_EPSILON) {
            return left.minPercentage - right.minPercentage;
        }

        return left.maxPercentage - right.maxPercentage;
    });
}

function validateGpaBands(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        if (allowUndefined) {
            return undefined;
        }

        throw createError(400, "gpaBands is required");
    }

    if (!Array.isArray(rawValue) || !rawValue.length) {
        throw createError(400, "gpaBands must be a non-empty array");
    }

    const gpaBands = rawValue.map((band, index) => {
        if (!band || typeof band !== "object" || Array.isArray(band)) {
            throw createError(400, `gpaBands[${index}] must be an object`);
        }

        const minPercentage = validateBoundedNumber(
            band.minPercentage,
            `gpaBands[${index}].minPercentage`,
            { min: 0, max: 100 }
        );
        const maxPercentage = validateBoundedNumber(
            band.maxPercentage,
            `gpaBands[${index}].maxPercentage`,
            { min: 0, max: 100 }
        );
        const gradePoint = validateBoundedNumber(
            band.gradePoint,
            `gpaBands[${index}].gradePoint`,
            { min: 0, max: GPA_SCALE_MAX }
        );

        if (maxPercentage < minPercentage) {
            throw createError(400, `gpaBands[${index}].maxPercentage must be >= minPercentage`);
        }

        return {
            minPercentage,
            maxPercentage,
            gradePoint,
        };
    });

    const sortedBands = sortBandsAscending(gpaBands);
    if (Math.abs(sortedBands[0].minPercentage - 0) > POLICY_EPSILON) {
        throw createError(400, "gpaBands must start at 0");
    }

    const lastBand = sortedBands[sortedBands.length - 1];
    if (Math.abs(lastBand.maxPercentage - 100) > POLICY_EPSILON) {
        throw createError(400, "gpaBands must end at 100");
    }

    for (let index = 1; index < sortedBands.length; index += 1) {
        const previousBand = sortedBands[index - 1];
        const currentBand = sortedBands[index];

        if (currentBand.minPercentage < previousBand.maxPercentage - POLICY_EPSILON) {
            throw createError(400, "gpaBands must be non-overlapping");
        }

        if (Math.abs(currentBand.minPercentage - previousBand.maxPercentage) > POLICY_EPSILON) {
            throw createError(400, "gpaBands must fully cover 0 to 100 without gaps");
        }

        if (currentBand.gradePoint + POLICY_EPSILON < previousBand.gradePoint) {
            throw createError(400, "gpaBands gradePoint must not decrease as scores increase");
        }
    }

    return sortedBands;
}

function readMinimumEnrollmentCreditHours(payload) {
    if (payload?.minimumEnrollmentCreditHours !== undefined) {
        return payload.minimumEnrollmentCreditHours;
    }

    return payload?.minCreditHours;
}

function validateCreateAcademicPolicyInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    return {
        name: normalizePolicyName(payload.name),
        status: validatePolicyStatus(payload.status),
        effectiveFromSemesterId: normalizeSemesterObjectId(
            payload.effectiveFromSemesterId,
            "effectiveFromSemesterId"
        ),
        minimumEnrollmentCreditHours: validateIntegerField(
            readMinimumEnrollmentCreditHours(payload),
            "minimumEnrollmentCreditHours"
        ),
        defaultMaxCreditHours: validateIntegerField(payload.defaultMaxCreditHours, "defaultMaxCreditHours"),
        overloadMinGpa: validateBoundedNumber(payload.overloadMinGpa, "overloadMinGpa", {
            min: 0,
            max: GPA_SCALE_MAX,
        }),
        overloadMaxCreditHours: validateIntegerField(payload.overloadMaxCreditHours, "overloadMaxCreditHours"),
        outcomeThresholds: validateOutcomeThresholds(payload.outcomeThresholds),
        gpaBands: validateGpaBands(payload.gpaBands),
    };
}

function validateUpdateAcademicPolicyInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const allowedFields = [
        "name",
        "status",
        "effectiveFromSemesterId",
        "minimumEnrollmentCreditHours",
        "minCreditHours",
        "defaultMaxCreditHours",
        "overloadMinGpa",
        "overloadMaxCreditHours",
        "outcomeThresholds",
        "gpaBands",
    ];
    const invalidFields = Object.keys(payload).filter((key) => !allowedFields.includes(key));
    if (invalidFields.length) {
        throw createError(400, `Cannot update: ${invalidFields.join(", ")}`);
    }

    if (!Object.keys(payload).length) {
        throw createError(400, "At least one field must be provided");
    }

    const updates = {};

    if (payload.name !== undefined) {
        updates.name = normalizePolicyName(payload.name);
    }

    if (payload.status !== undefined) {
        updates.status = validatePolicyStatus(payload.status, { allowUndefined: true });
    }

    if (payload.effectiveFromSemesterId !== undefined) {
        updates.effectiveFromSemesterId = normalizeSemesterObjectId(
            payload.effectiveFromSemesterId,
            "effectiveFromSemesterId",
            { allowUndefined: true }
        );
    }

    if (
        payload.minimumEnrollmentCreditHours !== undefined ||
        payload.minCreditHours !== undefined
    ) {
        updates.minimumEnrollmentCreditHours = validateIntegerField(
            readMinimumEnrollmentCreditHours(payload),
            "minimumEnrollmentCreditHours",
            { allowUndefined: true }
        );
    }

    if (payload.defaultMaxCreditHours !== undefined) {
        updates.defaultMaxCreditHours = validateIntegerField(payload.defaultMaxCreditHours, "defaultMaxCreditHours", {
            allowUndefined: true,
        });
    }

    if (payload.overloadMinGpa !== undefined) {
        updates.overloadMinGpa = validateBoundedNumber(payload.overloadMinGpa, "overloadMinGpa", {
            allowUndefined: true,
            min: 0,
            max: GPA_SCALE_MAX,
        });
    }

    if (payload.overloadMaxCreditHours !== undefined) {
        updates.overloadMaxCreditHours = validateIntegerField(payload.overloadMaxCreditHours, "overloadMaxCreditHours", {
            allowUndefined: true,
        });
    }

    if (payload.outcomeThresholds !== undefined) {
        updates.outcomeThresholds = validateOutcomeThresholds(payload.outcomeThresholds, {
            allowUndefined: true,
        });
    }

    if (payload.gpaBands !== undefined) {
        updates.gpaBands = validateGpaBands(payload.gpaBands, {
            allowUndefined: true,
        });
    }

    return updates;
}

function validateAcademicPolicyListQuery(query = {}) {
    if (query.status === undefined) {
        return { status: "all" };
    }

    const status = normalizeLowerString(query.status);
    if (status !== "all" && !ACADEMIC_POLICY_STATUSES.includes(status)) {
        throw createError(400, "status must be draft, active, archived, or all");
    }

    return { status };
}

function getMaxConfiguredGradePoint(policy) {
    if (!Array.isArray(policy.gpaBands) || !policy.gpaBands.length) {
        return 0;
    }

    return Math.max(...policy.gpaBands.map((band) => Number(band.gradePoint) || 0));
}

function validateResolvedPolicyShape(policy) {
    if (!policy) {
        throw createError(500, "Academic policy configuration is invalid");
    }

    if (policy.defaultMaxCreditHours < policy.minimumEnrollmentCreditHours) {
        throw createError(
            409,
            "Academic policy defaultMaxCreditHours must be >= minimumEnrollmentCreditHours"
        );
    }

    if (policy.overloadMaxCreditHours < policy.defaultMaxCreditHours) {
        throw createError(409, "Academic policy overloadMaxCreditHours must be >= defaultMaxCreditHours");
    }

    if (policy.overloadMinGpa > getMaxConfiguredGradePoint(policy) + POLICY_EPSILON) {
        throw createError(409, "Academic policy overloadMinGpa exceeds the configured GPA scale");
    }
}

function validateAcademicPolicyBusinessRules(policy) {
    if (policy.minimumEnrollmentCreditHours < 0) {
        throw createError(400, "minimumEnrollmentCreditHours must be >= 0");
    }

    if (policy.defaultMaxCreditHours < policy.minimumEnrollmentCreditHours) {
        throw createError(400, "defaultMaxCreditHours must be >= minimumEnrollmentCreditHours");
    }

    if (policy.overloadMaxCreditHours < policy.defaultMaxCreditHours) {
        throw createError(400, "overloadMaxCreditHours must be >= defaultMaxCreditHours");
    }

    if (policy.overloadMinGpa < 0) {
        throw createError(400, "overloadMinGpa must be >= 0");
    }

    if (policy.overloadMinGpa > getMaxConfiguredGradePoint(policy) + POLICY_EPSILON) {
        throw createError(400, "overloadMinGpa exceeds the configured GPA scale");
    }
}

function buildSemesterSummary(semester) {
    if (!semester) {
        return null;
    }

    return {
        id: semester._id.toString(),
        name: semester.name,
        startDate: formatDateOnly(new Date(semester.startDate)),
        endDate: formatDateOnly(new Date(semester.endDate)),
        status: semester.status,
    };
}

function toAcademicPolicyResponse(policy, { effectiveFromSemester = null } = {}) {
    return {
        id: policy._id.toString(),
        institutionId: policy.institutionId.toString(),
        name: policy.name,
        status: policy.status,
        effectiveFromSemesterId: policy.effectiveFromSemesterId.toString(),
        minimumEnrollmentCreditHours: policy.minimumEnrollmentCreditHours,
        defaultMaxCreditHours: policy.defaultMaxCreditHours,
        overloadMinGpa: policy.overloadMinGpa,
        overloadMaxCreditHours: policy.overloadMaxCreditHours,
        outcomeThresholds: {
            failedMaxPercentage: policy.outcomeThresholds.failedMaxPercentage,
            improvableMinPercentage: policy.outcomeThresholds.improvableMinPercentage,
            improvableMaxPercentage: policy.outcomeThresholds.improvableMaxPercentage,
            finalPassMinPercentage: policy.outcomeThresholds.finalPassMinPercentage,
        },
        gpaBands: Array.isArray(policy.gpaBands)
            ? policy.gpaBands.map((band) => ({
                  minPercentage: band.minPercentage,
                  maxPercentage: band.maxPercentage,
                  gradePoint: band.gradePoint,
              }))
            : [],
        createdByUserId: policy.createdByUserId?.toString() || null,
        updatedByUserId: policy.updatedByUserId?.toString() || null,
        createdAt: policy.createdAt,
        updatedAt: policy.updatedAt,
        effectiveFromSemester: buildSemesterSummary(effectiveFromSemester),
    };
}

async function loadInstitutionRecord(institutionId) {
    const institution = await Institution.findOne({ _id: institutionId }).select("_id type").lean();
    if (!institution) {
        throw createError(404, "Institution not found");
    }

    return institution;
}

function ensureUniversityInstitution(institution) {
    if (institution.type !== "university") {
        throw createError(409, "Academic policy is only supported for university institutions");
    }
}

async function loadSemesterRecord({ institutionId, semesterId, fieldName }) {
    const semester = await Semester.findOne({
        _id: semesterId,
        institutionId,
    })
        .select("_id institutionId name startDate endDate status")
        .lean();

    if (!semester) {
        throw createError(404, `${fieldName} not found`);
    }

    return semester;
}

async function loadPolicyRecord({ institutionId, policyId }) {
    return InstitutionAcademicPolicy.findOne({
        _id: policyId,
        institutionId,
    })
        .select(ACADEMIC_POLICY_SELECT_FIELDS)
        .lean();
}

async function loadPolicySemesters(policies, institutionId) {
    const semesterIds = [
        ...new Set(
            policies
                .map((policy) => normalizeId(policy.effectiveFromSemesterId))
                .filter(Boolean)
        ),
    ];

    if (!semesterIds.length) {
        return new Map();
    }

    const semesters = await Semester.find({
        _id: { $in: semesterIds },
        institutionId,
    })
        .select("_id institutionId name startDate endDate status")
        .lean();

    return new Map(semesters.map((semester) => [semester._id.toString(), semester]));
}

function compareSemesterStartDate(leftSemester, rightSemester) {
    return new Date(leftSemester.startDate).getTime() - new Date(rightSemester.startDate).getTime();
}

function mapAcademicPolicyDuplicateError(error) {
    if (!isDuplicateKeyError(error)) {
        return null;
    }

    if (
        error.keyPattern &&
        error.keyPattern.institutionId &&
        error.keyPattern.effectiveFromSemesterId
    ) {
        return createError(
            409,
            "An active academic policy already exists for this institution and effectiveFromSemesterId"
        );
    }

    return createError(409, "Academic policy already exists");
}

async function ensureNoResolvablePolicyConflict({
    institutionId,
    status,
    excludedPolicyId = null,
    effectiveFromSemesterId,
}) {
    if (!RESOLVABLE_POLICY_STATUSES.includes(status)) {
        return;
    }

    const policyQuery = {
        institutionId,
        status: { $in: RESOLVABLE_POLICY_STATUSES },
        effectiveFromSemesterId,
    };
    if (excludedPolicyId) {
        policyQuery._id = { $ne: excludedPolicyId };
    }

    const existingPolicy = await InstitutionAcademicPolicy.findOne(policyQuery)
        .select("_id")
        .lean();

    if (existingPolicy) {
        throw createError(409, "Another resolvable academic policy already starts from this semester");
    }
}

async function listPolicyCoverageSemesters({ institutionId, policy }) {
    if (!RESOLVABLE_POLICY_STATUSES.includes(policy.status)) {
        return [];
    }

    const resolvablePolicies = await InstitutionAcademicPolicy.find({
        institutionId,
        status: { $in: RESOLVABLE_POLICY_STATUSES },
    })
        .select("_id effectiveFromSemesterId status")
        .lean();

    const semesterById = await loadPolicySemesters(resolvablePolicies, institutionId);
    const currentPolicySemester = semesterById.get(policy.effectiveFromSemesterId.toString()) || null;
    if (!currentPolicySemester) {
        return [];
    }

    const laterPolicies = resolvablePolicies
        .filter((candidate) => candidate._id.toString() !== policy._id.toString())
        .map((candidate) => ({
            policy: candidate,
            effectiveFromSemester: semesterById.get(candidate.effectiveFromSemesterId.toString()) || null,
        }))
        .filter(({ effectiveFromSemester }) => effectiveFromSemester)
        .filter(
            ({ effectiveFromSemester }) =>
                compareSemesterStartDate(currentPolicySemester, effectiveFromSemester) < 0
        )
        .sort((left, right) =>
            compareSemesterStartDate(left.effectiveFromSemester, right.effectiveFromSemester)
        );

    const nextPolicySemester = laterPolicies[0]?.effectiveFromSemester || null;
    const semesterQuery = {
        institutionId,
        startDate: { $gte: currentPolicySemester.startDate },
    };

    if (nextPolicySemester) {
        semesterQuery.startDate.$lt = nextPolicySemester.startDate;
    }

    return Semester.find(semesterQuery)
        .select("_id name startDate endDate status")
        .sort({ startDate: 1, _id: 1 })
        .lean();
}

async function hasPolicyUsedFinalizedOutcomes({ institutionId, policy }) {
    const coveredSemesters = await listPolicyCoverageSemesters({
        institutionId,
        policy,
    });
    if (!coveredSemesters.length) {
        return false;
    }

    const closedSections = await Section.find({
        institutionId,
        semesterId: { $in: coveredSemesters.map((semester) => semester._id) },
        status: "closed",
    })
        .select("_id")
        .lean();

    if (!closedSections.length) {
        return false;
    }

    const publishedWeights = await Assessment.aggregate([
        {
            $match: {
                institutionId: new mongoose.Types.ObjectId(institutionId),
                sectionId: {
                    $in: closedSections.map((section) => new mongoose.Types.ObjectId(section._id)),
                },
                status: "published",
            },
        },
        {
            $group: {
                _id: "$sectionId",
                publishedWeightTotal: { $sum: "$weight" },
            },
        },
    ]);

    return publishedWeights.some(
        (item) => Math.abs(Number(item.publishedWeightTotal) - 100) <= POLICY_EPSILON
    );
}

async function buildPolicyResponse(policy, institutionId) {
    const semesterById = await loadPolicySemesters([policy], institutionId);

    return toAcademicPolicyResponse(policy, {
        effectiveFromSemester: semesterById.get(policy.effectiveFromSemesterId.toString()) || null,
    });
}

function resolveAllowedMaxCreditHours({ policy, cumulativeGpa }) {
    validateResolvedPolicyShape(policy);

    if (typeof cumulativeGpa === "number" && cumulativeGpa >= policy.overloadMinGpa - POLICY_EPSILON) {
        return policy.overloadMaxCreditHours;
    }

    return policy.defaultMaxCreditHours;
}

async function createAcademicPolicy({ institutionId, actorUserId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    const input = validateCreateAcademicPolicyInput(payload);
    const institution = await loadInstitutionRecord(institutionId);
    ensureUniversityInstitution(institution);
    await loadSemesterRecord({
        institutionId,
        semesterId: input.effectiveFromSemesterId,
        fieldName: "effectiveFromSemesterId",
    });
    validateAcademicPolicyBusinessRules(input);
    await ensureNoResolvablePolicyConflict({
        institutionId,
        status: input.status,
        effectiveFromSemesterId: input.effectiveFromSemesterId,
    });

    let policy;
    try {
        policy = await InstitutionAcademicPolicy.create({
            institutionId,
            name: input.name,
            status: input.status,
            effectiveFromSemesterId: input.effectiveFromSemesterId,
            minimumEnrollmentCreditHours: input.minimumEnrollmentCreditHours,
            defaultMaxCreditHours: input.defaultMaxCreditHours,
            overloadMinGpa: input.overloadMinGpa,
            overloadMaxCreditHours: input.overloadMaxCreditHours,
            outcomeThresholds: input.outcomeThresholds,
            gpaBands: input.gpaBands,
            createdByUserId: actorUserId,
            updatedByUserId: actorUserId,
        });
    } catch (error) {
        const mappedDuplicateError = mapAcademicPolicyDuplicateError(error);
        if (mappedDuplicateError) {
            throw mappedDuplicateError;
        }

        throw error;
    }

    return {
        academicPolicy: await buildPolicyResponse(policy, institutionId),
    };
}

async function listAcademicPolicies({ institutionId, query = {} }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    const institution = await loadInstitutionRecord(institutionId);
    ensureUniversityInstitution(institution);

    const input = validateAcademicPolicyListQuery(query);
    const policyQuery = { institutionId };
    if (input.status !== "all") {
        policyQuery.status = input.status;
    }

    const policies = await InstitutionAcademicPolicy.find(policyQuery)
        .select(ACADEMIC_POLICY_SELECT_FIELDS)
        .sort({ createdAt: -1, _id: -1 })
        .lean();

    const semesterById = await loadPolicySemesters(policies, institutionId);
    return {
        academicPolicies: policies.map((policy) =>
            toAcademicPolicyResponse(policy, {
                effectiveFromSemester: semesterById.get(policy.effectiveFromSemesterId.toString()) || null,
            })
        ),
    };
}

async function getAcademicPolicyById({ institutionId, policyId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!policyId || !isValidObjectId(policyId)) {
        throw createError(400, "Invalid academic policy id");
    }

    const institution = await loadInstitutionRecord(institutionId);
    ensureUniversityInstitution(institution);

    const policy = await loadPolicyRecord({
        institutionId,
        policyId,
    });
    if (!policy) {
        throw createError(404, "Academic policy not found");
    }

    return {
        academicPolicy: await buildPolicyResponse(policy, institutionId),
    };
}

function isAcademicPolicyFieldLocked(fieldName) {
    return !["name", "status"].includes(fieldName);
}

async function updateAcademicPolicy({ institutionId, policyId, actorUserId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!policyId || !isValidObjectId(policyId)) {
        throw createError(400, "Invalid academic policy id");
    }

    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    const updates = validateUpdateAcademicPolicyInput(payload);
    const institution = await loadInstitutionRecord(institutionId);
    ensureUniversityInstitution(institution);

    const existingPolicy = await loadPolicyRecord({
        institutionId,
        policyId,
    });
    if (!existingPolicy) {
        throw createError(404, "Academic policy not found");
    }

    const mergedPolicy = {
        ...existingPolicy,
        ...updates,
        outcomeThresholds: updates.outcomeThresholds || existingPolicy.outcomeThresholds,
        gpaBands: updates.gpaBands || existingPolicy.gpaBands,
    };
    validateAcademicPolicyBusinessRules(mergedPolicy);
    await loadSemesterRecord({
        institutionId,
        semesterId: mergedPolicy.effectiveFromSemesterId,
        fieldName: "effectiveFromSemesterId",
    });

    const changingLockedFields = Object.keys(updates).filter(isAcademicPolicyFieldLocked);
    if (changingLockedFields.length) {
        const usedByFinalizedOutcomes = await hasPolicyUsedFinalizedOutcomes({
            institutionId,
            policy: existingPolicy,
        });

        if (usedByFinalizedOutcomes) {
            throw createError(
                409,
                "This academic policy is already used by finalized outcomes. Create a new future policy version instead"
            );
        }
    }

    await ensureNoResolvablePolicyConflict({
        institutionId,
        status: mergedPolicy.status,
        excludedPolicyId: policyId,
        effectiveFromSemesterId: mergedPolicy.effectiveFromSemesterId,
    });

    const safeUpdates = { ...updates, updatedByUserId: actorUserId };
    let updatedPolicy;
    try {
        updatedPolicy = await InstitutionAcademicPolicy.findOneAndUpdate(
            {
                _id: policyId,
                institutionId,
            },
            { $set: safeUpdates },
            { returnDocument: "after", runValidators: true }
        )
            .select(ACADEMIC_POLICY_SELECT_FIELDS)
            .lean();
    } catch (error) {
        const mappedDuplicateError = mapAcademicPolicyDuplicateError(error);
        if (mappedDuplicateError) {
            throw mappedDuplicateError;
        }

        throw error;
    }

    if (!updatedPolicy) {
        throw createError(404, "Academic policy not found");
    }

    return {
        academicPolicy: await buildPolicyResponse(updatedPolicy, institutionId),
    };
}

async function resolveAcademicPolicyForSemester({ institutionId, semesterId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!semesterId || !isValidObjectId(semesterId)) {
        throw createError(400, "Invalid semester id");
    }

    const institution = await loadInstitutionRecord(institutionId);
    ensureUniversityInstitution(institution);

    const semester = await loadSemesterRecord({
        institutionId,
        semesterId,
        fieldName: "semesterId",
    });

    const policies = await InstitutionAcademicPolicy.find({
        institutionId,
        status: { $in: RESOLVABLE_POLICY_STATUSES },
    })
        .select(ACADEMIC_POLICY_SELECT_FIELDS)
        .lean();

    if (!policies.length) {
        throw createError(409, "No academic policy is configured for this semester");
    }

    const semesterById = await loadPolicySemesters(policies, institutionId);
    const candidatePolicies = policies
        .map((policy) => ({
            policy,
            effectiveFromSemester: semesterById.get(policy.effectiveFromSemesterId.toString()) || null,
        }))
        .filter(({ effectiveFromSemester }) => effectiveFromSemester)
        .filter(
            ({ effectiveFromSemester }) =>
                compareSemesterStartDate(effectiveFromSemester, semester) <= 0
        );

    if (!candidatePolicies.length) {
        throw createError(409, "No academic policy is configured for this semester");
    }

    candidatePolicies.sort((left, right) =>
        compareSemesterStartDate(right.effectiveFromSemester, left.effectiveFromSemester)
    );

    const winningStartDate = new Date(candidatePolicies[0].effectiveFromSemester.startDate).getTime();
    const matchedPolicies = candidatePolicies.filter(
        ({ effectiveFromSemester }) =>
            new Date(effectiveFromSemester.startDate).getTime() === winningStartDate
    );

    if (matchedPolicies.length > 1) {
        throw createError(409, "Multiple academic policies overlap for this semester");
    }

    const { policy, effectiveFromSemester } = matchedPolicies[0];
    validateResolvedPolicyShape(policy);

    return toAcademicPolicyResponse(policy, {
        effectiveFromSemester,
    });
}

module.exports = {
    ACADEMIC_POLICY_STATUSES,
    POLICY_EPSILON,
    GPA_SCALE_MAX,
    validateOutcomeThresholds,
    validateGpaBands,
    validateCreateAcademicPolicyInput,
    validateUpdateAcademicPolicyInput,
    resolveAllowedMaxCreditHours,
    createAcademicPolicy,
    listAcademicPolicies,
    getAcademicPolicyById,
    updateAcademicPolicy,
    resolveAcademicPolicyForSemester,
};
