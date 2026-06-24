const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Assessment = require("../src/models/Assessment");
const AssessmentResult = require("../src/models/AssessmentResult");
const Enrollment = require("../src/models/Enrollment");
const Homework = require("../src/models/Homework");
const Membership = require("../src/models/Membership");
const Section = require("../src/models/Section");
const SectionSession = require("../src/models/SectionSession");
const Subject = require("../src/models/Subject");
const User = require("../src/models/User");
const authService = require("../src/services/authService");
const emailService = require("../src/services/emailService");
const emailQueue = require("../src/queues/emailQueue");
const { EMAIL_JOB_TYPES } = require("../src/queues/emailQueueNames");
const { processEmailJob } = require("../src/workers/emailJobProcessor");
const emailWorker = require("../src/workers/emailWorker");

const institutionId = "507f1f77bcf86cd799439011";
const homeworkId = "507f1f77bcf86cd799439012";
const membershipId = "507f1f77bcf86cd799439013";
const sectionId = "507f1f77bcf86cd799439014";
const subjectId = "507f1f77bcf86cd799439015";
const userId = "507f1f77bcf86cd799439016";
const assessmentId = "507f1f77bcf86cd799439018";
const assessmentResultId = "507f1f77bcf86cd799439019";
const sessionId = "507f1f77bcf86cd799439020";

function query(result) {
    return { select() { return this; }, lean: async () => result };
}

test.afterEach(async () => {
    delete process.env.EMAIL_QUEUE_ENABLED;
    delete process.env.EMAIL_WORKER_CONCURRENCY;
    await emailQueue.closeEmailQueue();
    emailQueue.setQueueFactoryForTests((name, options) => {
        const { Queue } = require("bullmq");
        return new Queue(name, options);
    });
});

test("email job payload validation trims fields and rejects unsafe payloads", () => {
    const sanitized = emailQueue.sanitizeEmailJobPayload({
        institutionId: ` ${institutionId} `,
        entityId: ` ${homeworkId} `,
        recipientMembershipId: ` ${membershipId} `,
        emailType: ` ${EMAIL_JOB_TYPES.HOMEWORK_ASSIGNED} `,
        notificationId: " notification-1 ",
    });

    assert.deepEqual(sanitized, {
        institutionId,
        entityId: homeworkId,
        recipientMembershipId: membershipId,
        emailType: EMAIL_JOB_TYPES.HOMEWORK_ASSIGNED,
        notificationId: "notification-1",
    });
    assert.throws(
        () => emailQueue.sanitizeEmailJobPayload({ ...sanitized, entityId: "   " }),
        /Email job IDs are required/
    );
    assert.throws(
        () => emailQueue.sanitizeEmailJobPayload({ ...sanitized, notificationId: "   " }),
        /notificationId must not be empty/
    );
    assert.throws(
        () => emailQueue.sanitizeEmailJobPayload({ ...sanitized, privateDocument: { title: "secret" } }),
        /Unsupported email job payload field/
    );
    assert.throws(
        () => emailQueue.sanitizeEmailJobPayload({ ...sanitized, emailType: "unknown" }),
        /Unsupported email job type/
    );
});

