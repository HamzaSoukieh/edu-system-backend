const test = require("node:test");
const assert = require("node:assert/strict");

const Institution = require("../src/models/Institution");
const InstitutionBillingProfile = require("../src/models/InstitutionBillingProfile");
const StripeWebhookEvent = require("../src/models/StripeWebhookEvent");
const billingController = require("../src/controllers/billingController");
const institutionRoutes = require("../src/routes/institutionRoutes");
const billingService = require("../src/services/billingService");
const {
    getInstitutionBillingEntitlements,
} = require("../src/services/billingEntitlementService");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439012";
const ownerUserId = "507f1f77bcf86cd799439021";
const adminUserId = "507f1f77bcf86cd799439022";
const studentUserId = "507f1f77bcf86cd799439023";
const instructorUserId = "507f1f77bcf86cd799439024";
const adminMemberId = "507f1f77bcf86cd799439031";

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
        userId: adminUserId,
        role: "admin",
        status: "active",
        ...overrides,
    };
}

function buildSubscription(overrides = {}) {
    return {
        id: "sub_existing",
        customer: "cus_existing",
        status: "active",
        collection_method: "charge_automatically",
        latest_invoice: "in_baseline_1",
        schedule: null,
        metadata: { institutionId },
        cancel_at_period_end: false,
        trial_end: null,
        items: {
            data: [
                {
                    id: "si_plus",
                    quantity: 1,
                    current_period_start: 1767225600,
                    current_period_end: 1782864000,
                    price: { id: "price_plus_6_month", product: "prod_plus" },
                },
            ],
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
    };

    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.STRIPE_PRICE_PLUS_6_MONTH = "price_plus_6_month";
    process.env.STRIPE_PRICE_PRO_6_MONTH = "price_pro_6_month";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";

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

        return true;
    });
}

