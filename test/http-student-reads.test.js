const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

// HTTP-level integration for the student-facing reads wired to the frontend this
// cycle: /students/me/results, /students/me/attendance-history, and
// /students/me/academic-profile. Verifies a student can read their own data over
// the real request pipeline. Self-skips without Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "httpstudent-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "httpstudent-qr";
process.env.NODE_ENV = "test";
process.env.EMAIL_QUEUE_ENABLED = "false";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-httpstudent-test";

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

async function adminContext(seed) {
    const email = `httpstudent-${seed}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
    createdEmails.push(email);
    const signup = await api("/auth/signup", {
        method: "POST",
        body: {
            email,
            password: "Password123!",
            confirmPassword: "Password123!",
            institutionName: `HTTP Student ${seed}`,
            institutionType: "university",
        },
    });
    assert.equal(signup.status, 201, JSON.stringify(signup.body));
    await User.updateOne({ email }, { $set: { isEmailVerified: true } });
    return { institutionId: signup.body.institution.id };
}

// Seed a verified student with a known password so we can log in as them.
async function seedStudent(institutionId) {
    const email = `student-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
    createdEmails.push(email);
    const user = await User.create({
        email,
        passwordHash: await bcrypt.hash("Password123!", 10),
        isEmailVerified: true,
        status: "active",
    });
    const membership = await Membership.create({ userId: user._id, institutionId, role: "student", status: "active" });
    await MemberProfile.create({
        membershipId: membership._id,
        userId: user._id,
        institutionId,
        firstName: "Stu",
        lastName: "Dent",
        fullName: "Stu Dent",
        fullNameNormalized: "stu dent",
        nationalNumber: `ST${Date.now()}${Math.floor(Math.random() * 1000)}`,
    });
    return { email };
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

test("a student reads their own results / attendance-history / academic-profile over HTTP", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { institutionId } = await adminContext("reads");
    const { email } = await seedStudent(institutionId);

    const login = await api("/auth/login", { method: "POST", body: { email, password: "Password123!" } });
    assert.equal(login.status, 200);
    const token = login.body.accessToken;
    const b = `/institutions/${institutionId}/students/me`;

    const results = await api(`${b}/results`, { token });
    assert.equal(results.status, 200);
    assert.ok(Array.isArray(results.body.myResults));

    const attendance = await api(`${b}/attendance-history`, { token });
    assert.equal(attendance.status, 200);
    assert.ok(Array.isArray(attendance.body.attendanceHistory));

    const profile = await api(`${b}/academic-profile`, { token });
    assert.equal(profile.status, 200);
    assert.ok(profile.body.academicProfile);
    assert.ok(profile.body.academicProfile.summary);
});

test("a student is denied the admin members list (403) over HTTP", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { institutionId } = await adminContext("student-rbac");
    const { email } = await seedStudent(institutionId);
    const login = await api("/auth/login", { method: "POST", body: { email, password: "Password123!" } });
    assert.equal(login.status, 200);

    const members = await api(`/institutions/${institutionId}/members`, { token: login.body.accessToken });
    assert.equal(members.status, 403);
});
