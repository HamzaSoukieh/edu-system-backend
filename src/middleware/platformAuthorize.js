const mongoose = require("mongoose");
const PlatformAdmin = require("../models/PlatformAdmin");
const User = require("../models/User");
const PlatformAuditLog = require("../models/PlatformAuditLog");
const { getPlatformRolePermissions } = require("../auth/platformPermissions");
const { PLATFORM_AUDIT_ACTIONS } = require("../auth/platformAuditActions");

function normalizeId(value) {
    if (!value) return null;
    const normalized = String(value).trim();
    return normalized || null;
}

async function resolvePlatformAdmin(req, res, next) {
    try {
        const authenticatedUserId = normalizeId(req.user?.id || req.user?._id);
        if (!authenticatedUserId || !mongoose.Types.ObjectId.isValid(authenticatedUserId)) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const platformAdmin = await PlatformAdmin.findOne({
            userId: authenticatedUserId,
            status: "active",
        }).lean();

        if (!platformAdmin || platformAdmin.status !== "active") {
            return res.status(403).json({ message: "Platform access denied" });
        }

        if (normalizeId(platformAdmin.userId) !== authenticatedUserId) {
            return res.status(403).json({ message: "Platform access denied" });
        }

        const permissions = getPlatformRolePermissions(platformAdmin.role);
        if (!platformAdmin.role || !permissions) {
            return res.status(403).json({ message: "Platform access denied" });
        }

        const user = await User.findOne({
            _id: authenticatedUserId,
            status: "active",
            isEmailVerified: true,
        }).select("_id").lean();
        if (!user || normalizeId(user._id) !== authenticatedUserId) {
            return res.status(403).json({ message: "Platform access denied" });
        }

        req.platformAdmin = {
            id: normalizeId(platformAdmin._id),
            userId: authenticatedUserId,
            role: platformAdmin.role,
            status: platformAdmin.status,
        };
        req.platformPermissions = permissions;
        return next();
    } catch (error) {
        return next(error);
    }
}

function requirePlatformPermission(permission) {
    const middleware = async (req, res, next) => {
        if (!req.platformAdmin || !Array.isArray(req.platformPermissions)) {
            return res.status(403).json({ message: "Platform permission denied" });
        }
        if (!req.platformPermissions.includes(permission)) {
            const platformAdminId = normalizeId(req.platformAdmin.id);
            const actorUserId = normalizeId(req.user?.id);
            if (mongoose.Types.ObjectId.isValid(platformAdminId) && mongoose.Types.ObjectId.isValid(actorUserId)) {
                try {
                    await PlatformAuditLog.create({
                        actorPlatformAdminId: platformAdminId,
                        actorUserId,
                        action: PLATFORM_AUDIT_ACTIONS.PERMISSION_DENIED,
                        targetType: "platform_route",
                        targetId: normalizeId(req.originalUrl || req.path),
                        institutionId: null,
                        reason: "missing_permission",
                        metadata: {},
                        ipAddress: normalizeId(req.ip),
                        userAgent: normalizeId(req.headers?.["user-agent"]),
                        result: "denied",
                    });
                } catch (_auditError) {
                    // Authorization still fails closed when best-effort denial auditing is unavailable.
                }
            }
            return res.status(403).json({ message: "Platform permission denied" });
        }
        return next();
    };
    middleware.requiredPlatformPermission = permission;
    return middleware;
}

module.exports = { resolvePlatformAdmin, requirePlatformPermission };
