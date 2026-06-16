const notificationService = require("../services/notificationService");

function resolveStatusCode(error) {
    if (error && Number.isInteger(error.statusCode)) {
        return error.statusCode;
    }

    return 500;
}

function resolveMessage(error, statusCode) {
    if (statusCode >= 500) {
        return "Internal server error";
    }

    return error.message || "Request failed";
}

function buildServiceContext(req) {
    return {
        institutionId: req.params.institutionId || req.tenantId,
        actorUserId: req.user?.id || req.user?._id || null,
        actorMembership: req.membership || null,
    };
}

async function listMyNotifications(req, res) {
    try {
        const result = await notificationService.listMyNotifications({
            ...buildServiceContext(req),
            query: req.query || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function markMyNotificationRead(req, res) {
    try {
        const result = await notificationService.markMyNotificationRead({
            ...buildServiceContext(req),
            notificationId: req.params.notificationId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    listMyNotifications,
    markMyNotificationRead,
};
