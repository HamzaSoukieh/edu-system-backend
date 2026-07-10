const mongoose = require("mongoose");
const {
    ROLE_PERMISSIONS,
    isResponsibilityScopeAllowed,
    RESPONSIBILITY_TYPES: CANONICAL_RESPONSIBILITY_TYPES,
} = require("../auth/permissions");
const { isResponsibilityAssignmentActiveNow } = require("../auth/scopedResponsibilities");
const ClassLevel = require("../models/ClassLevel");
const Department = require("../models/Department");
const Institution = require("../models/Institution");
const Membership = require("../models/Membership");
const ResponsibilityAssignment = require("../models/ResponsibilityAssignment");
const SchoolClass = require("../models/SchoolClass");
const Section = require("../models/Section");

// Sourced from the canonical permissions map (D-005 / DB-5) so model, service, and
// authorization never drift. Includes head, coordinator, mentor, dean, principal, president.
const RESPONSIBILITY_TYPES = CANONICAL_RESPONSIBILITY_TYPES;
const SCOPE_TYPES = ["institution", "department", "classLevel", "class", "section"];
const CREATE_FIELDS = ["userId", "responsibilityType", "scopeType", "scopeId", "startAt", "endAt", "isActive"];
const UPDATE_FIELDS = ["scopeType", "scopeId", "startAt", "endAt", "isActive"];
const ASSIGNMENT_SELECT_FIELDS =
    "_id institutionId userId responsibilityType scopeType scopeId isActive startAt endAt createdAt updatedAt";
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const ACTIVE_MEMBERSHIP_STATUS = Membership.schema.path("status").defaultValue;
const ELIGIBLE_TARGET_ROLES = ["instructor"];

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

function validateObjectId(value, fieldName) {
    const normalized = normalizeId(value);
    if (!normalized || !isValidObjectId(normalized)) {
        throw createError(400, `Invalid ${fieldName}`);
    }

    return normalized;
}

function validateInstitutionId(institutionId) {
    return validateObjectId(institutionId, "institution context");
}

function validateAssignmentId(assignmentId) {
    return validateObjectId(assignmentId, "responsibility assignment id");
}

function validatePayloadObject(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }
}

function rejectUnexpectedFields(payload, allowedFields) {
    const invalidFields = Object.keys(payload).filter((field) => !allowedFields.includes(field));
    if (invalidFields.length) {
        throw createError(400, `Cannot set: ${invalidFields.join(", ")}`);
    }
}

function validateResponsibilityType(rawValue) {
    const responsibilityType = normalizeLowerString(rawValue);
    if (!RESPONSIBILITY_TYPES.includes(responsibilityType)) {
        throw createError(400, `responsibilityType must be one of: ${RESPONSIBILITY_TYPES.join(", ")}`);
    }

    return responsibilityType;
}

function validateScopeType(rawValue) {
    const scopeType = normalizeString(rawValue);
    if (!SCOPE_TYPES.includes(scopeType)) {
        throw createError(400, "scopeType must be institution, department, classLevel, class, or section");
    }

    return scopeType;
}

function validateScopeCombination({ responsibilityType, scopeType }) {
    if (!isResponsibilityScopeAllowed(responsibilityType, scopeType)) {
        throw createError(400, "scopeType is not allowed for responsibilityType");
    }
}

function validateOptionalBoolean(rawValue, fieldName, fallback) {
    if (rawValue === undefined) {
        return fallback;
    }

    if (typeof rawValue !== "boolean") {
        throw createError(400, `${fieldName} must be a boolean`);
    }

    return rawValue;
}

function parseOptionalDate(rawValue, fieldName) {
    if (rawValue === undefined) {
        return undefined;
    }

    if (rawValue === null || rawValue === "") {
        return null;
    }

    const date = rawValue instanceof Date ? rawValue : new Date(rawValue);
    if (Number.isNaN(date.getTime())) {
        throw createError(400, `${fieldName} must be a valid date`);
    }

    return date;
}

