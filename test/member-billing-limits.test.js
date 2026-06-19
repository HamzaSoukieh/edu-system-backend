const test = require("node:test");
const assert = require("node:assert/strict");

const bcrypt = require("bcrypt");
const InstitutionBillingProfile = require("../src/models/InstitutionBillingProfile");
const Membership = require("../src/models/Membership");
const MemberProfile = require("../src/models/MemberProfile");
const User = require("../src/models/User");
const emailService = require("../src/services/emailService");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439012";
const createdByUserId = "507f1f77bcf86cd799439021";
const activeStudentMemberId = "507f1f77bcf86cd799439101";
const activeStaffMemberId = "507f1f77bcf86cd799439102";
const suspendedStudentMemberId = "507f1f77bcf86cd799439103";
const suspendedStaffMemberId = "507f1f77bcf86cd799439104";

function createQuery(result) {
    return {
        select() {
            return this;
        },
        populate() {
            return this;
        },
        lean: async () => result,
        then(resolve, reject) {
            return Promise.resolve(result).then(resolve, reject);
        },
    };
}

function normalizeId(value) {
    if (value === undefined || value === null) {
        return null;
    }

    return value.toString();
}

function buildBillingProfile(overrides = {}) {
    return {
        institutionId,
        plan: "plus",
        billingInterval: "six_month",
        status: "active",
        cancelAtPeriodEnd: false,
        trialEnd: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        ...overrides,
    };
}

function buildUser({ id, email }) {
    return {
        _id: id,
        email,
        status: "active",
        firstName: "Test",
        lastName: "User",
    };
}

function buildMembership(overrides = {}) {
    return {
        _id: activeStudentMemberId,
        institutionId,
        userId: "507f1f77bcf86cd799439201",
        role: "student",
        status: "active",
        joinedAt: new Date("2026-06-01T00:00:00.000Z"),
        ...overrides,
    };
}

function buildProfile(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439301",
        membershipId: activeStudentMemberId,
        firstName: "Test",
        lastName: "Member",
        nationalNumber: "NAT-001",
        birthDate: null,
        gender: null,
        profilePictureUrl: null,
        ...overrides,
    };
}

function buildCreatePayload(overrides = {}) {
    const emailSeed = overrides.emailSeed || "student";
    return {
        email: `${emailSeed}@example.test`,
        role: "student",
        profile: {
            firstName: "New",
            lastName: "Member",
            nationalNumber: `NAT-${emailSeed}`,
        },
        ...overrides,
        emailSeed: undefined,
    };
}

function profileResponseForMembership(membership, profile) {
    return {
        ...membership,
        userId: buildUser({
            id: normalizeId(membership.userId),
            email: `${normalizeId(membership.userId)}@example.test`,
        }),
        profile,
    };
}

