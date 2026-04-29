const universityAcademicPolicyService = require("../services/universityAcademicPolicyService");

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

async function createAcademicPolicy(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await universityAcademicPolicyService.createAcademicPolicy({
            institutionId,
            actorUserId,
            payload: req.body || {},
        });

        return res.status(201).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function listAcademicPolicies(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const result = await universityAcademicPolicyService.listAcademicPolicies({
            institutionId,
            query: req.query || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getAcademicPolicyById(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const policyId = req.params.policyId;
        const result = await universityAcademicPolicyService.getAcademicPolicyById({
            institutionId,
            policyId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function updateAcademicPolicy(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const policyId = req.params.policyId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await universityAcademicPolicyService.updateAcademicPolicy({
            institutionId,
            policyId,
            actorUserId,
            payload: req.body || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    createAcademicPolicy,
    listAcademicPolicies,
    getAcademicPolicyById,
    updateAcademicPolicy,
};
