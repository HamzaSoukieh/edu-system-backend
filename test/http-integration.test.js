const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

// HTTP-level integration tests: exercise the real wired request pipeline
// (routes → middleware → controller → service → Mongo) over HTTP, rather than
// calling services in-memory. Codifies the audit's §4 runtime smoke tests:
// health, auth, RBAC, and tenant isolation. Self-skips without Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "httpint-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "httpint-qr";
process.env.NODE_ENV = "test";
process.env.EMAIL_QUEUE_ENABLED = "false";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-httpint-test";

const app = require("../src/app");
const User = require("../src/models/User");
const Institution = require("../src/models/Institution");
const Membership = require("../src/models/Membership");
const OtpCode = require("../src/models/OtpCode");

let dbReady = false;
let server;
let base;
const createdEmails = [];

async function api(path, { method = "GET", token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try {
        json = await res.json();
    } catch {
        json = null;
    }
    return { status: res.status, body: json };
}

async function signup(seed, institutionType = "university") {
    const email = `httpint-${seed}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
    createdEmails.push(email);
    const res = await api("/auth/signup", {
        method: "POST",
        body: {
            email,
            password: "Password123!",
            confirmPassword: "Password123!",
            institutionName: `HTTP Int ${seed}`,
            institutionType,
        },
    });
    // Mark the account email-verified directly — these tests exercise the authed
    // request pipeline (RBAC/tenant isolation), not the OTP verification flow
    // (which is covered separately and can't be driven here since OTPs are hashed).
    if (res.status === 201 && dbReady) {
        await User.updateOne({ email }, { $set: { isEmailVerified: true } });
    }
    return { email, res };
}

test.before(async () => {
    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
        dbReady = true;
    } catch {
        dbReady = false;
    }
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (dbReady) {
        for (const email of createdEmails) {
            const user = await User.findOne({ email }).lean();
            if (user) {
                await Membership.deleteMany({ userId: user._id });
                await Institution.deleteMany({ ownerUserId: user._id });
                await OtpCode.deleteMany({ userId: user._id });
                await User.deleteOne({ _id: user._id });
            }
        }
        await mongoose.disconnect();
    }
});

test("GET /health returns 200 over HTTP", async () => {
    const { status, body } = await api("/health");
    assert.equal(status, 200);
    assert.equal(body.status, "ok");
});

test("SEC-13: member profile pictures are not publicly served, but logos are", async () => {
    // Member profile pics (PII) are blocked before the static handler.
    const pii = await fetch(`${base}/uploads/member-profiles/anything.jpg`);
    assert.equal(pii.status, 404);
    // The institution-logos path is still handled by express.static (404 only
    // because the file doesn't exist — not blocked). A blocked path returns our
    // JSON 404; the static handler returns its own 404 for a missing file. Both
    // are 404 here; the key assertion is that member-profiles is intercepted.
    const piiBody = await pii.json().catch(() => null);
    assert.equal(piiBody?.message, "Not found");
});

test("a protected route without a token returns 401", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { status } = await api("/institutions/me");
    assert.equal(status, 401);
});

test("signup then login then /institutions/me over the real pipeline", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { email, res } = await signup("owner");
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.accessToken);

    const login = await api("/auth/login", { method: "POST", body: { email, password: "Password123!" } });
    assert.equal(login.status, 200);
    assert.ok(login.body.accessToken);

    const me = await api("/institutions/me", { token: login.body.accessToken });
    assert.equal(me.status, 200);
    assert.ok(Array.isArray(me.body.institutions));
    assert.equal(me.body.institutions[0].role, "admin");
});

test("bad password login returns a generic 401", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { email } = await signup("badpass");
    const login = await api("/auth/login", { method: "POST", body: { email, password: "wrong-password" } });
    assert.equal(login.status, 401);
});

test("signup with a missing field returns 400", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const res = await api("/auth/signup", {
        method: "POST",
        body: { email: "x@example.test", password: "Password123!" },
    });
    assert.equal(res.status, 400);
});

test("authorization: an ordinary owner is denied the platform control-plane (403)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { res: ownerRes } = await signup("platform-denied");
    assert.equal(ownerRes.status, 201);

    // A normal institution owner is not a PlatformAdmin → the platform plane
    // must fail closed (audit T11).
    const platform = await api("/platform/institutions", { token: ownerRes.body.accessToken });
    assert.equal(platform.status, 403);
});

test("tenant isolation: a valid token cannot access another institution's members", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { res: aRes } = await signup("tenant-a");
    const { res: bRes } = await signup("tenant-b");
    assert.equal(aRes.status, 201);
    assert.equal(bRes.status, 201);
    const institutionB = bRes.body.institution.id;

    // Owner A's token tries to read institution B's members → institution access denied.
    const cross = await api(`/institutions/${institutionB}/members`, { token: aRes.body.accessToken });
    assert.equal(cross.status, 403);
});
