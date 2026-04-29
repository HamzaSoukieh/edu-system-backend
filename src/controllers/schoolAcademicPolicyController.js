const schoolAcademicPolicyService = require("../services/schoolAcademicPolicyService");

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

async function createSchoolAcademicPolicy(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await schoolAcademicPolicyService.createSchoolAcademicPolicy({
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

async function listSchoolAcademicPolicies(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const result = await schoolAcademicPolicyService.listSchoolAcademicPolicies({
            institutionId,
            query: req.query || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getSchoolAcademicPolicyById(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const policyId = req.params.policyId;
        const result = await schoolAcademicPolicyService.getSchoolAcademicPolicyById({
            institutionId,
            policyId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function updateSchoolAcademicPolicy(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const policyId = req.params.policyId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await schoolAcademicPolicyService.updateSchoolAcademicPolicy({
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

async function archiveSchoolAcademicPolicy(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const policyId = req.params.policyId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await schoolAcademicPolicyService.archiveSchoolAcademicPolicy({
            institutionId,
            policyId,
            actorUserId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    createSchoolAcademicPolicy,
    listSchoolAcademicPolicies,
    getSchoolAcademicPolicyById,
    updateSchoolAcademicPolicy,
    archiveSchoolAcademicPolicy,
};