function mockBillingDependencies(t, dataset = {}) {
    const data = {
        institution: buildInstitution(),
        billingProfile: buildBillingProfile(),
        billingProfiles: null,
        webhookEvent: null,
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
            return createQuery(
                getBillingProfiles().find((item) => item.stripeSubscriptionId === query.stripeSubscriptionId) || null
            );
        }

        if (query.stripeCustomerId !== undefined) {
            return createQuery(
                getBillingProfiles().find((item) => item.stripeCustomerId === query.stripeCustomerId) || null
            );
        }

        return createQuery(
            getBillingProfiles().find((item) => matchesId(item.institutionId, query.institutionId)) || null
        );
    });

    t.mock.method(InstitutionBillingProfile, "findOneAndUpdate", (filter, update) => {
        data.queryLog.push({ model: "InstitutionBillingProfile", method: "findOneAndUpdate", query: filter, update });
        const existing = getBillingProfiles().find((item) => matchesId(item.institutionId, filter.institutionId));
        const nextProfile = {
            ...(existing || {}),
            _id: existing?._id || "507f1f77bcf86cd799439041",
            institutionId: filter.institutionId,
            ...(update.$set || {}),
            updatedAt: new Date("2026-06-02T00:00:00.000Z"),
        };

        if (existing) {
            Object.assign(existing, nextProfile);
            data.billingProfile = existing;
            return createQuery(existing);
        }

        data.billingProfile = nextProfile;
        return createQuery(nextProfile);
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

function buildStripeMock(options = {}) {
    const calls = {
        customersCreate: [],
        checkoutSessionsCreate: [],
        subscriptionsCreate: [],
        subscriptionsRetrieve: [],
        subscriptionsUpdate: [],
    };

    const client = {
        customers: {
            create: async (payload, requestOptions) => {
                calls.customersCreate.push({ payload, requestOptions });
                return { id: "cus_new" };
            },
        },
        checkout: {
            sessions: {
                create: async (payload, requestOptions) => {
                    calls.checkoutSessionsCreate.push({ payload, requestOptions });
                    return { id: "cs_test", url: "https://checkout.stripe.test/session" };
                },
            },
        },
        subscriptions: {
            create: async (payload, requestOptions) => {
                calls.subscriptionsCreate.push({ payload, requestOptions });
                return { id: "sub_new" };
            },
            retrieve: async (subscriptionId, params) => {
                calls.subscriptionsRetrieve.push({ subscriptionId, params });
                if (typeof options.retrieve === "function") {
                    return options.retrieve(subscriptionId, params);
                }
                return buildSubscription(options.subscription || {});
            },
            update: async (subscriptionId, params, requestOptions) => {
                calls.subscriptionsUpdate.push({ subscriptionId, params, requestOptions });
                if (typeof options.update === "function") {
                    return options.update(subscriptionId, params, requestOptions);
                }
                return buildSubscription({
                    latest_invoice: options.latestInvoice || "in_after_update_1",
                });
            },
        },
    };

    return { client, calls };
}

async function assertRejectsWithStatus(promise, expected) {
    await assert.rejects(
        promise,
        (error) => {
            assert.equal(error.statusCode, expected.statusCode);
            if (expected.message) {
                assert.equal(error.message, expected.message);
            }
            return true;
        }
    );
}

async function requestUpgrade({ actorUserId = adminUserId, actorMembership = buildMembership(), institution = institutionId } = {}) {
    return billingService.upgradeSubscriptionToPro({
        institutionId: institution,
        actorUserId,
        actorMembership,
    });
}

test("active admin and active owner can request immediate Plus to Pro upgrade", async (t) => {
    withBillingEnv(t);
    mockBillingDependencies(t);
    const { client, calls } = buildStripeMock();
    billingService.setStripeClientForTests(client);

    const adminResult = await requestUpgrade();
    assert.deepEqual(adminResult, {
        upgrade: {
            fromPlan: "plus",
            toPlan: "pro",
            status: "processing",
        },
    });

    t.mock.reset();
    withBillingEnv(t);
    mockBillingDependencies(t);
    const secondStripe = buildStripeMock();
    billingService.setStripeClientForTests(secondStripe.client);

    const ownerResult = await requestUpgrade({
        actorUserId: ownerUserId,
        actorMembership: buildMembership({ userId: ownerUserId, role: "instructor" }),
    });
    assert.deepEqual(ownerResult.upgrade, { fromPlan: "plus", toPlan: "pro", status: "processing" });

    assert.equal(calls.subscriptionsUpdate.length, 1);
    assert.equal(secondStripe.calls.subscriptionsUpdate.length, 1);
});

test("upgrade authorization fails closed and does not call Stripe", async (t) => {
    const cases = [
        {
            name: "student",
            actorUserId: studentUserId,
            actorMembership: buildMembership({ userId: studentUserId, role: "student" }),
            message: "You do not have permission to manage billing for this institution.",
        },
        {
            name: "instructor",
            actorUserId: instructorUserId,
            actorMembership: buildMembership({ userId: instructorUserId, role: "instructor" }),
            message: "You do not have permission to manage billing for this institution.",
        },
        {
            name: "inactive admin",
            actorMembership: buildMembership({ status: "suspended" }),
            message: "Institution access denied",
        },
        {
            name: "missing status",
            actorMembership: (() => {
                const membership = buildMembership();
                delete membership.status;
                return membership;
            })(),
            message: "Institution access denied",
        },
        {
            name: "user mismatch",
            actorUserId: adminUserId,
            actorMembership: buildMembership({ userId: ownerUserId }),
            message: "Institution access denied",
        },
        {
            name: "cross tenant",
            actorMembership: buildMembership({ institutionId: otherInstitutionId }),
            message: "Institution access denied",
        },
    ];

    for (const item of cases) {
        await t.test(item.name, async (st) => {
            withBillingEnv(st);
            mockBillingDependencies(st);
            const { client, calls } = buildStripeMock();
            billingService.setStripeClientForTests(client);

            await assertRejectsWithStatus(
                requestUpgrade({
                    actorUserId: item.actorUserId || adminUserId,
                    actorMembership: item.actorMembership,
                }),
                { statusCode: 403, message: item.message }
            );

            assert.equal(calls.subscriptionsRetrieve.length, 0);
            assert.equal(calls.subscriptionsUpdate.length, 0);
            assert.equal(calls.customersCreate.length, 0);
            assert.equal(calls.checkoutSessionsCreate.length, 0);
            assert.equal(calls.subscriptionsCreate.length, 0);
        });
    }
});

test("upgrade rejects unsupported local eligibility states before Stripe update", async (t) => {
    const cases = [
        { label: "already Pro", profile: buildBillingProfile({ plan: "pro" }), message: "Institution is already on Pro" },
        { label: "missing profile", profile: null, statusCode: 404, message: "Billing profile not found" },
        {
            label: "missing customer",
            profile: buildBillingProfile({ stripeCustomerId: null }),
            message: "Billing profile is missing Stripe customer",
        },
        {
            label: "missing subscription",
            profile: buildBillingProfile({ stripeSubscriptionId: null }),
            message: "Billing profile is missing Stripe subscription",
        },
        { label: "past_due", profile: buildBillingProfile({ status: "past_due" }), message: "Subscription status is not eligible for upgrade" },
        { label: "unpaid", profile: buildBillingProfile({ status: "unpaid" }), message: "Subscription status is not eligible for upgrade" },
        { label: "incomplete", profile: buildBillingProfile({ status: "incomplete" }), message: "Subscription status is not eligible for upgrade" },
        { label: "canceled", profile: buildBillingProfile({ status: "canceled" }), message: "Subscription status is not eligible for upgrade" },
        { label: "trialing", profile: buildBillingProfile({ status: "trialing" }), message: "Subscription status is not eligible for upgrade" },
        { label: "unknown plan", profile: buildBillingProfile({ plan: null }), message: "Only Plus subscriptions can be upgraded to Pro" },
    ];

    for (const item of cases) {
        await t.test(item.label, async (st) => {
            withBillingEnv(st);
            mockBillingDependencies(st, { billingProfile: item.profile });
            const { client, calls } = buildStripeMock();
            billingService.setStripeClientForTests(client);

            await assertRejectsWithStatus(requestUpgrade(), {
                statusCode: item.statusCode || 409,
                message: item.message,
            });

            assert.equal(calls.subscriptionsUpdate.length, 0);
        });
    }
});

test("upgrade rejects local Plus profiles when stored Stripe price is not synchronized", async (t) => {
    const cases = [
        { label: "local Pro price", stripePriceId: "price_pro_6_month" },
        { label: "unknown price", stripePriceId: "price_unknown" },
        { label: "missing price", stripePriceId: null },
    ];

    for (const item of cases) {
        await t.test(item.label, async (st) => {
            withBillingEnv(st);
            mockBillingDependencies(st, {
                billingProfile: buildBillingProfile({ stripePriceId: item.stripePriceId }),
            });
            const { client, calls } = buildStripeMock();
            billingService.setStripeClientForTests(client);

            await assertRejectsWithStatus(requestUpgrade(), {
                statusCode: 409,
                message: "Local billing profile is not synchronized",
            });

            assert.equal(calls.subscriptionsRetrieve.length, 0);
            assert.equal(calls.subscriptionsUpdate.length, 0);
        });
    }
});

test("upgrade validates live Stripe subscription status before update", async (t) => {
    for (const status of ["past_due", "canceled", null, "paused_unknown"]) {
        await t.test(String(status), async (st) => {
            withBillingEnv(st);
            mockBillingDependencies(st);
            const { client, calls } = buildStripeMock({
                subscription: buildSubscription({ status }),
            });
            billingService.setStripeClientForTests(client);

            await assertRejectsWithStatus(requestUpgrade(), {
                statusCode: 409,
                message: "Stripe subscription status is not eligible for upgrade",
            });

            assert.equal(calls.subscriptionsRetrieve.length, 1);
            assert.equal(calls.subscriptionsUpdate.length, 0);
        });
    }
});

test("upgrade validates Stripe collection method before update", async (t) => {
    for (const collectionMethod of ["send_invoice", null, "unknown_collection"]) {
        await t.test(String(collectionMethod), async (st) => {
            withBillingEnv(st);
            mockBillingDependencies(st);
            const { client, calls } = buildStripeMock({
                subscription: buildSubscription({ collection_method: collectionMethod }),
            });
            billingService.setStripeClientForTests(client);

            await assertRejectsWithStatus(requestUpgrade(), {
                statusCode: 409,
                message: "Subscription collection method is not eligible for upgrade",
            });

            assert.equal(calls.subscriptionsRetrieve.length, 1);
            assert.equal(calls.subscriptionsUpdate.length, 0);
        });
    }
});

test("upgrade rejects unexpected Stripe subscription item states", async (t) => {
    const cases = [
        {
            label: "unexpected current price",
            subscription: buildSubscription({ items: { data: [{ id: "si_unknown", quantity: 1, price: { id: "price_unknown" } }] } }),
            message: "Subscription price is not eligible for upgrade",
        },
        {
            label: "no suitable item",
            subscription: buildSubscription({ items: { data: [] } }),
            message: "Subscription item is not eligible for upgrade",
        },
        {
            label: "ambiguous items",
            subscription: buildSubscription({
                items: {
                    data: [
                        { id: "si_plus", price: { id: "price_plus_6_month" } },
                        { id: "si_extra", price: { id: "price_extra" } },
                    ],
                },
            }),
            message: "Subscription item is not eligible for upgrade",
        },
        {
            label: "already Pro in Stripe",
            subscription: buildSubscription({ items: { data: [{ id: "si_pro", quantity: 1, price: { id: "price_pro_6_month" } }] } }),
            message: "Subscription is already on Pro",
        },
    ];

    for (const item of cases) {
        await t.test(item.label, async (st) => {
            withBillingEnv(st);
            mockBillingDependencies(st);
            const { client, calls } = buildStripeMock({ subscription: item.subscription });
            billingService.setStripeClientForTests(client);

            await assertRejectsWithStatus(requestUpgrade(), { statusCode: 409, message: item.message });
            assert.equal(calls.subscriptionsRetrieve.length, 1);
            assert.equal(calls.subscriptionsUpdate.length, 0);
        });
    }
});

test("upgrade rejects invalid subscription item quantities before update", async (t) => {
    const cases = [
        { label: "quantity greater than one", quantity: 2 },
        { label: "zero quantity", quantity: 0 },
        { label: "missing quantity", quantity: undefined },
    ];

    for (const item of cases) {
        await t.test(item.label, async (st) => {
            withBillingEnv(st);
            mockBillingDependencies(st);
            const subscriptionItem = {
                id: "si_plus",
                price: { id: "price_plus_6_month" },
            };
            if (item.quantity !== undefined) {
                subscriptionItem.quantity = item.quantity;
            }
            const { client, calls } = buildStripeMock({
                subscription: buildSubscription({
                    items: {
                        data: [subscriptionItem],
                    },
                }),
            });
            billingService.setStripeClientForTests(client);

            await assertRejectsWithStatus(requestUpgrade(), {
                statusCode: 409,
                message: "Subscription item is not eligible for upgrade",
            });

            assert.equal(calls.subscriptionsUpdate.length, 0);
        });
    }
});

test("upgrade rejects Stripe subscription schedules in this phase", async (t) => {
    for (const schedule of ["sub_sched_123", { id: "sub_sched_expanded" }]) {
        await t.test(typeof schedule === "string" ? "string schedule" : "expanded schedule", async (st) => {
            withBillingEnv(st);
            mockBillingDependencies(st);
            const { client, calls } = buildStripeMock({
                subscription: buildSubscription({ schedule }),
            });
            billingService.setStripeClientForTests(client);

            await assertRejectsWithStatus(requestUpgrade(), {
                statusCode: 409,
                message: "Scheduled subscriptions are not eligible for upgrade",
            });

            assert.equal(calls.subscriptionsUpdate.length, 0);
        });
    }
});

test("upgrade fails safely when Stripe subscription retrieval fails", async (t) => {
    withBillingEnv(t);
    mockBillingDependencies(t);
    const { client, calls } = buildStripeMock({
        retrieve: async () => {
            throw new Error("raw Stripe not found detail");
        },
    });
    billingService.setStripeClientForTests(client);

    await assertRejectsWithStatus(requestUpgrade(), {
        statusCode: 502,
        message: "The payment provider is temporarily unavailable. Please try again.",
    });

    assert.equal(calls.subscriptionsRetrieve.length, 1);
    assert.equal(calls.subscriptionsUpdate.length, 0);
});

test("upgrade rejects invalid Plus and Pro Stripe price configuration before update", async (t) => {
    const cases = [
        { label: "missing Plus", setup: () => delete process.env.STRIPE_PRICE_PLUS_6_MONTH },
        { label: "missing Pro", setup: () => delete process.env.STRIPE_PRICE_PRO_6_MONTH },
        { label: "placeholder", setup: () => { process.env.STRIPE_PRICE_PRO_6_MONTH = "price_replace_me"; } },
        { label: "identical", setup: () => { process.env.STRIPE_PRICE_PRO_6_MONTH = "price_plus_6_month"; } },
    ];

    for (const item of cases) {
        await t.test(item.label, async (st) => {
            withBillingEnv(st);
            item.setup();
            mockBillingDependencies(st);
            const { client, calls } = buildStripeMock();
            billingService.setStripeClientForTests(client);

            await assertRejectsWithStatus(requestUpgrade(), {
                statusCode: 500,
                message: "Billing plan price is not configured",
            });

            assert.equal(calls.subscriptionsRetrieve.length, 0);
            assert.equal(calls.subscriptionsUpdate.length, 0);
        });
    }
});

test("upgrade validates Stripe subscription mapping before update", async (t) => {
    const cases = [
        {
            label: "customer mismatch",
            subscription: buildSubscription({ customer: "cus_other" }),
            message: "Stripe subscription identity conflict",
        },
        {
            label: "subscription mismatch",
            subscription: buildSubscription({ id: "sub_other" }),
            message: "Stripe subscription identity conflict",
        },
        {
            label: "metadata conflict",
            subscription: buildSubscription({ metadata: { institutionId: otherInstitutionId } }),
            message: "Stripe subscription identity conflict",
        },
        {
            label: "customer mapped to another institution",
            billingProfiles: [
                buildBillingProfile({
                    _id: "507f1f77bcf86cd799439099",
                    institutionId: otherInstitutionId,
                    stripeCustomerId: "cus_existing",
                    stripeSubscriptionId: "sub_other",
                }),
                buildBillingProfile(),
            ],
            message: "Stripe subscription identity conflict",
        },
        {
            label: "subscription mapped to another institution",
            billingProfiles: [
                buildBillingProfile({
                    _id: "507f1f77bcf86cd799439098",
                    institutionId: otherInstitutionId,
                    stripeCustomerId: "cus_other",
                    stripeSubscriptionId: "sub_existing",
                }),
                buildBillingProfile(),
            ],
            message: "Stripe subscription identity conflict",
        },
    ];

    for (const item of cases) {
        await t.test(item.label, async (st) => {
            withBillingEnv(st);
            const data = mockBillingDependencies(st, {
                billingProfiles: item.billingProfiles || null,
            });
            const { client, calls } = buildStripeMock({ subscription: item.subscription || buildSubscription() });
            billingService.setStripeClientForTests(client);

            await assertRejectsWithStatus(requestUpgrade(), { statusCode: 409, message: item.message });

            assert.equal(calls.subscriptionsUpdate.length, 0);
            assert.equal(
                data.queryLog.some((entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"),
                false
            );
        });
    }
});

test("successful upgrade replaces existing Plus item with Pro price using prorated pending update", async (t) => {
    withBillingEnv(t);
    mockBillingDependencies(t);
    const { client, calls } = buildStripeMock({
        latestInvoice: {
            confirmation_secret: { client_secret: "pi_secret_action" },
        },
    });
    billingService.setStripeClientForTests(client);

    const result = await requestUpgrade();

    assert.deepEqual(result, {
        upgrade: {
            fromPlan: "plus",
            toPlan: "pro",
            status: "processing",
        },
    });
    assert.equal(calls.subscriptionsRetrieve.length, 1);
    assert.equal(calls.subscriptionsRetrieve[0].subscriptionId, "sub_existing");
    assert.deepEqual(calls.subscriptionsRetrieve[0].params, { expand: ["items.data.price"] });
    assert.equal(calls.subscriptionsUpdate.length, 1);
    assert.equal(calls.subscriptionsUpdate[0].subscriptionId, "sub_existing");
    assert.deepEqual(calls.subscriptionsUpdate[0].params.items, [
        { id: "si_plus", price: "price_pro_6_month" },
    ]);
    assert.equal(calls.subscriptionsUpdate[0].params.proration_behavior, "always_invoice");
    assert.equal(calls.subscriptionsUpdate[0].params.payment_behavior, "pending_if_incomplete");
    assert.deepEqual(calls.subscriptionsUpdate[0].params.expand, ["latest_invoice.confirmation_secret"]);
    assert.equal(
        calls.subscriptionsUpdate[0].requestOptions.idempotencyKey,
        `subscription-upgrade:${institutionId}:sub_existing:invoice:in_baseline_1:price_plus_6_month:to:price_pro_6_month`
    );
    assert.equal(calls.customersCreate.length, 0);
    assert.equal(calls.checkoutSessionsCreate.length, 0);
    assert.equal(calls.subscriptionsCreate.length, 0);
});

test("upgrade classifies pending update payment states safely", async (t) => {
    const cases = [
        {
            label: "pending requires action",
            latestInvoice: {
                confirmation_secret: { client_secret: "pi_secret_action" },
                payment_intent: { status: "requires_action" },
            },
            pendingUpdate: { expires_at: 1782864000 },
            expected: {
                fromPlan: "plus",
                toPlan: "pro",
                status: "payment_action_required",
                clientSecret: "pi_secret_action",
            },
        },
        {
            label: "pending requires payment method",
            latestInvoice: {
                confirmation_secret: { client_secret: "pi_secret_declined" },
                payment_intent: { status: "requires_payment_method" },
            },
            pendingUpdate: { expires_at: 1782864000 },
            expected: {
                fromPlan: "plus",
                toPlan: "pro",
                status: "payment_failed",
            },
        },
        {
            label: "pending without safe secret",
            latestInvoice: {},
            pendingUpdate: { expires_at: 1782864000 },
            expected: {
                fromPlan: "plus",
                toPlan: "pro",
                status: "payment_incomplete",
            },
        },
    ];

    for (const item of cases) {
        await t.test(item.label, async (st) => {
            withBillingEnv(st);
            mockBillingDependencies(st);
            const { client } = buildStripeMock({
                update: async () =>
                    buildSubscription({
                        pending_update: item.pendingUpdate,
                        latest_invoice: item.latestInvoice,
                    }),
            });
            billingService.setStripeClientForTests(client);

            const result = await requestUpgrade();
            assert.deepEqual(result.upgrade, item.expected);
        });
    }
});

test("repeated upgrade requests use the same idempotency key and do not create customers, checkout sessions, or subscriptions", async (t) => {
    withBillingEnv(t);
    mockBillingDependencies(t);
    const { client, calls } = buildStripeMock();
    billingService.setStripeClientForTests(client);

    await requestUpgrade();
    await requestUpgrade();

    assert.equal(calls.subscriptionsUpdate.length, 2);
    assert.equal(
        calls.subscriptionsUpdate[0].requestOptions.idempotencyKey,
        calls.subscriptionsUpdate[1].requestOptions.idempotencyKey
    );
    assert.equal(calls.customersCreate.length, 0);
    assert.equal(calls.checkoutSessionsCreate.length, 0);
    assert.equal(calls.subscriptionsCreate.length, 0);
});

test("idempotency key changes when trusted Stripe baseline invoice changes", async (t) => {
    withBillingEnv(t);
    mockBillingDependencies(t);
    let retrieveCount = 0;
    const { client, calls } = buildStripeMock({
        retrieve: async () => {
            retrieveCount += 1;
            return buildSubscription({
                latest_invoice: retrieveCount === 1 ? "in_baseline_1" : "in_baseline_2",
            });
        },
    });
    billingService.setStripeClientForTests(client);

    await requestUpgrade();
    await requestUpgrade();

    assert.equal(calls.subscriptionsUpdate.length, 2);
    assert.notEqual(
        calls.subscriptionsUpdate[0].requestOptions.idempotencyKey,
        calls.subscriptionsUpdate[1].requestOptions.idempotencyKey
    );
    assert.equal(calls.customersCreate.length, 0);
    assert.equal(calls.checkoutSessionsCreate.length, 0);
    assert.equal(calls.subscriptionsCreate.length, 0);
});

test("detectable pending Pro upgrade is rejected safely", async (t) => {
    withBillingEnv(t);
    mockBillingDependencies(t);
    const { client, calls } = buildStripeMock({
        subscription: buildSubscription({
            pending_update: {
                subscription_items: [{ id: "si_plus", price: { id: "price_pro_6_month" } }],
            },
        }),
    });
    billingService.setStripeClientForTests(client);

    await assertRejectsWithStatus(requestUpgrade(), {
        statusCode: 409,
        message: "Subscription upgrade is already in progress",
    });
    assert.equal(calls.subscriptionsUpdate.length, 0);
});

test("detectable pending Pro upgrade with string price is rejected safely", async (t) => {
    withBillingEnv(t);
    mockBillingDependencies(t);
    const { client, calls } = buildStripeMock({
        subscription: buildSubscription({
            pending_update: {
                subscription_items: [{ id: "si_plus", price: "price_pro_6_month" }],
            },
        }),
    });
    billingService.setStripeClientForTests(client);

    await assertRejectsWithStatus(requestUpgrade(), {
        statusCode: 409,
        message: "Subscription upgrade is already in progress",
    });
    assert.equal(calls.subscriptionsUpdate.length, 0);
});

test("Stripe update failures are normalized and do not mutate local billing state", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t);
    const { client, calls } = buildStripeMock({
        update: async () => {
            throw new Error("raw Stripe decline with internal details");
        },
    });
    billingService.setStripeClientForTests(client);

    await assertRejectsWithStatus(requestUpgrade(), {
        statusCode: 502,
        message: "Stripe subscription upgrade failed",
    });

    assert.equal(calls.subscriptionsUpdate.length, 1);
    assert.equal(data.billingProfile.plan, "plus");
    assert.equal(getInstitutionBillingEntitlements(data.billingProfile).maxActiveStudents, 300);
    assert.equal(
        data.queryLog.some((entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"),
        false
    );
});

test("upgrade endpoint does not grant Pro until verified webhook synchronizes Pro price", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t);
    let stripeStateIsPro = false;
    const { client, calls } = buildStripeMock({
        update: async () => {
            stripeStateIsPro = true;
            return buildSubscription({ pending_update: null });
        },
        retrieve: async (subscriptionId) =>
            buildSubscription({
                id: subscriptionId,
                items: {
                    data: [
                        stripeStateIsPro
                            ? {
                                  id: "si_plus",
                                  quantity: 1,
                                  current_period_start: 1767225600,
                                  current_period_end: 1782864000,
                                  price: { id: "price_pro_6_month", product: "prod_pro" },
                              }
                            : {
                                  id: "si_plus",
                                  quantity: 1,
                                  current_period_start: 1767225600,
                                  current_period_end: 1782864000,
                                  price: { id: "price_plus_6_month", product: "prod_plus" },
                              },
                    ],
                },
            }),
    });
    billingService.setStripeClientForTests(client);

    const result = await requestUpgrade();
    assert.equal(result.upgrade.status, "processing");
    assert.equal(data.billingProfile.plan, "plus");
    assert.equal(getInstitutionBillingEntitlements(data.billingProfile).maxActiveStudents, 300);
    assert.equal(
        data.queryLog.some((entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOneAndUpdate"),
        false
    );
    assert.equal(calls.subscriptionsUpdate.length, 1);

    await billingService.processStripeWebhookEvent({
        id: "evt_upgrade_success",
        type: "customer.subscription.updated",
        data: {
            object: buildSubscription({
                items: {
                    data: [
                        {
                            id: "si_plus",
                            current_period_start: 1767225600,
                            current_period_end: 1782864000,
                            price: { id: "price_pro_6_month", product: "prod_pro" },
                        },
                    ],
                },
            }),
        },
    });

    assert.equal(data.billingProfile.plan, "pro");
    assert.equal(data.billingProfile.stripePriceId, "price_pro_6_month");
    assert.equal(getInstitutionBillingEntitlements(data.billingProfile).maxActiveStudents, 1000);
    assert.equal(getInstitutionBillingEntitlements(data.billingProfile).maxActiveStaff, 100);
});

test("stale subscription webhook snapshot cannot overwrite current retrieved Pro subscription", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t, {
        billingProfile: buildBillingProfile({
            stripePriceId: "price_pro_6_month",
            stripeProductId: "prod_pro",
            plan: "pro",
        }),
    });
    const { client, calls } = buildStripeMock({
        retrieve: async (subscriptionId) =>
            buildSubscription({
                id: subscriptionId,
                items: {
                    data: [
                        {
                            id: "si_plus",
                            quantity: 1,
                            current_period_start: 1767225600,
                            current_period_end: 1782864000,
                            price: { id: "price_pro_6_month", product: "prod_pro" },
                        },
                    ],
                },
            }),
    });
    billingService.setStripeClientForTests(client);

    await billingService.processStripeWebhookEvent({
        id: "evt_stale_plus_snapshot",
        type: "customer.subscription.updated",
        data: {
            object: buildSubscription({
                items: {
                    data: [
                        {
                            id: "si_plus",
                            quantity: 1,
                            price: { id: "price_plus_6_month", product: "prod_plus" },
                        },
                    ],
                },
            }),
        },
    });

    assert.deepEqual(calls.subscriptionsRetrieve, [{ subscriptionId: "sub_existing", params: undefined }]);
    assert.equal(data.billingProfile.plan, "pro");
    assert.equal(data.billingProfile.stripePriceId, "price_pro_6_month");
});

test("subscription deleted webhook still applies deletion snapshot without retrieving current subscription", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t);
    const { client, calls } = buildStripeMock();
    billingService.setStripeClientForTests(client);

    await billingService.processStripeWebhookEvent({
        id: "evt_subscription_deleted",
        type: "customer.subscription.deleted",
        data: {
            object: buildSubscription({
                status: "canceled",
            }),
        },
    });

    assert.deepEqual(calls.subscriptionsRetrieve, []);
    assert.equal(data.billingProfile.status, "canceled");
    assert.equal(getInstitutionBillingEntitlements(data.billingProfile).hasPaidAccess, false);
});

