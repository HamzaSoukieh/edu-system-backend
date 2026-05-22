const academicYearService = require("../services/academicYearService");

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

async function createAcademicYear(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const createdByUserId = req.user?.id || req.user?._id || null;
        const result = await academicYearService.createAcademicYear({
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

async function listAcademicYears(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const result = await academicYearService.listAcademicYears({
            institutionId,
            query: req.query || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getActiveAcademicYear(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const result = await academicYearService.getActiveAcademicYear({
            institutionId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getAcademicYearById(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const result = await academicYearService.getAcademicYearById({
            institutionId,
            academicYearId: req.params.academicYearId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function updateAcademicYear(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const result = await academicYearService.updateAcademicYear({
            institutionId,
            academicYearId: req.params.academicYearId,
            payload: req.body || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function archiveAcademicYear(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const result = await academicYearService.archiveAcademicYear({
            institutionId,
            academicYearId: req.params.academicYearId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    createAcademicYear,
    listAcademicYears,
    getActiveAcademicYear,
    getAcademicYearById,
    updateAcademicYear,
    archiveAcademicYear,
};
