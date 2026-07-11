const billingService = require("../services/billingService");

function resolveStatusCode(error) {
    if (error && Number.isInteger(error.statusCode)) {
        return error.statusCode;
    }

    return 500;
}

// Build the client error body. Unexpected 5xx faults (no `code`) are masked to a
// generic message so nothing leaks. Intentional application errors carry a stable
// `code` and a user-safe message — including coded 5xx like BILLING_NOT_CONFIGURED
// (503) and STRIPE_UNAVAILABLE (502) — and are surfaced with their code so the
// frontend can present an actionable state instead of "Internal server error".
function buildErrorResponse(error, statusCode) {
    const hasCode = Boolean(error && error.code);
    if (statusCode >= 500 && !hasCode) {
        return { message: "Internal server error" };
    }

    const body = { message: (error && error.message) || "Request failed" };
    if (hasCode) {
        body.code = error.code;
    }
    if (error && error.details) {
        body.details = error.details;
    }
    return body;
}

function sendBillingError(res, error) {
    const statusCode = resolveStatusCode(error);
    return res.status(statusCode).json(buildErrorResponse(error, statusCode));
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
        return sendBillingError(res, error);
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
        return sendBillingError(res, error);
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
        return sendBillingError(res, error);
    }
}

// Public (unauthenticated) plan catalog — display-safe name + seat limits + cycle,
// no secrets/Stripe IDs — so the marketing/pricing page uses the backend as the
// single source of truth for plan limits instead of hardcoding them.
function getPublicBillingPlans(_req, res) {
    return res.status(200).json({ plans: billingService.getBillingPlanCatalog() });
}

module.exports = {
    createCheckoutSession,
    getBillingStatus,
    upgradeToPro,
    getPublicBillingPlans,
};
