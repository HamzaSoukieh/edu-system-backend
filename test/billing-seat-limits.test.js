const test = require("node:test");
const assert = require("node:assert/strict");

const InstitutionBillingProfile = require("../src/models/InstitutionBillingProfile");
const Membership = require("../src/models/Membership");
const ResponsibilityAssignment = require("../src/models/ResponsibilityAssignment");
const MemberProfile = require("../src/models/MemberProfile");
const Enrollment = require("../src/models/Enrollment");
const institutionRoutes = require("../src/routes/institutionRoutes");
const {
    assertInstitutionWithinLimit,
    assertMembershipSeatTransitionAllowed,
    countInstitutionActiveSeats,
    getInstitutionBillingEntitlements,
} = require("../src/services/billingEntitlementService");
const { BILLING_PLAN_CONFIG } = require("../src/services/billingPlanConfig");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439012";

function createQuery(result) {
    return {
        lean: async () => result,
        then(resolve, reject) {
            return Promise.resolve(result).then(resolve, reject);
        },
    };
}

function normalizeId(value) {
    return value === undefined || value === null ? null : value.toString();
}

function mockSeatDependencies(t, { profile, studentCount = 0, staffCount = 0 } = {}) {
    const data = {
        queryLog: [],
    };

    t.mock.method(InstitutionBillingProfile, "findOne", (query) => {
        data.queryLog.push({ model: "InstitutionBillingProfile", method: "findOne", query });
        return createQuery(normalizeId(query.institutionId) === institutionId ? profile : null);
    });

    t.mock.method(Membership, "countDocuments", async (query) => {
        data.queryLog.push({ model: "Membership", method: "countDocuments", query });
        if (normalizeId(query.institutionId) !== institutionId) {
            return 0;
        }
        if (query.role === "student") {
            return studentCount;
        }
        if (query.role?.$in?.includes("admin") && query.role?.$in?.includes("instructor")) {
            return staffCount;
        }
        return 0;
    });

    return data;
}

function profile(overrides = {}) {
    return {
        institutionId,
        status: "active",
        plan: "plus",
        billingInterval: "six_month",
        cancelAtPeriodEnd: false,
        trialEnd: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        ...overrides,
    };
}

async function assertLimitReached(promise, expected) {
    await assert.rejects(
        promise,
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.code, "BILLING_LIMIT_REACHED");
            assert.equal(error.message, `Active ${expected.category} membership limit reached`);
            assert.deepEqual(error.details, expected);
            return true;
        }
    );
}

test("Plus and Pro expose identical feature catalog shape and only differ by plan limits", () => {
    assert.deepEqual(Object.keys(BILLING_PLAN_CONFIG), ["plus", "pro"]);
    assert.deepEqual(Object.keys(BILLING_PLAN_CONFIG.plus), [
        "plan",
        "billingInterval",
        "priceEnv",
        "maxActiveStudents",
        "maxActiveStaff",
    ]);
    assert.deepEqual(Object.keys(BILLING_PLAN_CONFIG.pro), [
        "plan",
        "billingInterval",
        "priceEnv",
        "maxActiveStudents",
        "maxActiveStaff",
    ]);
    assert.equal(BILLING_PLAN_CONFIG.plus.maxActiveStudents, 300);
    assert.equal(BILLING_PLAN_CONFIG.plus.maxActiveStaff, 30);
    assert.equal(BILLING_PLAN_CONFIG.pro.maxActiveStudents, 1000);
    assert.equal(BILLING_PLAN_CONFIG.pro.maxActiveStaff, 100);
});

test("active student seats count only active student Membership records", async (t) => {
    const data = mockSeatDependencies(t, {
        profile: profile({ plan: "plus" }),
        studentCount: 299,
        staffCount: 12,
    });

    const counts = await countInstitutionActiveSeats({ institutionId });
    assert.deepEqual(counts, { activeStudents: 299, activeStaff: 12 });

    const studentQuery = data.queryLog.find(
        (entry) => entry.model === "Membership" && entry.query.role === "student"
    ).query;
    assert.deepEqual(studentQuery, {
        institutionId,
        role: "student",
        status: "active",
    });
});

