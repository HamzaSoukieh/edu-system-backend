const {
    ACTIVE_STAFF_ROLES,
    BILLING_INTERVALS,
    BILLING_PLANS,
    DENIED_SUBSCRIPTION_STATUSES,
    PAID_SUBSCRIPTION_STATUSES,
    SUBSCRIPTION_STATUSES,
} = require("./billingConstants");

const BILLING_PLAN_CONFIG = Object.freeze({
    plus: Object.freeze({
        plan: BILLING_PLANS[0],
        billingInterval: BILLING_INTERVALS[0],
        priceEnv: "STRIPE_PRICE_PLUS_6_MONTH",
        maxActiveStudents: 300,
        maxActiveStaff: 30,
    }),
    pro: Object.freeze({
        plan: BILLING_PLANS[1],
        billingInterval: BILLING_INTERVALS[0],
        priceEnv: "STRIPE_PRICE_PRO_6_MONTH",
        maxActiveStudents: 1000,
        maxActiveStaff: 100,
    }),
});

const PLACEHOLDER_STRIPE_PRICE_IDS = Object.freeze([
    "price_replace_me",
    "price_example",
    "price_test",
    "price_test_example",
    "price_placeholder",
]);

function createBillingConfigError() {
    const error = new Error("Billing plan price is not configured");
    error.statusCode = 500;
    return error;
}

function normalizeString(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim();
}

function getBillingPlanConfig(plan) {
    return BILLING_PLAN_CONFIG[normalizeString(plan).toLowerCase()] || null;
}

function isSupportedBillingPlan(plan) {
    return Boolean(getBillingPlanConfig(plan));
}

function isPaidSubscriptionStatus(status) {
    return PAID_SUBSCRIPTION_STATUSES.includes(normalizeString(status).toLowerCase());
}

function getConfiguredStripePriceId(config) {
    if (!config) {
        return "";
    }

    return normalizeString(process.env[config.priceEnv]);
}

function isValidStripePriceId(value) {
    const priceId = normalizeString(value);
    if (!/^price_[A-Za-z0-9_]+$/.test(priceId)) {
        return false;
    }

    return !PLACEHOLDER_STRIPE_PRICE_IDS.includes(priceId.toLowerCase());
}

function validateConfiguredBillingPrices() {
    const configuredPrices = {};

    for (const config of Object.values(BILLING_PLAN_CONFIG)) {
        const priceId = getConfiguredStripePriceId(config);
        if (!isValidStripePriceId(priceId)) {
            throw createBillingConfigError();
        }

        configuredPrices[config.plan] = priceId;
    }

    if (configuredPrices.plus === configuredPrices.pro) {
        throw createBillingConfigError();
    }

    return Object.freeze(configuredPrices);
}

function resolveBillingPlanByStripePriceId(stripePriceId) {
    const normalizedPriceId = normalizeString(stripePriceId);
    if (!normalizedPriceId) {
        return null;
    }

    let configuredPrices;
    try {
        configuredPrices = validateConfiguredBillingPrices();
    } catch (_error) {
        return null;
    }

    for (const config of Object.values(BILLING_PLAN_CONFIG)) {
        if (configuredPrices[config.plan] === normalizedPriceId) {
            return config;
        }
    }

    return null;
}

function getSeatCategoryForMembershipState({ role, status }) {
    if (normalizeString(status).toLowerCase() !== "active") {
        return null;
    }

    const normalizedRole = normalizeString(role).toLowerCase();
    if (normalizedRole === "student") {
        return "student";
    }

    if (ACTIVE_STAFF_ROLES.includes(normalizedRole)) {
        return "staff";
    }

    return null;
}

module.exports = {
    ACTIVE_STAFF_ROLES,
    BILLING_INTERVALS,
    BILLING_PLAN_CONFIG,
    BILLING_PLANS,
    DENIED_SUBSCRIPTION_STATUSES,
    PAID_SUBSCRIPTION_STATUSES,
    SUBSCRIPTION_STATUSES,
    getBillingPlanConfig,
    getConfiguredStripePriceId,
    getSeatCategoryForMembershipState,
    isPaidSubscriptionStatus,
    isSupportedBillingPlan,
    isValidStripePriceId,
    resolveBillingPlanByStripePriceId,
    validateConfiguredBillingPrices,
};
