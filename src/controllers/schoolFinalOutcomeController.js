const schoolFinalOutcomeService = require("../services/schoolFinalOutcomeService");

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

async function finalizeSchoolStudentYearOutcome(req, res) {
    try {
        const result = await schoolFinalOutcomeService.finalizeSchoolStudentYearOutcome({
            institutionId: req.params.institutionId || req.tenantId,
            studentMembershipId: req.params.studentMembershipId,
            academicYearId: req.params.academicYearId,
            actorUserId: req.user?.id || req.user?._id || null,
            actorMembership: req.membership,
            payload: req.body || {},
        });

        return res.status(201).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function overrideSchoolFinalOutcome(req, res) {
    try {
        const result = await schoolFinalOutcomeService.overrideSchoolFinalOutcome({
            institutionId: req.params.institutionId || req.tenantId,
            outcomeId: req.params.outcomeId,
            actorUserId: req.user?.id || req.user?._id || null,
            actorMembership: req.membership,
            payload: req.body || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getSchoolFinalOutcomeForStudentYear(req, res) {
    try {
        const result = await schoolFinalOutcomeService.getSchoolFinalOutcomeForStudentYear({
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

module.exports = {
    finalizeSchoolStudentYearOutcome,
    overrideSchoolFinalOutcome,
    getSchoolFinalOutcomeForStudentYear,
};
