const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const crypto = require("crypto");

// DB-1: signup creates User + Institution + owner Membership + OTP atomically.
// On a replica set, a failure creating the Membership must roll back the User +
// Institution (no orphans). Self-skips without Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "signuptx-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "signuptx-qr";
process.env.NODE_ENV = "test";
process.env.EMAIL_QUEUE_ENABLED = "false";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-signuptx-test";

const authService = require("../src/services/authService");
const User = require("../src/models/User");
const Institution = require("../src/models/Institution");
const Membership = require("../src/models/Membership");
const OtpCode = require("../src/models/OtpCode");

let dbReady = false;
let isReplicaSet = false;

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
});

test.after(async () => {
    if (dbReady) await mongoose.disconnect();
});

async function cleanup(email) {
    const user = await User.findOne({ email }).lean();
    if (user) {
        await Membership.deleteMany({ userId: user._id });
        await Institution.deleteMany({ ownerUserId: user._id });
        await OtpCode.deleteMany({ userId: user._id });
        await User.deleteOne({ _id: user._id });
    }
}

test("signup persists user + institution + owner membership + otp", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const email = `signuptx-${crypto.randomBytes(4).toString("hex")}@example.test`;
    try {
        const result = await authService.signup({
            email,
            password: "Password123!",
            confirmPassword: "Password123!",
            institutionName: "Tx Co",
            institutionType: "university",
        });
        assert.ok(result.accessToken);
        const user = await User.findOne({ email }).lean();
        assert.ok(user);
        assert.ok(await Institution.exists({ ownerUserId: user._id }));
        assert.ok(await Membership.exists({ userId: user._id, role: "admin" }));
        assert.ok(await OtpCode.exists({ userId: user._id, purpose: "signup" }));
    } finally {
        await cleanup(email);
    }
});

test("a failure creating the owner membership rolls back user + institution (replica set)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    if (!isReplicaSet) return t.skip("standalone mongo: no transaction rollback");
    const email = `signuptxfail-${crypto.randomBytes(4).toString("hex")}@example.test`;

    const originalCreate = Membership.create;
    Membership.create = async () => {
        throw new Error("injected membership failure");
    };
    try {
        await assert.rejects(
            () =>
                authService.signup({
                    email,
                    password: "Password123!",
                    confirmPassword: "Password123!",
                    institutionName: "Rollback Co",
                    institutionType: "university",
                }),
            (err) => err.statusCode === 500
        );
        assert.equal(await User.findOne({ email }).lean(), null, "user rolled back");
        assert.equal(await Institution.findOne({ name: "Rollback Co" }).lean(), null, "institution rolled back");
    } finally {
        Membership.create = originalCreate;
        await cleanup(email);
    }
});
