const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

// Announcements domain: admin creates; members read audience-filtered. Self-skips
// without Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "annc-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "annc-qr";
process.env.NODE_ENV = "test";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-annc-test";

const announcementService = require("../src/services/announcementService");
const Announcement = require("../src/models/Announcement");

const oid = () => new mongoose.Types.ObjectId();
let dbReady = false;
let institutionId;

test.before(async () => {
    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
        dbReady = true;
        institutionId = oid();
    } catch {
        dbReady = false;
    }
});

test.after(async () => {
    if (!dbReady) return;
    await Announcement.deleteMany({ institutionId });
    await mongoose.disconnect();
});

const admin = { _id: oid(), role: "admin", status: "active" };
const student = { _id: oid(), role: "student", status: "active" };
const instructor = { _id: oid(), role: "instructor", status: "active" };

test("admin creates announcements; non-admin cannot", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { announcement } = await announcementService.createAnnouncement({
        institutionId,
        actorUserId: oid(),
        actorMembership: admin,
        payload: { title: "Welcome", body: "Term starts Sunday", audience: "all" },
    });
    assert.equal(announcement.title, "Welcome");
    assert.equal(announcement.audience, "all");

    await assert.rejects(
        () =>
            announcementService.createAnnouncement({
                institutionId,
                actorUserId: oid(),
                actorMembership: student,
                payload: { title: "Nope", body: "x" },
            }),
        (err) => err.statusCode === 403
    );
});

test("audience filtering: students see 'all' + 'student', not 'instructor'", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    await announcementService.createAnnouncement({
        institutionId, actorUserId: oid(), actorMembership: admin,
        payload: { title: "For students", body: "s", audience: "student" },
    });
    await announcementService.createAnnouncement({
        institutionId, actorUserId: oid(), actorMembership: admin,
        payload: { title: "For instructors", body: "i", audience: "instructor" },
    });

    const studentList = await announcementService.listAnnouncements({ institutionId, actorMembership: student });
    const titles = studentList.announcements.map((a) => a.title);
    assert.ok(titles.includes("For students"));
    assert.ok(titles.includes("Welcome")); // audience "all"
    assert.ok(!titles.includes("For instructors"));

    const instructorList = await announcementService.listAnnouncements({ institutionId, actorMembership: instructor });
    const instTitles = instructorList.announcements.map((a) => a.title);
    assert.ok(instTitles.includes("For instructors"));
    assert.ok(!instTitles.includes("For students"));
});

test("admin updates and deletes an announcement", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const { announcement } = await announcementService.createAnnouncement({
        institutionId, actorUserId: oid(), actorMembership: admin,
        payload: { title: "Draft", body: "b" },
    });
    const updated = await announcementService.updateAnnouncement({
        institutionId, announcementId: announcement.id, actorMembership: admin,
        payload: { title: "Edited" },
    });
    assert.equal(updated.announcement.title, "Edited");

    const del = await announcementService.deleteAnnouncement({
        institutionId, announcementId: announcement.id, actorMembership: admin,
    });
    assert.match(del.message, /deleted/i);
    assert.equal(await Announcement.findById(announcement.id), null);
});

test("validation: title and body required", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    await assert.rejects(
        () => announcementService.createAnnouncement({ institutionId, actorUserId: oid(), actorMembership: admin, payload: { body: "no title" } }),
        (err) => err.statusCode === 400
    );
});
