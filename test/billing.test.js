const test = require("node:test");
const assert = require("node:assert/strict");

const Institution = require("../src/models/Institution");
const InstitutionBillingProfile = require("../src/models/InstitutionBillingProfile");
const StripeWebhookEvent = require("../src/models/StripeWebhookEvent");
const app = require("../src/app");
const stripeWebhookController = require("../src/controllers/stripeWebhookController");
const institutionRoutes = require("../src/routes/institutionRoutes");
const billingService = require("../src/services/billingService");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439012";
const ownerUserId = "507f1f77bcf86cd799439021";
const adminMemberId = "507f1f77bcf86cd799439031";
const studentMemberId = "507f1f77bcf86cd799439032";

function createQuery(result) {
    return {
        select() {
            return this;
        },
        lean: async () => result,
        then(resolve, reject) {
            return Promise.resolve(result).then(resolve, reject);
        },
    };
}

function normalizeId(value) {
    return value === undefined || value === null ? null : value.toString();
}

function matchesId(value, condition) {
    return normalizeId(value) === normalizeId(condition);
}

function buildInstitution(overrides = {}) {
    return {
        _id: institutionId,
        name: "Demo University",
        ownerUserId,
        status: "active",
        ...overrides,
    };
}

function buildBillingProfile(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439041",
        institutionId,
        stripeCustomerId: "cus_existing",
        stripeSubscriptionId: "sub_existing",
        stripePriceId: "price_existing",
        status: "active",
        currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z"),
        cancelAtPeriodEnd: false,
        trialEnd: null,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-01T00:00:00.000Z"),
        ...overrides,
    };
}

function buildMembership(overrides = {}) {
    return {
        _id: adminMemberId,
        institutionId,
        userId: ownerUserId,
        role: "admin",
        status: "active",
        ...overrides,
    };
}

function createResponse() {
    return {
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
}

function withBillingEnv(t) {
    const originalEnv = {
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
        STRIPE_PRICE_BASIC_MONTHLY: process.env.STRIPE_PRICE_BASIC_MONTHLY,
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
        BILLING_SUCCESS_URL: process.env.BILLING_SUCCESS_URL,
        BILLING_CANCEL_URL: process.env.BILLING_CANCEL_URL,
    };

    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.STRIPE_PRICE_BASIC_MONTHLY = "price_1TetMH3lPsyty9Ic5cBRcXvJ";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
    process.env.BILLING_SUCCESS_URL = "https://app.example.test/billing/success";
    process.env.BILLING_CANCEL_URL = "https://app.example.test/billing/cancel";

    t.after(() => {
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }

        billingService.setStripeClientForTests(null);
    });
}

