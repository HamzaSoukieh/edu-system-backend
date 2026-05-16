const schoolPromotionDashboardService = require("../services/schoolPromotionDashboardService");

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
        academicYearId: req.params.academicYearId,
        actorUserId: req.user?.id || req.user?._id || null,
        actorMembership: req.membership || null,
        query: req.query || {},
    };
}

async function getSchoolPromotionDashboardSummary(req, res) {
    try {
        const result = await schoolPromotionDashboardService.summarizeSchoolPromotionDashboard(
            buildServiceContext(req)
        );

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function listSchoolPromotionDashboardStudents(req, res) {
    try {
        const result = await schoolPromotionDashboardService.listSchoolPromotionDashboardStudents(
            buildServiceContext(req)
        );

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getMyInstructorSchoolPromotionDashboardSummary(req, res) {
    try {
        const result = await schoolPromotionDashboardService.summarizeMySchoolPromotionDashboard(
            buildServiceContext(req)
        );

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function listMyInstructorSchoolPromotionDashboardStudents(req, res) {
    try {
        const result = await schoolPromotionDashboardService.listMySchoolPromotionDashboardStudents(
            buildServiceContext(req)
        );

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    getMyInstructorSchoolPromotionDashboardSummary,
    getSchoolPromotionDashboardSummary,
    listMyInstructorSchoolPromotionDashboardStudents,
    listSchoolPromotionDashboardStudents,
};
