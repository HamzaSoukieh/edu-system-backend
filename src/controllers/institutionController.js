const fs = require("fs");
const institutionService = require("../services/institutionService");

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

async function getMyInstitutionContext(req, res) {
    try {
        const result = await institutionService.getMyInstitutionContext(req.user || {});
        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function updateInstitution(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const result = await institutionService.updateInstitution(institutionId, req.body || {});
        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function uploadInstitutionLogo(req, res) {
    const institutionId = req.params.institutionId || req.tenantId;

    try {
        if (!req.file) {
            return res.status(400).json({ message: "Logo image is required (field: logo)" });
        }

        const logoUrl = `/uploads/institution-logos/${req.file.filename}`;
        const result = await institutionService.updateInstitutionLogo(institutionId, logoUrl);
        return res.status(200).json(result);
    } catch (error) {
        if (req.file?.path) {
            fs.promises.unlink(req.file.path).catch(() => {});
        }

        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    getMyInstitutionContext,
    updateInstitution,
    uploadInstitutionLogo,
};
