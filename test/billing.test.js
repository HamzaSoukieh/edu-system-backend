const test = require("node:test");
const assert = require("node:assert/strict");

const Institution = require("../src/models/Institution");
const InstitutionBillingProfile = require("../src/models/InstitutionBillingProfile");
const StripeWebhookEvent = require("../src/models/StripeWebhookEvent");
const app = require("../src/app");
const stripeWebhookController = require("../src/controllers/stripeWebhookController");
const institutionRoutes = require("../src/routes/institutionRoutes");
const billingService = require("../src/services/billingService");
const {
    SUBSCRIPTION_STATUSES,
} = require("../src/services/billingConstants");
const {
    resolveBillingPlanByStripePriceId,
    validateConfiguredBillingPrices,
} = require("../src/services/billingPlanConfig");
const {
    getInstitutionBillingEntitlements,
} = require("../src/services/billingEntitlementService");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439012";
const ownerUserId = "507f1f77bcf86cd799439021";
const adminMemberId = "507f1f77bcf86cd799439031";
const studentMemberId = "507f1f77bcf86cd799439032";
const staleWebhookUpdatedAt = new Date(Date.now() - 11 * 60 * 1000);
const freshWebhookUpdatedAt = new Date(Date.now() - 2 * 60 * 1000);

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

function matchesLessThanDate(value, condition) {
    if (!condition || condition.$lt === undefined) {
        return true;
    }

    if (!value) {
        return false;
    }

    return new Date(value).getTime() < new Date(condition.$lt).getTime();
}