function validateDateWindow({ startAt, endAt }) {
    if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
        throw createError(400, "endAt must be after startAt");
    }
}

function hasRolePermission(role, permission) {
    return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

function ensureActorMembership({ institutionId, actorMembership }) {
    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (normalizeId(actorMembership.institutionId) !== normalizeId(institutionId)) {
        throw createError(403, "Institution access denied");
    }

    if (actorMembership.status !== ACTIVE_MEMBERSHIP_STATUS) {
        throw createError(403, "Institution access denied");
    }
}

function ensureOwnerOrAdmin({ institution, institutionId, actorUserId, actorMembership }) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    ensureActorMembership({ institutionId, actorMembership });

    if (hasRolePermission(actorMembership.role, "membership.manage")) {
        return;
    }

    if (normalizeId(institution.ownerUserId) === normalizeId(actorUserId)) {
        return;
    }

    throw createError(403, "Permission denied");
}

async function loadInstitutionForManagement({ institutionId, actorUserId, actorMembership }) {
    const institution = await Institution.findOne({ _id: institutionId })
        .select("_id ownerUserId status type")
        .lean();

    if (!institution) {
        throw createError(404, "Institution not found");
    }

    ensureOwnerOrAdmin({
        institution,
        institutionId,
        actorUserId,
        actorMembership,
    });

    return institution;
}

async function ensureTargetEligibleForResponsibilityAssignment({ institutionId, userId }) {
    const membership = await Membership.findOne({
        institutionId,
        userId,
        status: ACTIVE_MEMBERSHIP_STATUS,
    })
        .select("_id userId institutionId role status")
        .lean();

    if (!membership) {
        throw createError(400, "Target user must have active membership in this institution");
    }

    if (!ELIGIBLE_TARGET_ROLES.includes(membership.role)) {
        throw createError(400, "Target user is not eligible for responsibility assignment");
    }

    return membership;
}

async function ensureScopeExists({ institutionId, scopeType, scopeId }) {
    const normalizedScopeId = validateObjectId(scopeId, "scopeId");

    if (scopeType === "institution") {
        if (normalizeId(institutionId) !== normalizedScopeId) {
            throw createError(400, "scopeId must match institutionId for institution scope");
        }

        const institution = await Institution.findOne({ _id: institutionId }).select("_id").lean();
        if (!institution) {
            throw createError(404, "Institution not found");
        }

        return normalizedScopeId;
    }

    const scopeModelByType = {
        department: Department,
        classLevel: ClassLevel,
        class: SchoolClass,
        section: Section,
    };
    const model = scopeModelByType[scopeType];
    const scope = await model.findOne({
        _id: normalizedScopeId,
        institutionId,
    })
        .select("_id")
        .lean();

    if (!scope) {
        throw createError(404, "Scope not found");
    }

    return normalizedScopeId;
}

function toResponsibilityAssignmentResponse(assignment) {
    return {
        id: assignment._id.toString(),
        institutionId: assignment.institutionId.toString(),
        userId: assignment.userId.toString(),
        responsibilityType: assignment.responsibilityType,
        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId.toString(),
        isActive: assignment.isActive === true,
        startAt: assignment.startAt || null,
        endAt: assignment.endAt || null,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
    };
}

function validateCreateInput(payload, institutionId) {
    validatePayloadObject(payload);
    rejectUnexpectedFields(payload, CREATE_FIELDS);

    const userId = validateObjectId(payload.userId, "userId");
    const responsibilityType = validateResponsibilityType(payload.responsibilityType);
    const scopeType = validateScopeType(payload.scopeType);
    validateScopeCombination({ responsibilityType, scopeType });

    const scopeId = validateObjectId(payload.scopeId, "scopeId");
    if (scopeType === "institution" && scopeId !== normalizeId(institutionId)) {
        throw createError(400, "scopeId must match institutionId for institution scope");
    }

    const startAt = parseOptionalDate(payload.startAt, "startAt");
    const endAt = parseOptionalDate(payload.endAt, "endAt");
    validateDateWindow({
        startAt: startAt === undefined ? null : startAt,
        endAt: endAt === undefined ? null : endAt,
    });

    return {
        userId,
        responsibilityType,
        scopeType,
        scopeId,
        startAt: startAt === undefined ? null : startAt,
        endAt: endAt === undefined ? null : endAt,
        isActive: validateOptionalBoolean(payload.isActive, "isActive", true),
    };
}

