const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

// DB-8: a deletable (draft/cancelled) section that still owns child records
// must not be hard-deleted (would orphan them). Self-skips without Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "secdel-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "secdel-qr";
process.env.NODE_ENV = "test";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-secdel-test";

const sectionService = require("../src/services/sectionService");
const Institution = require("../src/models/Institution");
const Semester = require("../src/models/Semester");
const Subject = require("../src/models/Subject");
const Section = require("../src/models/Section");
const SectionSession = require("../src/models/SectionSession");

const oid = () => new mongoose.Types.ObjectId();
let dbReady = false;
const created = { institutions: [], semesters: [], subjects: [], sections: [], sessions: [] };

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
    await SectionSession.deleteMany({ _id: { $in: created.sessions } });
    await Section.deleteMany({ _id: { $in: created.sections } });
    await Subject.deleteMany({ _id: { $in: created.subjects } });
    await Semester.deleteMany({ _id: { $in: created.semesters } });
    await Institution.deleteMany({ _id: { $in: created.institutions } });
    await mongoose.disconnect();
});

async function makeSection(status) {
    const inst = await Institution.create({ name: "SecDel U", type: "university", ownerUserId: oid() });
    created.institutions.push(inst._id);
    const semester = await Semester.create({
        institutionId: inst._id, name: "Fall", startDate: new Date("2026-09-01"), endDate: new Date("2026-12-20"),
        teachingDays: ["Sunday"], weekCount: 15, status: "active", createdByUserId: oid(),
    });
    created.semesters.push(semester._id);
    const subject = await Subject.create({
        institutionId: inst._id, departmentId: oid(), name: "Algo", nameNormalized: "algo", code: "ALG",
        creditHours: 3, createdByUserId: oid(),
    });
    created.subjects.push(subject._id);
    const section = await Section.create({
        institutionId: inst._id, semesterId: semester._id, subjectId: subject._id, code: "SEC1",
        status, createdByUserId: oid(),
    });
    created.sections.push(section._id);
    return { inst, semester, subject, section };
}

test("DB-8: a cancelled section with a child session cannot be deleted (409)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { inst, section } = await makeSection("cancelled");
    const session = await SectionSession.create({
        institutionId: inst._id, sectionId: section._id, sessionDate: new Date("2026-09-06"),
        startTime: "09:00", endTime: "10:00", sessionType: "lecture", status: "scheduled", createdByUserId: oid(),
    });
    created.sessions.push(session._id);

    await assert.rejects(
        () => sectionService.deleteSection({ institutionId: inst._id, sectionId: section._id }),
        (err) => err.statusCode === 409
    );
    assert.ok(await Section.exists({ _id: section._id }));
});

test("DB-8: a draft section with no children deletes cleanly", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { inst, section } = await makeSection("draft");
    const result = await sectionService.deleteSection({ institutionId: inst._id, sectionId: section._id });
    assert.match(result.message, /deleted/i);
    assert.equal(await Section.exists({ _id: section._id }), null);
});
