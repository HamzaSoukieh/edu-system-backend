const academicOversightService = require("../services/academicOversightService");

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
        query: req.query || {},
    };
}

async function getAcademicOversightRiskSummary(req, res) {
    try {
        const result = await academicOversightService.getAcademicOversightRiskSummary(
            buildServiceContext(req)
        );

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function listAcademicOversightStudents(req, res) {
    try {
        const result = await academicOversightService.listAcademicOversightStudents(
            buildServiceContext(req)
        );

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getAcademicOversightStudent(req, res) {
    try {
        const result = await academicOversightService.getAcademicOversightStudent({
            ...buildServiceContext(req),
            studentMemberId: req.params.studentMemberId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getAcademicOversightStudentStanding(req, res) {
    try {
        const result = await academicOversightService.getAcademicOversightStudentStanding({
            ...buildServiceContext(req),
            studentMemberId: req.params.studentMemberId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    getAcademicOversightRiskSummary,
    listAcademicOversightStudents,
    getAcademicOversightStudent,
    getAcademicOversightStudentStanding,
};
