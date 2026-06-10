const responsibilityAssignmentService = require("../services/responsibilityAssignmentService");

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

function getActorUserId(req) {
    return req.user?.id || req.user?._id || null;
}

async function createResponsibilityAssignment(req, res) {
    try {
        const result = await responsibilityAssignmentService.createResponsibilityAssignment({
            institutionId: req.params.institutionId || req.tenantId,
            actorUserId: getActorUserId(req),
            actorMembership: req.membership || null,
            payload: req.body || {},
        });

        return res.status(201).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function listResponsibilityAssignments(req, res) {
    try {
        const result = await responsibilityAssignmentService.listResponsibilityAssignments({
            institutionId: req.params.institutionId || req.tenantId,
            actorUserId: getActorUserId(req),
            actorMembership: req.membership || null,
            query: req.query || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getResponsibilityAssignmentById(req, res) {
    try {
        const result = await responsibilityAssignmentService.getResponsibilityAssignmentById({
            institutionId: req.params.institutionId || req.tenantId,
            assignmentId: req.params.assignmentId,
            actorUserId: getActorUserId(req),
            actorMembership: req.membership || null,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function updateResponsibilityAssignment(req, res) {
    try {
        const result = await responsibilityAssignmentService.updateResponsibilityAssignment({
            institutionId: req.params.institutionId || req.tenantId,
            assignmentId: req.params.assignmentId,
            actorUserId: getActorUserId(req),
            actorMembership: req.membership || null,
            payload: req.body || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function deactivateResponsibilityAssignment(req, res) {
    try {
        const result = await responsibilityAssignmentService.deactivateResponsibilityAssignment({
            institutionId: req.params.institutionId || req.tenantId,
            assignmentId: req.params.assignmentId,
            actorUserId: getActorUserId(req),
            actorMembership: req.membership || null,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    createResponsibilityAssignment,
    listResponsibilityAssignments,
    getResponsibilityAssignmentById,
    updateResponsibilityAssignment,
    deactivateResponsibilityAssignment,
};
