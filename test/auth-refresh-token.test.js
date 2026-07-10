const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

// Integration tests for the refresh-token lifecycle (D-008). These require a MongoDB
// instance; if one is not reachable the whole suite self-skips (so `npm test` still
// passes on a machine without a database). CI provisions Mongo, so these run there.

process.env.JWT_SECRET = process.env.JWT_SECRET || "refresh-test-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "refresh-test-qr";
process.env.NODE_ENV = "test";
process.env.EMAIL_QUEUE_ENABLED = "false";

const MONGO_URI =
    process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-refresh-test";

const authService = require("../src/services/authService");
const authJwt = require("../src/middleware/authJwt");
const User = require("../src/models/User");
const RefreshToken = require("../src/models/RefreshToken");
const Institution = require("../src/models/Institution");
const Membership = require("../src/models/Membership");

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
    if (dbReady) {
        await mongoose.disconnect();
    }
});

function uniqueEmail(tag) {
    return `refresh-${tag}-${crypto.randomBytes(4).toString("hex")}@example.test`;
}

async function cleanup(email) {
    const user = await User.findOne({ email }).select("_id").lean();
    if (user) {
        await RefreshToken.deleteMany({ userId: user._id });
        await Membership.deleteMany({ userId: user._id });
        await Institution.deleteMany({ ownerUserId: user._id });
        await User.deleteOne({ _id: user._id });
    }
}

// Minimal harness to drive the authJwt middleware without HTTP.
async function runAuthJwt(accessToken) {
    const req = { headers: { authorization: `Bearer ${accessToken}` } };
    let statusCode = 200;
    let body = null;
    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(payload) {
            body = payload;
            return this;
        },
    };
    let nextCalled = false;
    await authJwt(req, res, () => {
        nextCalled = true;
    });
    return { statusCode, body, nextCalled, req };
}

test("signup issues an access + refresh token pair", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const email = uniqueEmail("pair");
    try {
        const result = await authService.signup({
            email,
            password: "Password123!",
            confirmPassword: "Password123!",
            institutionName: "Refresh Co",
            institutionType: "school",
        });
        assert.ok(result.accessToken, "accessToken present");
        assert.ok(result.refreshToken, "refreshToken present");
        const stored = await RefreshToken.findOne({
            tokenHash: crypto.createHash("sha256").update(result.refreshToken).digest("hex"),
        }).lean();
        assert.ok(stored, "refresh token persisted (hashed)");
        assert.equal(stored.revokedAt, null);
    } finally {
        await cleanup(email);
    }
});

test("refresh rotates the token and rejects the old one", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const email = uniqueEmail("rotate");
    try {
        const { refreshToken: first } = await authService.signup({
            email,
            password: "Password123!",
            confirmPassword: "Password123!",
            institutionName: "Rotate Co",
            institutionType: "school",
        });

        const rotated = await authService.refreshSession({ refreshToken: first });
        assert.ok(rotated.refreshToken && rotated.refreshToken !== first, "new refresh token issued");
        assert.ok(rotated.accessToken, "new access token issued");

        // Old token is now revoked -> reuse must fail.
        await assert.rejects(
            () => authService.refreshSession({ refreshToken: first }),
            (err) => err.statusCode === 401
        );
    } finally {
        await cleanup(email);
    }
});

test("reusing a rotated token revokes the entire family", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const email = uniqueEmail("reuse");
    try {
        const { refreshToken: first } = await authService.signup({
            email,
            password: "Password123!",
            confirmPassword: "Password123!",
            institutionName: "Reuse Co",
            institutionType: "school",
        });
        const rotated = await authService.refreshSession({ refreshToken: first });
        // Attacker replays the old (already-rotated) token.
        await assert.rejects(() => authService.refreshSession({ refreshToken: first }));
        // Family is now revoked, so even the legitimate current token is dead.
        await assert.rejects(
            () => authService.refreshSession({ refreshToken: rotated.refreshToken }),
            (err) => err.statusCode === 401
        );
    } finally {
        await cleanup(email);
    }
});

test("logout revokes the presented refresh token", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const email = uniqueEmail("logout");
    try {
        const { refreshToken } = await authService.signup({
            email,
            password: "Password123!",
            confirmPassword: "Password123!",
            institutionName: "Logout Co",
            institutionType: "school",
        });
        await authService.logout({ refreshToken });
        await assert.rejects(
            () => authService.refreshSession({ refreshToken }),
            (err) => err.statusCode === 401
        );
    } finally {
        await cleanup(email);
    }
});

test("logout-all bumps tokenVersion and invalidates existing access tokens", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const email = uniqueEmail("logoutall");
    try {
        const signup = await authService.signup({
            email,
            password: "Password123!",
            confirmPassword: "Password123!",
            institutionName: "LogoutAll Co",
            institutionType: "school",
        });

        // Access token works before logout-all.
        const before = await runAuthJwt(signup.accessToken);
        assert.equal(before.nextCalled, true, "access token valid before logout-all");

        await authService.logoutAll({ id: signup.user.id });

        // Same access token is now rejected (tokenVersion mismatch).
        const after = await runAuthJwt(signup.accessToken);
        assert.equal(after.nextCalled, false);
        assert.equal(after.statusCode, 401);
        assert.equal(after.body.message, "Token revoked");

        // And the refresh token is revoked too.
        await assert.rejects(() => authService.refreshSession({ refreshToken: signup.refreshToken }));
    } finally {
        await cleanup(email);
    }
});

test("password reset invalidates prior sessions (tokenVersion bump + refresh revoke)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const email = uniqueEmail("reset");
    try {
        const signup = await authService.signup({
            email,
            password: "Password123!",
            confirmPassword: "Password123!",
            institutionName: "Reset Co",
            institutionType: "school",
        });
        // Mark verified so reset is allowed.
        await User.updateOne({ _id: signup.user.id }, { $set: { isEmailVerified: true } });

        // Old access token works before reset.
        const before = await runAuthJwt(signup.accessToken);
        assert.equal(before.nextCalled, true, "access token valid before reset");

        // forgotPassword returns the code in non-prod (devOtpCode), enabling a real reset.
        const forgot = await authService.forgotPassword({ email });
        assert.ok(forgot.devOtpCode, "reset code exposed in test env");

        await authService.resetPassword({
            email,
            code: forgot.devOtpCode,
            newPassword: "NewPassword456!",
        });

        // Prior access token rejected (tokenVersion bumped).
        const after = await runAuthJwt(signup.accessToken);
        assert.equal(after.nextCalled, false);
        assert.equal(after.statusCode, 401);
        assert.equal(after.body.message, "Token revoked");

        // Prior refresh token revoked.
        await assert.rejects(
            () => authService.refreshSession({ refreshToken: signup.refreshToken }),
            (err) => err.statusCode === 401
        );

        // New password works.
        const relogin = await authService.login({ email, password: "NewPassword456!" });
        assert.ok(relogin.accessToken && relogin.refreshToken, "re-login with new password issues tokens");
    } finally {
        await cleanup(email);
    }
});
