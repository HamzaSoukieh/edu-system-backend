const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

// Integration tests for referential-integrity delete guards (DB-2, DB-7). Self-skip w/o Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "delguard-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "delguard-qr";
process.env.NODE_ENV = "test";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-delguard-test";

const semesterService = require("../src/services/semesterService");
const departmentService = require("../src/services/departmentService");
const Institution = require("../src/models/Institution");
const Semester = require("../src/models/Semester");
const Department = require("../src/models/Department");
const Subject = require("../src/models/Subject");
const Section = require("../src/models/Section");

const oid = () => new mongoose.Types.ObjectId();
let dbReady = false;
const created = { institutions: [], semesters: [], departments: [], subjects: [], sections: [] };

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
    await Section.deleteMany({ _id: { $in: created.sections } });
    await Subject.deleteMany({ _id: { $in: created.subjects } });
    await Department.deleteMany({ _id: { $in: created.departments } });
    await Semester.deleteMany({ _id: { $in: created.semesters } });
    await Institution.deleteMany({ _id: { $in: created.institutions } });
    await mongoose.disconnect();
});

async function makeUniversity() {
    const inst = await Institution.create({ name: "DelGuard U", type: "university", ownerUserId: oid() });
    created.institutions.push(inst._id);
    return inst._id;
}

test("DB-7: a semester with linked sections cannot be deleted, even when archived (409)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const institutionId = await makeUniversity();
    const userId = oid();

    const semester = await Semester.create({
        institutionId,
        name: "Fall",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-12-20"),
        teachingDays: ["Sunday", "Monday"],
        weekCount: 15,
        status: "archived", // archived — the old bug bypassed the guard here
        createdByUserId: userId,
    });
    created.semesters.push(semester._id);

    const subject = await Subject.create({
        institutionId, name: "S", nameNormalized: "s", code: "S1", createdByUserId: userId,
    });
    created.subjects.push(subject._id);

    const section = await Section.create({
        institutionId, semesterId: semester._id, subjectId: subject._id, code: "SEC1", createdByUserId: userId,
    });
    created.sections.push(section._id);

    await assert.rejects(
        () => semesterService.deleteSemester({ institutionId, semesterId: semester._id }),
        (err) => err.statusCode === 409
    );
    // Semester must still exist.
    assert.ok(await Semester.exists({ _id: semester._id }));
});

test("DB-2: a department whose subjects are used by sections cannot be deleted (409)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const institutionId = await makeUniversity();
    const userId = oid();

    const department = await Department.create({
        institutionId, name: "Eng", nameNormalized: "eng", code: "ENG", status: "archived", createdByUserId: userId,
    });
    created.departments.push(department._id);

    const subject = await Subject.create({
        institutionId, departmentId: department._id, name: "Algo", nameNormalized: "algo", code: "ALGO",
        creditHours: 3, createdByUserId: userId,
    });
    created.subjects.push(subject._id);

    const semester = await Semester.create({
        institutionId, name: "Spring", startDate: new Date("2027-01-01"), endDate: new Date("2027-05-01"),
        teachingDays: ["Sunday"], weekCount: 15, status: "active", createdByUserId: userId,
    });
    created.semesters.push(semester._id);

    const section = await Section.create({
        institutionId, semesterId: semester._id, subjectId: subject._id, code: "SEC2", createdByUserId: userId,
    });
    created.sections.push(section._id);

    await assert.rejects(
        () => departmentService.deleteDepartment({ institutionId, departmentId: department._id }),
        (err) => err.statusCode === 409
    );
    // Department AND its subject must still exist (no orphaning cascade ran).
    assert.ok(await Department.exists({ _id: department._id }));
    assert.ok(await Subject.exists({ _id: subject._id }));
});

test("DB-2: an archived department with no section-referenced subjects deletes cleanly", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const institutionId = await makeUniversity();
    const userId = oid();

    const department = await Department.create({
        institutionId, name: "History", nameNormalized: "history", code: "HIST", status: "archived", createdByUserId: userId,
    });
    const subject = await Subject.create({
        institutionId, departmentId: department._id, name: "Rome", nameNormalized: "rome", code: "ROME",
        creditHours: 3, createdByUserId: userId,
    });

    const result = await departmentService.deleteDepartment({ institutionId, departmentId: department._id });
    assert.match(result.message, /deleted/i);
    assert.equal(await Department.exists({ _id: department._id }), null);
    assert.equal(await Subject.exists({ _id: subject._id }), null); // dependent subjects cascaded
});