function mockMemberServiceDependencies(t, options = {}) {
    const data = {
        billingProfile: buildBillingProfile(options.billingProfile || {}),
        studentCount: options.studentCount || 0,
        staffCount: options.staffCount || 0,
        nextMembershipNumber: 0,
        queryLog: [],
        calls: {
            userCreate: [],
            membershipCreate: [],
            memberProfileCreate: [],
            membershipUpdateOne: [],
            memberProfileUpdateOne: [],
            membershipFindOneAndUpdate: [],
            email: [],
        },
        usersByEmail: new Map(),
        usersById: new Map(),
        membershipsById: new Map(),
        memberProfilesByMembershipId: new Map(),
    };

    for (const user of options.users || []) {
        data.usersByEmail.set(user.email, user);
        data.usersById.set(normalizeId(user._id), user);
    }

    for (const membership of options.memberships || []) {
        data.membershipsById.set(normalizeId(membership._id), membership);
    }

    for (const profile of options.memberProfiles || []) {
        data.memberProfilesByMembershipId.set(normalizeId(profile.membershipId), profile);
    }

    t.mock.method(bcrypt, "hash", async () => "hashed_test_password");

    t.mock.method(emailService, "sendMemberAccountCreatedEmail", async (payload) => {
        data.calls.email.push(payload);
    });

    t.mock.method(InstitutionBillingProfile, "findOne", (query) => {
        data.queryLog.push({ model: "InstitutionBillingProfile", method: "findOne", query });
        return createQuery(normalizeId(query.institutionId) === institutionId ? data.billingProfile : null);
    });

    t.mock.method(Membership, "countDocuments", async (query) => {
        data.queryLog.push({ model: "Membership", method: "countDocuments", query });
        if (normalizeId(query.institutionId) !== institutionId) {
            return 0;
        }
        if (query.role === "student") {
            return data.studentCount;
        }
        if (query.role?.$in?.includes("admin") && query.role?.$in?.includes("instructor")) {
            return data.staffCount;
        }
        return 0;
    });

    t.mock.method(User, "findOne", (query) => {
        data.queryLog.push({ model: "User", method: "findOne", query });
        if (query.email) {
            const user = data.usersByEmail.get(query.email) || null;
            return createQuery(user);
        }
        return createQuery(null);
    });

    t.mock.method(User, "create", async (payload) => {
        data.calls.userCreate.push(payload);
        const id = `507f1f77bcf86cd7994394${String(data.calls.userCreate.length).padStart(2, "0")}`;
        const user = buildUser({ id, email: payload.email });
        data.usersByEmail.set(payload.email, user);
        data.usersById.set(id, user);
        return user;
    });

    t.mock.method(User, "updateOne", async (filter, update) => {
        data.queryLog.push({ model: "User", method: "updateOne", filter, update });
        return { matchedCount: 1, modifiedCount: 1 };
    });

    t.mock.method(User, "deleteOne", async (filter) => {
        data.queryLog.push({ model: "User", method: "deleteOne", filter });
        return { deletedCount: 1 };
    });

    t.mock.method(Membership, "findOne", (query) => {
        data.queryLog.push({ model: "Membership", method: "findOne", query });

        if (query._id) {
            const membership = data.membershipsById.get(normalizeId(query._id));
            const profile = membership ? data.memberProfilesByMembershipId.get(normalizeId(membership._id)) : null;
            return createQuery(membership ? profileResponseForMembership(membership, profile) : null);
        }

        if (query.userId && query.institutionId) {
            const membership = [...data.membershipsById.values()].find(
                (item) =>
                    normalizeId(item.userId) === normalizeId(query.userId) &&
                    normalizeId(item.institutionId) === normalizeId(query.institutionId)
            );
            return createQuery(membership || null);
        }

        return createQuery(null);
    });

    t.mock.method(Membership, "create", async (payload) => {
        data.calls.membershipCreate.push(payload);
        const id = `507f1f77bcf86cd7994395${String(data.nextMembershipNumber).padStart(2, "0")}`;
        data.nextMembershipNumber += 1;
        const membership = {
            _id: id,
            institutionId: payload.institutionId,
            userId: normalizeId(payload.userId),
            role: payload.role,
            status: payload.status,
            invitedBy: payload.invitedBy,
            joinedAt: payload.joinedAt,
        };
        data.membershipsById.set(id, membership);
        if (membership.status === "active" && membership.role === "student") {
            data.studentCount += 1;
        }
        if (membership.status === "active" && ["admin", "instructor"].includes(membership.role)) {
            data.staffCount += 1;
        }
        return membership;
    });

    t.mock.method(Membership, "updateOne", async (filter, update) => {
        data.calls.membershipUpdateOne.push({ filter, update });
        const membership = data.membershipsById.get(normalizeId(filter._id));
        if (membership && update.$set?.role) {
            membership.role = update.$set.role;
        }
        return { matchedCount: membership ? 1 : 0, modifiedCount: membership ? 1 : 0 };
    });

    t.mock.method(Membership, "findOneAndUpdate", (filter, update) => {
        data.calls.membershipFindOneAndUpdate.push({ filter, update });
        const membership = data.membershipsById.get(normalizeId(filter._id));
        if (membership && update.$set?.status) {
            const wasActive = membership.status === "active";
            const nextActive = update.$set.status === "active";
            if (wasActive && !nextActive && membership.role === "student") {
                data.studentCount -= 1;
            }
            if (wasActive && !nextActive && ["admin", "instructor"].includes(membership.role)) {
                data.staffCount -= 1;
            }
            if (!wasActive && nextActive && membership.role === "student") {
                data.studentCount += 1;
            }
            if (!wasActive && nextActive && ["admin", "instructor"].includes(membership.role)) {
                data.staffCount += 1;
            }
            membership.status = update.$set.status;
        }
        return createQuery(membership || null);
    });

    t.mock.method(Membership, "deleteOne", async (filter) => {
        data.queryLog.push({ model: "Membership", method: "deleteOne", filter });
        return { deletedCount: 1 };
    });

    t.mock.method(MemberProfile, "findOne", (query) => {
        data.queryLog.push({ model: "MemberProfile", method: "findOne", query });
        if (query.membershipId) {
            return createQuery(data.memberProfilesByMembershipId.get(normalizeId(query.membershipId)) || null);
        }
        return createQuery(null);
    });

    t.mock.method(MemberProfile, "create", async (payload) => {
        data.calls.memberProfileCreate.push(payload);
        const profile = {
            _id: `507f1f77bcf86cd7994396${String(data.calls.memberProfileCreate.length).padStart(2, "0")}`,
            membershipId: normalizeId(payload.membershipId),
            firstName: payload.firstName,
            lastName: payload.lastName,
            nationalNumber: payload.nationalNumber,
            birthDate: payload.birthDate || null,
            gender: payload.gender || null,
            profilePictureUrl: payload.profilePictureUrl || null,
        };
        data.memberProfilesByMembershipId.set(normalizeId(payload.membershipId), profile);
        return profile;
    });

    t.mock.method(MemberProfile, "updateOne", async (filter, update) => {
        data.calls.memberProfileUpdateOne.push({ filter, update });
        const profile = [...data.memberProfilesByMembershipId.values()].find(
            (item) => normalizeId(item._id) === normalizeId(filter._id)
        );
        if (profile) {
            Object.assign(profile, update.$set || {});
        }
        return { matchedCount: profile ? 1 : 0, modifiedCount: profile ? 1 : 0 };
    });

    t.mock.method(MemberProfile, "deleteOne", async (filter) => {
        data.queryLog.push({ model: "MemberProfile", method: "deleteOne", filter });
        return { deletedCount: 1 };
    });

    delete require.cache[require.resolve("../src/services/memberService")];
    const memberService = require("../src/services/memberService");

    return { data, memberService };
}