function mockBillingDependencies(t, dataset = {}) {
    const data = {
        institution: buildInstitution(),
        billingProfile: null,
        webhookEvent: null,
        billingProfileUpdateThrows: null,
        queryLog: [],
        ...dataset,
    };

    t.mock.method(Institution, "findOne", (query) => {
        data.queryLog.push({ model: "Institution", method: "findOne", query });
        return createQuery(matchesId(data.institution?._id, query._id) ? data.institution : null);
    });
    t.mock.method(InstitutionBillingProfile, "findOne", (query) => {
        data.queryLog.push({ model: "InstitutionBillingProfile", method: "findOne", query });
        if (query.stripeSubscriptionId !== undefined) {
            return createQuery(
                data.billingProfile && data.billingProfile.stripeSubscriptionId === query.stripeSubscriptionId
                    ? data.billingProfile
                    : null
            );
        }
        if (query.stripeCustomerId !== undefined) {
            return createQuery(
                data.billingProfile && data.billingProfile.stripeCustomerId === query.stripeCustomerId
                    ? data.billingProfile
                    : null
            );
        }
        return createQuery(
            data.billingProfile && matchesId(data.billingProfile.institutionId, query.institutionId)
                ? data.billingProfile
                : null
        );
    });
    t.mock.method(InstitutionBillingProfile, "findOneAndUpdate", (filter, update) => {
        data.queryLog.push({ model: "InstitutionBillingProfile", method: "findOneAndUpdate", query: filter, update });
        if (data.billingProfileUpdateThrows) {
            throw data.billingProfileUpdateThrows;
        }

        return createQuery({
            _id: data.billingProfile?._id || "507f1f77bcf86cd799439041",
            institutionId: filter.institutionId,
            stripeCustomerId: update.$set?.stripeCustomerId ?? data.billingProfile?.stripeCustomerId ?? null,
            stripeSubscriptionId:
                update.$set?.stripeSubscriptionId ?? data.billingProfile?.stripeSubscriptionId ?? null,
            stripePriceId: update.$set?.stripePriceId ?? data.billingProfile?.stripePriceId ?? null,
            status: update.$set?.status ?? data.billingProfile?.status ?? null,
            currentPeriodEnd: update.$set?.currentPeriodEnd ?? data.billingProfile?.currentPeriodEnd ?? null,
            cancelAtPeriodEnd: update.$set?.cancelAtPeriodEnd ?? data.billingProfile?.cancelAtPeriodEnd ?? false,
            trialEnd: update.$set?.trialEnd ?? data.billingProfile?.trialEnd ?? null,
            createdAt: new Date("2026-06-01T00:00:00.000Z"),
            updatedAt: new Date("2026-06-02T00:00:00.000Z"),
        });
    });
    t.mock.method(StripeWebhookEvent, "findOne", (query) => {
        data.queryLog.push({ model: "StripeWebhookEvent", method: "findOne", query });
        return createQuery(
            data.webhookEvent && data.webhookEvent.stripeEventId === query.stripeEventId ? data.webhookEvent : null
        );
    });
    t.mock.method(StripeWebhookEvent, "create", async (payload) => {
        data.queryLog.push({ model: "StripeWebhookEvent", method: "create", query: payload });
        if (data.webhookEvent && data.webhookEvent.stripeEventId === payload.stripeEventId) {
            const error = new Error("duplicate webhook event");
            error.code = 11000;
            throw error;
        }

        data.webhookEvent = {
            ...payload,
            createdAt: new Date("2026-06-01T00:00:00.000Z"),
            updatedAt: new Date("2026-06-01T00:00:00.000Z"),
        };
        return payload;
    });
    t.mock.method(StripeWebhookEvent, "findOneAndUpdate", (filter, update) => {
        data.queryLog.push({ model: "StripeWebhookEvent", method: "findOneAndUpdate", query: filter, update });
        if (
            !data.webhookEvent ||
            data.webhookEvent.stripeEventId !== filter.stripeEventId ||
            (filter.status !== undefined && data.webhookEvent.status !== filter.status)
        ) {
            return createQuery(null);
        }

        data.webhookEvent = {
            ...data.webhookEvent,
            ...(update.$set || {}),
            updatedAt: new Date("2026-06-02T00:00:00.000Z"),
        };

        return createQuery(data.webhookEvent);
    });

    return data;
}

function buildStripeMock(overrides = {}) {
    const calls = {
        customersCreate: [],
        checkoutSessionsCreate: [],
        subscriptionsRetrieve: [],
        constructEvent: [],
    };

    const client = {
        customers: {
            create: async (payload) => {
                calls.customersCreate.push(payload);
                return { id: "cus_new" };
            },
        },
        checkout: {
            sessions: {
                create: async (payload) => {
                    calls.checkoutSessionsCreate.push(payload);
                    return {
                        id: "cs_test",
                        url: "https://checkout.stripe.test/session",
                    };
                },
            },
        },
        subscriptions: {
            retrieve: async (subscriptionId) => {
                calls.subscriptionsRetrieve.push(subscriptionId);
                return {
                    id: subscriptionId,
                    customer: "cus_new",
                    status: "active",
                    current_period_end: 1782864000,
                    cancel_at_period_end: false,
                    trial_end: null,
                    metadata: { institutionId },
                    items: {
                        data: [{ price: { id: "price_1TetMH3lPsyty9Ic5cBRcXvJ" } }],
                    },
                };
            },
        },
        webhooks: {
            constructEvent: (rawBody, signature, secret) => {
                calls.constructEvent.push({ rawBody, signature, secret });
                return { id: "evt_constructed", type: "invoice.paid", data: { object: {} } };
            },
        },
        ...overrides,
    };

    return { client, calls };
}

