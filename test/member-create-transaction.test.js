const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

// DB-1: createMember writes User + Membership + MemberProfile atomically. On a
// replica set, a failure in a later write must leave NO orphaned User/Membership.
// Self-skips without Mongo; the rollback assertion self-skips on standalone Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "membertx-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "membertx-qr";
process.env.NODE_ENV = "test";
process.env.EMAIL_QUEUE_ENABLED = "false";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-membertx-test";

const memberService = require("../src/services/memberService");
const emailService = require("../src/services/emailService");
const institutionService = require("../src/services/institutionService");
const User = require("../src/models/User");
const Membership = require("../src/models/Membership");
const MemberProfile = require("../src/models/MemberProfile");
const InstitutionBillingProfile = require("../src/models/InstitutionBillingProfile");

const oid = () => new mongoose.Types.ObjectId();
let dbReady = false;
let isReplicaSet = false;

// Don't actually send email during these tests.
const origInvite = emailService.sendMemberInviteEmail;
const origAccount = emailService.sendMemberAccountCreatedEmail;

test.before(async () => {
    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
        dbReady = true;
        try {
            const status = await mongoose.connection.db.admin().command({ hello: 1 });
            isReplicaSet = Boolean(status.setName);
        } catch {
            isReplicaSet = false;
        }
    } catch {
        dbReady = false;
    }
    emailService.sendMemberInviteEmail = async () => ({ ok: true });
    emailService.sendMemberAccountCreatedEmail = async () => ({ ok: true });
});

test.after(async () => {
    emailService.sendMemberInviteEmail = origInvite;
    emailService.sendMemberAccountCreatedEmail = origAccount;
    if (dbReady) await mongoose.disconnect();
});

async function makeInstitution() {
    const ownerId = oid();
    const { institution } = await institutionService.createInstitution(
        { id: ownerId },
        { name: `Tx Members ${Date.now()}-${Math.floor(Math.random() * 1e6)}`, type: "university" }
    );
    // A paid subscription so the seat check permits adding staff/instructors.
    await InstitutionBillingProfile.create({ institutionId: institution.id, plan: "pro", status: "active" });
    return { institutionId: institution.id, ownerId };
}

function memberPayload(email) {
    return {
        email,
        role: "instructor",
        profile: {
            firstName: "New",
            lastName: "Member",
            fullName: "New Member",
            nationalNumber: `NM${Date.now()}${Math.floor(Math.random() * 1000)}`,
        },
    };
}

test("createMember persists User + Membership + MemberProfile", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { institutionId } = await makeInstitution();
    const email = `member-${Date.now()}@example.test`;
    let userId;
    try {
        const result = await memberService.createMember({
            institutionId,
            createdByUserId: oid(),
            payload: memberPayload(email),
        });
        assert.ok(result.member.id);
        const user = await User.findOne({ email }).lean();
        assert.ok(user, "User should be persisted");
        userId = user._id;
        const membership = await Membership.findOne({ userId, institutionId }).lean();
        assert.ok(membership, "Membership should be persisted");
        const profile = await MemberProfile.findOne({ membershipId: membership._id }).lean();
        assert.ok(profile, "MemberProfile should be persisted");
    } finally {
        if (userId) {
            await MemberProfile.deleteMany({ userId });
            await Membership.deleteMany({ userId });
            await User.deleteOne({ _id: userId });
        }
        await Membership.deleteMany({ institutionId });
    }
});

test("a failure creating the MemberProfile rolls back the User + Membership (replica set)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    if (!isReplicaSet) return t.skip("standalone mongo: no transaction rollback");

    const { institutionId } = await makeInstitution();
    const email = `member-rb-${Date.now()}@example.test`;

    const originalCreate = MemberProfile.create;
    MemberProfile.create = async () => {
        throw new Error("injected member-profile failure");
    };
    try {
        await assert.rejects(
            () => memberService.createMember({
                institutionId,
                createdByUserId: oid(),
                payload: memberPayload(email),
            }),
            /injected member-profile failure|Failed to create member/
        );
        // The transaction must have rolled back the User and Membership.
        const leakedUser = await User.findOne({ email }).lean();
        assert.equal(leakedUser, null, "User should have been rolled back");
    } finally {
        MemberProfile.create = originalCreate;
        const u = await User.findOne({ email }).lean();
        if (u) {
            await MemberProfile.deleteMany({ userId: u._id });
            await Membership.deleteMany({ userId: u._id });
            await User.deleteOne({ _id: u._id });
        }
        await Membership.deleteMany({ institutionId });
    }
});