function validateUpdateInput(payload, existingAssignment) {
    validatePayloadObject(payload);
    rejectUnexpectedFields(payload, UPDATE_FIELDS);

    const updates = {};
    const nextScopeType =
        payload.scopeType !== undefined ? validateScopeType(payload.scopeType) : existingAssignment.scopeType;
    const nextScopeId =
        payload.scopeId !== undefined
            ? validateObjectId(payload.scopeId, "scopeId")
            : normalizeId(existingAssignment.scopeId);

    if (payload.scopeType !== undefined || payload.scopeId !== undefined) {
        validateScopeCombination({
            responsibilityType: existingAssignment.responsibilityType,
            scopeType: nextScopeType,
        });
        updates.scopeType = nextScopeType;
        updates.scopeId = nextScopeId;
    }

    const nextStartAt =
        payload.startAt !== undefined
            ? parseOptionalDate(payload.startAt, "startAt")
            : existingAssignment.startAt || null;
    const nextEndAt =
        payload.endAt !== undefined
            ? parseOptionalDate(payload.endAt, "endAt")
            : existingAssignment.endAt || null;
    validateDateWindow({ startAt: nextStartAt, endAt: nextEndAt });

    if (payload.startAt !== undefined) {
        updates.startAt = nextStartAt;
    }

    if (payload.endAt !== undefined) {
        updates.endAt = nextEndAt;
    }

    if (payload.isActive !== undefined) {
        updates.isActive = validateOptionalBoolean(payload.isActive, "isActive");
    }

    if (!Object.keys(updates).length) {
        throw createError(400, "No valid fields to update");
    }

    return {
        updates,
        nextScopeType,
        nextScopeId,
    };
}

function validateListQuery(query = {}) {
    const filters = {};

    if (query.userId !== undefined && normalizeString(query.userId)) {
        filters.userId = validateObjectId(query.userId, "userId");
    }

    if (query.responsibilityType !== undefined && normalizeString(query.responsibilityType)) {
        filters.responsibilityType = validateResponsibilityType(query.responsibilityType);
    }

    if (query.scopeType !== undefined && normalizeString(query.scopeType)) {
        filters.scopeType = validateScopeType(query.scopeType);
    }

    if (query.scopeId !== undefined && normalizeString(query.scopeId)) {
        filters.scopeId = validateObjectId(query.scopeId, "scopeId");
    }

    if (query.isActive !== undefined && normalizeString(query.isActive)) {
        const normalized = normalizeLowerString(query.isActive);
        if (normalized !== "true" && normalized !== "false") {
            throw createError(400, "isActive must be true or false");
        }
        filters.isActive = normalized === "true";
    }

    let activeNow = null;
    if (query.activeNow !== undefined && normalizeString(query.activeNow)) {
        const normalized = normalizeLowerString(query.activeNow);
        if (normalized !== "true" && normalized !== "false") {
            throw createError(400, "activeNow must be true or false");
        }
        activeNow = normalized === "true";
    }

    const page = query.page === undefined || query.page === "" ? DEFAULT_PAGE : Number(query.page);
    if (!Number.isInteger(page) || page < 1) {
        throw createError(400, "page must be a positive integer");
    }

    const limit = query.limit === undefined || query.limit === "" ? DEFAULT_LIMIT : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        throw createError(400, `limit must be an integer between 1 and ${MAX_LIMIT}`);
    }

    return {
        filters,
        activeNow,
        page,
        limit,
    };
}

function isDuplicateAssignmentKeyError(error) {
    return Boolean(error) && error.name === "MongoServerError" && error.code === 11000;
}