test("failed prorated payment webhook does not grant Pro when Stripe subscription remains Plus", async (t) => {
    withBillingEnv(t);
    const data = mockBillingDependencies(t);
    const { client } = buildStripeMock({
        retrieve: async () =>
            buildSubscription({
                items: {
                    data: [{ id: "si_plus", price: { id: "price_plus_6_month", product: "prod_plus" } }],
                },
            }),
    });
    billingService.setStripeClientForTests(client);

    await billingService.processStripeWebhookEvent({
        id: "evt_upgrade_failed",
        type: "invoice.payment_failed",
        data: {
            object: {
                subscription: "sub_existing",
            },
        },
    });

    assert.equal(data.billingProfile.plan, "plus");
    assert.equal(data.billingProfile.stripePriceId, "price_plus_6_month");
    assert.equal(getInstitutionBillingEntitlements(data.billingProfile).maxActiveStudents, 300);
    assert.equal(getInstitutionBillingEntitlements(data.billingProfile).maxActiveStaff, 30);
});

test("billing upgrade route and controller follow existing billing middleware and plain service argument pattern", async (t) => {
    const upgradeRoute = institutionRoutes.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route)
        .find((route) => route.path === "/:institutionId/billing/upgrade-to-pro" && route.methods.post);

    assert.ok(upgradeRoute);
    assert.deepEqual(
        upgradeRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "upgradeToPro"]
    );

    const serviceCalls = [];
    t.mock.method(billingService, "upgradeSubscriptionToPro", async (payload) => {
        serviceCalls.push(payload);
        assert.equal(payload.req, undefined);
        assert.equal(payload.res, undefined);
        return { upgrade: { fromPlan: "plus", toPlan: "pro", status: "processing" } };
    });

    const res = createResponse();
    await billingController.upgradeToPro(
        {
            params: { institutionId },
            tenantId: institutionId,
            user: { id: adminUserId },
            membership: buildMembership(),
            body: { ignored: "controller does not pass body" },
        },
        res
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { upgrade: { fromPlan: "plus", toPlan: "pro", status: "processing" } });
    assert.deepEqual(serviceCalls, [
        {
            institutionId,
            actorUserId: adminUserId,
            actorMembership: buildMembership(),
        },
    ]);
});
