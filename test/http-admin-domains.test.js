const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

// HTTP-level integration for the admin/registrar domains wired to the frontend
// this cycle: academic-years lifecycle and responsibility assignments (IM-4).
// Boots the real app and drives it over HTTP. Self-skips without Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "httpadmin-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "httpadmin-qr";
process.env.NODE_ENV = "test";
process.env.EMAIL_QUEUE_ENABLED = "false";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-httpadmin-test";

const app = require("../src/app");
const User = require("../src/models/User");
const Institution = require("../src/models/Institution");
const Membership = require("../src/models/Membership");
const MemberProfile = require("../src/models/MemberProfile");
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
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, body: json };
}

// Create a verified admin owner + institution and return a usable token.
async function adminContext(seed) {
    const email = `httpadmin-${seed}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
    createdEmails.push(email);
    const signup = await api("/auth/signup", {
        method: "POST",
        body: {
            email,
            password: "Password123!",
            confirmPassword: "Password123!",
            institutionName: `HTTP Admin ${seed}`,
            institutionType: "university",
        },
    });
    assert.equal(signup.status, 201, JSON.stringify(signup.body));
    await User.updateOne({ email }, { $set: { isEmailVerified: true } });
    const login = await api("/auth/login", { method: "POST", body: { email, password: "Password123!" } });
    assert.equal(login.status, 200);
    return { token: login.body.accessToken, institutionId: signup.body.institution.id };
}

// Insert a member (User+Membership+Profile) directly, bypassing billing seat
// checks, so we have a target userId for responsibility assignment.
async function seedMember(institutionId, role = "instructor") {
    const email = `member-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
    createdEmails.push(email);
    const user = await User.create({
        email,
        passwordHash: await bcrypt.hash("Password123!", 10),
        isEmailVerified: true,
        status: "active",
    });
    const membership = await Membership.create({ userId: user._id, institutionId, role, status: "active" });
    await MemberProfile.create({
        membershipId: membership._id,
        userId: user._id,
        institutionId,
        firstName: "Seed",
        lastName: "Member",
        fullName: "Seed Member",
        fullNameNormalized: "seed member",
        nationalNumber: `SM${Date.now()}${Math.floor(Math.random() * 1000)}`,
    });
    return { userId: user._id.toString() };
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
                await MemberProfile.deleteMany({ userId: user._id });
                await Membership.deleteMany({ userId: user._id });
                await Institution.deleteMany({ ownerUserId: user._id });
                await OtpCode.deleteMany({ userId: user._id });
                await User.deleteOne({ _id: user._id });
            }
        }
        await mongoose.disconnect();
    }
});

test("academic-years: create → list → activate over HTTP", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { token, institutionId } = await adminContext("years");
    const b = `/institutions/${institutionId}/academic-years`;

    const created = await api(b, {
        method: "POST",
        token,
        body: { name: "2030 / 2031", startDate: "2030-09-01", endDate: "2031-06-30", status: "draft" },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const yearId = created.body.academicYear?.id || created.body.id;
    assert.ok(yearId);

    const list = await api(b, { token });
    assert.equal(list.status, 200);
    assert.ok(list.body.academicYears.some((y) => y.id === yearId));

    const activated = await api(`${b}/${yearId}`, { method: "PATCH", token, body: { status: "active" } });
    assert.equal(activated.status, 200);
    const year = activated.body.academicYear || activated.body;
    assert.equal(year.status, "active");
});

test("responsibilities: assign president → list → deactivate over HTTP (IM-4)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { token, institutionId } = await adminContext("resp");
    const { userId } = await seedMember(institutionId, "instructor");
    const b = `/institutions/${institutionId}/responsibility-assignments`;

    const created = await api(b, {
        method: "POST",
        token,
        body: { userId, responsibilityType: "president", scopeType: "institution", scopeId: institutionId },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const assignmentId = created.body.responsibilityAssignment?.id || created.body.id;
    assert.ok(assignmentId);

    const list = await api(b, { token });
    assert.equal(list.status, 200);
    assert.ok(list.body.responsibilityAssignments.some((a) => a.id === assignmentId));

    const deactivated = await api(`${b}/${assignmentId}/deactivate`, { method: "PATCH", token });
    assert.equal(deactivated.status, 200);
});

test("registrar reads: oversight risk-summary, university standing, and policies over HTTP", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { token, institutionId } = await adminContext("reads");

    const oversight = await api(`/institutions/${institutionId}/academic-oversight/risk-summary`, { token });
    assert.equal(oversight.status, 200);
    assert.ok(oversight.body.academicRiskSummary);

    const standing = await api(`/institutions/${institutionId}/academic-standing/university/summary`, { token });
    assert.equal(standing.status, 200);
    assert.ok(standing.body.standingSummary);

    const policies = await api(`/institutions/${institutionId}/academic-policies`, { token });
    assert.equal(policies.status, 200);
    assert.ok(Array.isArray(policies.body.academicPolicies));
});

test("tenant isolation: owner A cannot create an academic-year in institution B over HTTP", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const a = await adminContext("iso-a");
    const b = await adminContext("iso-b");

    const cross = await api(`/institutions/${b.institutionId}/academic-years`, {
        method: "POST",
        token: a.token,
        body: { name: "2040 / 2041", startDate: "2040-09-01", endDate: "2041-06-30", status: "draft" },
    });
    assert.equal(cross.status, 403);
});
