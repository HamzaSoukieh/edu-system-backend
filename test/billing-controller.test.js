const test = require("node:test");
const assert = require("node:assert/strict");

const billingController = require("../src/controllers/billingController");
const billingService = require("../src/services/billingService");

// Verifies the client-facing response contract without a database: coded billing
// errors (incl. 5xx like BILLING_NOT_CONFIGURED) surface { message, code } so the
// frontend can show an actionable state; UNexpected 5xx (no code) stay masked to
// "Internal server error".

function fakeReqRes() {
    const res = {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
    const req = {
        params: { institutionId: "507f1f77bcf86cd799439011" },
        user: { id: "507f1f77bcf86cd799439012" },
        membership: { _id: "507f1f77bcf86cd799439013" },
        body: { plan: "plus" },
    };
    return { req, res };
}

function withServiceStub(method, impl, run) {
    const original = billingService[method];
    billingService[method] = impl;
    return Promise.resolve(run()).finally(() => {
        billingService[method] = original;
    });
}

test("checkout: BILLING_NOT_CONFIGURED (503) surfaces { message, code } — not 'Internal server error'", async () => {
    const err = Object.assign(new Error("Billing is temporarily unavailable."), {
        statusCode: 503,
        code: "BILLING_NOT_CONFIGURED",
    });
    await withServiceStub("createCheckoutSession", async () => { throw err; }, async () => {
        const { req, res } = fakeReqRes();
        await billingController.createCheckoutSession(req, res);
        assert.equal(res.statusCode, 503);
        assert.equal(res.body.code, "BILLING_NOT_CONFIGURED");
        assert.match(res.body.message, /temporarily unavailable/);
        assert.notEqual(res.body.message, "Internal server error");
    });
});

test("checkout: an UNexpected 5xx with no code stays masked to 'Internal server error'", async () => {
    await withServiceStub("createCheckoutSession", async () => { throw new Error("mongo blew up"); }, async () => {
        const { req, res } = fakeReqRes();
        await billingController.createCheckoutSession(req, res);
        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { message: "Internal server error" });
    });
});

test("checkout: a 409 already-active conflict passes its code + message through", async () => {
    const err = Object.assign(new Error("Your institution already has an active subscription."), {
        statusCode: 409,
        code: "SUBSCRIPTION_ALREADY_ACTIVE",
    });
    await withServiceStub("createCheckoutSession", async () => { throw err; }, async () => {
        const { req, res } = fakeReqRes();
        await billingController.createCheckoutSession(req, res);
        assert.equal(res.statusCode, 409);
        assert.equal(res.body.code, "SUBSCRIPTION_ALREADY_ACTIVE");
    });
});

test("public plans: returns the display-safe catalog with no auth and no secrets", async () => {
    const res = {
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
    billingController.getPublicBillingPlans({}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.plans.length, 2);
    assert.ok(res.body.plans.every((p) => typeof p.maxActiveStudents === "number"));
    assert.doesNotMatch(JSON.stringify(res.body), /price_|sk_|whsec_|stripeCustomerId|stripeSubscriptionId/);
});

test("checkout: a successful result is returned with 201", async () => {
    const result = { checkoutSession: { id: "cs_1", url: "https://stripe.test/x" }, billingProfile: {}, entitlements: {} };
    await withServiceStub("createCheckoutSession", async () => result, async () => {
        const { req, res } = fakeReqRes();
        await billingController.createCheckoutSession(req, res);
        assert.equal(res.statusCode, 201);
        assert.equal(res.body.checkoutSession.url, "https://stripe.test/x");
    });
});