test("active staff seats count active admin and instructor Membership records only", async (t) => {
    const data = mockSeatDependencies(t, {
        profile: profile({ plan: "plus" }),
        studentCount: 10,
        staffCount: 29,
    });

    const counts = await countInstitutionActiveSeats({ institutionId });
    assert.deepEqual(counts, { activeStudents: 10, activeStaff: 29 });

    const staffQuery = data.queryLog.find(
        (entry) => entry.model === "Membership" && entry.query.role?.$in
    ).query;
    assert.deepEqual(staffQuery, {
        institutionId,
        role: { $in: ["admin", "instructor"] },
        status: "active",
    });
});

test("Plus allows the 300th active student and blocks the 301st", async (t) => {
    mockSeatDependencies(t, {
        profile: profile({ plan: "plus" }),
        studentCount: 299,
    });

    await assert.doesNotReject(() =>
        assertMembershipSeatTransitionAllowed({
            institutionId,
            sourceMembership: null,
            destinationMembership: { role: "student", status: "active" },
        })
    );

    t.mock.reset();
    mockSeatDependencies(t, {
        profile: profile({ plan: "plus" }),
        studentCount: 300,
    });

    await assertLimitReached(
        assertMembershipSeatTransitionAllowed({
            institutionId,
            sourceMembership: null,
            destinationMembership: { role: "student", status: "active" },
        }),
        { plan: "plus", category: "student", limit: 300, currentCount: 300 }
    );
});

test("Pro allows the 1000th active student and blocks the 1001st", async (t) => {
    mockSeatDependencies(t, {
        profile: profile({ plan: "pro" }),
        studentCount: 999,
    });

    await assert.doesNotReject(() =>
        assertMembershipSeatTransitionAllowed({
            institutionId,
            sourceMembership: null,
            destinationMembership: { role: "student", status: "active" },
        })
    );

    t.mock.reset();
    mockSeatDependencies(t, {
        profile: profile({ plan: "pro" }),
        studentCount: 1000,
    });

    await assertLimitReached(
        assertMembershipSeatTransitionAllowed({
            institutionId,
            sourceMembership: null,
            destinationMembership: { role: "student", status: "active" },
        }),
        { plan: "pro", category: "student", limit: 1000, currentCount: 1000 }
    );
});

test("Plus and Pro enforce active staff limits", async (t) => {
    mockSeatDependencies(t, {
        profile: profile({ plan: "plus" }),
        staffCount: 29,
    });

    await assert.doesNotReject(() =>
        assertMembershipSeatTransitionAllowed({
            institutionId,
            sourceMembership: null,
            destinationMembership: { role: "admin", status: "active" },
        })
    );

    t.mock.reset();
    mockSeatDependencies(t, {
        profile: profile({ plan: "plus" }),
        staffCount: 30,
    });
    await assertLimitReached(
        assertMembershipSeatTransitionAllowed({
            institutionId,
            sourceMembership: null,
            destinationMembership: { role: "instructor", status: "active" },
        }),
        { plan: "plus", category: "staff", limit: 30, currentCount: 30 }
    );

    t.mock.reset();
    mockSeatDependencies(t, {
        profile: profile({ plan: "pro" }),
        staffCount: 99,
    });
    await assert.doesNotReject(() =>
        assertMembershipSeatTransitionAllowed({
            institutionId,
            sourceMembership: null,
            destinationMembership: { role: "instructor", status: "active" },
        })
    );

    t.mock.reset();
    mockSeatDependencies(t, {
        profile: profile({ plan: "pro" }),
        staffCount: 100,
    });
    await assertLimitReached(
        assertMembershipSeatTransitionAllowed({
            institutionId,
            sourceMembership: null,
            destinationMembership: { role: "admin", status: "active" },
        }),
        { plan: "pro", category: "staff", limit: 100, currentCount: 100 }
    );
});

test("seat category validation accepts student and staff and rejects invalid categories", async (t) => {
    mockSeatDependencies(t, {
        profile: profile({ plan: "plus" }),
        studentCount: 1,
        staffCount: 1,
    });

    await assert.doesNotReject(() => assertInstitutionWithinLimit({ institutionId, category: "student" }));
    await assert.doesNotReject(() => assertInstitutionWithinLimit({ institutionId, category: "staff" }));

    for (const category of ["students", "teacher", "member", "admin", "", undefined]) {
        await assert.rejects(
            () => assertInstitutionWithinLimit({ institutionId, category }),
            { statusCode: 500, message: "Invalid billing seat category" }
        );
    }
});

