const fs = require("fs");
const path = require("path");
const sectionMaterialService = require("../services/sectionMaterialService");

const PRIVATE_SECTION_MATERIAL_DIR = path.resolve(
    __dirname,
    "..",
    "..",
    "storage",
    "section-materials"
);

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

function resolvePrivateUploadedFilePath(file = {}) {
    const rawPath = typeof file.path === "string" && file.path.trim() ? file.path : null;
    const rawFilename = typeof file.filename === "string" && file.filename.trim() ? file.filename : null;
    const candidatePath = rawPath
        ? path.resolve(rawPath)
        : rawFilename
          ? path.resolve(PRIVATE_SECTION_MATERIAL_DIR, rawFilename)
          : null;

    if (!candidatePath || !candidatePath.startsWith(`${PRIVATE_SECTION_MATERIAL_DIR}${path.sep}`)) {
        return null;
    }

    return candidatePath;
}

function removeUploadedFile(file) {
    const filePath = resolvePrivateUploadedFilePath(file);
    if (!filePath) {
        return;
    }

    fs.promises.unlink(filePath).catch(() => {});
}

async function createSectionMaterial(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await sectionMaterialService.createSectionMaterial({
            institutionId,
            sectionId,
            actorUserId,
            actorMembership: req.membership || null,
            payload: req.body || {},
            file: req.file || null,
        });

        return res.status(201).json(result);
    } catch (error) {
        removeUploadedFile(req.file);
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function listSectionMaterialsForStaff(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await sectionMaterialService.listSectionMaterialsForStaff({
            institutionId,
            sectionId,
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

async function getSectionMaterialByIdForStaff(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const materialId = req.params.materialId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await sectionMaterialService.getSectionMaterialByIdForStaff({
            institutionId,
            sectionId,
            materialId,
            actorUserId,
            actorMembership: req.membership || null,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function updateSectionMaterial(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const materialId = req.params.materialId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await sectionMaterialService.updateSectionMaterial({
            institutionId,
            sectionId,
            materialId,
            actorUserId,
            actorMembership: req.membership || null,
            payload: req.body || {},
            file: req.file || null,
        });

        return res.status(200).json(result);
    } catch (error) {
        removeUploadedFile(req.file);
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function updateSectionMaterialStatus(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const materialId = req.params.materialId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await sectionMaterialService.updateSectionMaterialStatus({
            institutionId,
            sectionId,
            materialId,
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

async function listMySectionMaterials(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await sectionMaterialService.listMySectionMaterials({
            institutionId,
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

async function downloadSectionMaterialFile(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const materialId = req.params.materialId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const fileAccess = await sectionMaterialService.getSectionMaterialFileAccess({
            institutionId,
            sectionId,
            materialId,
            actorUserId,
            actorMembership: req.membership || null,
        });

        res.setHeader("Content-Type", fileAccess.mimeType);
        return res.download(fileAccess.filePath, fileAccess.filename);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    createSectionMaterial,
    listSectionMaterialsForStaff,
    getSectionMaterialByIdForStaff,
    updateSectionMaterial,
    updateSectionMaterialStatus,
    listMySectionMaterials,
    downloadSectionMaterialFile,
};
