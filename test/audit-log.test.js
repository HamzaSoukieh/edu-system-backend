const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

// SEC-15: sensitive tenant mutations must write an AuditLog. This covers the
// audit service directly plus the member status-change wiring. Self-skips
// without Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "audit-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "audit-qr";
process.env.NODE_ENV = "test";
process.env.EMAIL_QUEUE_ENABLED = "false";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-audit-test";

const { recordAuditLog } = require("../src/services/auditService");
const memberService = require("../src/services/memberService");
const AuditLog = require("../src/models/AuditLog");
const Institution = require("../src/models/Institution");
const User = require("../src/models/User");
const Membership = require("../src/models/Membership");
const MemberProfile = require("../src/models/MemberProfile");

const oid = () => new mongoose.Types.ObjectId();
let dbReady = false;
const created = { institutions: [], users: [], memberships: [], profiles: [], audits: [] };

test.before(async () => {
    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
        dbReady = true;
    } catch {
        dbReady = false;
    }
});

test.after(async () => {
    if (!dbReady) return;
    await AuditLog.deleteMany({ institutionId: { $in: created.institutions } });
    await MemberProfile.deleteMany({ _id: { $in: created.profiles } });
    await Membership.deleteMany({ _id: { $in: created.memberships } });
    await User.deleteMany({ _id: { $in: created.users } });
    await Institution.deleteMany({ _id: { $in: created.institutions } });
    await mongoose.disconnect();
});

test("recordAuditLog writes a row and never throws on bad input", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const institutionId = oid();
    created.institutions.push(institutionId);
    const actorUserId = oid();

    const row = await recordAuditLog({
        institutionId,
        actorUserId,
        action: "test.action",
        entityType: "Thing",
        entityId: oid(),
        metadata: { a: 1 },
    });
    assert.ok(row, "returns the created row");
    const stored = await AuditLog.findById(row._id).lean();
    assert.equal(stored.action, "test.action");
    assert.equal(stored.actorUserId.toString(), actorUserId.toString());

    // Missing required fields -> null, no throw.
    const bad = await recordAuditLog({ institutionId, action: null, entityType: "X" });
    assert.equal(bad, null);
});

test("member status change writes member.status.changed audit", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const institution = await Institution.create({ name: "Audit U", type: "university", ownerUserId: oid() });
    created.institutions.push(institution._id);
    const actorUserId = oid();
    created.users.push(actorUserId);

    const user = await User.create({
        email: `audit-${Date.now()}@example.test`,
        passwordHash: "x",
        status: "active",
        isEmailVerified: true,
    });
    created.users.push(user._id);
    const membership = await Membership.create({
        institutionId: institution._id,
        userId: user._id,
        role: "instructor",
        status: "active",
    });
    created.memberships.push(membership._id);
    const profile = await MemberProfile.create({
        institutionId: institution._id,
        membershipId: membership._id,
        userId: user._id,
        firstName: "A",
        lastName: "B",
        fullName: "A B",
        fullNameNormalized: "a b",
        nationalNumber: `N${Date.now()}`,
    });
    created.profiles.push(profile._id);

    await memberService.updateMemberStatus({
        institutionId: institution._id,
        membershipId: membership._id,
        payload: { status: "suspended" },
        actorUserId,
    });

    const audit = await AuditLog.findOne({
        institutionId: institution._id,
        action: "member.status.changed",
        entityId: membership._id,
    }).lean();
    assert.ok(audit, "audit row written");
    assert.equal(audit.metadata.from, "active");
    assert.equal(audit.metadata.to, "suspended");
    assert.equal(audit.actorUserId.toString(), actorUserId.toString());
});
