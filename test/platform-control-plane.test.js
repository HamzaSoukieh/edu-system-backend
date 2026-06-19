const test = require("node:test");
const assert = require("node:assert/strict");

const Institution = require("../src/models/Institution");
const InstitutionBillingProfile = require("../src/models/InstitutionBillingProfile");
const Membership = require("../src/models/Membership");
const PlatformAdmin = require("../src/models/PlatformAdmin");
const PlatformAuditLog = require("../src/models/PlatformAuditLog");
const StripeWebhookEvent = require("../src/models/StripeWebhookEvent");
const User = require("../src/models/User");
const app = require("../src/app");
const { ROLE_PERMISSIONS } = require("../src/auth/permissions");
const { PLATFORM_PERMISSIONS, PLATFORM_ROLE_PERMISSIONS, getPlatformRolePermissions } = require("../src/auth/platformPermissions");
const platformPermissionsModule = require("../src/auth/platformPermissions");
const { resolvePlatformAdmin, requirePlatformPermission } = require("../src/middleware/platformAuthorize");
const platformController = require("../src/controllers/platformController");
const platformRoutes = require("../src/routes/platformRoutes");
const platformService = require("../src/services/platformService");
const { createPlatformOwner, normalizeEmail, parseEmailArg } = require("../scripts/create-platform-owner");

const userId = "507f1f77bcf86cd799439011";
const adminId = "507f1f77bcf86cd799439012";
const institutionId = "507f1f77bcf86cd799439013";
const otherInstitutionId = "507f1f77bcf86cd799439014";

function query(result) {
    return {
        select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; },
        lean: async () => result,
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
    };
}