test("no valid paid access blocks additional active student and staff seats", async (t) => {
    mockSeatDependencies(t, {
        profile: profile({ plan: null, status: "active" }),
        studentCount: 0,
        staffCount: 0,
    });

    await assertLimitReached(
        assertMembershipSeatTransitionAllowed({
            institutionId,
            sourceMembership: null,
            destinationMembership: { role: "student", status: "active" },
        }),
        { plan: null, category: "student", limit: 0, currentCount: 0 }
    );

    await assertLimitReached(
        assertMembershipSeatTransitionAllowed({
            institutionId,
            sourceMembership: null,
            destinationMembership: { role: "instructor", status: "active" },
        }),
        { plan: null, category: "staff", limit: 0, currentCount: 0 }
    );
});

test("role and status transitions check only destination category increases", async (t) => {
    mockSeatDependencies(t, {
        profile: profile({ plan: "plus" }),
        studentCount: 300,
        staffCount: 30,
    });

    await assert.doesNotReject(() =>
        assertMembershipSeatTransitionAllowed({
            institutionId,
            sourceMembership: { role: "admin", status: "active" },
            destinationMembership: { role: "instructor", status: "active" },
        })
    );
    await assert.doesNotReject(() =>
        assertMembershipSeatTransitionAllowed({
            institutionId,
            sourceMembership: { role: "instructor", status: "active" },
            destinationMembership: { role: "admin", status: "active" },
        })
    );
    await assert.doesNotReject(() =>
        assertMembershipSeatTransitionAllowed({
            institutionId,
            sourceMembership: { role: "student", status: "active" },
            destinationMembership: { role: "student", status: "suspended" },
        })
    );
    await assert.doesNotReject(() =>
        assertMembershipSeatTransitionAllowed({
            institutionId,
            sourceMembership: { role: "student", status: "suspended" },
            destinationMembership: { role: "admin", status: "suspended" },
        })
    );

    await assertLimitReached(
        assertMembershipSeatTransitionAllowed({
            institutionId,
            sourceMembership: { role: "student", status: "active" },
            destinationMembership: { role: "instructor", status: "active" },
        }),
        { plan: "plus", category: "staff", limit: 30, currentCount: 30 }
    );
    await assertLimitReached(
        assertMembershipSeatTransitionAllowed({
            institutionId,
            sourceMembership: { role: "instructor", status: "active" },
            destinationMembership: { role: "student", status: "active" },
        }),
        { plan: "plus", category: "student", limit: 300, currentCount: 300 }
    );
});

test("seat limit checks are tenant-scoped and do not count responsibilities, profiles, or enrollments", async (t) => {
    t.mock.method(ResponsibilityAssignment, "countDocuments", () => {
        throw new Error("responsibility assignments must not be counted as seats");
    });
    t.mock.method(MemberProfile, "countDocuments", () => {
        throw new Error("member profiles must not be counted as seats");
    });
    t.mock.method(Enrollment, "countDocuments", () => {
        throw new Error("enrollments must not be counted as seats");
    });

    const data = mockSeatDependencies(t, {
        profile: profile({ plan: "plus" }),
        studentCount: 1,
        staffCount: 1,
    });

    await countInstitutionActiveSeats({ institutionId });
    await countInstitutionActiveSeats({ institutionId: otherInstitutionId });

    const membershipCountQueries = data.queryLog.filter(
        (entry) => entry.model === "Membership" && entry.method === "countDocuments"
    );
    assert.equal(membershipCountQueries.length, 4);
    assert.ok(membershipCountQueries.every((entry) => entry.query.institutionId));
});

test("Plus and Pro do not add Pro-only middleware or route restrictions", () => {
    const routeNames = institutionRoutes.stack
        .filter((layer) => layer.route)
        .flatMap((layer) => layer.route.stack.map((item) => item.handle.name || ""))
        .join(" ");

    assert.equal(routeNames.includes("requireProPlan"), false);
    assert.equal(routeNames.includes("requirePlusPlan"), false);
    assert.equal(routeNames.includes("requirePaidInstitutionAccess"), false);
});

test("inactive/suspended memberships and unknown plans do not grant paid access", () => {
    assert.deepEqual(
        getInstitutionBillingEntitlements({ plan: "plus", status: "suspended" }),
        {
            plan: "plus",
            billingInterval: "six_month",
            subscriptionStatus: "suspended",
            hasPaidAccess: false,
            maxActiveStudents: 0,
            maxActiveStaff: 0,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            trialEnd: null,
        }
    );
});
