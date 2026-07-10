const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

// DB-3: at most one ACTIVE SchoolAcademicPolicy per (institution, year, class
// level). Self-skips without Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "schoolpol-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "schoolpol-qr";
process.env.NODE_ENV = "test";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-schoolpol-test";

const SchoolAcademicPolicy = require("../src/models/SchoolAcademicPolicy");

const oid = () => new mongoose.Types.ObjectId();
let dbReady = false;
const created = [];

function buildPolicy({ institutionId, academicYearId, classLevelId, status }) {
    return {
        institutionId,
        name: "Promotion Policy",
        status,
        appliesTo: { academicYearId, classLevelId },
        gradingRules: { gradingMode: "percentage", scaleMax: 100, subjectPassMinPercentage: 50, yearPassMinPercentage: 50 },
        aggregationRules: { yearCalculationMethod: "weighted_semesters", semesterWeights: [] },
        promotionRules: { passDecision: "promoted", failDecision: "repeat_year" },
        audit: { createdBy: oid(), updatedBy: oid() },
    };
}

test.before(async () => {
    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
        dbReady = true;
        // Ensure the new partial-unique index exists on this collection.
        await SchoolAcademicPolicy.syncIndexes();
    } catch {
        dbReady = false;
    }
});

test.after(async () => {
    if (!dbReady) return;
    await SchoolAcademicPolicy.deleteMany({ _id: { $in: created } });
    await mongoose.disconnect();
});

test("two ACTIVE school policies for the same year+level cannot coexist", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const institutionId = oid();
    const academicYearId = oid();
    const classLevelId = oid();

    const first = await SchoolAcademicPolicy.create(
        buildPolicy({ institutionId, academicYearId, classLevelId, status: "active" })
    );
    created.push(first._id);

    await assert.rejects(
        () =>
            SchoolAcademicPolicy.create(
                buildPolicy({ institutionId, academicYearId, classLevelId, status: "active" })
            ),
        (err) => err && err.code === 11000
    );
});

test("a draft + an active policy for the same year+level is allowed", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const institutionId = oid();
    const academicYearId = oid();
    const classLevelId = oid();

    const active = await SchoolAcademicPolicy.create(
        buildPolicy({ institutionId, academicYearId, classLevelId, status: "active" })
    );
    created.push(active._id);
    // The partial index only covers status: "active", so a draft is fine.
    const draft = await SchoolAcademicPolicy.create(
        buildPolicy({ institutionId, academicYearId, classLevelId, status: "draft" })
    );
    created.push(draft._id);
    assert.ok(draft._id);
});
