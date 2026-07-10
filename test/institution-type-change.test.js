const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const mongoose = require("mongoose");

// Integration tests for the institution-type contract (IM-1 / D-004). Self-skip w/o Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "insttype-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "insttype-qr";
process.env.NODE_ENV = "test";
process.env.EMAIL_QUEUE_ENABLED = "false";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-insttype-test";

const authService = require("../src/services/authService");
const institutionService = require("../src/services/institutionService");
const User = require("../src/models/User");
const Institution = require("../src/models/Institution");
const Membership = require("../src/models/Membership");
const AcademicYear = require("../src/models/AcademicYear");

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

async function newOwner(type) {
    const email = `insttype-${crypto.randomBytes(4).toString("hex")}@example.test`;
    const res = await authService.signup({
        email,
        password: "Password123!",
        confirmPassword: "Password123!",
        institutionName: "Type Co",
        institutionType: type,
    });
    const inst = await Institution.findOne({ ownerUserId: res.user.id }).lean();
    return { email, userId: res.user.id, institutionId: inst._id };
}

async function cleanup(userId, institutionId) {
    await AcademicYear.deleteMany({ institutionId });
    await Membership.deleteMany({ userId });
    await Institution.deleteMany({ _id: institutionId });
    await User.deleteOne({ _id: userId });
}

test("signup honors the chosen institution type", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const owner = await newOwner("university");
    try {
        const inst = await Institution.findById(owner.institutionId).lean();
        assert.equal(inst.type, "university");
    } finally {
        await cleanup(owner.userId, owner.institutionId);
    }
});

test("type can be changed while the institution has no academic structure", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const owner = await newOwner("school");
    try {
        const result = await institutionService.updateInstitution(owner.institutionId, {
            type: "university",
        });
        assert.equal(result.institution.type, "university");
    } finally {
        await cleanup(owner.userId, owner.institutionId);
    }
});

test("type change is rejected (409) once academic structure exists", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const owner = await newOwner("university");
    try {
        // Create type-specific structure.
        await AcademicYear.create({
            institutionId: owner.institutionId,
            name: "2026-2027",
            nameNormalized: "2026-2027",
            startDate: new Date("2026-09-01"),
            endDate: new Date("2027-06-30"),
            status: "draft",
        });

        await assert.rejects(
            () => institutionService.updateInstitution(owner.institutionId, { type: "school" }),
            (err) => err.statusCode === 409
        );

        // Unchanged type is a harmless no-op even with data present.
        const same = await institutionService.updateInstitution(owner.institutionId, {
            type: "university",
            name: "Renamed Co",
        });
        assert.equal(same.institution.type, "university");
        assert.equal(same.institution.name, "Renamed Co");
    } finally {
        await cleanup(owner.userId, owner.institutionId);
    }
});

test("an invalid type value is rejected (400)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const owner = await newOwner("school");
    try {
        await assert.rejects(
            () => institutionService.updateInstitution(owner.institutionId, { type: "college" }),
            (err) => err.statusCode === 400
        );
    } finally {
        await cleanup(owner.userId, owner.institutionId);
    }
});