async function createResponsibilityAssignment({
    institutionId,
    actorUserId,
    actorMembership,
    payload,
}) {
    const normalizedInstitutionId = validateInstitutionId(institutionId);
    await loadInstitutionForManagement({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });

    const input = validateCreateInput(payload, normalizedInstitutionId);
    await ensureTargetEligibleForResponsibilityAssignment({
        institutionId: normalizedInstitutionId,
        userId: input.userId,
    });
    await ensureScopeExists({
        institutionId: normalizedInstitutionId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
    });

    const uniqueQuery = {
        institutionId: normalizedInstitutionId,
        userId: input.userId,
        responsibilityType: input.responsibilityType,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
    };
    const existingAssignment = await ResponsibilityAssignment.findOne(uniqueQuery)
        .select(ASSIGNMENT_SELECT_FIELDS)
        .lean();

    if (existingAssignment?.isActive) {
        throw createError(409, "Active responsibility assignment already exists");
    }

    let assignment;
    try {
        if (existingAssignment) {
            assignment = await ResponsibilityAssignment.findOneAndUpdate(
                {
                    _id: existingAssignment._id,
                    institutionId: normalizedInstitutionId,
                },
                {
                    $set: {
                        startAt: input.startAt,
                        endAt: input.endAt,
                        isActive: input.isActive,
                        permissions: [],
                    },
                },
                { returnDocument: "after", runValidators: true }
            )
                .select(ASSIGNMENT_SELECT_FIELDS)
                .lean();
        } else {
            assignment = await ResponsibilityAssignment.create({
                institutionId: normalizedInstitutionId,
                userId: input.userId,
                responsibilityType: input.responsibilityType,
                scopeType: input.scopeType,
                scopeId: input.scopeId,
                startAt: input.startAt,
                endAt: input.endAt,
                isActive: input.isActive,
                permissions: [],
            });
        }
    } catch (error) {
        if (isDuplicateAssignmentKeyError(error)) {
            throw createError(409, "Responsibility assignment already exists");
        }

        throw error;
    }

    return {
        responsibilityAssignment: toResponsibilityAssignmentResponse(assignment),
    };
}

