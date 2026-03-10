const semesterService = require("../services/semesterService");

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

async function createSemester(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const createdByUserId = req.user?.id || null;
        const result = await semesterService.createSemester({
            institutionId,
            createdByUserId,
            payload: req.body || {},
        });

        return res.status(201).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function listSemesters(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const result = await semesterService.listSemesters({
            institutionId,
            status: req.query?.status,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getSemesterById(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const semesterId = req.params.semesterId;
        const result = await semesterService.getSemesterById({
            institutionId,
            semesterId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getActiveSemester(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const result = await semesterService.getActiveSemester({
            institutionId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function updateSemester(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const semesterId = req.params.semesterId;
        const result = await semesterService.updateSemester({
            institutionId,
            semesterId,
            payload: req.body || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function deleteSemester(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const semesterId = req.params.semesterId;
        const result = await semesterService.deleteSemester({
            institutionId,
            semesterId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    createSemester,
    listSemesters,
    getSemesterById,
    getActiveSemester,
    updateSemester,
    deleteSemester,
};