function matchesWebhookEventFilter(event, filter) {
    if (!event || event.stripeEventId !== filter.stripeEventId) {
        return false;
    }

    if (filter.status !== undefined && event.status !== filter.status) {
        return false;
    }

    if (!Array.isArray(filter.$or)) {
        return true;
    }

    return filter.$or.some((condition) => {
        if (condition.status !== undefined && event.status !== condition.status) {
            return false;
        }

        if (condition.updatedAt === null && event.updatedAt !== null && event.updatedAt !== undefined) {
            return false;
        }

        if (condition.updatedAt && !matchesLessThanDate(event.updatedAt, condition.updatedAt)) {
            return false;
        }

        if (condition.createdAt && !matchesLessThanDate(event.createdAt, condition.createdAt)) {
            return false;
        }

        return true;
    });
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
        stripePriceId: "price_plus_6_month",
        plan: "plus",
        billingInterval: "six_month",
        stripeProductId: "prod_plus",
        status: "active",
        currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
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

function buildStripeSubscription(overrides = {}) {
    return {
        id: "sub_existing",
        customer: "cus_existing",
        status: "active",
        current_period_end: 1782864000,
        cancel_at_period_end: false,
        trial_end: null,
        metadata: { institutionId },
        items: {
            data: [{ price: { id: "price_plus_6_month", product: "prod_plus" } }],
        },
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
        STRIPE_PRICE_PLUS_6_MONTH: process.env.STRIPE_PRICE_PLUS_6_MONTH,
        STRIPE_PRICE_PRO_6_MONTH: process.env.STRIPE_PRICE_PRO_6_MONTH,
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
        BILLING_SUCCESS_URL: process.env.BILLING_SUCCESS_URL,
        BILLING_CANCEL_URL: process.env.BILLING_CANCEL_URL,
    };

    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.STRIPE_PRICE_PLUS_6_MONTH = "price_plus_6_month";
    process.env.STRIPE_PRICE_PRO_6_MONTH = "price_pro_6_month";
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

    const getBillingProfiles = () => {
        if (Array.isArray(data.billingProfiles)) {
            return data.billingProfiles;
        }

        return data.billingProfile ? [data.billingProfile] : [];
    };

    t.mock.method(Institution, "findOne", (query) => {
        data.queryLog.push({ model: "Institution", method: "findOne", query });
        return createQuery(matchesId(data.institution?._id, query._id) ? data.institution : null);
    });
    t.mock.method(InstitutionBillingProfile, "findOne", (query) => {
        data.queryLog.push({ model: "InstitutionBillingProfile", method: "findOne", query });
        if (query.stripeSubscriptionId !== undefined) {
            const profile = getBillingProfiles().find(
                (item) => item.stripeSubscriptionId === query.stripeSubscriptionId
            );
            return createQuery(
                profile || null
            );
        }
        if (query.stripeCustomerId !== undefined) {
            const profile = getBillingProfiles().find(
                (item) => item.stripeCustomerId === query.stripeCustomerId
            );
            return createQuery(
                profile || null
            );
        }
        const profile = getBillingProfiles().find((item) => matchesId(item.institutionId, query.institutionId));
        return createQuery(
            profile || null
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
            plan: update.$set?.plan ?? data.billingProfile?.plan ?? null,
            billingInterval: update.$set?.billingInterval ?? data.billingProfile?.billingInterval ?? null,
            stripeProductId: update.$set?.stripeProductId ?? data.billingProfile?.stripeProductId ?? null,
            status: update.$set?.status ?? data.billingProfile?.status ?? null,
            currentPeriodStart: update.$set?.currentPeriodStart ?? data.billingProfile?.currentPeriodStart ?? null,
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
        if (!matchesWebhookEventFilter(data.webhookEvent, filter)) {
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

function setCurrentStripeSubscriptionForWebhook(subscriptionOrResolver) {
    const calls = [];
    billingService.setStripeClientForTests({
        subscriptions: {
            retrieve: async (subscriptionId) => {
                calls.push(subscriptionId);
                if (typeof subscriptionOrResolver === "function") {
                    return subscriptionOrResolver(subscriptionId);
                }

                return subscriptionOrResolver;
            },
        },
    });
    return calls;
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
            create: async (payload, options) => {
                calls.customersCreate.push({ ...payload, options });
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
                    current_period_start: 1767225600,
                    current_period_end: 1782864000,
                    cancel_at_period_end: false,
                    trial_end: null,
                    metadata: { institutionId },
                    items: {
                        data: [
                            {
                                current_period_start: 1767225600,
                                current_period_end: 1782864000,
                                price: { id: "price_plus_6_month", product: "prod_plus" },
                            },
                        ],
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

test("billing profile model validates nullable Plus/Pro fields and normalizes Stripe ids", async () => {
    for (const plan of ["plus", "pro", null]) {
        const profile = new InstitutionBillingProfile({ institutionId, plan });
        await assert.doesNotReject(() => profile.validate());
        assert.equal(profile.plan, plan);
    }

    const invalidPlanProfile = new InstitutionBillingProfile({
        institutionId,
        plan: "basic",
    });
    await assert.rejects(() => invalidPlanProfile.validate(), /`basic` is not a valid enum value/);

    for (const billingInterval of ["six_month", null]) {
        const profile = new InstitutionBillingProfile({ institutionId, billingInterval });
        await assert.doesNotReject(() => profile.validate());
        assert.equal(profile.billingInterval, billingInterval);
    }

    for (const billingInterval of ["monthly", "yearly"]) {
        const profile = new InstitutionBillingProfile({ institutionId, billingInterval });
        await assert.rejects(() => profile.validate(), new RegExp(`\`${billingInterval}\` is not a valid enum value`));
    }

    for (const status of [...SUBSCRIPTION_STATUSES, null]) {
        const profile = new InstitutionBillingProfile({ institutionId, status });
        await assert.doesNotReject(() => profile.validate());
        assert.equal(profile.status, status);
    }

    const invalidStatusProfile = new InstitutionBillingProfile({
        institutionId,
        status: "not_a_status",
    });
    await assert.rejects(() => invalidStatusProfile.validate(), /`not_a_status` is not a valid enum value/);

    const trimmedProfile = new InstitutionBillingProfile({
        institutionId,
        stripeCustomerId: "  cus_test_example  ",
        stripeSubscriptionId: "  sub_test_example  ",
        stripePriceId: "  price_test_example  ",
        stripeProductId: "  prod_test_example  ",
    });
    await assert.doesNotReject(() => trimmedProfile.validate());
    assert.equal(trimmedProfile.stripeCustomerId, "cus_test_example");
    assert.equal(trimmedProfile.stripeSubscriptionId, "sub_test_example");
    assert.equal(trimmedProfile.stripePriceId, "price_test_example");
    assert.equal(trimmedProfile.stripeProductId, "prod_test_example");

    for (const value of ["", "   "]) {
        const profile = new InstitutionBillingProfile({
            institutionId,
            stripeCustomerId: value,
            stripeSubscriptionId: value,
            stripePriceId: value,
            stripeProductId: value,
        });
        await assert.doesNotReject(() => profile.validate());
        assert.equal(profile.stripeCustomerId, null);
        assert.equal(profile.stripeSubscriptionId, null);
        assert.equal(profile.stripePriceId, null);
        assert.equal(profile.stripeProductId, null);
    }

    const event = new StripeWebhookEvent({
        stripeEventId: "evt_123",
        type: "customer.subscription.updated",
    });
    await assert.doesNotReject(() => event.validate());
    assert.equal(event.status, "processing");

    for (const status of ["processing", "processed", "failed"]) {
        const statusEvent = new StripeWebhookEvent({
            stripeEventId: `evt_${status}`,
            type: "customer.subscription.updated",
            status,
        });
        await assert.doesNotReject(() => statusEvent.validate());
    }

    const nullCustomerProfileA = new InstitutionBillingProfile({ institutionId });
    const nullCustomerProfileB = new InstitutionBillingProfile({ institutionId: otherInstitutionId });
    await assert.doesNotReject(() => nullCustomerProfileA.validate());
    await assert.doesNotReject(() => nullCustomerProfileB.validate());

    const profileIndexesWithOptions = InstitutionBillingProfile.schema.indexes();
    const profileIndexes = profileIndexesWithOptions.map(([fields]) => fields);
    assert.ok(
        profileIndexesWithOptions.some(
            ([fields, options]) => fields.institutionId === 1 && options.unique === true
        )
    );
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
    assert.equal(profileIndexes.some((fields) => fields.institutionId === 1 && fields.status === 1), false);
    assert.equal(
        profileIndexes.some((fields) => fields.institutionId === 1 && fields.stripeSubscriptionId === 1),
        false
    );

    const eventIndexes = StripeWebhookEvent.schema.indexes().map(([fields]) => fields);
    assert.ok(eventIndexes.some((fields) => fields.stripeEventId === 1));
    assert.ok(eventIndexes.some((fields) => fields.status === 1 && fields.updatedAt === 1));
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
        payload: { plan: "plus" },
    });

    assert.equal(result.checkoutSession.url, "https://checkout.stripe.test/session");
    assert.equal(result.billingProfile.stripeCustomerId, "cus_new");
    assert.equal(result.billingProfile.status, null);
    assert.equal(result.billingProfile.stripeSubscriptionId, null);
    assert.equal(result.billingProfile.currentPeriodStart, null);
    assert.equal(result.billingProfile.currentPeriodEnd, null);
    assert.deepEqual(result.entitlements, {
        plan: null,
        billingInterval: null,
        subscriptionStatus: null,
        hasPaidAccess: false,
        maxActiveStudents: 0,
        maxActiveStaff: 0,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        trialEnd: null,
    });
    assert.equal(calls.customersCreate.length, 1);
    assert.deepEqual(calls.customersCreate[0].metadata, { institutionId });
    assert.equal(calls.customersCreate[0].options.idempotencyKey, `customer:create:${institutionId}`);
    assert.equal(calls.checkoutSessionsCreate.length, 1);
    assert.equal(calls.checkoutSessionsCreate[0].mode, "subscription");
    assert.equal(calls.checkoutSessionsCreate[0].customer, "cus_new");
    assert.equal(calls.checkoutSessionsCreate[0].line_items[0].price, "price_plus_6_month");
    // Reconciliation metadata for the webhook: institution + requested plan + actor.
    const sessionMetadata = calls.checkoutSessionsCreate[0].metadata;
    assert.equal(sessionMetadata.institutionId, institutionId);
    assert.equal(sessionMetadata.requestedPlan, "plus");
    assert.equal(sessionMetadata.actorUserId, ownerUserId);
    assert.equal(typeof sessionMetadata.billingProfileId, "string");
    assert.deepEqual(calls.checkoutSessionsCreate[0].subscription_data.metadata, { institutionId, plan: "plus" });
    // Return URLs carry the billing state (+ Stripe session id on success).
    assert.match(calls.checkoutSessionsCreate[0].success_url, /billing=success/);
    assert.match(calls.checkoutSessionsCreate[0].success_url, /session_id=\{CHECKOUT_SESSION_ID\}/);
    assert.match(calls.checkoutSessionsCreate[0].cancel_url, /billing=cancel/);

    const profileUpdate = data.queryLog.find((entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate");
    assert.equal(normalizeId(profileUpdate.query.institutionId), institutionId);
});

test("checkout session reuses existing Stripe customer", async (t) => {
    withBillingEnv(t);
    mockBillingDependencies(t, {
        billingProfile: buildBillingProfile({
            stripeCustomerId: "cus_existing",
            stripeSubscriptionId: null,
            status: null,
        }),
    });
    const { client, calls } = buildStripeMock();
    billingService.setStripeClientForTests(client);

    const result = await billingService.createCheckoutSession({
        institutionId,
        actorUserId: ownerUserId,
        actorMembership: buildMembership(),
        payload: { plan: "pro" },
    });

    assert.equal(result.billingProfile.stripeCustomerId, "cus_existing");
    assert.equal(calls.customersCreate.length, 0);
    assert.equal(calls.checkoutSessionsCreate[0].customer, "cus_existing");
    assert.equal(calls.checkoutSessionsCreate[0].line_items[0].price, "price_pro_6_month");
});

test("checkout session rejects missing, invalid, and unsafe plan payloads", async (t) => {
    withBillingEnv(t);
    mockBillingDependencies(t);
    const { client, calls } = buildStripeMock();
    billingService.setStripeClientForTests(client);

    const cases = [
        { payload: {}, message: "plan is required" },
        { payload: { plan: "enterprise" }, message: "plan must be one of: plus, pro" },
        { payload: { plan: "plus", priceId: "price_attack" }, message: "Unexpected field: priceId" },
        { payload: { plan: "plus", stripePriceId: "price_attack" }, message: "Unexpected field: stripePriceId" },
        { payload: { plan: "plus", productId: "prod_attack" }, message: "Unexpected field: productId" },
        { payload: { plan: "plus", amount: 1 }, message: "Unexpected field: amount" },
        { payload: { plan: "plus", maxActiveStudents: 999999 }, message: "Unexpected field: maxActiveStudents" },
        { payload: { plan: "plus", maxActiveStaff: 999999 }, message: "Unexpected field: maxActiveStaff" },
    ];

    for (const item of cases) {
        await assert.rejects(
            () =>
                billingService.createCheckoutSession({
                    institutionId,
                    actorUserId: ownerUserId,
                    actorMembership: buildMembership(),
                    payload: item.payload,
                }),
            { statusCode: 400, message: item.message }
        );
    }

    assert.equal(calls.customersCreate.length, 0);
    assert.equal(calls.checkoutSessionsCreate.length, 0);
});

test("checkout session fails safely when selected plan price configuration is missing", async (t) => {
    withBillingEnv(t);
    mockBillingDependencies(t);
    const { client, calls } = buildStripeMock();
    billingService.setStripeClientForTests(client);

    delete process.env.STRIPE_PRICE_PLUS_6_MONTH;
    await assert.rejects(
        () =>
            billingService.createCheckoutSession({
                institutionId,
                actorUserId: ownerUserId,
                actorMembership: buildMembership(),
                payload: { plan: "plus" },
            }),
        { statusCode: 500, message: "Billing plan price is not configured" }
    );

    process.env.STRIPE_PRICE_PLUS_6_MONTH = "price_plus_6_month";
    process.env.STRIPE_PRICE_PRO_6_MONTH = "not_a_price";
    await assert.rejects(
        () =>
            billingService.createCheckoutSession({
                institutionId,
                actorUserId: ownerUserId,
                actorMembership: buildMembership(),
                payload: { plan: "pro" },
            }),
        { statusCode: 500, message: "Billing plan price is not configured" }
    );

    assert.equal(calls.customersCreate.length, 0);
    assert.equal(calls.checkoutSessionsCreate.length, 0);
});

for (const status of ["active", "trialing", "past_due"]) {
    test(`checkout session rejects institution with ${status} subscription`, async (t) => {
        withBillingEnv(t);
        mockBillingDependencies(t, {
            billingProfile: buildBillingProfile({
                stripeCustomerId: "cus_existing",
                stripeSubscriptionId: `sub_${status}`,
                status,
            }),
        });
        const { client, calls } = buildStripeMock();
        billingService.setStripeClientForTests(client);

        await assert.rejects(
            () =>
                billingService.createCheckoutSession({
                    institutionId,
                    actorUserId: ownerUserId,
                    actorMembership: buildMembership(),
                    payload: { plan: "plus" },
                }),
            (error) => {
                assert.equal(error.statusCode, 409);
                assert.equal(error.message, "Your institution already has an active subscription.");
                assert.equal(error.code, "SUBSCRIPTION_ALREADY_ACTIVE");
                return true;
            }
        );

        assert.equal(calls.customersCreate.length, 0);
        assert.equal(calls.checkoutSessionsCreate.length, 0);
    });
}

for (const status of ["active", "trialing", "past_due"]) {
    test(`checkout session rejects institution with ${status} status even without subscription id`, async (t) => {
        withBillingEnv(t);
        mockBillingDependencies(t, {
            billingProfile: buildBillingProfile({
                stripeCustomerId: "cus_existing",
                stripeSubscriptionId: null,
                status,
            }),
        });
        const { client, calls } = buildStripeMock();
        billingService.setStripeClientForTests(client);

        await assert.rejects(
            () =>
                billingService.createCheckoutSession({
                    institutionId,
                    actorUserId: ownerUserId,
                    actorMembership: buildMembership(),
                    payload: { plan: "plus" },
                }),
            { statusCode: 409, message: "Your institution already has an active subscription." }
        );

        assert.equal(calls.customersCreate.length, 0);
        assert.equal(calls.checkoutSessionsCreate.length, 0);
    });
}

test("checkout session allows canceled subscription profile to start a new session", async (t) => {
    withBillingEnv(t);
    mockBillingDependencies(t, {
        billingProfile: buildBillingProfile({
            stripeCustomerId: "cus_existing",
            stripeSubscriptionId: "sub_canceled",
            status: "canceled",
        }),
    });
    const { client, calls } = buildStripeMock();
    billingService.setStripeClientForTests(client);

    const result = await billingService.createCheckoutSession({
        institutionId,
        actorUserId: ownerUserId,
        actorMembership: buildMembership(),
        payload: { plan: "plus" },
    });

    assert.equal(result.checkoutSession.url, "https://checkout.stripe.test/session");
    assert.equal(calls.customersCreate.length, 0);
    assert.equal(calls.checkoutSessionsCreate.length, 1);
    assert.equal(calls.checkoutSessionsCreate[0].customer, "cus_existing");
});

test("checkout duplicate guard does not block unpaid subscription profile", async (t) => {
    withBillingEnv(t);
    mockBillingDependencies(t, {
        billingProfile: buildBillingProfile({
            stripeCustomerId: "cus_existing",
            stripeSubscriptionId: "sub_unpaid",
            status: "unpaid",
        }),
    });
    const { client, calls } = buildStripeMock();
    billingService.setStripeClientForTests(client);

    await assert.doesNotReject(() =>
        billingService.createCheckoutSession({
            institutionId,
            actorUserId: ownerUserId,
            actorMembership: buildMembership(),
            payload: { plan: "plus" },
        })
    );

    assert.equal(calls.checkoutSessionsCreate.length, 1);
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
                payload: { plan: "plus" },
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "You do not have permission to manage billing for this institution.");
            return true;
        }
    );

    assert.equal(calls.customersCreate.length, 0);
    assert.equal(calls.checkoutSessionsCreate.length, 0);
});

test("billing authorization validates active actor membership ownership fail closed", async (t) => {
    withBillingEnv(t);
    mockBillingDependencies(t);
    const { client, calls } = buildStripeMock();
    billingService.setStripeClientForTests(client);

    const allowedCases = [
        buildMembership(),
        buildMembership({ userId: { _id: ownerUserId } }),
        buildMembership({ institutionId: { _id: institutionId } }),
    ];

    for (const actorMembership of allowedCases) {
        await assert.doesNotReject(() =>
            billingService.createCheckoutSession({
                institutionId,
                actorUserId: ownerUserId,
                actorMembership,
                payload: { plan: "plus" },
            })
        );
    }

    const deniedCases = [
        buildMembership({ status: undefined }),
        buildMembership({ status: "suspended" }),
        buildMembership({ userId: "507f1f77bcf86cd799439099" }),
        buildMembership({ institutionId: otherInstitutionId }),
        buildMembership({ userId: "507f1f77bcf86cd799439099", role: "admin" }),
        buildMembership({ status: undefined, role: "admin" }),
    ];

    for (const actorMembership of deniedCases) {
        await assert.rejects(
            () =>
                billingService.createCheckoutSession({
                    institutionId,
                    actorUserId: ownerUserId,
                    actorMembership,
                    payload: { plan: "plus" },
                }),
            { statusCode: 403, message: "Institution access denied" }
        );
    }

    assert.equal(calls.checkoutSessionsCreate.length, allowedCases.length);
});

test("billing price configuration validates placeholders, malformed ids, and duplicate plan prices safely", (t) => {
    withBillingEnv(t);

    assert.deepEqual(validateConfiguredBillingPrices(), {
        plus: "price_plus_6_month",
        pro: "price_pro_6_month",
    });

    delete process.env.STRIPE_PRICE_PLUS_6_MONTH;
    assert.throws(() => validateConfiguredBillingPrices(), {
        statusCode: 500,
        message: "Billing plan price is not configured",
    });

    process.env.STRIPE_PRICE_PLUS_6_MONTH = "price_plus_6_month";
    delete process.env.STRIPE_PRICE_PRO_6_MONTH;
    assert.throws(() => validateConfiguredBillingPrices(), {
        statusCode: 500,
        message: "Billing plan price is not configured",
    });

    process.env.STRIPE_PRICE_PRO_6_MONTH = "price_replace_me";
    assert.throws(() => validateConfiguredBillingPrices(), {
        statusCode: 500,
        message: "Billing plan price is not configured",
    });

    process.env.STRIPE_PRICE_PRO_6_MONTH = "not_a_price";
    assert.throws(() => validateConfiguredBillingPrices(), {
        statusCode: 500,
        message: "Billing plan price is not configured",
    });

    process.env.STRIPE_PRICE_PLUS_6_MONTH = "price_actualsecretplus";
    process.env.STRIPE_PRICE_PRO_6_MONTH = "price_actualsecretplus";
    assert.throws(
        () => validateConfiguredBillingPrices(),
        (error) => {
            assert.equal(error.statusCode, 500);
            assert.equal(error.message, "Billing plan price is not configured");
            assert.equal(error.message.includes("price_actualsecretplus"), false);
            return true;
        }
    );

    assert.equal(resolveBillingPlanByStripePriceId("price_actualsecretplus"), null);
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
    assert.deepEqual(result.entitlements, {
        plan: "plus",
        billingInterval: "six_month",
        subscriptionStatus: "active",
        hasPaidAccess: true,
        maxActiveStudents: 300,
        maxActiveStaff: 30,
        currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z"),
        cancelAtPeriodEnd: false,
        trialEnd: null,
    });
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

test("billing entitlements normalize paid statuses and plan limits", () => {
    const cases = [
        { status: "active", plan: "plus", hasPaidAccess: true, students: 300, staff: 30 },
        { status: "trialing", plan: "plus", hasPaidAccess: true, students: 300, staff: 30 },
        { status: "past_due", plan: "plus", hasPaidAccess: true, students: 300, staff: 30 },
        { status: "active", plan: "pro", hasPaidAccess: true, students: 1000, staff: 100 },
        { status: "trialing", plan: "pro", hasPaidAccess: true, students: 1000, staff: 100 },
        { status: "past_due", plan: "pro", hasPaidAccess: true, students: 1000, staff: 100 },
        { status: "canceled", plan: "plus", hasPaidAccess: false, students: 0, staff: 0 },
        { status: "unpaid", plan: "plus", hasPaidAccess: false, students: 0, staff: 0 },
        { status: "incomplete", plan: "plus", hasPaidAccess: false, students: 0, staff: 0 },
        { status: "incomplete_expired", plan: "plus", hasPaidAccess: false, students: 0, staff: 0 },
        { status: "paused", plan: "plus", hasPaidAccess: false, students: 0, staff: 0 },
        { status: "active", plan: null, hasPaidAccess: false, students: 0, staff: 0 },
        { status: "active", plan: "basic", hasPaidAccess: false, students: 0, staff: 0 },
    ];

    for (const item of cases) {
        const entitlements = getInstitutionBillingEntitlements({
            status: item.status,
            plan: item.plan,
            currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
            currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z"),
            cancelAtPeriodEnd: true,
            trialEnd: new Date("2026-02-01T00:00:00.000Z"),
        });

        assert.equal(entitlements.hasPaidAccess, item.hasPaidAccess);
        assert.equal(entitlements.maxActiveStudents, item.students);
        assert.equal(entitlements.maxActiveStaff, item.staff);
        assert.equal(entitlements.subscriptionStatus, item.status);
        assert.equal(entitlements.cancelAtPeriodEnd, true);
    }
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
            updatedAt: freshWebhookUpdatedAt,
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

test("stripe webhook fresh processing event is treated as duplicate", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t, {
        webhookEvent: {
            stripeEventId: "evt_processing_fresh",
            type: "customer.subscription.updated",
            status: "processing",
            updatedAt: freshWebhookUpdatedAt,
            createdAt: freshWebhookUpdatedAt,
        },
    });

    const result = await billingService.processStripeWebhookEvent({
        id: "evt_processing_fresh",
        type: "customer.subscription.updated",
        data: {
            object: {
                id: "sub_fresh",
                customer: "cus_fresh",
                status: "active",
                current_period_end: 1782864000,
                cancel_at_period_end: false,
                trial_end: null,
                metadata: { institutionId },
                items: {
                    data: [{ price: { id: "price_plus_6_month", product: "prod_plus" } }],
                },
            },
        },
    });

    assert.deepEqual(result, { received: true, duplicate: true });
    assert.equal(data.webhookEvent.status, "processing");
    assert.equal(data.queryLog.some((entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"), false);

    const reclaimAttempt = data.queryLog.find(
        (entry) =>
            entry.model === "StripeWebhookEvent" &&
            entry.method === "findOneAndUpdate" &&
            Array.isArray(entry.query.$or)
    );
    assert.equal(reclaimAttempt.query.stripeEventId, "evt_processing_fresh");
});

test("stripe webhook stale processing event is reclaimed and retried", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t, {
        webhookEvent: {
            stripeEventId: "evt_processing_stale",
            type: "customer.subscription.updated",
            status: "processing",
            processedAt: new Date("2026-06-01T00:00:00.000Z"),
            errorMessage: "server crashed",
            updatedAt: staleWebhookUpdatedAt,
            createdAt: staleWebhookUpdatedAt,
        },
    });
    const currentSubscription = buildStripeSubscription({
        id: "sub_stale",
        customer: "cus_stale",
    });
    setCurrentStripeSubscriptionForWebhook(currentSubscription);

    const result = await billingService.processStripeWebhookEvent({
        id: "evt_processing_stale",
        type: "customer.subscription.updated",
        data: {
            object: currentSubscription,
        },
    });

    assert.deepEqual(result, { received: true, duplicate: false });
    assert.equal(data.webhookEvent.status, "processed");
    assert.equal(data.webhookEvent.errorMessage, null);

    const retryClaim = data.queryLog.find(
        (entry) =>
            entry.model === "StripeWebhookEvent" &&
            entry.method === "findOneAndUpdate" &&
            Array.isArray(entry.query.$or) &&
            entry.update.$set?.status === "processing"
    );
    assert.equal(retryClaim.query.stripeEventId, "evt_processing_stale");
    assert.equal(retryClaim.update.$set.processedAt, null);
    assert.equal(retryClaim.update.$set.errorMessage, null);

    const profileUpdate = data.queryLog.find(
        (entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"
    );
    assert.equal(normalizeId(profileUpdate.query.institutionId), institutionId);
});

test("subscription webhook updates tenant billing profile and records event", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t);
    const currentSubscription = buildStripeSubscription({
        id: "sub_123",
        customer: "cus_123",
        status: "past_due",
        cancel_at_period_end: true,
        trial_end: 1780272000,
        items: {
            data: [
                {
                    current_period_start: 1767225600,
                    current_period_end: 1782864000,
                    price: { id: "price_plus_6_month", product: "prod_plus" },
                },
            ],
        },
    });
    setCurrentStripeSubscriptionForWebhook(currentSubscription);

    const result = await billingService.processStripeWebhookEvent({
        id: "evt_subscription_updated",
        type: "customer.subscription.updated",
        data: {
            object: currentSubscription,
        },
    });

    assert.deepEqual(result, { received: true, duplicate: false });
    assert.equal(data.webhookEvent.status, "processed");
    const profileUpdate = data.queryLog.find((entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate");
    assert.equal(normalizeId(profileUpdate.query.institutionId), institutionId);
    assert.equal(profileUpdate.update.$set.stripeSubscriptionId, "sub_123");
    assert.equal(profileUpdate.update.$set.status, "past_due");
    assert.equal(profileUpdate.update.$set.stripePriceId, "price_plus_6_month");
    assert.equal(profileUpdate.update.$set.stripeProductId, "prod_plus");
    assert.equal(profileUpdate.update.$set.plan, "plus");
    assert.equal(profileUpdate.update.$set.billingInterval, "six_month");
    assert.equal(profileUpdate.update.$set.cancelAtPeriodEnd, true);
    assert.equal(profileUpdate.update.$set.currentPeriodStart.toISOString(), "2026-01-01T00:00:00.000Z");
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

test("subscription webhook maps Pro price and expanded product object", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t);
    const currentSubscription = buildStripeSubscription({
        id: "sub_pro",
        customer: { id: "cus_pro" },
        status: "trialing",
        items: {
            data: [
                {
                    current_period_start: 1767225600,
                    current_period_end: 1782864000,
                    price: { id: "price_pro_6_month", product: { id: "prod_pro" } },
                },
            ],
        },
    });
    setCurrentStripeSubscriptionForWebhook(currentSubscription);

    await billingService.processStripeWebhookEvent({
        id: "evt_subscription_pro",
        type: "customer.subscription.updated",
        data: {
            object: currentSubscription,
        },
    });

    const profileUpdate = data.queryLog.find(
        (entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"
    );
    assert.equal(profileUpdate.update.$set.stripeCustomerId, "cus_pro");
    assert.equal(profileUpdate.update.$set.plan, "pro");
    assert.equal(profileUpdate.update.$set.billingInterval, "six_month");
    assert.equal(profileUpdate.update.$set.stripeProductId, "prod_pro");
});

test("subscription webhook stores unknown price without granting paid access", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t);
    const currentSubscription = buildStripeSubscription({
        id: "sub_unknown",
        customer: "cus_unknown",
        current_period_start: 1767225600,
        current_period_end: 1782864000,
        items: {
            data: [{ price: { id: "price_unknown", product: "prod_unknown" } }],
        },
    });
    setCurrentStripeSubscriptionForWebhook(currentSubscription);

    await billingService.processStripeWebhookEvent({
        id: "evt_subscription_unknown_price",
        type: "customer.subscription.updated",
        data: {
            object: currentSubscription,
        },
    });

    const profileUpdate = data.queryLog.find(
        (entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"
    );
    assert.equal(profileUpdate.update.$set.stripePriceId, "price_unknown");
    assert.equal(profileUpdate.update.$set.stripeProductId, "prod_unknown");
    assert.equal(profileUpdate.update.$set.plan, null);
    assert.equal(profileUpdate.update.$set.billingInterval, null);

    const entitlements = getInstitutionBillingEntitlements({
        status: "active",
        plan: profileUpdate.update.$set.plan,
    });
    assert.equal(entitlements.hasPaidAccess, false);
    assert.equal(entitlements.maxActiveStudents, 0);
    assert.equal(entitlements.maxActiveStaff, 0);
});

test("subscription webhook does not guess plan when configured plan prices are duplicated", (t) => {
    withBillingEnv(t);
    process.env.STRIPE_PRICE_PRO_6_MONTH = process.env.STRIPE_PRICE_PLUS_6_MONTH;

    const updates = billingService.buildSubscriptionProfileUpdates({
        id: "sub_duplicate_config",
        customer: "cus_duplicate_config",
        status: "active",
        current_period_start: 1767225600,
        current_period_end: 1782864000,
        cancel_at_period_end: false,
        trial_end: null,
        items: {
            data: [{ price: { id: process.env.STRIPE_PRICE_PLUS_6_MONTH, product: "prod_duplicate" } }],
        },
    });

    assert.equal(updates.stripePriceId, "price_plus_6_month");
    assert.equal(updates.plan, null);
    assert.equal(updates.billingInterval, null);
});

test("subscription profile update handles missing items and top-level period fallback", (t) => {
    withBillingEnv(t);

    const topLevelUpdates = billingService.buildSubscriptionProfileUpdates({
        id: "sub_top_level",
        customer: "cus_top_level",
        status: "active",
        current_period_start: 1767225600,
        current_period_end: 1782864000,
        cancel_at_period_end: false,
        trial_end: null,
        items: {
            data: [{ price: { id: "price_plus_6_month", product: "prod_plus" } }],
        },
    });
    assert.equal(topLevelUpdates.currentPeriodStart.toISOString(), "2026-01-01T00:00:00.000Z");
    assert.equal(topLevelUpdates.currentPeriodEnd.toISOString(), "2026-07-01T00:00:00.000Z");
    assert.equal(topLevelUpdates.plan, "plus");

    const missingItemUpdates = billingService.buildSubscriptionProfileUpdates({
        id: "sub_missing_items",
        customer: "cus_missing_items",
        status: "active",
        cancel_at_period_end: false,
        trial_end: null,
        items: {
            data: [],
        },
    });
    assert.equal(missingItemUpdates.stripePriceId, null);
    assert.equal(missingItemUpdates.plan, null);
    assert.equal(missingItemUpdates.billingInterval, null);
    assert.equal(missingItemUpdates.currentPeriodStart, null);
    assert.equal(missingItemUpdates.currentPeriodEnd, null);
});

test("checkout completed retrieves subscription before syncing billing profile", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t);
    const { client, calls } = buildStripeMock();
    billingService.setStripeClientForTests(client);

    await billingService.processStripeWebhookEvent({
        id: "evt_checkout_completed",
        type: "checkout.session.completed",
        data: {
            object: {
                id: "cs_completed",
                customer: "cus_checkout",
                subscription: "sub_checkout",
                client_reference_id: institutionId,
                metadata: { institutionId, plan: "pro" },
            },
        },
    });

    assert.deepEqual(calls.subscriptionsRetrieve, ["sub_checkout"]);
    const profileUpdate = data.queryLog.find(
        (entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"
    );
    assert.equal(profileUpdate.update.$set.stripeSubscriptionId, "sub_checkout");
    assert.equal(profileUpdate.update.$set.stripePriceId, "price_plus_6_month");
    assert.equal(profileUpdate.update.$set.plan, "plus");
});

test("checkout completed supports expanded subscription object shape", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t);
    const { client, calls } = buildStripeMock();
    billingService.setStripeClientForTests(client);

    await billingService.processStripeWebhookEvent({
        id: "evt_checkout_expanded_subscription",
        type: "checkout.session.completed",
        data: {
            object: {
                id: "cs_expanded_subscription",
                customer: "cus_checkout",
                subscription: { id: "sub_checkout_expanded" },
                client_reference_id: institutionId,
                metadata: { institutionId },
            },
        },
    });

    assert.deepEqual(calls.subscriptionsRetrieve, ["sub_checkout_expanded"]);
    const profileUpdate = data.queryLog.find(
        (entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"
    );
    assert.equal(profileUpdate.update.$set.stripeSubscriptionId, "sub_checkout_expanded");
});

for (const item of [
    {
        name: "metadata/client_reference_id conflict fails",
        session: {
            customer: "cus_checkout",
            subscription: "sub_checkout",
            client_reference_id: otherInstitutionId,
            metadata: { institutionId },
        },
        profiles: [],
    },
    {
        name: "customer mapping conflict fails",
        session: {
            customer: "cus_checkout_conflict",
            subscription: "sub_checkout",
            client_reference_id: institutionId,
            metadata: { institutionId },
        },
        profiles: [
            buildBillingProfile({
                institutionId: otherInstitutionId,
                stripeCustomerId: "cus_checkout_conflict",
                stripeSubscriptionId: "sub_other_checkout",
            }),
        ],
    },
    {
        name: "subscription mapping conflict fails",
        session: {
            customer: "cus_checkout",
            subscription: "sub_checkout_conflict",
            client_reference_id: institutionId,
            metadata: { institutionId },
        },
        profiles: [
            buildBillingProfile({
                institutionId: otherInstitutionId,
                stripeCustomerId: "cus_other_checkout",
                stripeSubscriptionId: "sub_checkout_conflict",
            }),
        ],
    },
]) {
    test(`checkout completed ${item.name}`, async (t) => {
        withBillingEnv(t);
        const data = mockBillingDependencies(t, {
            billingProfiles: item.profiles,
        });
        const { client, calls } = buildStripeMock();
        billingService.setStripeClientForTests(client);

        await assert.rejects(
            () =>
                billingService.processStripeWebhookEvent({
                    id: `evt_checkout_${item.name.replaceAll(" ", "_")}`,
                    type: "checkout.session.completed",
                    data: {
                        object: {
                            id: "cs_conflict",
                            ...item.session,
                        },
                    },
                }),
            { statusCode: 409, message: "Stripe billing identity conflict" }
        );

        assert.deepEqual(calls.subscriptionsRetrieve, []);
        assert.equal(
            data.queryLog.some(
                (entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"
            ),
            false
        );
    });
}

test("checkout completed with no institution candidate returns without tenant update", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t);
    const { client, calls } = buildStripeMock();
    billingService.setStripeClientForTests(client);

    await billingService.processStripeWebhookEvent({
        id: "evt_checkout_no_candidate",
        type: "checkout.session.completed",
        data: {
            object: {
                id: "cs_no_candidate",
                customer: "cus_no_candidate",
                subscription: "sub_no_candidate",
                metadata: {},
            },
        },
    });

    assert.deepEqual(calls.subscriptionsRetrieve, []);
    assert.equal(
        data.queryLog.some(
            (entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"
        ),
        false
    );
});

test("failed webhook processing marks failed and allows retry", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t, {
        billingProfileUpdateThrows: new Error("profile update failed"),
    });
    const currentSubscription = buildStripeSubscription({
        id: "sub_retry",
        customer: "cus_retry",
    });
    setCurrentStripeSubscriptionForWebhook(currentSubscription);
    const event = {
        id: "evt_retry",
        type: "customer.subscription.updated",
        data: {
            object: currentSubscription,
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
            Array.isArray(entry.query.$or) &&
            entry.query.$or.some((condition) => condition.status === "failed") &&
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
    const currentSubscription = buildStripeSubscription({
        metadata: {},
    });
    setCurrentStripeSubscriptionForWebhook(currentSubscription);

    await billingService.processStripeWebhookEvent({
        id: "evt_subscription_no_metadata",
        type: "customer.subscription.updated",
        data: {
            object: currentSubscription,
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

test("subscription webhook reconciles metadata, subscription, and customer institution candidates", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t, {
        billingProfiles: [
            buildBillingProfile({
                institutionId,
                stripeSubscriptionId: "sub_existing",
                stripeCustomerId: "cus_existing",
            }),
        ],
    });
    const currentSubscription = buildStripeSubscription();
    setCurrentStripeSubscriptionForWebhook(currentSubscription);

    await billingService.processStripeWebhookEvent({
        id: "evt_subscription_matching_candidates",
        type: "customer.subscription.updated",
        data: {
            object: currentSubscription,
        },
    });

    const profileUpdate = data.queryLog.find(
        (entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"
    );
    assert.equal(normalizeId(profileUpdate.query.institutionId), institutionId);
});

for (const item of [
    {
        name: "metadata-only institution resolution works",
        eventObject: {
            id: "sub_metadata_only",
            customer: "cus_metadata_only",
            metadata: { institutionId },
        },
        profiles: [],
    },
    {
        name: "subscription mapping-only institution resolution works",
        eventObject: {
            id: "sub_mapped",
            customer: "cus_unmapped",
            metadata: {},
        },
        profiles: [buildBillingProfile({ stripeSubscriptionId: "sub_mapped", stripeCustomerId: "cus_other" })],
    },
    {
        name: "customer mapping-only institution resolution works",
        eventObject: {
            id: "sub_unmapped",
            customer: "cus_mapped",
            metadata: {},
        },
        profiles: [buildBillingProfile({ stripeSubscriptionId: "sub_other", stripeCustomerId: "cus_mapped" })],
    },
]) {
    test(`subscription webhook ${item.name}`, async (t) => {
        withBillingEnv(t);
        const data = mockBillingDependencies(t, {
            billingProfiles: item.profiles,
        });
        const currentSubscription = buildStripeSubscription({
            ...item.eventObject,
            status: "active",
            current_period_end: 1782864000,
            cancel_at_period_end: false,
            trial_end: null,
            items: {
                data: [{ price: { id: "price_plus_6_month", product: "prod_plus" } }],
            },
        });
        setCurrentStripeSubscriptionForWebhook(currentSubscription);

        await billingService.processStripeWebhookEvent({
            id: `evt_${item.eventObject.id}`,
            type: "customer.subscription.updated",
            data: {
                object: currentSubscription,
            },
        });

        const profileUpdate = data.queryLog.find(
            (entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"
        );
        assert.equal(normalizeId(profileUpdate.query.institutionId), institutionId);
    });
}

for (const item of [
    {
        name: "metadata versus subscription mapping conflict fails",
        eventObject: {
            id: "sub_conflict",
            customer: "cus_unmapped",
            metadata: { institutionId },
        },
        profiles: [
            buildBillingProfile({
                institutionId: otherInstitutionId,
                stripeSubscriptionId: "sub_conflict",
                stripeCustomerId: "cus_other",
            }),
        ],
    },
    {
        name: "metadata versus customer mapping conflict fails",
        eventObject: {
            id: "sub_unmapped",
            customer: "cus_conflict",
            metadata: { institutionId },
        },
        profiles: [
            buildBillingProfile({
                institutionId: otherInstitutionId,
                stripeSubscriptionId: "sub_other",
                stripeCustomerId: "cus_conflict",
            }),
        ],
    },
    {
        name: "subscription versus customer mapping conflict fails",
        eventObject: {
            id: "sub_conflict",
            customer: "cus_conflict",
            metadata: {},
        },
        profiles: [
            buildBillingProfile({
                institutionId,
                stripeSubscriptionId: "sub_conflict",
                stripeCustomerId: "cus_institution",
            }),
            buildBillingProfile({
                institutionId: otherInstitutionId,
                stripeSubscriptionId: "sub_other",
                stripeCustomerId: "cus_conflict",
            }),
        ],
    },
]) {
    test(`subscription webhook ${item.name}`, async (t) => {
        withBillingEnv(t);
        const data = mockBillingDependencies(t, {
            billingProfiles: item.profiles,
        });
        const currentSubscription = buildStripeSubscription({
            ...item.eventObject,
            status: "active",
            current_period_end: 1782864000,
            cancel_at_period_end: false,
            trial_end: null,
            items: {
                data: [{ price: { id: "price_plus_6_month", product: "prod_plus" } }],
            },
        });
        setCurrentStripeSubscriptionForWebhook(currentSubscription);

        await assert.rejects(
            () =>
                billingService.processStripeWebhookEvent({
                    id: `evt_${item.name.replaceAll(" ", "_")}`,
                    type: "customer.subscription.updated",
                    data: {
                        object: currentSubscription,
                    },
                }),
            { statusCode: 409, message: "Stripe billing identity conflict" }
        );

        assert.equal(
            data.queryLog.some(
                (entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"
            ),
            false
        );
    });
}

test("subscription webhook with no institution candidate returns without tenant update", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t);
    const currentSubscription = buildStripeSubscription({
        id: "sub_no_candidate",
        customer: "cus_no_candidate",
        metadata: {},
    });
    setCurrentStripeSubscriptionForWebhook(currentSubscription);

    await billingService.processStripeWebhookEvent({
        id: "evt_subscription_no_candidate",
        type: "customer.subscription.updated",
        data: {
            object: currentSubscription,
        },
    });

    assert.equal(
        data.queryLog.some(
            (entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"
        ),
        false
    );
});

test("subscription webhook resolved institution must exist before profile update", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t);
    const currentSubscription = buildStripeSubscription({
        id: "sub_missing_institution",
        customer: "cus_missing_institution",
        metadata: { institutionId: otherInstitutionId },
    });
    setCurrentStripeSubscriptionForWebhook(currentSubscription);

    await billingService.processStripeWebhookEvent({
        id: "evt_subscription_missing_institution",
        type: "customer.subscription.updated",
        data: {
            object: currentSubscription,
        },
    });

    assert.equal(
        data.queryLog.some(
            (entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"
        ),
        false
    );
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