test("billing models validate subscription status and expose tenant indexes", async () => {
    const profile = new InstitutionBillingProfile({
        institutionId,
        stripeCustomerId: "cus_123",
        status: "active",
    });
    await assert.doesNotReject(() => profile.validate());

    const invalidProfile = new InstitutionBillingProfile({
        institutionId,
        status: "not_a_status",
    });
    await assert.rejects(() => invalidProfile.validate(), /`not_a_status` is not a valid enum value/);

    const event = new StripeWebhookEvent({
        stripeEventId: "evt_123",
        type: "customer.subscription.updated",
    });
    await assert.doesNotReject(() => event.validate());

    const profileIndexesWithOptions = InstitutionBillingProfile.schema.indexes();
    const profileIndexes = profileIndexesWithOptions.map(([fields]) => fields);
    assert.ok(profileIndexes.some((fields) => fields.institutionId === 1));
    assert.ok(profileIndexes.some((fields) => fields.institutionId === 1 && fields.status === 1));
    assert.ok(profileIndexes.some((fields) => fields.institutionId === 1 && fields.stripeSubscriptionId === 1));
    assert.ok(
        profileIndexesWithOptions.some(
            ([fields, options]) =>
                fields.stripeCustomerId === 1 &&
                options.unique === true &&
                options.partialFilterExpression?.stripeCustomerId?.$type === "string"
        )
    );
    assert.ok(
        profileIndexesWithOptions.some(
            ([fields, options]) =>
                fields.stripeSubscriptionId === 1 &&
                options.unique === true &&
                options.partialFilterExpression?.stripeSubscriptionId?.$type === "string"
        )
    );

    const eventIndexes = StripeWebhookEvent.schema.indexes().map(([fields]) => fields);
    assert.ok(eventIndexes.some((fields) => fields.stripeEventId === 1));
});

test("checkout session creates Stripe customer and tenant-scoped billing profile", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t);
    const { client, calls } = buildStripeMock();
    billingService.setStripeClientForTests(client);

    const result = await billingService.createCheckoutSession({
        institutionId,
        actorUserId: ownerUserId,
        actorMembership: buildMembership(),
    });

    assert.equal(result.checkoutSession.url, "https://checkout.stripe.test/session");
    assert.equal(result.billingProfile.stripeCustomerId, "cus_new");
    assert.equal(calls.customersCreate.length, 1);
    assert.deepEqual(calls.customersCreate[0].metadata, { institutionId });
    assert.equal(calls.checkoutSessionsCreate.length, 1);
    assert.equal(calls.checkoutSessionsCreate[0].mode, "subscription");
    assert.equal(calls.checkoutSessionsCreate[0].customer, "cus_new");
    assert.equal(calls.checkoutSessionsCreate[0].line_items[0].price, "price_1TetMH3lPsyty9Ic5cBRcXvJ");
    assert.deepEqual(calls.checkoutSessionsCreate[0].metadata, { institutionId });
    assert.deepEqual(calls.checkoutSessionsCreate[0].subscription_data.metadata, { institutionId });

    const profileUpdate = data.queryLog.find((entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate");
    assert.equal(normalizeId(profileUpdate.query.institutionId), institutionId);
});

test("checkout session reuses existing Stripe customer", async (t) => {
    withBillingEnv(t);
    mockBillingDependencies(t, {
        billingProfile: buildBillingProfile({ stripeCustomerId: "cus_existing" }),
    });
    const { client, calls } = buildStripeMock();
    billingService.setStripeClientForTests(client);

    const result = await billingService.createCheckoutSession({
        institutionId,
        actorUserId: ownerUserId,
        actorMembership: buildMembership(),
    });

    assert.equal(result.billingProfile.stripeCustomerId, "cus_existing");
    assert.equal(calls.customersCreate.length, 0);
    assert.equal(calls.checkoutSessionsCreate[0].customer, "cus_existing");
});

