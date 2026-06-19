const test = require("node:test");
const assert = require("node:assert/strict");

const Membership = require("../src/models/Membership");
const MemberProfile = require("../src/models/MemberProfile");
const ResponsibilityAssignment = require("../src/models/ResponsibilityAssignment");
const memberController = require("../src/controllers/memberController");
const memberService = require("../src/services/memberService");
const institutionRoutes = require("../src/routes/institutionRoutes");

const userId = "507f1f77bcf86cd799439001";
const otherUserId = "507f1f77bcf86cd799439002";
const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439012";
const membershipId = "507f1f77bcf86cd799439021";
const otherMembershipId = "507f1f77bcf86cd799439022";

function normalizeId(value) {
    return value === undefined || value === null ? null : value.toString();
}

function createQuery(result, logEntry = null) {
    return {
        select(fields) {
            if (logEntry) {
                logEntry.select = fields;
            }
            return this;
        },
        populate(populate) {
            if (logEntry) {
                logEntry.populate = populate;
            }
            return this;
        },
        lean: async () => result,
        then(resolve, reject) {
            return Promise.resolve(result).then(resolve, reject);
        },
    };
}

function createResponse() {
    return {
        statusCode: null,
        body: null,
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

function buildMembership(overrides = {}) {
    return {
        _id: membershipId,
        userId: {
            _id: userId,
            email: "self@example.test",
            status: "active",
            isEmailVerified: true,
        },
        institutionId,
        role: "instructor",
        status: "active",
        joinedAt: new Date("2026-01-01T00:00:00.000Z"),
        ...overrides,
    };
}

function buildProfile(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439031",
        membershipId,
        userId,
        institutionId,
        firstName: "Self",
        lastName: "Instructor",
        fatherName: "Father",
        motherName: "Mother",
        birthPlace: "Damascus",
        birthDate: new Date("1990-05-20T00:00:00.000Z"),
        gender: "male",
        nationality: "Syrian",
        nationalNumber: "NAT-001",
        mobile: "+963900000001",
        profilePictureUrl: "/uploads/member-profiles/self.png",
        fullName: "Self Instructor",
        fullNameNormalized: "self instructor",
        privateFilePath: "C:\\private\\do-not-return.png",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        ...overrides,
    };
}

function actorUser(overrides = {}) {
    return {
        id: userId,
        email: "self@example.test",
        status: "active",
        isEmailVerified: true,
        ...overrides,
    };
}

function actorMembership(overrides = {}) {
    return {
        _id: membershipId,
        userId,
        institutionId,
        role: "instructor",
        status: "active",
        ...overrides,
    };
}

function mockSelfProfileDependencies(t, overrides = {}) {
    const data = {
        membership: buildMembership(overrides.membership || {}),
        profiles:
            overrides.profiles === undefined
                ? [
                      buildProfile(),
                      buildProfile({
                          _id: "507f1f77bcf86cd799439032",
                          institutionId: otherInstitutionId,
                          fullName: "Wrong Tenant",
                      }),
                      buildProfile({
                          _id: "507f1f77bcf86cd799439033",
                          membershipId: otherMembershipId,
                          fullName: "Wrong Membership",
                      }),
                  ]
                : overrides.profiles,
        queryLog: [],
    };

    t.mock.method(Membership, "findOne", (query) => {
        const entry = { model: "Membership", query };
        data.queryLog.push(entry);

        const membershipUserId =
            data.membership.userId && typeof data.membership.userId === "object"
                ? data.membership.userId._id
                : data.membership.userId;
        const matches =
            normalizeId(query._id) === normalizeId(data.membership._id) &&
            normalizeId(query.institutionId) === normalizeId(data.membership.institutionId) &&
            normalizeId(query.userId) === normalizeId(membershipUserId) &&
            query.status === data.membership.status;

        return createQuery(matches ? data.membership : null, entry);
    });

    t.mock.method(MemberProfile, "findOne", (query) => {
        const entry = { model: "MemberProfile", query };
        data.queryLog.push(entry);

        const profile = data.profiles.find(
            (item) =>
                normalizeId(item.institutionId) === normalizeId(query.institutionId) &&
                normalizeId(item.membershipId) === normalizeId(query.membershipId)
        );

        return createQuery(profile || null, entry);
    });

    return data;
}

async function getSelfProfileForRole(t, role) {
    mockSelfProfileDependencies(t, {
        membership: { role },
    });

    return memberService.getMyMemberProfile({
        institutionId,
        actorUser: actorUser(),
        actorMembership: actorMembership({ role }),
    });
}

test("GET /institutions/:institutionId/members/me returns authenticated admin, instructor, and student profiles", async (t) => {
    for (const role of ["admin", "instructor", "student"]) {
        await t.test(role, async (t) => {
            const result = await getSelfProfileForRole(t, role);

            assert.equal(result.member.id, membershipId);
            assert.equal(result.member.userId, userId);
            assert.equal(result.member.institutionId, institutionId);
            assert.equal(result.member.role, role);
            assert.equal(result.member.status, "active");
            assert.equal(result.member.email, "self@example.test");
            assert.ok(result.member.joinedAt);
            assert.deepEqual(Object.keys(result.member), [
                "id",
                "userId",
                "institutionId",
                "role",
                "status",
                "email",
                "joinedAt",
                "profile",
            ]);
        });
    }
});

test("GET /institutions/:institutionId/members/me returns full safe profile details only", async (t) => {
    mockSelfProfileDependencies(t);

    const result = await memberService.getMyMemberProfile({
        institutionId,
        actorUser: actorUser(),
        actorMembership: actorMembership(),
    });

    assert.deepEqual(result.member.profile, {
        firstName: "Self",
        lastName: "Instructor",
        fatherName: "Father",
        motherName: "Mother",
        birthPlace: "Damascus",
        birthDate: "1990-05-20",
        gender: "male",
        nationality: "Syrian",
        nationalNumber: "NAT-001",
        mobile: "+963900000001",
        profilePictureUrl: "/uploads/member-profiles/self.png",
        fullName: "Self Instructor",
    });
    assert.equal(result.member.profile.fullNameNormalized, undefined);
    assert.equal(result.member.profile.privateFilePath, undefined);
    assert.equal(result.member.profile.createdAt, undefined);
});

test("GET /institutions/:institutionId/members/me returns profile null when profile is missing", async (t) => {
    mockSelfProfileDependencies(t, { profiles: [] });

    const result = await memberService.getMyMemberProfile({
        institutionId,
        actorUser: actorUser(),
        actorMembership: actorMembership(),
    });

    assert.equal(result.member.id, membershipId);
    assert.equal(result.member.profile, null);
});

test("GET /institutions/:institutionId/members/me tenant-scopes membership and profile queries", async (t) => {
    const data = mockSelfProfileDependencies(t);

    await memberService.getMyMemberProfile({
        institutionId,
        actorUser: actorUser(),
        actorMembership: actorMembership(),
    });

    const membershipQuery = data.queryLog.find((entry) => entry.model === "Membership").query;
    assert.deepEqual(membershipQuery, {
        _id: membershipId,
        institutionId,
        userId,
        status: "active",
    });

    const profileQuery = data.queryLog.find((entry) => entry.model === "MemberProfile").query;
    assert.deepEqual(profileQuery, {
        institutionId,
        membershipId,
    });
});

test("GET /institutions/:institutionId/members/me rejects mismatched or inactive actor membership context", async (t) => {
    await assert.rejects(
        () =>
            memberService.getMyMemberProfile({
                institutionId,
                actorUser: actorUser(),
                actorMembership: actorMembership({ institutionId: otherInstitutionId }),
            }),
        { statusCode: 403, message: "Institution access denied" }
    );

    await assert.rejects(
        () =>
            memberService.getMyMemberProfile({
                institutionId,
                actorUser: actorUser(),
                actorMembership: actorMembership({ userId: otherUserId }),
            }),
        { statusCode: 403, message: "Institution access denied" }
    );

    await assert.rejects(
        () =>
            memberService.getMyMemberProfile({
                institutionId,
                actorUser: actorUser(),
                actorMembership: actorMembership({ status: "suspended" }),
            }),
        { statusCode: 403, message: "Institution access denied" }
    );

    mockSelfProfileDependencies(t, {
        membership: { status: "suspended" },
    });
    await assert.rejects(
        () =>
            memberService.getMyMemberProfile({
                institutionId,
                actorUser: actorUser(),
                actorMembership: actorMembership(),
            }),
        { statusCode: 403, message: "Institution access denied" }
    );
});

test("GET /institutions/:institutionId/members/me allows scoped responsibility users without membership.manage", async (t) => {
    for (const responsibilityType of ["head", "coordinator", "mentor"]) {
        await t.test(responsibilityType, async (t) => {
            t.mock.method(ResponsibilityAssignment, "find", () => {
                throw new Error("self member profile must not query responsibility assignments");
            });

            const result = await getSelfProfileForRole(t, "instructor");

            assert.equal(result.member.role, "instructor");
            assert.equal(result.member.profile.fullName, "Self Instructor");
        });
    }
});

test("GET /institutions/:institutionId/members/me controller passes plain trusted context", async (t) => {
    let receivedArgs = null;
    t.mock.method(memberService, "getMyMemberProfile", async (args) => {
        receivedArgs = args;
        return {
            member: {
                id: membershipId,
                profile: null,
            },
        };
    });

    const req = {
        params: { institutionId },
        tenantId: institutionId,
        user: actorUser(),
        membership: actorMembership(),
        body: { membershipId: otherMembershipId },
        query: { membershipId: otherMembershipId },
    };
    const res = createResponse();

    await memberController.getMyMemberProfile(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(receivedArgs, {
        institutionId,
        actorUser: req.user,
        actorMembership: req.membership,
    });
    assert.equal(receivedArgs.req, undefined);
    assert.equal(receivedArgs.res, undefined);
    assert.equal(receivedArgs.membershipId, undefined);
    assert.deepEqual(res.body, {
        member: {
            id: membershipId,
            profile: null,
        },
    });
});

test("GET /institutions/:institutionId/members/me route is before member id route and does not require membership.manage", () => {
    const routes = institutionRoutes.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route);

    const selfRoute = routes.find((route) => route.path === "/:institutionId/members/me" && route.methods.get);
    const detailRoute = routes.find((route) => route.path === "/:institutionId/members/:membershipId" && route.methods.get);

    assert.ok(selfRoute);
    assert.ok(detailRoute);
    assert.equal(routes.indexOf(selfRoute) < routes.indexOf(detailRoute), true);

    assert.deepEqual(
        selfRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "getMyMemberProfile"]
    );
    assert.equal(selfRoute.stack.some((layer) => layer.handle.requiredPermission === "membership.manage"), false);
    assert.equal(detailRoute.stack.some((layer) => layer.handle.requiredPermission === "membership.manage"), true);
});
