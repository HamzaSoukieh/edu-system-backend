const schoolClassService = require("../services/schoolClassService");

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

async function createSchoolClass(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const createdByUserId = req.user?.id || null;
        const result = await schoolClassService.createSchoolClass({
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

async function listSchoolClasses(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const result = await schoolClassService.listSchoolClasses({
            institutionId,
            status: req.query?.status,
            classLevelId: req.query?.classLevelId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getSchoolClassById(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const classId = req.params.classId;
        const result = await schoolClassService.getSchoolClassById({
            institutionId,
            classId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function updateSchoolClass(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const classId = req.params.classId;
        const result = await schoolClassService.updateSchoolClass({
            institutionId,
            classId,
            payload: req.body || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    createSchoolClass,
    listSchoolClasses,
    getSchoolClassById,
    updateSchoolClass,
};
