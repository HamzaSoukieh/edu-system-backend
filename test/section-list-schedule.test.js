const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

// IM-9: section list items must expose schedule + a derived room (not just
// scheduleCount) so the frontend can render room/schedule without a detail
// fetch. Self-skips without Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "seclist-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "seclist-qr";
process.env.NODE_ENV = "test";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-seclist-test";

const sectionService = require("../src/services/sectionService");
const Institution = require("../src/models/Institution");
const Semester = require("../src/models/Semester");
const Subject = require("../src/models/Subject");
const Section = require("../src/models/Section");

const oid = () => new mongoose.Types.ObjectId();
let dbReady = false;
const created = { institutions: [], semesters: [], subjects: [], sections: [] };

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
    await Semester.deleteMany({ _id: { $in: created.semesters } });
    await Institution.deleteMany({ _id: { $in: created.institutions } });
    await mongoose.disconnect();
});

test("IM-9: listed sections carry schedule + derived room", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const inst = await Institution.create({ name: "Sched U", type: "university", ownerUserId: oid() });
    created.institutions.push(inst._id);
    const semester = await Semester.create({
        institutionId: inst._id, name: "Fall", startDate: new Date("2026-09-01"), endDate: new Date("2026-12-20"),
        teachingDays: ["Sunday", "Monday"], weekCount: 15, status: "active", createdByUserId: oid(),
    });
    created.semesters.push(semester._id);
    const subject = await Subject.create({
        institutionId: inst._id, departmentId: oid(), name: "Algo", nameNormalized: "algo", code: "ALG",
        creditHours: 3, createdByUserId: oid(),
    });
    created.subjects.push(subject._id);

    const section = await Section.create({
        institutionId: inst._id, semesterId: semester._id, subjectId: subject._id, code: "SEC1",
        schedule: [{ sessionType: "lecture", day: "sunday", startTime: "09:00", endTime: "10:30", room: "B204" }],
        status: "active", createdByUserId: oid(),
    });
    created.sections.push(section._id);

    const { sections } = await sectionService.listSections({
        institutionId: inst._id,
        query: {},
        actorMembership: {
            _id: oid(),
            userId: inst.ownerUserId,
            institutionId: inst._id,
            role: "admin",
            status: "active",
        },
    });

    const listed = sections.find((s) => s.id === section._id.toString());
    assert.ok(listed, "section present in list");
    assert.equal(listed.scheduleCount, 1);
    assert.equal(listed.room, "B204");
    assert.equal(listed.schedule[0].startTime, "09:00");
    assert.equal(listed.schedule[0].day, "sunday");
});
