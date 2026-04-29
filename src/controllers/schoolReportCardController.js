const schoolReportCardService = require("../services/schoolReportCardService");

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

async function getStudentSemesterReportCard(req, res) {
    try {
        const result = await schoolReportCardService.getStudentSemesterReportCard({
            institutionId: req.params.institutionId || req.tenantId,
            studentMembershipId: req.params.studentMembershipId,
            semesterId: req.params.semesterId,
            actorUserId: req.user?.id || req.user?._id || null,
            actorMembership: req.membership,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getStudentYearlyReportCard(req, res) {
    try {
        const result = await schoolReportCardService.getStudentYearlyReportCard({
            institutionId: req.params.institutionId || req.tenantId,
            studentMembershipId: req.params.studentMembershipId,
            academicYearId: req.params.academicYearId,
            actorUserId: req.user?.id || req.user?._id || null,
            actorMembership: req.membership,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getClassPromotionSummary(req, res) {
    try {
        const result = await schoolReportCardService.getClassPromotionSummary({
            institutionId: req.params.institutionId || req.tenantId,
            schoolClassId: req.params.schoolClassId,
            academicYearId: req.params.academicYearId,
            actorUserId: req.user?.id || req.user?._id || null,
            actorMembership: req.membership,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    getStudentSemesterReportCard,
    getStudentYearlyReportCard,
    getClassPromotionSummary,
};
