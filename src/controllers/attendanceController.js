const attendanceService = require("../services/attendanceService");

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

async function openSectionSessionAttendance(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const sectionSessionId = req.params.sectionSessionId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await attendanceService.openSectionSessionAttendance({
            institutionId,
            sectionId,
            sectionSessionId,
            actorUserId,
            actorMembership: req.membership || null,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function issueSectionSessionQrToken(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const sectionSessionId = req.params.sectionSessionId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await attendanceService.issueSectionSessionQrToken({
            institutionId,
            sectionId,
            sectionSessionId,
            actorUserId,
            actorMembership: req.membership || null,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function checkInToSectionSessionAttendance(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const sectionSessionId = req.params.sectionSessionId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await attendanceService.checkInToSectionSessionAttendance({
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

async function upsertManualSectionSessionAttendance(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const sectionSessionId = req.params.sectionSessionId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await attendanceService.upsertManualSectionSessionAttendance({
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

async function listSectionSessionAttendanceRoster(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const sectionSessionId = req.params.sectionSessionId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await attendanceService.listSectionSessionAttendanceRoster({
            institutionId,
            sectionId,
            sectionSessionId,
            actorUserId,
            actorMembership: req.membership || null,
            query: req.query || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function closeSectionSessionAttendance(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const sectionSessionId = req.params.sectionSessionId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await attendanceService.closeSectionSessionAttendance({
            institutionId,
            sectionId,
            sectionSessionId,
            actorUserId,
            actorMembership: req.membership || null,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    openSectionSessionAttendance,
    issueSectionSessionQrToken,
    checkInToSectionSessionAttendance,
    upsertManualSectionSessionAttendance,
    listSectionSessionAttendanceRoster,
    closeSectionSessionAttendance,
};
