const classLevelService = require("../services/classLevelService");

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

async function createClassLevel(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const createdByUserId = req.user?.id || null;
        const result = await classLevelService.createClassLevel({
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

async function listClassLevels(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const result = await classLevelService.listClassLevels({
            institutionId,
            status: req.query?.status,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getClassLevelById(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const classLevelId = req.params.classLevelId;
        const result = await classLevelService.getClassLevelById({
            institutionId,
            classLevelId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function updateClassLevel(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const classLevelId = req.params.classLevelId;
        const result = await classLevelService.updateClassLevel({
            institutionId,
            classLevelId,
            payload: req.body || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    createClassLevel,
    listClassLevels,
    getClassLevelById,
    updateClassLevel,
};
