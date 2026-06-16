const academicDecisionService = require("../services/academicDecisionService");

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

function buildServiceContext(req) {
    return {
        institutionId: req.params.institutionId || req.tenantId,
        actorUserId: req.user?.id || req.user?._id || null,
        actorMembership: req.membership || null,
    };
}

async function recommendEnrollmentDrop(req, res) {
    try {
        const result = await academicDecisionService.recommendEnrollmentDrop({
            ...buildServiceContext(req),
            enrollmentId: req.body?.enrollmentId,
            studentMemberId: req.body?.studentMemberId,
            payload: req.body || {},
        });

        return res.status(201).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function listAcademicDecisions(req, res) {
    try {
        const result = await academicDecisionService.listAcademicDecisions({
            ...buildServiceContext(req),
            query: req.query || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function listAcademicDecisionReviewQueue(req, res) {
    try {
        const result = await academicDecisionService.listAcademicDecisionReviewQueue({
            ...buildServiceContext(req),
            query: req.query || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getAcademicDecisionById(req, res) {
    try {
        const result = await academicDecisionService.getAcademicDecisionById({
            ...buildServiceContext(req),
            decisionId: req.params.decisionId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function approveAcademicDecision(req, res) {
    try {
        const result = await academicDecisionService.approveAcademicDecision({
            ...buildServiceContext(req),
            decisionId: req.params.decisionId,
            payload: req.body || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function rejectAcademicDecision(req, res) {
    try {
        const result = await academicDecisionService.rejectAcademicDecision({
            ...buildServiceContext(req),
            decisionId: req.params.decisionId,
            payload: req.body || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function applyAcademicDecision(req, res) {
    try {
        const result = await academicDecisionService.applyAcademicDecision({
            ...buildServiceContext(req),
            decisionId: req.params.decisionId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function cancelAcademicDecision(req, res) {
    try {
        const result = await academicDecisionService.cancelAcademicDecision({
            ...buildServiceContext(req),
            decisionId: req.params.decisionId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    recommendEnrollmentDrop,
    listAcademicDecisions,
    listAcademicDecisionReviewQueue,
    getAcademicDecisionById,
    approveAcademicDecision,
    rejectAcademicDecision,
    applyAcademicDecision,
    cancelAcademicDecision,
};