async function listResponsibilityAssignments({
    institutionId,
    actorUserId,
    actorMembership,
    query = {},
}) {
    const normalizedInstitutionId = validateInstitutionId(institutionId);
    await loadInstitutionForManagement({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });

    const { filters, activeNow, page, limit } = validateListQuery(query);
    const mongoQuery = {
        institutionId: normalizedInstitutionId,
        ...filters,
    };

    const assignments = await ResponsibilityAssignment.find(mongoQuery)
        .select(ASSIGNMENT_SELECT_FIELDS)
        .sort({ createdAt: -1, _id: -1 })
        .lean();

    const filteredAssignments =
        activeNow === null
            ? assignments
            : assignments.filter((assignment) => isResponsibilityAssignmentActiveNow(assignment) === activeNow);
    const total = filteredAssignments.length;
    const offset = (page - 1) * limit;
    const pageAssignments = filteredAssignments.slice(offset, offset + limit);

    return {
        responsibilityAssignments: pageAssignments.map(toResponsibilityAssignmentResponse),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

async function getResponsibilityAssignmentById({
    institutionId,
    assignmentId,
    actorUserId,
    actorMembership,
}) {
    const normalizedInstitutionId = validateInstitutionId(institutionId);
    const normalizedAssignmentId = validateAssignmentId(assignmentId);
    await loadInstitutionForManagement({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });

    const assignment = await ResponsibilityAssignment.findOne({
        _id: normalizedAssignmentId,
        institutionId: normalizedInstitutionId,
    })
        .select(ASSIGNMENT_SELECT_FIELDS)
        .lean();

    if (!assignment) {
        throw createError(404, "Responsibility assignment not found");
    }

    return {
        responsibilityAssignment: toResponsibilityAssignmentResponse(assignment),
    };
}

async function updateResponsibilityAssignment({
    institutionId,
    assignmentId,
    actorUserId,
    actorMembership,
    payload,
}) {
    const normalizedInstitutionId = validateInstitutionId(institutionId);
    const normalizedAssignmentId = validateAssignmentId(assignmentId);
    await loadInstitutionForManagement({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });

    const existingAssignment = await ResponsibilityAssignment.findOne({
        _id: normalizedAssignmentId,
        institutionId: normalizedInstitutionId,
    })
        .select(ASSIGNMENT_SELECT_FIELDS)
        .lean();

    if (!existingAssignment) {
        throw createError(404, "Responsibility assignment not found");
    }

    const { updates, nextScopeType, nextScopeId } = validateUpdateInput(payload, existingAssignment);
    await ensureScopeExists({
        institutionId: normalizedInstitutionId,
        scopeType: nextScopeType,
        scopeId: nextScopeId,
    });

    if (updates.scopeType || updates.scopeId || updates.isActive === true) {
        const duplicateAssignment = await ResponsibilityAssignment.findOne({
            institutionId: normalizedInstitutionId,
            userId: existingAssignment.userId,
            responsibilityType: existingAssignment.responsibilityType,
            scopeType: nextScopeType,
            scopeId: nextScopeId,
            isActive: true,
            _id: { $ne: normalizedAssignmentId },
        })
            .select("_id")
            .lean();

        if (duplicateAssignment) {
            throw createError(409, "Active responsibility assignment already exists");
        }
    }

    if (updates.permissions !== undefined) {
        delete updates.permissions;
    }

    const assignment = await ResponsibilityAssignment.findOneAndUpdate(
        {
            _id: normalizedAssignmentId,
            institutionId: normalizedInstitutionId,
        },
        {
            $set: updates,
        },
        { returnDocument: "after", runValidators: true }
    )
        .select(ASSIGNMENT_SELECT_FIELDS)
        .lean();

    if (!assignment) {
        throw createError(404, "Responsibility assignment not found");
    }

    return {
        responsibilityAssignment: toResponsibilityAssignmentResponse(assignment),
    };
}

async function deactivateResponsibilityAssignment({
    institutionId,
    assignmentId,
    actorUserId,
    actorMembership,
}) {
    const normalizedInstitutionId = validateInstitutionId(institutionId);
    const normalizedAssignmentId = validateAssignmentId(assignmentId);
    await loadInstitutionForManagement({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });

    const existingAssignment = await ResponsibilityAssignment.findOne({
        _id: normalizedAssignmentId,
        institutionId: normalizedInstitutionId,
    })
        .select(ASSIGNMENT_SELECT_FIELDS)
        .lean();

    if (!existingAssignment) {
        throw createError(404, "Responsibility assignment not found");
    }

    const now = new Date();
    const currentEndAt = existingAssignment.endAt ? new Date(existingAssignment.endAt) : null;
    const updates = {
        isActive: false,
    };

    if (!currentEndAt || Number.isNaN(currentEndAt.getTime()) || currentEndAt.getTime() > now.getTime()) {
        updates.endAt = now;
    }

    const assignment = await ResponsibilityAssignment.findOneAndUpdate(
        {
            _id: normalizedAssignmentId,
            institutionId: normalizedInstitutionId,
        },
        { $set: updates },
        { returnDocument: "after", runValidators: true }
    )
        .select(ASSIGNMENT_SELECT_FIELDS)
        .lean();

    if (!assignment) {
        throw createError(404, "Responsibility assignment not found");
    }

    return {
        responsibilityAssignment: toResponsibilityAssignmentResponse(assignment),
    };
}

module.exports = {
    CREATE_FIELDS,
    UPDATE_FIELDS,
    RESPONSIBILITY_TYPES,
    SCOPE_TYPES,
    toResponsibilityAssignmentResponse,
    createResponsibilityAssignment,
    listResponsibilityAssignments,
    getResponsibilityAssignmentById,
    updateResponsibilityAssignment,
    deactivateResponsibilityAssignment,
};
