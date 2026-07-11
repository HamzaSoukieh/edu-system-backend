const test = require("node:test");
const assert = require("node:assert/strict");
const billingService = require("../src/services/billingService");

// Focused tests for request-time billing configuration validation (the fix for
// the "Internal server error" on checkout). No database or network required —
// assertBillingConfigured is a pure gate over process.env + the injected client.

const CONFIG_KEYS = [
    "STRIPE_SECRET_KEY",
    "STRIPE_PRICE_PLUS_6_MONTH",
    "STRIPE_PRICE_PRO_6_MONTH",
    "BILLING_SUCCESS_URL",
    "BILLING_CANCEL_URL",
];

const VALID_CONFIG = {
    STRIPE_SECRET_KEY: `sk_test_${"a".repeat(40)}`,
    STRIPE_PRICE_PLUS_6_MONTH: "price_plus_6_month_live_abc123",
    STRIPE_PRICE_PRO_6_MONTH: "price_pro_6_month_live_def456",
    BILLING_SUCCESS_URL: "https://app.example.test/billing/success",
    BILLING_CANCEL_URL: "https://app.example.test/billing/cancel",
};

function withEnv(overrides, run) {
    const previous = {};
    for (const key of CONFIG_KEYS) {
        previous[key] = process.env[key];
    }
    for (const key of CONFIG_KEYS) {
        if (Object.prototype.hasOwnProperty.call(overrides, key)) {
            if (overrides[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = overrides[key];
            }
        }
    }
    try {
        return run();
    } finally {
        for (const key of CONFIG_KEYS) {
            if (previous[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = previous[key];
            }
        }
    }
}

function isNotConfigured(error) {
    return error.statusCode === 503 && error.code === "BILLING_NOT_CONFIGURED";
}

test.afterEach(() => billingService.setStripeClientForTests(null));

test("BILLING_NOT_CONFIGURED when the Stripe secret key is a placeholder", () => {
    billingService.setStripeClientForTests(null);
    withEnv({ ...VALID_CONFIG, STRIPE_SECRET_KEY: "sk_test_placeholder" }, () => {
        assert.throws(() => billingService.assertBillingConfigured(), isNotConfigured);
    });
});

test("BILLING_NOT_CONFIGURED when the secret key is missing entirely", () => {
    billingService.setStripeClientForTests(null);
    withEnv({ ...VALID_CONFIG, STRIPE_SECRET_KEY: undefined }, () => {
        assert.throws(() => billingService.assertBillingConfigured(), isNotConfigured);
    });
});

test("BILLING_NOT_CONFIGURED when plan price IDs are placeholders (the reproduced root cause)", () => {
    billingService.setStripeClientForTests(null);
    withEnv(
        {
            ...VALID_CONFIG,
            STRIPE_PRICE_PLUS_6_MONTH: "price_replace_me",
            STRIPE_PRICE_PRO_6_MONTH: "price_example",
        },
        () => assert.throws(() => billingService.assertBillingConfigured(), isNotConfigured)
    );
});

test("BILLING_NOT_CONFIGURED when a plan price ID is missing", () => {
    billingService.setStripeClientForTests(null);
    withEnv({ ...VALID_CONFIG, STRIPE_PRICE_PRO_6_MONTH: undefined }, () => {
        assert.throws(() => billingService.assertBillingConfigured(), isNotConfigured);
    });
});

test("BILLING_NOT_CONFIGURED when the success/cancel URLs are invalid", () => {
    billingService.setStripeClientForTests(null);
    withEnv({ ...VALID_CONFIG, BILLING_SUCCESS_URL: "not-a-url", BILLING_CANCEL_URL: "" }, () => {
        assert.throws(() => billingService.assertBillingConfigured(), isNotConfigured);
    });
});

test("the config gate is a no-op when a mock Stripe client is injected (test mode)", () => {
    billingService.setStripeClientForTests({ mock: true });
    withEnv(
        {
            STRIPE_SECRET_KEY: undefined,
            STRIPE_PRICE_PLUS_6_MONTH: undefined,
            STRIPE_PRICE_PRO_6_MONTH: undefined,
            BILLING_SUCCESS_URL: undefined,
            BILLING_CANCEL_URL: undefined,
        },
        () => assert.doesNotThrow(() => billingService.assertBillingConfigured())
    );
});

test("the config gate passes with a fully valid configuration", () => {
    billingService.setStripeClientForTests(null);
    withEnv(VALID_CONFIG, () => assert.doesNotThrow(() => billingService.assertBillingConfigured()));
});

test("BILLING_ERROR_CODES exposes the stable codes used by the frontend", () => {
    assert.equal(billingService.BILLING_ERROR_CODES.NOT_CONFIGURED, "BILLING_NOT_CONFIGURED");
    assert.equal(billingService.BILLING_ERROR_CODES.FORBIDDEN, "BILLING_FORBIDDEN");
    assert.equal(billingService.BILLING_ERROR_CODES.ALREADY_ACTIVE, "SUBSCRIPTION_ALREADY_ACTIVE");
    assert.equal(billingService.BILLING_ERROR_CODES.STRIPE_UNAVAILABLE, "STRIPE_UNAVAILABLE");
});

test("getBillingPlanCatalog returns display-safe plan metadata (no secrets/Stripe IDs)", () => {
    const catalog = billingService.getBillingPlanCatalog();
    assert.equal(catalog.length, 2);
    const plus = catalog.find((p) => p.plan === "plus");
    const pro = catalog.find((p) => p.plan === "pro");
    assert.equal(plus.name, "Plus");
    assert.equal(pro.name, "Pro");
    assert.equal(plus.maxActiveStudents, 300);
    assert.equal(pro.maxActiveStudents, 1000);
    assert.equal(plus.billingInterval, "six_month");
    // No Stripe price IDs / secrets leak into the catalog.
    const serialized = JSON.stringify(catalog);
    assert.doesNotMatch(serialized, /price_|sk_|whsec_/);
});

test("isBillingConfigured is false for placeholder config and true for valid config", () => {
    billingService.setStripeClientForTests(null);
    withEnv({ ...VALID_CONFIG, STRIPE_PRICE_PLUS_6_MONTH: "price_replace_me" }, () => {
        assert.equal(billingService.isBillingConfigured(), false);
    });
    withEnv(VALID_CONFIG, () => {
        assert.equal(billingService.isBillingConfigured(), true);
    });
});
