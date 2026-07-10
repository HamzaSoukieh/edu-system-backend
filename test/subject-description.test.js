const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const mongoose = require("mongoose");

// IM-8: subject `description` must be persisted (school + university) and
// returned, and validated for length. Self-skips without Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "subjdesc-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "subjdesc-qr";
process.env.NODE_ENV = "test";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-subjdesc-test";

const subjectService = require("../src/services/subjectService");
const Institution = require("../src/models/Institution");
const ClassLevel = require("../src/models/ClassLevel");
const Department = require("../src/models/Department");
const Subject = require("../src/models/Subject");

const oid = () => new mongoose.Types.ObjectId();
let dbReady = false;
const created = { institutions: [], classLevels: [], departments: [], subjects: [] };

test.before(async () => {
    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
        dbReady = true;
    } catch {
        dbReady = false;
    }
});

test.after(async () => {
    if (!dbReady) return;
    await Subject.deleteMany({ _id: { $in: created.subjects } });
    await ClassLevel.deleteMany({ _id: { $in: created.classLevels } });
    await Department.deleteMany({ _id: { $in: created.departments } });
    await Institution.deleteMany({ _id: { $in: created.institutions } });
    await mongoose.disconnect();
});

test("IM-8: school subject create persists and returns description", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const school = await Institution.create({ name: "Desc School", type: "school", ownerUserId: oid() });
    created.institutions.push(school._id);
    const classLevel = await ClassLevel.create({
        institutionId: school._id, name: "Grade 1", nameNormalized: "grade 1", code: "GRADE-1", createdByUserId: oid(),
    });
    created.classLevels.push(classLevel._id);

    const { subject } = await subjectService.createSubject({
        institutionId: school._id,
        classLevelId: classLevel._id,
        createdByUserId: oid(),
        payload: { name: "Reading", code: "READ", description: "Intro to reading" },
    });
    created.subjects.push(subject.id);

    assert.equal(subject.description, "Intro to reading");
    const stored = await Subject.findById(subject.id).lean();
    assert.equal(stored.description, "Intro to reading");
});

test("IM-8: university subject description round-trips and updates", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const uni = await Institution.create({ name: "Desc U", type: "university", ownerUserId: oid() });
    created.institutions.push(uni._id);
    const dept = await Department.create({
        institutionId: uni._id, name: "CS", nameNormalized: "cs", code: "CS", createdByUserId: oid(),
    });
    created.departments.push(dept._id);

    const { subject } = await subjectService.createSubject({
        institutionId: uni._id,
        departmentId: dept._id,
        createdByUserId: oid(),
        payload: { name: "Algorithms", code: "ALG", creditHours: 3, description: "Big-O and friends" },
    });
    created.subjects.push(subject.id);
    assert.equal(subject.description, "Big-O and friends");

    const updated = await subjectService.updateSubject({
        institutionId: uni._id,
        subjectId: subject.id,
        payload: { description: "Updated desc" },
    });
    assert.equal(updated.subject.description, "Updated desc");
});

test("IM-8: over-long description is rejected (400)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const uni = await Institution.create({ name: "Desc U2", type: "university", ownerUserId: oid() });
    created.institutions.push(uni._id);
    const dept = await Department.create({
        institutionId: uni._id, name: "Math", nameNormalized: "math", code: "MATH", createdByUserId: oid(),
    });
    created.departments.push(dept._id);

    await assert.rejects(
        () =>
            subjectService.createSubject({
                institutionId: uni._id,
                departmentId: dept._id,
                createdByUserId: oid(),
                payload: { name: "Calc", code: "CALC", creditHours: 3, description: "x".repeat(1001) },
            }),
        (err) => err.statusCode === 400
    );
});