test("redis connection options validate protocol, port, and database path", () => {
    assert.deepEqual(
        emailQueue.getRedisConnectionOptions("redis://user:pass@localhost:6380/2", 1),
        {
            host: "localhost",
            port: 6380,
            username: "user",
            password: "pass",
            db: 2,
            maxRetriesPerRequest: 1,
            connectTimeout: 5000,
        }
    );
    assert.equal(emailQueue.getRedisConnectionOptions("rediss://cache.example.com:6380/0", null).tls instanceof Object, true);
    assert.throws(() => emailQueue.getRedisConnectionOptions("http://localhost:6379"), /redis:\/\/ or rediss:\/\//);
    assert.throws(() => emailQueue.getRedisConnectionOptions("redis://localhost:0"), /port/);
    assert.throws(() => emailQueue.getRedisConnectionOptions("redis://localhost:65536"), /valid port/);
    assert.throws(() => emailQueue.getRedisConnectionOptions("redis://localhost:6379/-1"), /database path/);
    assert.throws(() => emailQueue.getRedisConnectionOptions("redis://localhost:6379/1.5"), /database path/);
    assert.throws(() => emailQueue.getRedisConnectionOptions("redis://localhost:6379/abc"), /database path/);
});

test("email queue uses deterministic IDs and stores only allowlisted ID fields", async () => {
    process.env.EMAIL_QUEUE_ENABLED = "true";
    const added = [];
    emailQueue.setQueueFactoryForTests(() => ({
        async add(name, data, options) { added.push({ name, data, options }); },
        async close() {},
    }));

    const payload = {
        institutionId,
        entityId: homeworkId,
        recipientMembershipId: membershipId,
        emailType: EMAIL_JOB_TYPES.HOMEWORK_ASSIGNED,
    };
    const result = await emailQueue.enqueueEmailJob(payload);

    assert.equal(result.jobId, `homework-assigned~${institutionId}~${homeworkId}~${membershipId}`);
    assert.equal(emailQueue.buildEmailJobId(payload), result.jobId);
    assert.equal(result.jobId.includes(":"), false);
    assert.equal(result.jobId.includes("~"), true);
    assert.deepEqual(added[0].data, payload);
    assert.deepEqual(Object.keys(added[0].data).sort(), [
        "emailType", "entityId", "institutionId", "recipientMembershipId",
    ]);
    await assert.rejects(
        emailQueue.enqueueEmailJob({ ...payload, homework: { title: "private document" } }),
        /Unsupported email job payload field/
    );
});

test("email producer skips when disabled and contains enqueue failures", async (t) => {
    let calls = 0;
    emailQueue.setQueueFactoryForTests(() => ({
        async add() { calls += 1; throw new Error("redis unavailable"); },
        async close() {},
    }));

    const payload = { institutionId, entityId: homeworkId, recipientMembershipId: membershipId,
        emailType: EMAIL_JOB_TYPES.HOMEWORK_ASSIGNED };
    assert.deepEqual(await emailQueue.enqueueEmailJob(payload), { queued: false, reason: "disabled" });
    assert.equal(calls, 0);

    process.env.EMAIL_QUEUE_ENABLED = "true";
    t.mock.method(console, "error", () => {});
    assert.deepEqual(await emailQueue.enqueueEmailJob(payload), { queued: false, reason: "enqueue_failed" });
    assert.equal(calls, 1);
});

test("re-enqueuing the same deterministic job ID is duplicate-safe", async () => {
    process.env.EMAIL_QUEUE_ENABLED = "true";
    const storedIds = new Set();
    emailQueue.setQueueFactoryForTests(() => ({
        async add(_name, _data, options) { storedIds.add(options.jobId); },
        async close() {},
    }));
    const payload = { institutionId, entityId: homeworkId, recipientMembershipId: membershipId,
        emailType: EMAIL_JOB_TYPES.HOMEWORK_ASSIGNED };

    const first = await emailQueue.enqueueEmailJob(payload);
    const second = await emailQueue.enqueueEmailJob(payload);
    assert.equal(first.jobId, second.jobId);
    assert.equal(storedIds.size, 1);
});

function mockRecipientAndSection(t, { filters = [], sectionStatus = "active", userEmail = "student@example.com" } = {}) {
    t.mock.method(Section, "findOne", (filter) => {
        filters.push(filter);
        return query({ _id: sectionId, subjectId, code: "S1", title: "A", status: sectionStatus });
    });
    t.mock.method(Subject, "findOne", (filter) => {
        filters.push(filter);
        return query({ _id: subjectId, name: "Math", code: "M1", status: "active" });
    });
    t.mock.method(Membership, "findOne", (filter) => {
        filters.push(filter);
        return query({ _id: membershipId, userId });
    });
    t.mock.method(Enrollment, "findOne", (filter) => {
        filters.push(filter);
        return query({ _id: "507f1f77bcf86cd799439017", studentMemberId: membershipId });
    });
    t.mock.method(User, "findOne", (filter) => {
        filters.push(filter);
        return query(userEmail ? { _id: userId, email: userEmail } : null);
    });
}

test("worker reloads tenant-scoped data before sending and skips invalid scope", async (t) => {
    const filters = [];
    t.mock.method(Homework, "findOne", (filter) => {
        filters.push(filter);
        return query({ _id: homeworkId, sectionId, title: "Read Mongo", type: "homework",
            dueAt: null, submissionMode: "offline", status: "assigned" });
    });
    t.mock.method(Section, "findOne", (filter) => {
        filters.push(filter);
        return query({ _id: sectionId, subjectId, code: "S1", title: "A", status: "active" });
    });
    t.mock.method(Subject, "findOne", (filter) => {
        filters.push(filter);
        return query({ _id: subjectId, name: "Math", code: "M1", status: "active" });
    });
    t.mock.method(Membership, "findOne", (filter) => {
        filters.push(filter);
        return query({ _id: membershipId, userId });
    });
    t.mock.method(Enrollment, "findOne", (filter) => {
        filters.push(filter);
        return query({ _id: "507f1f77bcf86cd799439017", studentMemberId: membershipId });
    });
    t.mock.method(User, "findOne", (filter) => {
        filters.push(filter);
        return query({ _id: userId, email: "student@example.com" });
    });
    const sent = [];
    t.mock.method(emailService, "sendHomeworkAssignedEmail", async (payload) => sent.push(payload));

    const data = { institutionId, entityId: homeworkId, recipientMembershipId: membershipId,
        emailType: EMAIL_JOB_TYPES.HOMEWORK_ASSIGNED };
    assert.deepEqual(await processEmailJob({ data }), { sent: true });
    assert.equal(sent.length, 1);
    assert.ok(filters.slice(0, 5).every((filter) => filter.institutionId === institutionId));
    assert.deepEqual(filters[0], { _id: homeworkId, institutionId, status: "assigned" });

    Membership.findOne.mock.mockImplementation(() => query(null));
    assert.deepEqual(await processEmailJob({ data }), { skipped: true, reason: "invalid_recipient_scope" });
    assert.equal(sent.length, 1);
});

test("worker validates job payload before processing", async (t) => {
    const send = t.mock.method(emailService, "sendHomeworkAssignedEmail", async () => {});
    assert.deepEqual(await processEmailJob({ data: {
        institutionId: "   ",
        entityId: homeworkId,
        recipientMembershipId: membershipId,
        emailType: EMAIL_JOB_TYPES.HOMEWORK_ASSIGNED,
    } }), { skipped: true, reason: "invalid_payload" });
    assert.equal(send.mock.callCount(), 0);
});

test("worker safely skips a deleted event before loading recipient data", async (t) => {
    t.mock.method(Homework, "findOne", () => query(null));
    const membershipLookup = t.mock.method(Membership, "findOne", () => query(null));
    const result = await processEmailJob({ data: {
        institutionId,
        entityId: homeworkId,
        recipientMembershipId: membershipId,
        emailType: EMAIL_JOB_TYPES.HOMEWORK_ASSIGNED,
    } });
    assert.deepEqual(result, { skipped: true, reason: "invalid_homework" });
    assert.equal(membershipLookup.mock.callCount(), 0);
});

test("worker skips recipient when membership, enrollment, or user email is invalid", async (t) => {
    t.mock.method(Homework, "findOne", () => query({ _id: homeworkId, sectionId, title: "Read Mongo", type: "homework",
        dueAt: null, submissionMode: "offline", status: "assigned" }));
    mockRecipientAndSection(t, { userEmail: null });
    const send = t.mock.method(emailService, "sendHomeworkAssignedEmail", async () => {});

    const data = { institutionId, entityId: homeworkId, recipientMembershipId: membershipId,
        emailType: EMAIL_JOB_TYPES.HOMEWORK_ASSIGNED };
    assert.deepEqual(await processEmailJob({ data }), { skipped: true, reason: "invalid_recipient_scope" });
    assert.equal(send.mock.callCount(), 0);

    Enrollment.findOne.mock.mockImplementation(() => query(null));
    assert.deepEqual(await processEmailJob({ data }), { skipped: true, reason: "invalid_recipient_scope" });

    Membership.findOne.mock.mockImplementation(() => query(null));
    assert.deepEqual(await processEmailJob({ data }), { skipped: true, reason: "invalid_recipient_scope" });
});

test("assessment announcement and result jobs use real statuses and tenant-scoped lookups", async (t) => {
    const filters = [];
    t.mock.method(Assessment, "findOne", (filter) => {
        filters.push(filter);
        return query({ _id: assessmentId, sectionId, title: "Midterm", type: "exam",
            assessmentDate: new Date("2026-06-21T00:00:00.000Z"), status: filter.status });
    });
    t.mock.method(AssessmentResult, "findOne", (filter) => {
        filters.push(filter);
        return query({ _id: assessmentResultId, assessmentId, sectionId });
    });
    mockRecipientAndSection(t, { filters, sectionStatus: "closed" });
    const announced = [];
    const published = [];
    t.mock.method(emailService, "sendAssessmentAnnouncedEmail", async (payload) => announced.push(payload));
    t.mock.method(emailService, "sendAssessmentResultsPublishedEmail", async (payload) => published.push(payload));

    assert.deepEqual(await processEmailJob({ data: {
        institutionId,
        entityId: assessmentId,
        recipientMembershipId: membershipId,
        emailType: EMAIL_JOB_TYPES.ASSESSMENT_ANNOUNCEMENT,
    } }), { sent: true });
    assert.deepEqual(await processEmailJob({ data: {
        institutionId,
        entityId: assessmentResultId,
        recipientMembershipId: membershipId,
        emailType: EMAIL_JOB_TYPES.ASSESSMENT_RESULT,
    } }), { sent: true });

    assert.equal(announced.length, 1);
    assert.equal(published.length, 1);
    assert.ok(filters.every((filter) => !Object.hasOwn(filter, "institutionId") || filter.institutionId === institutionId));
    assert.ok(filters.some((filter) => filter.status === "announced"));
    assert.ok(filters.some((filter) => filter.status === "published"));
    assert.ok(filters.some((filter) => filter._id === assessmentResultId
        && filter.institutionId === institutionId
        && filter.studentMemberId === membershipId));
});

test("assessment result skips when AssessmentResult is out of tenant or recipient scope", async (t) => {
    t.mock.method(AssessmentResult, "findOne", (filter) => {
        assert.deepEqual(filter, {
            _id: assessmentResultId,
            institutionId,
            studentMemberId: membershipId,
        });
        return query(null);
    });
    const send = t.mock.method(emailService, "sendAssessmentResultsPublishedEmail", async () => {});

    assert.deepEqual(await processEmailJob({ data: {
        institutionId,
        entityId: assessmentResultId,
        recipientMembershipId: membershipId,
        emailType: EMAIL_JOB_TYPES.ASSESSMENT_RESULT,
    } }), { skipped: true, reason: "invalid_assessment_result" });
    assert.equal(send.mock.callCount(), 0);
});

test("session cancelled job uses cancelled status and sends only when valid", async (t) => {
    const filters = [];
    t.mock.method(SectionSession, "findOne", (filter) => {
        filters.push(filter);
        return query({ _id: sessionId, sectionId, sessionDate: new Date("2026-06-22T00:00:00.000Z"),
            startTime: "10:00", endTime: "11:00", room: "101", status: "cancelled", statusNote: "Storm" });
    });
    mockRecipientAndSection(t, { filters });
    const sent = [];
    t.mock.method(emailService, "sendSectionSessionStatusUpdatedEmail", async (payload) => sent.push(payload));

    assert.deepEqual(await processEmailJob({ data: {
        institutionId,
        entityId: sessionId,
        recipientMembershipId: membershipId,
        emailType: EMAIL_JOB_TYPES.SESSION_CANCELLED,
    } }), { sent: true });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].sessionDate, "2026-06-22");
    assert.deepEqual(filters[0], { _id: sessionId, institutionId, status: "cancelled" });
});

