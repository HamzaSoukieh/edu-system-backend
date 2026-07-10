const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const mongoose = require("mongoose");

// HTTP integration tests for authentication, RBAC, and tenant isolation (Phase 2.4 / 17).
// Boots the real Express app against a MongoDB; self-skips if no database is reachable.

process.env.JWT_SECRET = process.env.JWT_SECRET || "tenant-test-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "tenant-test-qr";
process.env.NODE_ENV = "test";
process.env.EMAIL_QUEUE_ENABLED = "false";
process.env.RATE_LIMIT_ENABLED = "false"; // don't throttle the test's many auth calls

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-tenant-test";

const app = require("../src/app");
const User = require("../src/models/User");
const Institution = require("../src/models/Institution");
const Membership = require("../src/models/Membership");

let dbReady = false;
let server;
let base;

test.before(async () => {
    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
        dbReady = true;
    } catch {
        dbReady = false;
        return;
    }
    await new Promise((resolve) => {
        server = app.listen(0, "127.0.0.1", () => {
            base = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
});

test.after(async () => {
    if (server) await new Promise((r) => server.close(r));
    if (dbReady) await mongoose.disconnect();
});

async function api(method, path, { token, body } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = {};
    try {
        json = text ? JSON.parse(text) : {};
    } catch {
        json = { message: text };
    }
    return { status: res.status, body: json };
}

// Create a verified institution owner; returns { token, institutionId, email }.
async function createOwner(tag) {
    const email = `tenant-${tag}-${crypto.randomBytes(4).toString("hex")}@example.test`;
    const signup = await api("POST", "/auth/signup", {
        body: {
            email,
            password: "Password123!",
            confirmPassword: "Password123!",
            institutionName: `${tag} Institution`,
            institutionType: "university",
        },
    });
    assert.equal(signup.status, 201, `signup failed: ${JSON.stringify(signup.body)}`);
    const token = signup.body.accessToken;
    await api("POST", "/auth/otp/verify", { token, body: { code: signup.body.devOtpCode } });
    const me = await api("GET", "/institutions/me", { token });
    return { email, token, institutionId: me.body.institutions[0].institutionId };
}

async function cleanup(email) {
    const user = await User.findOne({ email }).select("_id").lean();
    if (user) {
        await Membership.deleteMany({ userId: user._id });
        await Institution.deleteMany({ ownerUserId: user._id });
        await User.deleteOne({ _id: user._id });
    }
}

test("unauthenticated requests to protected routes return 401", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const res = await api("GET", "/institutions/507f1f77bcf86cd799439011/members");
    assert.equal(res.status, 401);
});

test("a normal institution admin cannot access the platform control plane (403)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const owner = await createOwner("platform");
    try {
        const res = await api("GET", "/platform/institutions", { token: owner.token });
        assert.equal(res.status, 403);
    } finally {
        await cleanup(owner.email);
    }
});

test("tenant isolation: an admin of institution A cannot read institution B (403)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const a = await createOwner("tenantA");
    const b = await createOwner("tenantB");
    try {
        // A's own institution works.
        const own = await api("GET", `/institutions/${a.institutionId}/members`, { token: a.token });
        assert.equal(own.status, 200, `own access failed: ${JSON.stringify(own.body)}`);

        // A accessing B's institution is denied.
        const cross = await api("GET", `/institutions/${b.institutionId}/members`, { token: a.token });
        assert.equal(cross.status, 403);
        assert.match(cross.body.message, /access denied/i);
    } finally {
        await cleanup(a.email);
        await cleanup(b.email);
    }
});

test("tenant isolation: A cannot create members in B's institution (403)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const a = await createOwner("writeA");
    const b = await createOwner("writeB");
    try {
        const res = await api("POST", `/institutions/${b.institutionId}/members`, {
            token: a.token,
            body: {
                email: "intruder@example.test",
                role: "instructor",
                profile: { firstName: "In", lastName: "Truder", nationalNumber: "X1", fullName: "In Truder" },
            },
        });
        assert.equal(res.status, 403);
    } finally {
        await cleanup(a.email);
        await cleanup(b.email);
    }
});

test("an invalid/garbage bearer token is rejected (401)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const res = await api("GET", "/institutions/507f1f77bcf86cd799439011/members", { token: "not.a.jwt" });
    assert.equal(res.status, 401);
});
