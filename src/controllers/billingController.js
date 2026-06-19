const billingService = require("../services/billingService");

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

async function createCheckoutSession(req, res) {
    try {
        const result = await billingService.createCheckoutSession({
            institutionId: req.params.institutionId || req.tenantId,
            actorUserId: req.user?.id || req.user?._id || null,
            actorMembership: req.membership || null,
            payload: req.body || {},
        });

        return res.status(201).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getBillingStatus(req, res) {
    try {
        const result = await billingService.getBillingStatus({
            institutionId: req.params.institutionId || req.tenantId,
            actorUserId: req.user?.id || req.user?._id || null,
            actorMembership: req.membership || null,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function upgradeToPro(req, res) {
    try {
        const result = await billingService.upgradeSubscriptionToPro({
            institutionId: req.params.institutionId || req.tenantId,
            actorUserId: req.user?.id || req.user?._id || null,
            actorMembership: req.membership || null,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    createCheckoutSession,
    getBillingStatus,
    upgradeToPro,
};
