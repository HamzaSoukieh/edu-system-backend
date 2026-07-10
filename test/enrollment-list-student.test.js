const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

// Enrollment list items should carry a { fullName, email } student summary so
// roster views resolve names without a second query. Self-skips without Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "enrlist-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "enrlist-qr";
process.env.NODE_ENV = "test";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-enrlist-test";

const enrollmentService = require("../src/services/enrollmentService");
const Institution = require("../src/models/Institution");
const Semester = require("../src/models/Semester");
const Subject = require("../src/models/Subject");
const Section = require("../src/models/Section");
const Enrollment = require("../src/models/Enrollment");
const User = require("../src/models/User");
const Membership = require("../src/models/Membership");
const MemberProfile = require("../src/models/MemberProfile");

const oid = () => new mongoose.Types.ObjectId();
let dbReady = false;
const created = { ids: [] };

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

test("listEnrollments attaches a { fullName, email } student summary", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const inst = await Institution.create({ name: "Enr U", type: "university", ownerUserId: oid() });
    const semester = await Semester.create({
        institutionId: inst._id, name: "Fall", startDate: new Date("2026-09-01"), endDate: new Date("2026-12-20"),
        teachingDays: ["Sunday"], weekCount: 15, status: "active", createdByUserId: oid(),
    });
    const subject = await Subject.create({
        institutionId: inst._id, departmentId: oid(), name: "Algo", nameNormalized: "algo", code: "ALG",
        creditHours: 3, createdByUserId: oid(),
    });
    const section = await Section.create({
        institutionId: inst._id, semesterId: semester._id, subjectId: subject._id, code: "SEC1",
        status: "active", createdByUserId: oid(),
    });

    const user = await User.create({
        email: `enr-${Date.now()}@example.test`, passwordHash: "x", status: "active", isEmailVerified: true,
    });
    const membership = await Membership.create({
        institutionId: inst._id, userId: user._id, role: "student", status: "active",
    });
    await MemberProfile.create({
        institutionId: inst._id, membershipId: membership._id, userId: user._id,
        firstName: "Sam", lastName: "Student", fullName: "Sam Student", fullNameNormalized: "sam student",
        nationalNumber: `N${Date.now()}`,
    });
    const enrollment = await Enrollment.create({
        institutionId: inst._id, sectionId: section._id, studentMemberId: membership._id, status: "enrolled",
        createdByUserId: oid(),
    });

    try {
        const { enrollments } = await enrollmentService.listEnrollments({
            institutionId: inst._id,
            sectionId: section._id,
        });
        const row = enrollments.find((e) => e.id === enrollment._id.toString());
        assert.ok(row, "enrollment present");
        assert.equal(row.student.fullName, "Sam Student");
        assert.equal(row.student.email, user.email);
    } finally {
        await Enrollment.deleteMany({ institutionId: inst._id });
        await MemberProfile.deleteMany({ institutionId: inst._id });
        await Membership.deleteMany({ institutionId: inst._id });
        await User.deleteOne({ _id: user._id });
        await Section.deleteMany({ institutionId: inst._id });
        await Subject.deleteMany({ institutionId: inst._id });
        await Semester.deleteMany({ institutionId: inst._id });
        await Institution.deleteOne({ _id: inst._id });
    }
});
