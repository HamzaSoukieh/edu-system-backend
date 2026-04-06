const assessmentService = require("../services/assessmentService");

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

async function createAssessment(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await assessmentService.createAssessment({
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

async function listAssessments(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await assessmentService.listAssessments({
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

async function getAssessmentById(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const assessmentId = req.params.assessmentId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await assessmentService.getAssessmentById({
            institutionId,
            sectionId,
            assessmentId,
            actorUserId,
            actorMembership: req.membership || null,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function updateAssessment(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const assessmentId = req.params.assessmentId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await assessmentService.updateAssessment({
            institutionId,
            sectionId,
            assessmentId,
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

async function updateAssessmentStatus(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const assessmentId = req.params.assessmentId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await assessmentService.updateAssessmentStatus({
            institutionId,
            sectionId,
            assessmentId,
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

async function upsertAssessmentResults(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const assessmentId = req.params.assessmentId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await assessmentService.upsertAssessmentResults({
            institutionId,
            sectionId,
            assessmentId,
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

async function listAssessmentResults(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const assessmentId = req.params.assessmentId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await assessmentService.listAssessmentResults({
            institutionId,
            sectionId,
            assessmentId,
            actorUserId,
            actorMembership: req.membership || null,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getSectionResults(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await assessmentService.getSectionResults({
            institutionId,
            sectionId,
            actorUserId,
            actorMembership: req.membership || null,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function listMyResults(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await assessmentService.listMyResults({
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

async function listMyAssessments(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await assessmentService.listMyAssessments({
            institutionId,
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
    createAssessment,
    listAssessments,
    getAssessmentById,
    updateAssessment,
    updateAssessmentStatus,
    upsertAssessmentResults,
    listAssessmentResults,
    getSectionResults,
    listMyAssessments,
    listMyResults,
};