test("invalid required dates are skipped without retrying", async (t) => {
    t.mock.method(Assessment, "findOne", () => query({ _id: assessmentId, sectionId, title: "Midterm", type: "exam",
        assessmentDate: "not-a-date", status: "announced" }));
    mockRecipientAndSection(t);
    const assessmentSend = t.mock.method(emailService, "sendAssessmentAnnouncedEmail", async () => {});
    assert.deepEqual(await processEmailJob({ data: {
        institutionId,
        entityId: assessmentId,
        recipientMembershipId: membershipId,
        emailType: EMAIL_JOB_TYPES.ASSESSMENT_ANNOUNCEMENT,
    } }), { skipped: true, reason: "invalid_assessment_date" });
    assert.equal(assessmentSend.mock.callCount(), 0);

    t.mock.reset();
    t.mock.method(SectionSession, "findOne", () => query({ _id: sessionId, sectionId, sessionDate: null,
        startTime: "10:00", endTime: "11:00", status: "cancelled" }));
    mockRecipientAndSection(t);
    const sessionSend = t.mock.method(emailService, "sendSectionSessionStatusUpdatedEmail", async () => {});
    assert.deepEqual(await processEmailJob({ data: {
        institutionId,
        entityId: sessionId,
        recipientMembershipId: membershipId,
        emailType: EMAIL_JOB_TYPES.SESSION_CANCELLED,
    } }), { skipped: true, reason: "invalid_session_date" });
    assert.equal(sessionSend.mock.callCount(), 0);
});