function response() {
    return {
        statusCode: null, body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
}

async function runMiddleware(middleware, req) {
    const res = response();
    let nextCalled = false;
    let nextError = null;
    await middleware(req, res, (error) => { nextCalled = true; nextError = error || null; });
    return { res, nextCalled, nextError };
}

function activePlatformAdmin(overrides = {}) {
    return { _id: adminId, userId, role: "platform_owner", status: "active", permissions: ["membership.manage"], ...overrides };
}

function platformContext(overrides = {}) {
    return { platformAdminId: adminId, actorUserId: userId, permissions: [...PLATFORM_PERMISSIONS], ipAddress: "127.0.0.1", userAgent: "node:test", ...overrides };
}

function mockServiceActor(t, overrides = {}) {
    const record = activePlatformAdmin(overrides);
    t.mock.method(PlatformAdmin, "findOne", (filter) => {
        assert.deepEqual(filter, { _id: adminId, userId, status: "active" });
        return query(record);
    });
    return record;
}

function mockPlatformResolution(t, platformAdmin, user = { _id: userId }) {
    t.mock.method(PlatformAdmin, "findOne", (filter) => {
        assert.deepEqual(filter, { userId, status: "active" });
        return query(platformAdmin);
    });
    t.mock.method(User, "findOne", (filter) => {
        assert.deepEqual(filter, { _id: userId, status: "active", isEmailVerified: true });
        return query(user);
    });
}

test("platform permission catalog is separate, exact, and unknown roles fail closed", () => {
    assert.deepEqual(PLATFORM_ROLE_PERMISSIONS.platform_owner, PLATFORM_PERMISSIONS);
    assert.deepEqual(getPlatformRolePermissions("platform_owner"), PLATFORM_PERMISSIONS);
    assert.equal(getPlatformRolePermissions("admin"), null);
    assert.equal(getPlatformRolePermissions("unknown"), null);
    assert.equal(Object.values(ROLE_PERMISSIONS).flat().some((permission) => permission.startsWith("platform.")), false);
    assert.equal(PLATFORM_PERMISSIONS.includes("membership.manage"), false);
});

test("active platform owner resolves without a Membership and ignores stored permissions", async (t) => {
    mockPlatformResolution(t, activePlatformAdmin());
    const req = { user: { id: userId } };
    const result = await runMiddleware(resolvePlatformAdmin, req);
    assert.equal(result.nextCalled, true);
    assert.equal(result.nextError, null);
    assert.deepEqual(req.platformPermissions, PLATFORM_PERMISSIONS);
    assert.equal(req.membership, undefined);
    assert.equal(req.platformPermissions.includes("membership.manage"), false);
});

for (const scenario of [
    ["missing PlatformAdmin", null],
    ["suspended PlatformAdmin", null],
    ["missing PlatformAdmin status", null],
    ["unknown platform role", activePlatformAdmin({ role: "future_role" })],
    ["PlatformAdmin user mismatch", activePlatformAdmin({ userId: otherInstitutionId })],
]) {
    test(`${scenario[0]} is denied`, async (t) => {
        mockPlatformResolution(t, scenario[1]);
        const result = await runMiddleware(resolvePlatformAdmin, { user: { id: userId }, membership: { role: "admin" } });
        assert.equal(result.nextCalled, false);
        assert.equal(result.res.statusCode, 403);
        assert.deepEqual(result.res.body, { message: "Platform access denied" });
    });
}

test("tenant admin membership alone does not grant provider access", async (t) => {
    mockPlatformResolution(t, null);
    const result = await runMiddleware(resolvePlatformAdmin, { user: { id: userId }, membership: { role: "admin", status: "active" } });
    assert.equal(result.res.statusCode, 403);
});

test("invalid or inactive referenced User fails closed", async (t) => {
    mockPlatformResolution(t, activePlatformAdmin(), null);
    const result = await runMiddleware(resolvePlatformAdmin, { user: { id: userId } });
    assert.equal(result.res.statusCode, 403);
});

test("platform permission middleware denies missing, unknown, and tenant-only permissions", async () => {
    const allowed = await runMiddleware(requirePlatformPermission("platform.audit.read"), { platformAdmin: { id: adminId }, platformPermissions: PLATFORM_PERMISSIONS });
    assert.equal(allowed.nextCalled, true);
    for (const permissions of [[], ["membership.manage"], ["platform.future.read"]]) {
        const denied = await runMiddleware(requirePlatformPermission("platform.audit.read"), { platformAdmin: { id: adminId }, platformPermissions: permissions });
        assert.equal(denied.res.statusCode, 403);
    }
});

test("permission denial creates a sanitized provider audit when actor context is available", async (t) => {
    let audit;
    t.mock.method(PlatformAuditLog, "create", async (payload) => { audit = payload; return payload; });
    const denied = await runMiddleware(requirePlatformPermission("platform.audit.read"), {
        user: { id: userId },
        platformAdmin: { id: adminId },
        platformPermissions: ["platform.institutions.read"],
        originalUrl: "/platform/audit",
        ip: "127.0.0.1",
        headers: { "user-agent": "node:test" },
    });
    assert.equal(denied.res.statusCode, 403);
    assert.equal(audit.action, "platform.permission.denied");
    assert.equal(audit.result, "denied");
    assert.deepEqual(audit.metadata, {});
});

test("PlatformAdmin and PlatformAuditLog models enforce separate authority and immutable timestamps", () => {
    const valid = new PlatformAdmin({ userId, role: "platform_owner", status: "active" });
    assert.equal(valid.validateSync(), undefined);
    assert.equal(new PlatformAdmin({ userId, role: "admin", status: "active" }).validateSync().errors.role.kind, "enum");
    assert.equal(new PlatformAdmin({ userId, role: "platform_owner" }).status, "active");
    assert.ok(PlatformAdmin.schema.indexes().some(([fields, options]) => fields.userId === 1 && options.unique));
    assert.equal(PlatformAuditLog.schema.options.timestamps.updatedAt, false);
});

test("provider query validators reject unsafe pagination and filters", () => {
    assert.throws(() => platformService.validateInstitutionListQuery({ page: "0" }), /page must be/);
    assert.throws(() => platformService.validateInstitutionListQuery({ limit: "101" }), /limit must be/);
    assert.throws(() => platformService.validateInstitutionListQuery({ type: "college" }), /type must be/);
    assert.throws(() => platformService.validateInstitutionListQuery({ status: "suspended" }), /status must be/);
    assert.throws(() => platformService.validateInstitutionListQuery({ plan: "enterprise" }), /plan must be/);
    assert.throws(() => platformService.validateInstitutionListQuery({ sort: "passwordHash" }), /Unexpected query field/);
    assert.throws(() => platformService.validateWebhookQuery({ status: "processed" }), /Only failed/);
    assert.throws(() => platformService.validateWebhookQuery({ institutionId: "bad" }), /valid id/);
    assert.throws(() => platformService.validateAuditQuery({ result: "deleted" }), /result must be/);
    assert.doesNotThrow(() => platformService.validateWebhookQuery({ institutionId }, null));
    assert.throws(() => platformService.validateWebhookQuery({ institutionId }, institutionId), /Unexpected query field/);
});

test("service-level actor validation re-reads the exact active PlatformAdmin and derives permissions", async (t) => {
    let capturedFilter;
    t.mock.method(PlatformAdmin, "findOne", (filter) => {
        capturedFilter = filter;
        return query(activePlatformAdmin({ permissions: ["membership.manage", "platform.future.read"] }));
    });
    const actor = await platformService.resolveAndAssertPlatformActor(
        platformContext({ permissions: ["membership.manage"] }),
        "platform.institutions.read"
    );
    assert.deepEqual(capturedFilter, { _id: adminId, userId, status: "active" });
    assert.deepEqual(actor.permissions, PLATFORM_PERMISSIONS);
    assert.equal(actor.permissions.includes("membership.manage"), false);
});

test("service-level actor validation fails closed for malformed, missing, stale, mismatched, and unknown actors", async (t) => {
    await t.test("malformed PlatformAdmin id", async () => {
        await assert.rejects(
            () => platformService.resolveAndAssertPlatformActor(platformContext({ platformAdminId: "bad" }), "platform.institutions.read"),
            (error) => error.statusCode === 400
        );
    });
    await t.test("malformed actor User id", async () => {
        await assert.rejects(
            () => platformService.resolveAndAssertPlatformActor(platformContext({ actorUserId: "bad" }), "platform.institutions.read"),
            (error) => error.statusCode === 400
        );
    });
    for (const [name, record] of [
        ["missing", null],
        ["suspended", activePlatformAdmin({ status: "suspended" })],
        ["user mismatch", activePlatformAdmin({ userId: otherInstitutionId })],
    ]) {
        await t.test(name, async (t) => {
            t.mock.method(PlatformAdmin, "findOne", () => query(record));
            await assert.rejects(
                () => platformService.resolveAndAssertPlatformActor(platformContext(), "platform.institutions.read"),
                (error) => error.statusCode === 403
            );
        });
    }
    await t.test("unknown role", async (t) => {
        t.mock.method(PlatformAdmin, "findOne", () => query(activePlatformAdmin({ role: "future_role" })));
        await assert.rejects(
            () => platformService.resolveAndAssertPlatformActor(platformContext(), "platform.institutions.read"),
            (error) => error.statusCode === 403
        );
    });
});

test("caller, stored, and tenant permissions cannot authorize a platform service operation", async (t) => {
    t.mock.method(PlatformAdmin, "findOne", () => query(activePlatformAdmin({ permissions: ["platform.institutions.read"] })));
    t.mock.method(platformPermissionsModule, "getPlatformRolePermissions", () => ["platform.audit.read"]);
    for (const supplied of [
        ["platform.institutions.read"],
        ["membership.manage"],
        ["platform.institutions.read", "membership.manage"],
    ]) {
        await assert.rejects(
            () => platformService.resolveAndAssertPlatformActor(platformContext({ permissions: supplied }), "platform.institutions.read"),
            (error) => error.statusCode === 403
        );
    }
});

function installOperationalMocks(t, { institutions = [], total = institutions.length, profiles = [], counts = [], webhooks = [], actorPermissions = PLATFORM_PERMISSIONS } = {}) {
    const calls = { institutionFind: 0, billingFind: 0, membershipAggregate: 0, webhookAggregate: 0, auditCreate: 0 };
    mockServiceActor(t);
    t.mock.method(platformPermissionsModule, "getPlatformRolePermissions", (role) => role === "platform_owner" ? [...actorPermissions] : null);
    t.mock.method(Institution, "find", () => { calls.institutionFind += 1; return query(institutions); });
    t.mock.method(Institution, "countDocuments", async () => total);
    t.mock.method(InstitutionBillingProfile, "find", () => { calls.billingFind += 1; return query(profiles); });
    t.mock.method(Membership, "aggregate", async (pipeline) => {
        calls.membershipAggregate += 1;
        assert.ok(pipeline[0].$match.institutionId.$in);
        assert.equal(pipeline[2].$project.userIds, undefined);
        assert.deepEqual(pipeline[2].$project.totalUsers, { $size: "$userIds" });
        return counts;
    });
    t.mock.method(StripeWebhookEvent, "aggregate", async () => { calls.webhookAggregate += 1; return webhooks; });
    t.mock.method(PlatformAuditLog, "create", async (payload) => { calls.auditCreate += 1; return payload; });
    return calls;
}

function installDetailMocks(t, actorPermissions, { profile = null, countRows = [], webhookRows = [] } = {}) {
    mockServiceActor(t);
    t.mock.method(platformPermissionsModule, "getPlatformRolePermissions", () => [...actorPermissions]);
    t.mock.method(Institution, "findOne", () => query({ _id: institutionId, name: "School", type: "school", status: "active", createdAt: new Date(), updatedAt: new Date() }));
    t.mock.method(InstitutionBillingProfile, "find", () => query(profile ? [profile] : []));
    t.mock.method(Membership, "aggregate", async () => countRows);
    t.mock.method(StripeWebhookEvent, "aggregate", async () => webhookRows);
    t.mock.method(PlatformAuditLog, "create", async (payload) => payload);
}

test("institution list batch-loads safe operational summaries without N+1 or cross-tenant counts", async (t) => {
    process.env.STRIPE_PRICE_PLUS_6_MONTH = "price_plus_test";
    process.env.STRIPE_PRICE_PRO_6_MONTH = "price_pro_test";
    const institution = { _id: institutionId, name: "Demo University", type: "university", status: "active", createdAt: new Date(), updatedAt: new Date(), passwordHash: "never" };
    const profile = { institutionId, plan: "plus", billingInterval: "six_month", status: "active", stripeCustomerId: "cus_safe", stripeSubscriptionId: "sub_safe", stripePriceId: "price_plus_test", currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };
    const calls = installOperationalMocks(t, {
        institutions: [institution], profiles: [profile],
        counts: [{ _id: institutionId, totalUsers: 4, totalMemberships: 5, activeMemberships: 4, suspendedMemberships: 1, activeStudents: 3, activeAdmins: 1, activeInstructors: 0 }],
        webhooks: [{ _id: institutionId, lastWebhookAt: new Date(), lastSuccessfulWebhookAt: new Date(), failedWebhookCount: 0, latestFailureAt: null }],
    });
    const result = await platformService.listInstitutions({ context: platformContext(), query: { page: "1", limit: "25" } });
    assert.equal(result.items.length, 1);
    assert.deepEqual(result.items[0].seatUsage, { activeStudents: 3, maxActiveStudents: 300, activeStaff: 1, maxActiveStaff: 30 });
    assert.equal(result.items[0].billingSync.state, "synced");
    assert.equal(result.items[0].billing.stripeCustomerId, undefined);
    assert.equal(JSON.stringify(result).includes("passwordHash"), false);
    assert.deepEqual(calls, { institutionFind: 1, billingFind: 1, membershipAggregate: 1, webhookAggregate: 1, auditCreate: 1 });
});

test("institution list conditionally exposes billing and webhook sections from role-derived permissions", async (t) => {
    const institution = { _id: institutionId, name: "Demo University", type: "university", status: "active", createdAt: new Date(), updatedAt: new Date() };
    const profile = { institutionId, plan: "plus", status: "active", stripeCustomerId: "cus_safe", stripeSubscriptionId: "sub_safe", stripePriceId: "price_plus_test" };
    const countRows = [{ _id: institutionId, totalUsers: 4, totalMemberships: 5, activeMemberships: 4, suspendedMemberships: 1, activeStudents: 3, activeAdmins: 1, activeInstructors: 0 }];
    const webhookRows = [{ _id: institutionId, lastWebhookAt: new Date(), lastSuccessfulWebhookAt: new Date(), failedWebhookCount: 0 }];

    await t.test("institution-only", async (t) => {
        const calls = installOperationalMocks(t, { institutions: [institution], profiles: [profile], counts: countRows, webhooks: webhookRows, actorPermissions: ["platform.institutions.read"] });
        const result = await platformService.listInstitutions({ context: platformContext({ permissions: PLATFORM_PERMISSIONS }), query: {} });
        assert.ok(result.items[0].counts);
        assert.equal(result.items[0].billing, undefined);
        assert.equal(result.items[0].seatUsage, undefined);
        assert.equal(result.items[0].billingSync, undefined);
        assert.equal(calls.billingFind, 0);
        assert.equal(calls.webhookAggregate, 0);
    });

    await t.test("billing visibility", async (t) => {
        const calls = installOperationalMocks(t, { institutions: [institution], profiles: [profile], counts: countRows, webhooks: webhookRows, actorPermissions: ["platform.institutions.read", "platform.billing.read"] });
        const result = await platformService.listInstitutions({ context: platformContext({ permissions: [] }), query: {} });
        assert.ok(result.items[0].billing);
        assert.ok(result.items[0].seatUsage);
        assert.equal(result.items[0].billing.stripeCustomerId, undefined);
        assert.equal(result.items[0].billingSync, undefined);
        assert.equal(calls.webhookAggregate, 0);
    });

    await t.test("webhook visibility", async (t) => {
        installOperationalMocks(t, { institutions: [institution], profiles: [profile], counts: countRows, webhooks: webhookRows, actorPermissions: ["platform.institutions.read", "platform.webhooks.read"] });
        const result = await platformService.listInstitutions({ context: platformContext({ permissions: [] }), query: {} });
        assert.ok(result.items[0].billingSync);
        assert.equal(result.items[0].billing, undefined);
        assert.equal(result.items[0].seatUsage, undefined);
    });
});

test("empty institution list is safe and avoids aggregate work", async (t) => {
    const calls = installOperationalMocks(t, { institutions: [], total: 0 });
    const result = await platformService.listInstitutions({ context: platformContext(), query: {} });
    assert.deepEqual(result.items, []);
    assert.equal(result.pagination.totalPages, 0);
    assert.equal(calls.membershipAggregate, 0);
});

test("billing sync state fails closed for missing, unknown, failed, and stale state", () => {
    assert.equal(platformService.deriveBillingSync(null).state, "missing_profile");
    assert.equal(platformService.deriveBillingSync({ plan: null }).state, "unknown_plan");
    assert.equal(platformService.deriveBillingSync({ plan: "plus" }, { failedWebhookCount: 1 }).state, "webhook_failed");
    assert.equal(platformService.deriveBillingSync({ plan: "plus", stripeCustomerId: "cus" }).state, "missing_subscription_mapping");
    assert.equal(platformService.deriveBillingSync({ plan: "plus", stripeCustomerId: "cus", stripeSubscriptionId: "sub", stripePriceId: "price_unknown" }).state, "unknown_price");
});

test("institution detail returns 404 and includes Stripe ids only with billing-read permission", async (t) => {
    const profile = { institutionId, plan: null, status: null, stripeCustomerId: "cus_safe", stripeSubscriptionId: "sub_safe", stripePriceId: "price_safe" };

    await t.test("unknown institution", async (t) => {
        mockServiceActor(t);
        t.mock.method(Institution, "findOne", () => query(null));
        t.mock.method(PlatformAuditLog, "create", async (payload) => payload);
        await assert.rejects(() => platformService.getInstitutionSummary({ context: platformContext(), institutionId }), (error) => error.statusCode === 404);
    });

    await t.test("institution-only", async (t) => {
        installDetailMocks(t, ["platform.institutions.read"], { profile });
        const result = await platformService.getInstitutionSummary({ context: platformContext({ permissions: PLATFORM_PERMISSIONS }), institutionId });
        assert.ok(result.institution);
        assert.ok(result.counts);
        assert.equal(result.billing, undefined);
        assert.equal(result.seatUsage, undefined);
        assert.equal(result.billingSync, undefined);
    });

    await t.test("billing permission", async (t) => {
        installDetailMocks(t, ["platform.institutions.read", "platform.billing.read"], { profile });
        const result = await platformService.getInstitutionSummary({ context: platformContext({ permissions: [] }), institutionId });
        assert.equal(result.billing.stripeCustomerId, "cus_safe");
        assert.ok(result.seatUsage);
        assert.equal(result.billingSync, undefined);
    });

    await t.test("webhook permission", async (t) => {
        installDetailMocks(t, ["platform.institutions.read", "platform.webhooks.read"], { profile, webhookRows: [{ _id: institutionId, failedWebhookCount: 1, latestFailureAt: new Date() }] });
        const result = await platformService.getInstitutionSummary({ context: platformContext({ permissions: [] }), institutionId });
        assert.ok(result.billingSync);
        assert.equal(result.billing, undefined);
        assert.equal(result.seatUsage, undefined);
    });
});

test("institution billing hides webhook diagnostics unless the role also grants webhook read", async (t) => {
    const profile = { institutionId, plan: "plus", status: "active", stripeCustomerId: "cus_safe", stripeSubscriptionId: "sub_safe", stripePriceId: "price_plus_test" };

    await t.test("billing-only", async (t) => {
        installDetailMocks(t, ["platform.billing.read"], { profile });
        t.mock.method(StripeWebhookEvent, "find", () => { throw new Error("billing-only must not query failed webhook rows"); });
        const result = await platformService.getInstitutionBilling({ context: platformContext({ permissions: PLATFORM_PERMISSIONS }), institutionId, query: {} });
        assert.ok(result.billing);
        assert.ok(result.seatUsage);
        assert.equal(result.billingSync, undefined);
        assert.equal(result.failedWebhooks, undefined);
    });

    await t.test("billing plus webhooks", async (t) => {
        installDetailMocks(t, ["platform.billing.read", "platform.webhooks.read"], {
            profile,
            webhookRows: [{ _id: institutionId, failedWebhookCount: 1, latestFailureAt: new Date() }],
        });
        t.mock.method(StripeWebhookEvent, "find", () => query([{ _id: adminId, stripeEventId: "evt_safe", type: "invoice.payment_failed", status: "failed", institutionId, errorMessage: "secret whsec_ABC123ABC123ABC123", attemptCount: 2 }]));
        t.mock.method(StripeWebhookEvent, "countDocuments", async () => 1);
        const result = await platformService.getInstitutionBilling({ context: platformContext({ permissions: [] }), institutionId, query: {} });
        assert.ok(result.billingSync);
        assert.equal(result.failedWebhooks.items.length, 1);
        assert.equal(result.failedWebhooks.items[0].errorMessage.includes("whsec_"), false);
        assert.equal(result.failedWebhooks.items[0].rawPayload, undefined);
    });
});

test("institution-fixed billing query rejects institutionId and uses only the route institution", async (t) => {
    mockServiceActor(t);
    let institutionFilter;
    t.mock.method(Institution, "findOne", (filter) => { institutionFilter = filter; return query({ _id: institutionId, name: "Demo", type: "university", status: "active" }); });
    t.mock.method(PlatformAuditLog, "create", async (payload) => payload);
    await assert.rejects(
        () => platformService.getInstitutionBilling({ context: platformContext(), institutionId, query: { institutionId: otherInstitutionId } }),
        /Unexpected query field: institutionId/
    );
    assert.equal(institutionFilter, undefined);

    t.mock.restoreAll();
    let capturedFixedFilter;
    mockServiceActor(t);
    t.mock.method(platformPermissionsModule, "getPlatformRolePermissions", () => ["platform.billing.read"]);
    t.mock.method(Institution, "findOne", (filter) => { capturedFixedFilter = filter; return query({ _id: institutionId, name: "Demo", type: "university", status: "active" }); });
    t.mock.method(InstitutionBillingProfile, "find", () => query([]));
    t.mock.method(Membership, "aggregate", async () => []);
    t.mock.method(PlatformAuditLog, "create", async (payload) => payload);
    await platformService.getInstitutionBilling({ context: platformContext(), institutionId, query: {} });
    assert.deepEqual(capturedFixedFilter, { _id: institutionId });
});

test("failed webhook listing is read-only, scoped, paginated, and redacts secrets", async (t) => {
    mockServiceActor(t);
    let capturedFilter;
    t.mock.method(StripeWebhookEvent, "find", (filter) => {
        capturedFilter = filter;
        return query([{ _id: adminId, stripeEventId: "evt_1", type: "invoice.payment_failed", status: "failed", institutionId, errorMessage: "bad sk_live_ABC123ABC123ABC123 and whsec_ABC123ABC123ABC123", attemptCount: 2, createdAt: new Date(), updatedAt: new Date(), processedAt: null, rawPayload: { card: "secret" } }]);
    });
    t.mock.method(StripeWebhookEvent, "countDocuments", async () => 1);
    t.mock.method(PlatformAuditLog, "create", async (payload) => payload);
    const result = await platformService.listFailedWebhookEvents({ context: platformContext(), query: { institutionId, page: "1", limit: "10" } });
    assert.deepEqual(capturedFilter.status, "failed");
    assert.equal(capturedFilter.institutionId, institutionId);
    assert.equal(result.items[0].attemptCount, 2);
    assert.equal(result.items[0].errorMessage.includes("sk_live"), false);
    assert.equal(result.items[0].errorMessage.includes("whsec_"), false);
    assert.equal(result.items[0].rawPayload, undefined);
});

test("platform audit list maps allowlisted metadata and creates a global audit read entry", async (t) => {
    mockServiceActor(t);
    const created = [];
    t.mock.method(PlatformAuditLog, "find", () => query([{ _id: institutionId, actorPlatformAdminId: adminId, actorUserId: userId, action: "platform.institutions.list", targetType: "institution_collection", targetId: null, institutionId: null, reason: null, metadata: { page: 1, secret: "no" }, ipAddress: "127.0.0.1", userAgent: "test", result: "success", createdAt: new Date() }]));
    t.mock.method(PlatformAuditLog, "countDocuments", async () => 1);
    t.mock.method(PlatformAuditLog, "create", async (payload) => { created.push(payload); return payload; });
    const result = await platformService.listPlatformAuditLogs({ context: platformContext(), query: {} });
    assert.deepEqual(result.items[0].metadata, { page: 1 });
    assert.equal(created[0].institutionId, null);
    assert.equal(created[0].action, "platform.audit.list");
});

test("each authorized platform operation writes one sanitized failed audit and preserves its error", async (t) => {
    const cases = [
        {
            name: "institution list",
            action: "platform.institutions.list",
            invoke: () => platformService.listInstitutions({ context: platformContext(), query: {} }),
            fail(t, error) { t.mock.method(Institution, "find", () => { throw error; }); t.mock.method(Institution, "countDocuments", async () => 0); },
        },
        {
            name: "institution summary",
            action: "platform.institutions.view",
            invoke: () => platformService.getInstitutionSummary({ context: platformContext(), institutionId }),
            fail(t, error) { t.mock.method(Institution, "findOne", () => { throw error; }); },
        },
        {
            name: "billing view",
            action: "platform.institutions.billing.view",
            invoke: () => platformService.getInstitutionBilling({ context: platformContext(), institutionId, query: {} }),
            fail(t, error) { t.mock.method(Institution, "findOne", () => { throw error; }); },
        },
        {
            name: "webhook list",
            action: "platform.webhooks.failures.list",
            invoke: () => platformService.listFailedWebhookEvents({ context: platformContext(), query: {} }),
            fail(t, error) { t.mock.method(StripeWebhookEvent, "find", () => { throw error; }); t.mock.method(StripeWebhookEvent, "countDocuments", async () => 0); },
        },
        {
            name: "audit list",
            action: "platform.audit.list",
            invoke: () => platformService.listPlatformAuditLogs({ context: platformContext(), query: {} }),
            fail(t, error) { t.mock.method(PlatformAuditLog, "find", () => { throw error; }); t.mock.method(PlatformAuditLog, "countDocuments", async () => 0); },
        },
    ];

    for (const scenario of cases) {
        await t.test(scenario.name, async (t) => {
            mockServiceActor(t);
            const originalError = Object.assign(new Error("sk_live_secret password=bad"), { stack: "SENSITIVE STACK" });
            scenario.fail(t, originalError);
            const audits = [];
            t.mock.method(PlatformAuditLog, "create", async (payload) => { audits.push(payload); return payload; });
            await assert.rejects(scenario.invoke, (error) => error === originalError);
            assert.equal(audits.length, 1);
            assert.equal(audits[0].action, scenario.action);
            assert.equal(audits[0].result, "failed");
            assert.deepEqual(audits[0].metadata, { errorCode: "PLATFORM_OPERATION_FAILED" });
            assert.equal(JSON.stringify(audits[0]).includes("sk_live_secret"), false);
            assert.equal(JSON.stringify(audits[0]).includes("SENSITIVE STACK"), false);
            assert.equal(JSON.stringify(audits[0]).includes("password=bad"), false);
        });
    }
});

test("failed-audit write failure does not replace the original operation error", async (t) => {
    mockServiceActor(t);
    const originalError = new Error("original operation failure");
    t.mock.method(Institution, "find", () => { throw originalError; });
    t.mock.method(Institution, "countDocuments", async () => 0);
    t.mock.method(PlatformAuditLog, "create", async () => { throw new Error("audit storage unavailable"); });
    await assert.rejects(
        () => platformService.listInstitutions({ context: platformContext(), query: {} }),
        (error) => error === originalError
    );
});

test("service authorization denial is not double-audited as an operation failure", async (t) => {
    t.mock.method(PlatformAdmin, "findOne", () => query(activePlatformAdmin()));
    t.mock.method(platformPermissionsModule, "getPlatformRolePermissions", () => ["platform.audit.read"]);
    let auditCount = 0;
    t.mock.method(PlatformAuditLog, "create", async () => { auditCount += 1; });
    await assert.rejects(
        () => platformService.listInstitutions({ context: platformContext({ permissions: ["platform.institutions.read"] }), query: {} }),
        (error) => error.statusCode === 403
    );
    assert.equal(auditCount, 0);
});

test("platform controllers pass only plain trusted middleware context and route values", async (t) => {
    const cases = [
        { name: "listInstitutions", controller: platformController.listInstitutions, service: "listInstitutions", expected: { query: { page: "2", platformAdminId: "forged" } } },
        { name: "getInstitutionSummary", controller: platformController.getInstitutionSummary, service: "getInstitutionSummary", expected: { institutionId } },
        { name: "getInstitutionBilling", controller: platformController.getInstitutionBilling, service: "getInstitutionBilling", expected: { institutionId, query: { institutionId: otherInstitutionId, platformAdminId: "forged" } } },
        { name: "listFailedWebhookEvents", controller: platformController.listFailedWebhookEvents, service: "listFailedWebhookEvents", expected: { query: { institutionId, platformAdminId: "forged" } } },
        { name: "listPlatformAuditLogs", controller: platformController.listPlatformAuditLogs, service: "listPlatformAuditLogs", expected: { query: { result: "success", platformAdminId: "forged" } } },
    ];

    for (const scenario of cases) {
        await t.test(scenario.name, async (t) => {
            let received;
            t.mock.method(Institution, "find", () => { throw new Error("controller must not query Institution"); });
            t.mock.method(PlatformAdmin, "findOne", () => { throw new Error("controller must not query PlatformAdmin"); });
            t.mock.method(PlatformAuditLog, "create", () => { throw new Error("controller must not write audit directly"); });
            t.mock.method(platformService, scenario.service, async (args) => {
                received = args;
                return { operation: scenario.name };
            });
            const req = {
                params: { institutionId },
                query: scenario.expected.query || { platformAdminId: "forged", institutionId: otherInstitutionId },
                body: { platformAdminId: "forged-body", actorUserId: otherInstitutionId },
                headers: { "x-platform-admin-id": otherInstitutionId, "user-agent": "controller-test-agent" },
                membership: { role: "admin", userId: otherInstitutionId },
                platformAdmin: { id: adminId, userId, role: "platform_owner", status: "active" },
                platformPermissions: [...PLATFORM_PERMISSIONS],
                user: { id: userId },
                ip: "127.0.0.8",
                get(name) { return name === "user-agent" ? "controller-test-agent" : undefined; },
            };
            const res = response();
            await scenario.controller(req, res);

            assert.equal(res.statusCode, 200);
            assert.deepEqual(res.body, { operation: scenario.name });
            assert.deepEqual(received.context, {
                platformAdminId: adminId,
                actorUserId: userId,
                permissions: PLATFORM_PERMISSIONS,
                ipAddress: "127.0.0.8",
                userAgent: "controller-test-agent",
            });
            for (const [key, value] of Object.entries(scenario.expected)) assert.deepEqual(received[key], value);
            assert.equal(received.req, undefined);
            assert.equal(received.membership, undefined);
            assert.equal(received.body, undefined);
            assert.notEqual(received.context.platformAdminId, req.body.platformAdminId);
            assert.notEqual(received.context.platformAdminId, req.headers["x-platform-admin-id"]);
            if (scenario.expected.institutionId) assert.equal(received.institutionId, req.params.institutionId);
        });
    }
});

test("every platform controller preserves the existing service error response boundary", async (t) => {
    const cases = [
        [platformController.listInstitutions, "listInstitutions"],
        [platformController.getInstitutionSummary, "getInstitutionSummary"],
        [platformController.getInstitutionBilling, "getInstitutionBilling"],
        [platformController.listFailedWebhookEvents, "listFailedWebhookEvents"],
        [platformController.listPlatformAuditLogs, "listPlatformAuditLogs"],
    ];
    for (const [controller, serviceName] of cases) {
        await t.test(serviceName, async (t) => {
            t.mock.method(platformService, serviceName, async () => { throw Object.assign(new Error("safe validation failure"), { statusCode: 400 }); });
            const req = {
                params: { institutionId }, query: {}, headers: {},
                platformAdmin: { id: adminId }, platformPermissions: PLATFORM_PERMISSIONS,
                user: { id: userId }, ip: "127.0.0.1",
            };
            const res = response();
            await controller(req, res);
            assert.equal(res.statusCode, 400);
            assert.deepEqual(res.body, { message: "safe validation failure" });
        });
    }
});

test("platform routes have explicit protected GET-only middleware and no tenant access middleware", () => {
    const routeLayers = platformRoutes.stack.filter((layer) => layer.route);
    assert.equal(routeLayers.length, 5);
    const expectedPermissions = {
        "/institutions": "platform.institutions.read",
        "/institutions/:institutionId": "platform.institutions.read",
        "/institutions/:institutionId/billing": "platform.billing.read",
        "/webhook-events": "platform.webhooks.read",
        "/audit": "platform.audit.read",
    };
    for (const layer of routeLayers) {
        assert.equal(layer.route.methods.get, true);
        assert.equal(Boolean(layer.route.methods.post || layer.route.methods.patch || layer.route.methods.put || layer.route.methods.delete), false);
        const permissionLayers = layer.route.stack.filter((entry) => entry.handle.requiredPlatformPermission);
        assert.equal(permissionLayers.length, 1);
        assert.equal(permissionLayers[0].handle.requiredPlatformPermission, expectedPermissions[layer.route.path]);
        assert.equal(layer.route.stack.some((entry) => entry.handle.name === "institutionAccess"), false);
    }
    const routerMiddlewareSource = platformRoutes.stack.filter((layer) => !layer.route).map((layer) => layer.handle.name).join(" ");
    assert.match(routerMiddlewareSource, /authJwt/);
    assert.match(routerMiddlewareSource, /requireEmailVerified/);
    assert.match(routerMiddlewareSource, /resolvePlatformAdmin/);

    const platformMount = app.router.stack.find((layer) => layer.handle === platformRoutes);
    assert.ok(platformMount);
    assert.ok(platformMount.matchers[0]("/platform/institutions"));
    assert.equal(platformMount.matchers[0]("/institutions"), false);
});

test("trusted owner script normalizes input, requires verified user, and refuses duplicates", async (t) => {
    assert.equal(normalizeEmail(" OWNER@Example.Test "), "owner@example.test");
    assert.equal(parseEmailArg(["--email", "OWNER@Example.Test"]), "owner@example.test");
    t.mock.method(User, "findOne", () => query({ _id: userId, email: "owner@example.test", status: "active", isEmailVerified: true }));
    t.mock.method(PlatformAdmin, "exists", async () => null);
    let payload;
    t.mock.method(PlatformAdmin, "create", async (value) => { payload = value; return value; });
    assert.equal(await createPlatformOwner("owner@example.test"), "owner@example.test");
    assert.deepEqual(payload, { userId, role: "platform_owner", status: "active", createdByUserId: userId });
});

test("trusted owner script rejects unverified and duplicate platform users", async (t) => {
    t.mock.method(User, "findOne", () => query({ _id: userId, email: "owner@example.test", status: "active", isEmailVerified: false }));
    await assert.rejects(() => createPlatformOwner("owner@example.test"), /active and email-verified/);
    t.mock.restoreAll();
    t.mock.method(User, "findOne", () => query({ _id: userId, email: "owner@example.test", status: "active", isEmailVerified: true }));
    t.mock.method(PlatformAdmin, "exists", async () => ({ _id: adminId }));
    await assert.rejects(() => createPlatformOwner("owner@example.test"), /already exists/);
});
