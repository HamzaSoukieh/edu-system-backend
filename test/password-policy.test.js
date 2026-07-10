const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const mongoose = require("mongoose");

// SEC-19: password policy — min 8 chars, max 72 bytes (bcrypt truncates beyond
// 72, so an over-long password must be rejected, not silently truncated).
// Self-skips without Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "pwpolicy-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "pwpolicy-qr";
process.env.NODE_ENV = "test";
process.env.EMAIL_QUEUE_ENABLED = "false";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-pwpolicy-test";

const authService = require("../src/services/authService");
const User = require("../src/models/User");
const Institution = require("../src/models/Institution");
const Membership = require("../src/models/Membership");
const OtpCode = require("../src/models/OtpCode");

let dbReady = false;

test.before(async () => {
    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
        dbReady = true;
    } catch {
        dbReady = false;
    }
});

test.after(async () => {
    if (dbReady) await mongoose.disconnect();
});

function signupWith(password) {
    const email = `pw-${crypto.randomBytes(4).toString("hex")}@example.test`;
    return authService.signup({
        email,
        password,
        confirmPassword: password,
        institutionName: "PW Co",
        institutionType: "university",
    });
}

async function cleanup(email) {
    const user = await User.findOne({ email }).lean();
    if (user) {
        await Membership.deleteMany({ userId: user._id });
        await Institution.deleteMany({ ownerUserId: user._id });
        await OtpCode.deleteMany({ userId: user._id });
        await User.deleteOne({ _id: user._id });
    }
}

test("rejects a password shorter than 8 characters (400)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    await assert.rejects(() => signupWith("short"), (err) => err.statusCode === 400);
});

test("rejects a password longer than 72 bytes (400)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    await assert.rejects(() => signupWith("a".repeat(73)), (err) => err.statusCode === 400 && /72 bytes/.test(err.message));
});

test("accepts an exactly-72-byte password", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const password = "a".repeat(72);
    let email;
    try {
        const result = await signupWith(password);
        email = result.user.email;
        assert.ok(result.accessToken);
    } finally {
        if (email) await cleanup(email);
    }
});
