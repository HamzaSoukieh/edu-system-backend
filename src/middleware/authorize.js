const mongoose = require("mongoose");
const Membership = require("../models/Membership");
const ResponsibilityAssignment = require("../models/ResponsibilityAssignment");
const { ROLE_PERMISSIONS } = require("../auth/permissions");
const {
    hasResponsibilityPermissionWithinScope,
    isResponsibilityAssignmentActiveNow,
} = require("../auth/scopedResponsibilities");

const ACTIVE_MEMBERSHIP_STATUS = Membership.schema.path("status").defaultValue;

function getUserId(req) {
    return req.user?.id || req.user?._id || null;
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

function hasPermission(permissionList, permission) {
    return permissionList.includes(permission);
}

function institutionAccess() {
    return async (req, res, next) => {
        try {
            const userId = getUserId(req);
            const institutionId = normalizeId(req.params.institutionId || req.headers["x-institution-id"]);

            if (!userId || !isValidObjectId(userId)) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            if (!institutionId) {
                return res.status(400).json({ message: "Missing institution context" });
            }

            if (!isValidObjectId(institutionId)) {
                return res.status(400).json({ message: "Invalid institution context" });
            }

            const membership = await Membership.findOne({
                userId,
                institutionId,
                status: ACTIVE_MEMBERSHIP_STATUS,
            }).lean();

            if (!membership) {
                return res.status(403).json({ message: "Institution access denied" });
            }

            req.tenantId = membership.institutionId.toString();
            req.membership = membership;
            return next();
        } catch (error) {
            return next(error);
        }
    };
}


function requirePermission(permission) {
    const middleware = (0, async function (req, res, next) {
        try {
            const userId = getUserId(req);
            if (!userId || !isValidObjectId(userId)) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            if (!req.membership) {
                return res.status(500).json({ message: "Membership context missing" });
            }

            const rolePermissions = ROLE_PERMISSIONS[req.membership.role] || [];
            if (hasPermission(rolePermissions, permission)) {
                return next();
            }

            const institutionId = req.membership.institutionId;
            const scopeType = req.authzScope?.type;
            const scopeId = normalizeId(req.authzScope?.id);

            if (!scopeType || !scopeId) {
                return res.status(403).json({ message: "Permission denied" });
            }

            if (!isValidObjectId(scopeId)) {
                return res.status(400).json({ message: "Invalid scope context" });
            }

            const assignments = await ResponsibilityAssignment.find({
                userId,
                institutionId,
                scopeType,
                scopeId,
                isActive: true,
            }).lean();

            const now = new Date();
            const permittedByAssignment = assignments.some((assignment) => {
                if (!isResponsibilityAssignmentActiveNow(assignment, now)) {
                    return false;
                }

                return hasResponsibilityPermissionWithinScope({
                    assignment,
                    permission,
                    scopeType,
                    scopeId,
                    now,
                });
            });

            if (!permittedByAssignment) {
                return res.status(403).json({ message: "Permission denied" });
            }

            return next();
        } catch (error) {
            return next(error);
        }
    });

    middleware.requiredPermission = permission;
    return middleware;
}

function withScope(typeResolver, idResolver) {
    return (req, _res, next) => {
        req.authzScope = {
            type: typeof typeResolver === "function" ? typeResolver(req) : typeResolver,
            id: typeof idResolver === "function" ? idResolver(req) : idResolver,
        };
        return next();
    };
}

module.exports = {
    institutionAccess,
    requirePermission,
    withScope,
};
