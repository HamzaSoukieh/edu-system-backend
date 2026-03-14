const sectionService = require("../services/sectionService");

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

async function listSections(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const result = await sectionService.listSections({
            institutionId,
            query: req.query || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getSectionById(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const result = await sectionService.getSectionById({
            institutionId,
            sectionId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function createSection(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const createdByUserId = req.user?.id || null;
        const result = await sectionService.createSection({
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

async function updateSection(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const result = await sectionService.updateSection({
            institutionId,
            sectionId,
            payload: req.body || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    listSections,
    getSectionById,
    createSection,
    updateSection,
};
