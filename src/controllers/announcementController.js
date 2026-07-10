const announcementService = require("../services/announcementService");

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

function respondError(res, error) {
    const statusCode = resolveStatusCode(error);
    return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
}

async function createAnnouncement(req, res) {
    try {
        const result = await announcementService.createAnnouncement({
            ...buildServiceContext(req),
            payload: req.body || {},
        });
        return res.status(201).json(result);
    } catch (error) {
        return respondError(res, error);
    }
}

async function listAnnouncements(req, res) {
    try {
        const result = await announcementService.listAnnouncements({
            ...buildServiceContext(req),
            query: req.query || {},
        });
        return res.status(200).json(result);
    } catch (error) {
        return respondError(res, error);
    }
}

async function updateAnnouncement(req, res) {
    try {
        const result = await announcementService.updateAnnouncement({
            ...buildServiceContext(req),
            announcementId: req.params.announcementId,
            payload: req.body || {},
        });
        return res.status(200).json(result);
    } catch (error) {
        return respondError(res, error);
    }
}

async function deleteAnnouncement(req, res) {
    try {
        const result = await announcementService.deleteAnnouncement({
            ...buildServiceContext(req),
            announcementId: req.params.announcementId,
        });
        return res.status(200).json(result);
    } catch (error) {
        return respondError(res, error);
    }
}

module.exports = {
    createAnnouncement,
    listAnnouncements,
    updateAnnouncement,
    deleteAnnouncement,
};
