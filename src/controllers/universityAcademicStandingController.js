const universityAcademicStandingReportService = require("../services/universityAcademicStandingReportService");

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

async function getUniversityAcademicStandingSummary(req, res) {
    try {
        const result = await universityAcademicStandingReportService.summarizeUniversityAcademicStandings(
            buildServiceContext(req)
        );

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function listUniversityAcademicStandingStudents(req, res) {
    try {
        const result = await universityAcademicStandingReportService.listUniversityAcademicStandingStudents(
            buildServiceContext(req)
        );

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getMyInstructorAcademicStandingSummary(req, res) {
    try {
        const result = await universityAcademicStandingReportService.summarizeMyUniversityAcademicStandings(
            buildServiceContext(req)
        );

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function listMyInstructorAcademicStandingStudents(req, res) {
    try {
        const result = await universityAcademicStandingReportService.listMyUniversityAcademicStandingStudents(
            buildServiceContext(req)
        );

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    getMyInstructorAcademicStandingSummary,
    getUniversityAcademicStandingSummary,
    listMyInstructorAcademicStandingStudents,
    listUniversityAcademicStandingStudents,
};
