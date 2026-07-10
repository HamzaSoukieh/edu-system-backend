const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

// DB-1: createAssessment writes the Assessment + one AssessmentResult per
// enrolled student atomically. On a replica set, a failure seeding the results
// must leave NO Assessment behind. Self-skips without Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "asmtx-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "asmtx-qr";
process.env.NODE_ENV = "test";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-asmtx-test";

const assessmentService = require("../src/services/assessmentService");
const Institution = require("../src/models/Institution");
const Semester = require("../src/models/Semester");
const Subject = require("../src/models/Subject");
const Section = require("../src/models/Section");
const Enrollment = require("../src/models/Enrollment");
const Assessment = require("../src/models/Assessment");
const AssessmentResult = require("../src/models/AssessmentResult");

const oid = () => new mongoose.Types.ObjectId();
let dbReady = false;
let isReplicaSet = false;
const created = { institutions: [] };

test.before(async () => {
    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
        dbReady = true;
        try {
            const status = await mongoose.connection.db.admin().command({ hello: 1 });
            isReplicaSet = Boolean(status.setName);
        } catch {
            isReplicaSet = false;
        }
    } catch {
        dbReady = false;
    }
});

test.after(async () => {
    if (!dbReady) return;
    for (const institutionId of created.institutions) {
        await AssessmentResult.deleteMany({ institutionId });
        await Assessment.deleteMany({ institutionId });
        await Enrollment.deleteMany({ institutionId });
        await Section.deleteMany({ institutionId });
        await Subject.deleteMany({ institutionId });
        await Semester.deleteMany({ institutionId });
        await Institution.deleteOne({ _id: institutionId });
    }
    await mongoose.disconnect();
});

async function buildSectionWithStudents(studentCount) {
    const ownerUserId = oid();
    const inst = await Institution.create({ name: "Asmt U", type: "university", ownerUserId });
    created.institutions.push(inst._id);
    const semester = await Semester.create({
        institutionId: inst._id, name: "Fall", startDate: new Date("2026-09-01"), endDate: new Date("2026-12-20"),
        teachingDays: ["Sunday"], weekCount: 15, status: "active", createdByUserId: ownerUserId,
    });
    const subject = await Subject.create({
        institutionId: inst._id, departmentId: oid(), name: "Algo", nameNormalized: "algo", code: "ALG",
        creditHours: 3, createdByUserId: ownerUserId,
    });
    const section = await Section.create({
        institutionId: inst._id, semesterId: semester._id, subjectId: subject._id, code: "SEC1",
        status: "active", createdByUserId: ownerUserId,
    });
    for (let i = 0; i < studentCount; i += 1) {
        await Enrollment.create({
            institutionId: inst._id, sectionId: section._id, studentMemberId: oid(), status: "enrolled",
            createdByUserId: ownerUserId,
        });
    }
    return { institutionId: inst._id, sectionId: section._id, ownerUserId };
}

const actor = (userId) => ({ actorUserId: userId, actorMembership: { _id: oid(), userId, role: "admin", status: "active" } });

test("createAssessment persists the assessment + one result per enrolled student", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { institutionId, sectionId, ownerUserId } = await buildSectionWithStudents(3);
    const { assessment } = await assessmentService.createAssessment({
        institutionId,
        sectionId,
        ...actor(ownerUserId),
        payload: { title: "Midterm", type: "midterm", assessmentDate: "2026-10-01", maxScore: 100, weight: 40 },
    });
    assert.ok(assessment.id);
    const resultCount = await AssessmentResult.countDocuments({ assessmentId: assessment.id });
    assert.equal(resultCount, 3);
});

test("a failure seeding results rolls back the assessment (replica set)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    if (!isReplicaSet) return t.skip("standalone mongo: no transaction rollback");
    const { institutionId, sectionId, ownerUserId } = await buildSectionWithStudents(2);

    const originalInsertMany = AssessmentResult.insertMany;
    AssessmentResult.insertMany = async () => {
        throw new Error("injected result seeding failure");
    };
    try {
        await assert.rejects(
            () =>
                assessmentService.createAssessment({
                    institutionId,
                    sectionId,
                    ...actor(ownerUserId),
                    payload: { title: "Broken", type: "midterm", assessmentDate: "2026-10-01", maxScore: 100, weight: 40 },
                }),
            /injected result seeding failure/
        );
        const leaked = await Assessment.countDocuments({ institutionId, title: "Broken" });
        assert.equal(leaked, 0, "assessment should have been rolled back");
    } finally {
        AssessmentResult.insertMany = originalInsertMany;
    }
});
