const fs = require("fs");
const path = require("path");
const homeworkService = require("../services/homeworkService");

const PRIVATE_HOMEWORK_SUBMISSION_DIR = path.resolve(
    __dirname,
    "..",
    "..",
    "storage",
    "homework-submissions"
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
          ? path.resolve(PRIVATE_HOMEWORK_SUBMISSION_DIR, rawFilename)
          : null;

    if (!candidatePath || !candidatePath.startsWith(`${PRIVATE_HOMEWORK_SUBMISSION_DIR}${path.sep}`)) {
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

async function createHomework(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await homeworkService.createHomework({
            institutionId,
            sectionId,
            actorUserId,
            actorMembership: req.membership || null,
            payload: req.body || {},
        });

        return res.status(201).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function listSectionHomeworks(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await homeworkService.listSectionHomeworks({
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

async function getHomeworkById(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const homeworkId = req.params.homeworkId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await homeworkService.getHomeworkById({
            institutionId,
            sectionId,
            homeworkId,
            actorUserId,
            actorMembership: req.membership || null,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function updateHomework(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const homeworkId = req.params.homeworkId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await homeworkService.updateHomework({
            institutionId,
            sectionId,
            homeworkId,
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

async function updateHomeworkStatus(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const homeworkId = req.params.homeworkId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await homeworkService.updateHomeworkStatus({
            institutionId,
            sectionId,
            homeworkId,
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

async function listStudentHomeworks(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await homeworkService.listStudentHomeworks({
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

async function getMyHomeworkSubmission(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const homeworkId = req.params.homeworkId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await homeworkService.getMyHomeworkSubmission({
            institutionId,
            sectionId,
            homeworkId,
            actorUserId,
            actorMembership: req.membership || null,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function submitHomework(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const homeworkId = req.params.homeworkId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await homeworkService.submitHomework({
            institutionId,
            sectionId,
            homeworkId,
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

async function getHomeworkSubmissionsRoster(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const homeworkId = req.params.homeworkId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await homeworkService.getHomeworkSubmissionsRoster({
            institutionId,
            sectionId,
            homeworkId,
            actorUserId,
            actorMembership: req.membership || null,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function markEnrollmentHomeworkSubmission(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const homeworkId = req.params.homeworkId;
        const enrollmentId = req.params.enrollmentId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await homeworkService.markEnrollmentHomeworkSubmission({
            institutionId,
            sectionId,
            homeworkId,
            enrollmentId,
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

async function updateHomeworkSubmission(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const homeworkId = req.params.homeworkId;
        const submissionId = req.params.submissionId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await homeworkService.updateHomeworkSubmission({
            institutionId,
            sectionId,
            homeworkId,
            submissionId,
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

async function downloadHomeworkSubmissionFile(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const homeworkId = req.params.homeworkId;
        const submissionId = req.params.submissionId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const fileAccess = await homeworkService.getHomeworkSubmissionFileAccess({
            institutionId,
            sectionId,
            homeworkId,
            submissionId,
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
    createHomework,
    listSectionHomeworks,
    getHomeworkById,
    updateHomework,
    updateHomeworkStatus,
    listStudentHomeworks,
    getMyHomeworkSubmission,
    submitHomework,
    getHomeworkSubmissionsRoster,
    markEnrollmentHomeworkSubmission,
    updateHomeworkSubmission,
    downloadHomeworkSubmissionFile,
};