test("email service failures throw so BullMQ can retry", async (t) => {
    t.mock.method(Homework, "findOne", () => query({ _id: homeworkId, sectionId, title: "Read Mongo", type: "homework",
        dueAt: null, submissionMode: "offline", status: "assigned" }));
    mockRecipientAndSection(t);
    t.mock.method(emailService, "sendHomeworkAssignedEmail", async () => {
        throw new Error("smtp unavailable");
    });

    await assert.rejects(
        processEmailJob({ data: {
            institutionId,
            entityId: homeworkId,
            recipientMembershipId: membershipId,
            emailType: EMAIL_JOB_TYPES.HOMEWORK_ASSIGNED,
        } }),
        /smtp unavailable/
    );
});

test("email worker concurrency defaults safely and rejects invalid values", () => {
    assert.equal(emailWorker.getConcurrency(), 2);
    process.env.EMAIL_WORKER_CONCURRENCY = "bad";
    assert.equal(emailWorker.getConcurrency(), 2);
    process.env.EMAIL_WORKER_CONCURRENCY = "0";
    assert.equal(emailWorker.getConcurrency(), 2);
    process.env.EMAIL_WORKER_CONCURRENCY = "3";
    assert.equal(emailWorker.getConcurrency(), 3);
});

test("email worker disabled mode logs and does not connect to MongoDB", async (t) => {
    process.env.EMAIL_QUEUE_ENABLED = "false";
    const connect = t.mock.method(mongoose, "connect", async () => {
        throw new Error("should not connect");
    });
    const logs = [];
    t.mock.method(console, "log", (...args) => logs.push(args));

    assert.equal(await emailWorker.start(), undefined);
    assert.equal(connect.mock.callCount(), 0);
    assert.ok(logs.some((entry) => entry[0] === "Email worker disabled"));
});

test("OTP service remains directly coupled to synchronous email sending", () => {
    const source = require("node:fs").readFileSync(require.resolve("../src/services/authService"), "utf8");
    assert.match(source, /await sendOtpEmail\s*\(/);
    assert.doesNotMatch(source, /enqueueEmailJob|EMAIL_JOB_TYPES/);
    assert.equal(typeof authService.signup, "function");
});