test("unauthorized membership cannot create checkout session", async (t) => {
    withBillingEnv(t);
    mockBillingDependencies(t);
    const { client, calls } = buildStripeMock();
    billingService.setStripeClientForTests(client);

    await assert.rejects(
        () =>
            billingService.createCheckoutSession({
                institutionId,
                actorUserId: "507f1f77bcf86cd799439099",
                actorMembership: buildMembership({
                    _id: studentMemberId,
                    userId: "507f1f77bcf86cd799439099",
                    role: "student",
                }),
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Permission denied");
            return true;
        }
    );

    assert.equal(calls.customersCreate.length, 0);
    assert.equal(calls.checkoutSessionsCreate.length, 0);
});

test("billing status is tenant scoped", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t, {
        billingProfile: buildBillingProfile(),
    });

    const result = await billingService.getBillingStatus({
        institutionId,
        actorUserId: ownerUserId,
        actorMembership: buildMembership(),
    });

    assert.equal(result.billingProfile.status, "active");
    const profileRead = data.queryLog.find((entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOne");
    assert.equal(normalizeId(profileRead.query.institutionId), institutionId);

    await assert.rejects(
        () =>
            billingService.getBillingStatus({
                institutionId: otherInstitutionId,
                actorUserId: ownerUserId,
                actorMembership: buildMembership({ institutionId: otherInstitutionId }),
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Institution not found");
            return true;
        }
    );
});

test("stripe webhook signature construction delegates to Stripe SDK", (t) => {
    withBillingEnv(t);
    const { client, calls } = buildStripeMock();
    billingService.setStripeClientForTests(client);

    const rawBody = Buffer.from("{\"id\":\"evt_123\"}");
    const event = billingService.constructStripeWebhookEvent({
        rawBody,
        signature: "sig_test",
    });

    assert.equal(event.id, "evt_constructed");
    assert.deepEqual(calls.constructEvent[0], {
        rawBody,
        signature: "sig_test",
        secret: "whsec_mock",
    });
});

test("stripe webhook controller rejects invalid signatures", async (t) => {
    withBillingEnv(t);
    const { client } = buildStripeMock({
        webhooks: {
            constructEvent: () => {
                throw new Error("invalid signature");
            },
        },
    });
    billingService.setStripeClientForTests(client);

    const res = createResponse();
    await stripeWebhookController.handleStripeWebhook(
        {
            body: Buffer.from("{\"id\":\"evt_bad\"}"),
            headers: { "stripe-signature": "bad" },
        },
        res
    );

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: "Invalid Stripe webhook signature" });
});

