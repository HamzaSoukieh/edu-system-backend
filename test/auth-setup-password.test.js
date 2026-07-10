const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const mongoose = require("mongoose");

// Integration tests for the secure member setup-token flow (D-006). Self-skip without Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "setup-test-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "setup-test-qr";
process.env.NODE_ENV = "test";
process.env.EMAIL_QUEUE_ENABLED = "false";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-setup-test";

const authService = require("../src/services/authService");
const authJwt = require("../src/middleware/authJwt");
const User = require("../src/models/User");
const AccountSetupToken = require("../src/models/AccountSetupToken");
const RefreshToken = require("../src/models/RefreshToken");

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

async function makeInvitedUser(tag) {
    // Simulate what memberService does for a brand-new member: random unusable password.
    const email = `setup-${tag}-${crypto.randomBytes(4).toString("hex")}@example.test`;
    const bcrypt = require("bcrypt");
    const unusable = crypto.randomBytes(32).toString("hex");
    const user = await User.create({
        email,
        passwordHash: await bcrypt.hash(unusable, 10),
        isEmailVerified: true,
        mustChangePassword: true,
        status: "active",
    });
    return { user, email, unusable };
}

async function cleanup(userId) {
    await AccountSetupToken.deleteMany({ userId });
    await RefreshToken.deleteMany({ userId });
    await User.deleteOne({ _id: userId });
}

async function runAuthJwt(accessToken) {
    const req = { headers: { authorization: `Bearer ${accessToken}` } };
    let statusCode = 200;
    let body = null;
    const res = {
        status(c) { statusCode = c; return this; },
        json(p) { body = p; return this; },
    };
    let nextCalled = false;
    await authJwt(req, res, () => { nextCalled = true; });
    return { statusCode, body, nextCalled };
}

test("setup token lets a member set their own password and log in", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { user, email } = await makeInvitedUser("happy");
    try {
        const { rawToken } = await authService.createAccountSetupToken({ userId: user._id });
        const result = await authService.setupPassword({ token: rawToken, newPassword: "MyOwnPass123!" });
        assert.ok(result.accessToken && result.refreshToken, "tokens issued on setup");

        // mustChangePassword cleared.
        const updated = await User.findById(user._id).select("mustChangePassword").lean();
        assert.equal(updated.mustChangePassword, false);

        // Login with the self-chosen password works.
        const login = await authService.login({ email, password: "MyOwnPass123!" });
        assert.ok(login.accessToken, "login with new password works");
    } finally {
        await cleanup(user._id);
    }
});

test("setup token is single-use", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { user } = await makeInvitedUser("single");
    try {
        const { rawToken } = await authService.createAccountSetupToken({ userId: user._id });
        await authService.setupPassword({ token: rawToken, newPassword: "FirstPass123!" });
        await assert.rejects(
            () => authService.setupPassword({ token: rawToken, newPassword: "SecondPass123!" }),
            (err) => err.statusCode === 400
        );
    } finally {
        await cleanup(user._id);
    }
});

test("expired setup token is rejected", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { user } = await makeInvitedUser("expired");
    try {
        const { rawToken } = await authService.createAccountSetupToken({ userId: user._id });
        // Force-expire the stored token.
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        await AccountSetupToken.updateOne({ tokenHash }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
        await assert.rejects(
            () => authService.setupPassword({ token: rawToken, newPassword: "AnyPass123!" }),
            (err) => err.statusCode === 400
        );
    } finally {
        await cleanup(user._id);
    }
});

test("invalid setup token and weak passwords are rejected", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    await assert.rejects(
        () => authService.setupPassword({ token: "does-not-exist", newPassword: "Whatever123!" }),
        (err) => err.statusCode === 400
    );
    const { user } = await makeInvitedUser("weak");
    try {
        const { rawToken } = await authService.createAccountSetupToken({ userId: user._id });
        await assert.rejects(
            () => authService.setupPassword({ token: rawToken, newPassword: "short" }),
            (err) => err.statusCode === 400
        );
        await assert.rejects(
            () => authService.setupPassword({ token: rawToken, newPassword: "" }),
            (err) => err.statusCode === 400
        );
    } finally {
        await cleanup(user._id);
    }
});

test("completing setup invalidates any prior access tokens (tokenVersion bump)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { user } = await makeInvitedUser("version");
    try {
        // An access token minted before setup (tokenVersion 0).
        const jwt = require("jsonwebtoken");
        const preToken = jwt.sign({ tokenVersion: 0 }, process.env.JWT_SECRET, {
            subject: user._id.toString(),
            expiresIn: "15m",
        });
        const before = await runAuthJwt(preToken);
        assert.equal(before.nextCalled, true, "pre-setup token valid");

        const { rawToken } = await authService.createAccountSetupToken({ userId: user._id });
        await authService.setupPassword({ token: rawToken, newPassword: "VersionPass123!" });

        const after = await runAuthJwt(preToken);
        assert.equal(after.nextCalled, false);
        assert.equal(after.statusCode, 401);
    } finally {
        await cleanup(user._id);
    }
});