async function assertBillingLimitReached(promise, expected) {
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

test("memberService allows the final Plus student seat, then blocks the next active student create", async (t) => {
    const existingStudentUserA = buildUser({
        id: "507f1f77bcf86cd799439211",
        email: "student-a@example.test",
    });
    const existingStudentUserB = buildUser({
        id: "507f1f77bcf86cd799439212",
        email: "student-b@example.test",
    });
    const { data, memberService } = mockMemberServiceDependencies(t, {
        studentCount: 299,
        staffCount: 10,
        users: [existingStudentUserA, existingStudentUserB],
    });

    const created = await memberService.createMember({
        institutionId,
        createdByUserId,
        payload: buildCreatePayload({ emailSeed: "student-a", email: "student-a@example.test" }),
    });

    assert.equal(created.member.role, "student");
    assert.equal(data.studentCount, 300);
    assert.equal(data.calls.membershipCreate.length, 1);
    assert.equal(data.calls.memberProfileCreate.length, 1);
    assert.equal(data.calls.email.length, 1);

    await assertBillingLimitReached(
        memberService.createMember({
            institutionId,
            createdByUserId,
            payload: buildCreatePayload({ emailSeed: "student-b", email: "student-b@example.test" }),
        }),
        { plan: "plus", category: "student", limit: 300, currentCount: 300 }
    );

    assert.equal(data.calls.membershipCreate.length, 1);
    assert.equal(data.calls.memberProfileCreate.length, 1);
    assert.equal(data.calls.email.length, 1);
});

test("memberService blocks active student creation at the Plus student limit before write side effects", async (t) => {
    const existingStudentUser = buildUser({
        id: "507f1f77bcf86cd799439221",
        email: "student-full@example.test",
    });
    const { data, memberService } = mockMemberServiceDependencies(t, {
        studentCount: 300,
        staffCount: 10,
        users: [existingStudentUser],
    });

    await assertBillingLimitReached(
        memberService.createMember({
            institutionId,
            createdByUserId,
            payload: buildCreatePayload({ emailSeed: "student-full", email: "student-full@example.test" }),
        }),
        { plan: "plus", category: "student", limit: 300, currentCount: 300 }
    );

    assert.equal(data.calls.userCreate.length, 0);
    assert.equal(data.calls.membershipCreate.length, 0);
    assert.equal(data.calls.memberProfileCreate.length, 0);
    assert.equal(data.calls.email.length, 0);
});

test("memberService blocks active staff creation at the Plus staff limit before write side effects", async (t) => {
    const existingStaffUser = buildUser({
        id: "507f1f77bcf86cd799439222",
        email: "staff-full@example.test",
    });
    const { data, memberService } = mockMemberServiceDependencies(t, {
        studentCount: 20,
        staffCount: 30,
        users: [existingStaffUser],
    });

    await assertBillingLimitReached(
        memberService.createMember({
            institutionId,
            createdByUserId,
            payload: buildCreatePayload({
                emailSeed: "staff-full",
                email: "staff-full@example.test",
                role: "instructor",
            }),
        }),
        { plan: "plus", category: "staff", limit: 30, currentCount: 30 }
    );

    assert.equal(data.calls.userCreate.length, 0);
    assert.equal(data.calls.membershipCreate.length, 0);
    assert.equal(data.calls.memberProfileCreate.length, 0);
    assert.equal(data.calls.email.length, 0);
});

test("memberService activation/reactivation checks destination student and staff capacity", async (t) => {
    const suspendedStudent = buildMembership({
        _id: suspendedStudentMemberId,
        userId: "507f1f77bcf86cd799439231",
        role: "student",
        status: "suspended",
    });
    const suspendedStaff = buildMembership({
        _id: suspendedStaffMemberId,
        userId: "507f1f77bcf86cd799439232",
        role: "instructor",
        status: "suspended",
    });
    const { data, memberService } = mockMemberServiceDependencies(t, {
        studentCount: 300,
        staffCount: 30,
        memberships: [suspendedStudent, suspendedStaff],
        memberProfiles: [
            buildProfile({ membershipId: suspendedStudentMemberId }),
            buildProfile({ membershipId: suspendedStaffMemberId }),
        ],
    });

    await assertBillingLimitReached(
        memberService.updateMemberStatus({
            institutionId,
            membershipId: suspendedStudentMemberId,
            payload: { status: "active" },
        }),
        { plan: "plus", category: "student", limit: 300, currentCount: 300 }
    );

    await assertBillingLimitReached(
        memberService.updateMemberStatus({
            institutionId,
            membershipId: suspendedStaffMemberId,
            payload: { status: "active" },
        }),
        { plan: "plus", category: "staff", limit: 30, currentCount: 30 }
    );

    assert.equal(data.calls.membershipFindOneAndUpdate.length, 0);
});

test("memberService deactivation and profile-only updates remain allowed while over limit", async (t) => {
    const activeStudent = buildMembership({
        _id: activeStudentMemberId,
        userId: "507f1f77bcf86cd799439241",
        role: "student",
        status: "active",
    });
    const { data, memberService } = mockMemberServiceDependencies(t, {
        studentCount: 301,
        staffCount: 31,
        memberships: [activeStudent],
        memberProfiles: [buildProfile({ membershipId: activeStudentMemberId })],
    });

    const suspended = await memberService.updateMemberStatus({
        institutionId,
        membershipId: activeStudentMemberId,
        payload: { status: "suspended" },
    });

    assert.equal(suspended.member.status, "suspended");
    assert.equal(data.calls.membershipFindOneAndUpdate.length, 1);

    const updated = await memberService.updateMember({
        institutionId,
        membershipId: activeStudentMemberId,
        payload: {
            profile: {
                firstName: "Updated",
                lastName: "Member",
            },
        },
    });

    assert.equal(updated.member.profile.firstName, "Updated");
    assert.equal(data.calls.memberProfileUpdateOne.length, 1);
    assert.equal(data.calls.membershipUpdateOne.length, 0);
});

test("memberService role changes check only the destination active seat category", async (t) => {
    const activeStudent = buildMembership({
        _id: activeStudentMemberId,
        userId: "507f1f77bcf86cd799439251",
        role: "student",
        status: "active",
    });
    const activeInstructor = buildMembership({
        _id: activeStaffMemberId,
        userId: "507f1f77bcf86cd799439252",
        role: "instructor",
        status: "active",
    });
    const { data, memberService } = mockMemberServiceDependencies(t, {
        studentCount: 300,
        staffCount: 30,
        memberships: [activeStudent, activeInstructor],
        memberProfiles: [
            buildProfile({ membershipId: activeStudentMemberId }),
            buildProfile({ membershipId: activeStaffMemberId }),
        ],
    });

    await assertBillingLimitReached(
        memberService.updateMember({
            institutionId,
            membershipId: activeStudentMemberId,
            payload: { role: "instructor" },
        }),
        { plan: "plus", category: "staff", limit: 30, currentCount: 30 }
    );

    await assertBillingLimitReached(
        memberService.updateMember({
            institutionId,
            membershipId: activeStaffMemberId,
            payload: { role: "student" },
        }),
        { plan: "plus", category: "student", limit: 300, currentCount: 300 }
    );

    assert.equal(data.calls.membershipUpdateOne.length, 0);
});

test("memberService billing checks stay institution-scoped", async (t) => {
    const existingStudentUser = buildUser({
        id: "507f1f77bcf86cd799439261",
        email: "tenant-scoped@example.test",
    });
    const { data, memberService } = mockMemberServiceDependencies(t, {
        studentCount: 300,
        staffCount: 30,
        users: [existingStudentUser],
    });

    await assertBillingLimitReached(
        memberService.createMember({
            institutionId,
            createdByUserId,
            payload: buildCreatePayload({ emailSeed: "tenant-scoped", email: "tenant-scoped@example.test" }),
        }),
        { plan: "plus", category: "student", limit: 300, currentCount: 300 }
    );

    const billingProfileReads = data.queryLog.filter(
        (entry) => entry.model === "InstitutionBillingProfile" && entry.method === "findOne"
    );
    const membershipCounts = data.queryLog.filter(
        (entry) => entry.model === "Membership" && entry.method === "countDocuments"
    );

    assert.ok(billingProfileReads.every((entry) => normalizeId(entry.query.institutionId) === institutionId));
    assert.ok(membershipCounts.every((entry) => normalizeId(entry.query.institutionId) === institutionId));

    const otherTenantCount = await Membership.countDocuments({
        institutionId: otherInstitutionId,
        role: "student",
        status: "active",
    });
    assert.equal(otherTenantCount, 0);
});
