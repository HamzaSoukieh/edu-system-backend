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

async function handleStripeWebhook(req, res) {
    try {
        const event = billingService.constructStripeWebhookEvent({
            rawBody: req.body,
            signature: req.headers["stripe-signature"],
        });
        const result = await billingService.processStripeWebhookEvent(event);

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    handleStripeWebhook,
};
