const classStudentAssignmentService = require("../services/classStudentAssignmentService");

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

async function createClassStudentAssignment(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const classId = req.params.classId;
        const createdByUserId = req.user?.id || null;
        const result = await classStudentAssignmentService.createClassStudentAssignment({
            institutionId,
            classId,
            createdByUserId,
            payload: req.body || {},
        });

        return res.status(201).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function listClassStudentAssignments(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const classId = req.params.classId;
        const result = await classStudentAssignmentService.listClassStudentAssignments({
            institutionId,
            classId,
            query: req.query || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getClassStudentAssignmentById(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const classId = req.params.classId;
        const assignmentId = req.params.assignmentId;
        const result = await classStudentAssignmentService.getClassStudentAssignmentById({
            institutionId,
            classId,
            assignmentId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function updateClassStudentAssignmentStatus(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const classId = req.params.classId;
        const assignmentId = req.params.assignmentId;
        const result = await classStudentAssignmentService.updateClassStudentAssignmentStatus({
            institutionId,
            classId,
            assignmentId,
            payload: req.body || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    createClassStudentAssignment,
    listClassStudentAssignments,
    getClassStudentAssignmentById,
    updateClassStudentAssignmentStatus,
};
