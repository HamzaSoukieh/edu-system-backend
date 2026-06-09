const mongoose = require("mongoose");
const ResponsibilityAssignment = require("../models/ResponsibilityAssignment");
const {
    RESPONSIBILITY_PERMISSIONS,
    isResponsibilityScopeAllowed,
} = require("./permissions");

const INVALID_DATE = Symbol("invalidDate");

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

function normalizeDate(value) {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return INVALID_DATE;
    }

    return date;
}

function isResponsibilityAssignmentActiveNow(assignment, now = new Date()) {
    const startAt = normalizeDate(assignment.startAt);
    const endAt = normalizeDate(assignment.endAt);

    if (!assignment.isActive) {
        return false;
    }

    if (startAt === INVALID_DATE || endAt === INVALID_DATE) {
        return false;
    }

    if (startAt && now < startAt) {
        return false;
    }

    if (endAt && now > endAt) {
        return false;
    }

    return true;
}

function getEffectiveResponsibilityPermissions(responsibilityType) {
    return RESPONSIBILITY_PERMISSIONS[responsibilityType] || [];
}

function hasResponsibilityPermission(assignment, permission) {
    if (!isResponsibilityScopeAllowed(assignment.responsibilityType, assignment.scopeType)) {
        return false;
    }

    return getEffectiveResponsibilityPermissions(assignment.responsibilityType).includes(permission);
}

function hasResponsibilityPermissionWithinScope({
    assignment,
    permission,
    scopeType,
    scopeId,
    now = new Date(),
}) {
    if (!assignment || !permission) {
        return false;
    }

    if (!isResponsibilityAssignmentActiveNow(assignment, now)) {
        return false;
    }

    if (scopeType && assignment.scopeType !== scopeType) {
        return false;
    }

    if (scopeId && normalizeId(assignment.scopeId) !== normalizeId(scopeId)) {
        return false;
    }

    return hasResponsibilityPermission(assignment, permission);
}

async function resolveScopedResponsibilities({
    institutionId,
    userId,
    responsibilityTypes = null,
    scopeTypes = null,
    permission = null,
    now = new Date(),
}) {
    if (!isValidObjectId(institutionId) || !isValidObjectId(userId)) {
        return [];
    }

    const query = {
        institutionId,
        userId,
        isActive: true,
    };

    if (Array.isArray(responsibilityTypes) && responsibilityTypes.length) {
        query.responsibilityType = { $in: responsibilityTypes };
    }

    if (Array.isArray(scopeTypes) && scopeTypes.length) {
        query.scopeType = { $in: scopeTypes };
    }

    const assignments = await ResponsibilityAssignment.find(query)
        .select("_id institutionId userId scopeType scopeId responsibilityType isActive startAt endAt")
        .lean();

    return assignments.filter((assignment) => {
        if (!isResponsibilityAssignmentActiveNow(assignment, now)) {
            return false;
        }

        if (!isResponsibilityScopeAllowed(assignment.responsibilityType, assignment.scopeType)) {
            return false;
        }

        if (permission && !hasResponsibilityPermission(assignment, permission)) {
            return false;
        }

        return true;
    });
}

module.exports = {
    normalizeId,
    isResponsibilityAssignmentActiveNow,
    getEffectiveResponsibilityPermissions,
    hasResponsibilityPermission,
    hasResponsibilityPermissionWithinScope,
    resolveScopedResponsibilities,
};
