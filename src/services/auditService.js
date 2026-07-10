const AuditLog = require("../models/AuditLog");

// Tenant audit logging (SEC-15). The AuditLog model existed but nothing wrote
// to it, so sensitive tenant mutations (member role/status changes, enrollment
// drops, grade/outcome overrides, billing changes) left no institutional trail.
//
// recordAuditLog is intentionally best-effort: it never throws. An audit-write
// failure must not roll back or break the business mutation it accompanies —
// it is logged and swallowed. Callers therefore do not need try/catch.

function normalizeId(value) {
    if (!value) {
        return null;
    }
    if (typeof value === "string") {
        return value;
    }
    if (typeof value.toString === "function") {
        return value.toString();
    }
    return null;
}

async function recordAuditLog({ institutionId, actorUserId = null, action, entityType, entityId = null, metadata = {} }) {
    try {
        if (!institutionId || !action || !entityType) {
            // A malformed audit call should not surface as a business error.
            return null;
        }

        return await AuditLog.create({
            institutionId: normalizeId(institutionId),
            actorUserId: normalizeId(actorUserId),
            action,
            entityType,
            entityId: normalizeId(entityId),
            metadata: metadata && typeof metadata === "object" ? metadata : {},
        });
    } catch (error) {
        // Never let auditing break the mutation it records.
        // eslint-disable-next-line no-console
        console.error("[audit] failed to write AuditLog", {
            action,
            entityType,
            message: error?.message,
        });
        return null;
    }
}

module.exports = {
    recordAuditLog,
};
