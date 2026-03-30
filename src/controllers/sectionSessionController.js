const sectionSessionService = require("../services/sectionSessionService");

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

async function createSectionSession(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const createdByUserId = req.user?.id || null;
        const result = await sectionSessionService.createSectionSession({
            institutionId,
            sectionId,
            createdByUserId,
            payload: req.body || {},
        });

        return res.status(201).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function listSectionSessions(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const result = await sectionSessionService.listSectionSessions({
            institutionId,
            sectionId,
            query: req.query || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function generateSectionSessions(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const createdByUserId = req.user?.id || req.user?._id || null;
        const result = await sectionSessionService.generateSectionSessions({
            institutionId,
            sectionId,
            createdByUserId,
            payload: req.body || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getSectionSessionById(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const sectionSessionId = req.params.sectionSessionId;
        const result = await sectionSessionService.getSectionSessionById({
            institutionId,
            sectionId,
            sectionSessionId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function updateSectionSession(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const sectionSessionId = req.params.sectionSessionId;
        const result = await sectionSessionService.updateSectionSession({
            institutionId,
            sectionId,
            sectionSessionId,
            payload: req.body || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function updateSectionSessionStatus(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const sectionSessionId = req.params.sectionSessionId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await sectionSessionService.updateSectionSessionStatus({
            institutionId,
            sectionId,
            sectionSessionId,
            actorUserId,
            actorMembership: req.membership || null,
            payload: req.body || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    createSectionSession,
    generateSectionSessions,
    listSectionSessions,
    getSectionSessionById,
    updateSectionSession,
    updateSectionSessionStatus,
};
