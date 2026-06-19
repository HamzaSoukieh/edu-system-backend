const platformService = require("../services/platformService");

function buildContext(req) {
    return {
        platformAdminId: req.platformAdmin?.id,
        actorUserId: req.user?.id,
        permissions: Array.isArray(req.platformPermissions) ? [...req.platformPermissions] : [],
        ipAddress: req.ip,
        userAgent: req.get?.("user-agent") || req.headers?.["user-agent"],
    };
}

function sendError(res, error) {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    return res.status(statusCode).json({ message: statusCode >= 500 ? "Internal server error" : error.message });
}

async function listInstitutions(req, res) {
    try {
        return res.status(200).json(await platformService.listInstitutions({ context: buildContext(req), query: req.query || {} }));
    } catch (error) { return sendError(res, error); }
}

async function getInstitutionSummary(req, res) {
    try {
        return res.status(200).json(await platformService.getInstitutionSummary({ context: buildContext(req), institutionId: req.params.institutionId }));
    } catch (error) { return sendError(res, error); }
}

async function getInstitutionBilling(req, res) {
    try {
        return res.status(200).json(await platformService.getInstitutionBilling({ context: buildContext(req), institutionId: req.params.institutionId, query: req.query || {} }));
    } catch (error) { return sendError(res, error); }
}

async function listFailedWebhookEvents(req, res) {
    try {
        return res.status(200).json(await platformService.listFailedWebhookEvents({ context: buildContext(req), query: req.query || {} }));
    } catch (error) { return sendError(res, error); }
}

async function listPlatformAuditLogs(req, res) {
    try {
        return res.status(200).json(await platformService.listPlatformAuditLogs({ context: buildContext(req), query: req.query || {} }));
    } catch (error) { return sendError(res, error); }
}

module.exports = { getInstitutionBilling, getInstitutionSummary, listFailedWebhookEvents, listInstitutions, listPlatformAuditLogs };