test("stripe webhook duplicate events are ignored before processing", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t, {
        webhookEvent: {
            stripeEventId: "evt_duplicate",
            type: "customer.subscription.updated",
            status: "processed",
        },
    });

    const result = await billingService.processStripeWebhookEvent({
        id: "evt_duplicate",
        type: "customer.subscription.updated",
        data: {
            object: {
                id: "sub_123",
                metadata: { institutionId },
            },
        },
    });

    assert.deepEqual(result, { received: true, duplicate: true });
    assert.equal(data.queryLog.some((entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"), false);
});

test("subscription webhook updates tenant billing profile and records event", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t);

    const result = await billingService.processStripeWebhookEvent({
        id: "evt_subscription_updated",
        type: "customer.subscription.updated",
        data: {
            object: {
                id: "sub_123",
                customer: "cus_123",
                status: "past_due",
                current_period_end: 1782864000,
                cancel_at_period_end: true,
                trial_end: 1780272000,
                metadata: { institutionId },
                items: {
                    data: [{ price: { id: "price_1TetMH3lPsyty9Ic5cBRcXvJ" } }],
                },
            },
        },
    });

    assert.deepEqual(result, { received: true, duplicate: false });
    const profileUpdate = data.queryLog.find((entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate");
    assert.equal(normalizeId(profileUpdate.query.institutionId), institutionId);
    assert.equal(profileUpdate.update.$set.stripeSubscriptionId, "sub_123");
    assert.equal(profileUpdate.update.$set.status, "past_due");
    assert.equal(profileUpdate.update.$set.stripePriceId, "price_1TetMH3lPsyty9Ic5cBRcXvJ");
    assert.equal(profileUpdate.update.$set.cancelAtPeriodEnd, true);
    assert.equal(profileUpdate.update.$set.currentPeriodEnd.toISOString(), "2026-07-01T00:00:00.000Z");

    const eventCreate = data.queryLog.find((entry) => entry.model === "StripeWebhookEvent" && entry.method === "create");
    assert.equal(eventCreate.query.stripeEventId, "evt_subscription_updated");
    const eventProcessed = data.queryLog.find(
        (entry) =>
            entry.model === "StripeWebhookEvent" &&
            entry.method === "findOneAndUpdate" &&
            entry.update.$set?.status === "processed"
    );
    assert.equal(eventProcessed.query.stripeEventId, "evt_subscription_updated");
});

test("failed webhook processing marks failed and allows retry", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t, {
        billingProfileUpdateThrows: new Error("profile update failed"),
    });
    const event = {
        id: "evt_retry",
        type: "customer.subscription.updated",
        data: {
            object: {
                id: "sub_retry",
                customer: "cus_retry",
                status: "active",
                current_period_end: 1782864000,
                cancel_at_period_end: false,
                trial_end: null,
                metadata: { institutionId },
                items: {
                    data: [{ price: { id: "price_1TetMH3lPsyty9Ic5cBRcXvJ" } }],
                },
            },
        },
    };

    await assert.rejects(() => billingService.processStripeWebhookEvent(event), /profile update failed/);
    assert.equal(data.webhookEvent.status, "failed");
    assert.equal(data.webhookEvent.errorMessage, "profile update failed");

    data.billingProfileUpdateThrows = null;
    const result = await billingService.processStripeWebhookEvent(event);
    assert.deepEqual(result, { received: true, duplicate: false });
    assert.equal(data.webhookEvent.status, "processed");

    const retryClaim = data.queryLog.find(
        (entry) =>
            entry.model === "StripeWebhookEvent" &&
            entry.method === "findOneAndUpdate" &&
            entry.query.status === "failed" &&
            entry.update.$set?.status === "processing"
    );
    assert.equal(retryClaim.query.stripeEventId, "evt_retry");
});

test("subscription webhook can fall back to stored Stripe subscription id", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t, {
        billingProfile: buildBillingProfile({
            stripeSubscriptionId: "sub_existing",
            stripeCustomerId: "cus_existing",
        }),
    });

    await billingService.processStripeWebhookEvent({
        id: "evt_subscription_no_metadata",
        type: "customer.subscription.updated",
        data: {
            object: {
                id: "sub_existing",
                customer: "cus_existing",
                status: "active",
                current_period_end: 1782864000,
                cancel_at_period_end: false,
                trial_end: null,
                metadata: {},
                items: {
                    data: [{ price: { id: "price_1TetMH3lPsyty9Ic5cBRcXvJ" } }],
                },
            },
        },
    });

    const fallbackRead = data.queryLog.find(
        (entry) =>
            entry.model === "InstitutionBillingProfile" &&
            entry.method === "findOne" &&
            entry.query.stripeSubscriptionId === "sub_existing"
    );
    assert.ok(fallbackRead);

    const profileUpdate = data.queryLog.find(
        (entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"
    );
    assert.equal(normalizeId(profileUpdate.query.institutionId), institutionId);
});

test("billing routes are wired and webhook route is mounted before json parser", () => {
    const findInstitutionRoute = (routePath, method) =>
        institutionRoutes.stack
            .filter((layer) => layer.route)
            .map((layer) => layer.route)
            .find((route) => route.path === routePath && route.methods[method]);

    const checkoutRoute = findInstitutionRoute("/:institutionId/billing/checkout-session", "post");
    const statusRoute = findInstitutionRoute("/:institutionId/billing/status", "get");

    assert.deepEqual(
        checkoutRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "createCheckoutSession"]
    );
    assert.deepEqual(
        statusRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "getBillingStatus"]
    );

    const firstRouteLayer = app.router.stack.find((layer) => layer.route);
    assert.equal(firstRouteLayer.route.path, "/stripe/webhook");
    assert.equal(firstRouteLayer.route.methods.post, true);
    assert.deepEqual(
        firstRouteLayer.route.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["rawParser", "handleStripeWebhook"]
    );
});
