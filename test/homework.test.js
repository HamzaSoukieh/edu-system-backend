const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const Assessment = require("../src/models/Assessment");
const Enrollment = require("../src/models/Enrollment");
const Homework = require("../src/models/Homework");
const HomeworkSubmission = require("../src/models/HomeworkSubmission");
const MemberProfile = require("../src/models/MemberProfile");
const Membership = require("../src/models/Membership");
const ResponsibilityAssignment = require("../src/models/ResponsibilityAssignment");
const SchoolClass = require("../src/models/SchoolClass");
const Section = require("../src/models/Section");
const SectionSession = require("../src/models/SectionSession");
const Subject = require("../src/models/Subject");
const User = require("../src/models/User");
const app = require("../src/app");
const homeworkController = require("../src/controllers/homeworkController");
const uploadHomeworkSubmission = require("../src/middleware/uploadHomeworkSubmission");
const emailService = require("../src/services/emailService");
const homeworkService = require("../src/services/homeworkService");
const institutionRoutes = require("../src/routes/institutionRoutes");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439012";
const sectionId = "507f1f77bcf86cd799439021";
const otherSectionId = "507f1f77bcf86cd799439022";
const subjectId = "507f1f77bcf86cd799439031";
const homeworkId = "507f1f77bcf86cd799439041";
const submissionId = "507f1f77bcf86cd799439042";
const assessmentId = "507f1f77bcf86cd799439051";
const enrollmentId = "507f1f77bcf86cd799439061";
const otherEnrollmentId = "507f1f77bcf86cd799439062";
const studentMemberId = "507f1f77bcf86cd799439071";
const otherStudentMemberId = "507f1f77bcf86cd799439072";
const instructorMemberId = "507f1f77bcf86cd799439081";
const actorUserId = "507f1f77bcf86cd799439091";
const otherUserId = "507f1f77bcf86cd799439092";
const privateHomeworkUploadDir = path.resolve(__dirname, "..", "storage", "homework-submissions");

function createQuery(result) {
    return {
        select() {
            return this;
        },
        sort() {
            return this;
        },
        skip() {
            return this;
        },
        limit() {
            return this;
        },
        lean: async () => result,
        then(resolve, reject) {
            return Promise.resolve(result).then(resolve, reject);
        },
    };
}

function normalizeId(value) {
    return value === undefined || value === null ? null : value.toString();
}

function matchesId(value, condition) {
    if (condition?.$in) {
        return condition.$in.map(normalizeId).includes(normalizeId(value));
    }

    if (condition?.$ne !== undefined) {
        return normalizeId(value) !== normalizeId(condition.$ne);
    }

    return normalizeId(value) === normalizeId(condition);
}

function buildSection(overrides = {}) {
    return {
        _id: sectionId,
        institutionId,
        subjectId,
        schoolClassId: null,
        code: "SEC-1",
        title: "Section 1",
        instructorMemberId,
        status: "active",
        ...overrides,
    };
}

function buildSubject(overrides = {}) {
    return {
        _id: subjectId,
        institutionId,
        departmentId: null,
        classLevelId: null,
        code: "MATH101",
        name: "Math",
        ...overrides,
    };
}

function buildAssessment(overrides = {}) {
    return {
        _id: assessmentId,
        institutionId,
        sectionId,
        status: "draft",
        ...overrides,
    };
}

function buildHomework(overrides = {}) {
    return {
        _id: homeworkId,
        institutionId,
        sectionId,
        sectionSessionId: null,
        assessmentId: null,
        title: "Research Project",
        titleNormalized: "research project",
        instructions: "Upload a PDF.",
        type: "project",
        dueAt: new Date("2026-06-20T23:59:00.000Z"),
        submissionMode: "online_upload",
        allowLate: false,
        status: "assigned",
        createdByUserId: actorUserId,
        archivedAt: null,
        createdAt: new Date("2026-05-20T00:00:00.000Z"),
        updatedAt: new Date("2026-05-20T00:00:00.000Z"),
        ...overrides,
    };
}

function buildEnrollment(overrides = {}) {
    return {
        _id: enrollmentId,
        institutionId,
        sectionId,
        studentMemberId,
        status: "enrolled",
        ...overrides,
    };
}

function buildSubmission(overrides = {}) {
    return {
        _id: submissionId,
        institutionId,
        homeworkId,
        sectionId,
        enrollmentId,
        studentMemberId,
        submissionMethod: "online_upload",
        fileKey: "submission.pdf",
        originalFilename: "project.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12345,
        submittedAt: new Date("2026-06-19T12:00:00.000Z"),
        status: "submitted",
        studentNote: "",
        instructorFeedback: "",
        markedByUserId: null,
        createdAt: new Date("2026-05-20T00:00:00.000Z"),
        updatedAt: new Date("2026-05-20T00:00:00.000Z"),
        ...overrides,
    };
}

function buildActorMembership(overrides = {}) {
    return {
        _id: instructorMemberId,
        institutionId,
        userId: actorUserId,
        role: "instructor",
        status: "active",
        ...overrides,
    };
}

function createResponse() {
    return {
        statusCode: null,
        body: null,
        headers: {},
        downloaded: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        setHeader(name, value) {
            this.headers[name] = value;
        },
        download(filePath, filename) {
            this.downloaded = { filePath, filename };
            return this;
        },
    };
}

async function listenOnEphemeralPort(expressApp) {
    const server = http.createServer(expressApp);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    return {
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    };
}

async function postHomeworkUpload({ filename, mimeType, bytes }) {
    const uploadApp = express();
    uploadApp.post("/upload", uploadHomeworkSubmission, (req, res) => {
        return res.status(200).json({
            filename: req.file.filename,
            path: req.file.path,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
        });
    });
    uploadApp.use((error, _req, res, _next) => {
        const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
        return res.status(statusCode).json({ message: statusCode >= 500 ? "Internal server error" : error.message });
    });

    const server = await listenOnEphemeralPort(uploadApp);
    try {
        const form = new FormData();
        form.append("submissionFile", new Blob([bytes], { type: mimeType }), filename);
        const response = await fetch(`${server.baseUrl}/upload`, {
            method: "POST",
            body: form,
        });
        const body = await response.json();
        return { status: response.status, body };
    } finally {
        await server.close();
    }
}

function mockBaseHomeworkDependencies(t, dataset = {}) {
    const data = {
        section: buildSection(),
        subject: buildSubject(),
        schoolClass: null,
        assessment: null,
        homework: buildHomework(),
        sectionSession: null,
        enrollments: [buildEnrollment()],
        submissions: [],
        memberships: [],
        profiles: [],
        users: [],
        responsibilityAssignments: [],
        ...dataset,
    };

    t.mock.method(Section, "findOne", (query) => {
        if (!matchesId(data.section?._id, query._id) || !matchesId(data.section?.institutionId, query.institutionId)) {
            return createQuery(null);
        }

        return createQuery(data.section);
    });
    t.mock.method(Subject, "findOne", (query) => {
        if (!matchesId(data.subject?._id, query._id) || !matchesId(data.subject?.institutionId, query.institutionId)) {
            return createQuery(null);
        }

        return createQuery(data.subject);
    });
    t.mock.method(SchoolClass, "findOne", () => createQuery(data.schoolClass));
    t.mock.method(ResponsibilityAssignment, "find", (query) => {
        const assignments = data.responsibilityAssignments
            .filter((assignment) => matchesId(assignment.institutionId, query.institutionId))
            .filter((assignment) => matchesId(assignment.userId, query.userId))
            .filter((assignment) => matchesId(assignment.responsibilityType, query.responsibilityType || assignment.responsibilityType))
            .filter((assignment) => matchesId(assignment.scopeType, query.scopeType))
            .filter((assignment) => matchesId(assignment.scopeId, query.scopeId))
            .filter((assignment) => matchesId(assignment.isActive, query.isActive));
        return createQuery(assignments);
    });
    t.mock.method(SectionSession, "findOne", (query) => {
        if (!data.sectionSession) {
            return createQuery(null);
        }

        return createQuery(
            matchesId(data.sectionSession._id, query._id) &&
                matchesId(data.sectionSession.institutionId, query.institutionId) &&
                matchesId(data.sectionSession.sectionId, query.sectionId)
                ? data.sectionSession
                : null
        );
    });
    t.mock.method(Assessment, "findOne", (query) => {
        if (!data.assessment) {
            return createQuery(null);
        }

        return createQuery(
            matchesId(data.assessment._id, query._id) &&
                matchesId(data.assessment.institutionId, query.institutionId) &&
                matchesId(data.assessment.sectionId, query.sectionId)
                ? data.assessment
                : null
        );
    });
    t.mock.method(Homework, "findOne", (query) => {
        if (!data.homework) {
            return createQuery(null);
        }

        return createQuery(
            matchesId(data.homework._id, query._id) &&
                matchesId(data.homework.institutionId, query.institutionId) &&
                matchesId(data.homework.sectionId, query.sectionId)
                ? data.homework
                : null
        );
    });
    t.mock.method(Homework, "find", (query) => {
        const results = [data.homework]
            .filter(Boolean)
            .filter((homework) => matchesId(homework.institutionId, query.institutionId))
            .filter((homework) => matchesId(homework.sectionId, query.sectionId))
            .filter((homework) => {
                if (!query.status) {
                    return true;
                }
                return matchesId(homework.status, query.status);
            });
        return createQuery(results);
    });
    t.mock.method(Homework, "countDocuments", async () => (data.homework ? 1 : 0));
    t.mock.method(Homework, "create", async (payload) => {
        if (data.homeworkCreateError) {
            throw data.homeworkCreateError;
        }

        return {
        _id: homeworkId,
        createdAt: new Date("2026-05-20T00:00:00.000Z"),
        updatedAt: new Date("2026-05-20T00:00:00.000Z"),
        ...payload,
        };
    });
    t.mock.method(Homework, "findOneAndUpdate", (filter, update) => {
        if (Object.hasOwn(data, "homeworkFindOneAndUpdateResult")) {
            return createQuery(data.homeworkFindOneAndUpdateResult);
        }

        if (!data.homework || !matchesId(data.homework._id, filter._id)) {
            return createQuery(null);
        }

        return createQuery({
            ...data.homework,
            ...(update.$set || {}),
            updatedAt: new Date("2026-05-21T00:00:00.000Z"),
        });
    });
    t.mock.method(Enrollment, "findOne", (query) => {
        const enrollment =
            data.enrollments.find(
                (item) =>
                    matchesId(item._id, query._id || item._id) &&
                    matchesId(item.institutionId, query.institutionId) &&
                    matchesId(item.sectionId, query.sectionId) &&
                    matchesId(item.studentMemberId, query.studentMemberId || item.studentMemberId) &&
                    matchesId(item.status, query.status || item.status)
            ) || null;
        return createQuery(enrollment);
    });
    t.mock.method(Enrollment, "find", (query) => {
        const enrollments = data.enrollments.filter(
            (item) =>
                matchesId(item.institutionId, query.institutionId) &&
                matchesId(item.sectionId, query.sectionId || item.sectionId) &&
                matchesId(item.studentMemberId, query.studentMemberId || item.studentMemberId) &&
                matchesId(item.status, query.status || item.status)
        );
        return createQuery(enrollments);
    });
    t.mock.method(HomeworkSubmission, "findOne", (query) => {
        const submission =
            data.submissions.find(
                (item) =>
                    matchesId(item._id, query._id || item._id) &&
                    matchesId(item.institutionId, query.institutionId) &&
                    matchesId(item.sectionId, query.sectionId || item.sectionId) &&
                    matchesId(item.homeworkId, query.homeworkId) &&
                    matchesId(item.enrollmentId, query.enrollmentId || item.enrollmentId) &&
                    matchesId(item.studentMemberId, query.studentMemberId || item.studentMemberId)
            ) || null;
        return createQuery(submission);
    });
    t.mock.method(HomeworkSubmission, "find", (query) => {
        const submissions = data.submissions.filter(
            (item) =>
                matchesId(item.institutionId, query.institutionId) &&
                matchesId(item.homeworkId, query.homeworkId || item.homeworkId) &&
                matchesId(item.sectionId, query.sectionId || item.sectionId) &&
                matchesId(item.enrollmentId, query.enrollmentId || item.enrollmentId)
        );
        return createQuery(submissions);
    });
    t.mock.method(HomeworkSubmission, "countDocuments", async (query) =>
        data.submissions.filter(
            (item) =>
                matchesId(item.institutionId, query.institutionId) &&
                matchesId(item.sectionId, query.sectionId || item.sectionId) &&
                matchesId(item.homeworkId, query.homeworkId || item.homeworkId)
        ).length
    );
    t.mock.method(HomeworkSubmission, "findOneAndUpdate", (filter, update) => {
        if (Object.hasOwn(data, "homeworkSubmissionFindOneAndUpdateResult")) {
            return createQuery(data.homeworkSubmissionFindOneAndUpdateResult);
        }

        const existing =
            data.submissions.find(
                (item) =>
                    matchesId(item._id, filter._id || item._id) &&
                    matchesId(item.institutionId, filter.institutionId) &&
                    matchesId(item.homeworkId, filter.homeworkId) &&
                    matchesId(item.enrollmentId, filter.enrollmentId || item.enrollmentId)
            ) || null;
        const base =
            existing ||
            buildSubmission({
                _id: submissionId,
                institutionId: filter.institutionId,
                homeworkId: filter.homeworkId,
                sectionId,
                enrollmentId: filter.enrollmentId || enrollmentId,
                studentMemberId,
            });
        return createQuery({
            ...base,
            ...(update.$setOnInsert || {}),
            ...(update.$set || {}),
            updatedAt: new Date("2026-05-21T00:00:00.000Z"),
        });
    });
    t.mock.method(Membership, "find", (query) =>
        createQuery(
            data.memberships
                .filter((item) => matchesId(item._id, query._id || item._id))
                .filter((item) => matchesId(item.institutionId, query.institutionId || item.institutionId))
                .filter((item) => matchesId(item.role, query.role || item.role))
                .filter((item) => matchesId(item.status, query.status || item.status))
        )
    );
    t.mock.method(MemberProfile, "find", (query) =>
        createQuery(
            data.profiles.filter(
                (item) => matchesId(item.membershipId, query.membershipId) && matchesId(item.institutionId, query.institutionId)
            )
        )
    );
    t.mock.method(User, "find", (query) => createQuery(data.users.filter((item) => matchesId(item._id, query._id || item._id))));
}

test("homework models expose required fields and indexes", async () => {
    const homework = new Homework({
        institutionId,
        sectionId,
        title: "  Worksheet  ",
        titleNormalized: "worksheet",
        type: "homework",
        submissionMode: "offline",
        createdByUserId: actorUserId,
    });
    await assert.doesNotReject(() => homework.validate());

    const invalidHomework = new Homework({
        institutionId,
        sectionId,
        title: "",
        titleNormalized: "",
        type: "paper",
        createdByUserId: actorUserId,
    });
    await assert.rejects(() => invalidHomework.validate());

    const submission = new HomeworkSubmission({
        institutionId,
        homeworkId,
        sectionId,
        enrollmentId,
        studentMemberId,
        submissionMethod: "offline",
        status: "submitted",
    });
    await assert.doesNotReject(() => submission.validate());

    const onlineMissingSubmission = new HomeworkSubmission({
        institutionId,
        homeworkId,
        sectionId,
        enrollmentId,
        studentMemberId,
        submissionMethod: "online_upload",
        status: "missing",
    });
    await assert.doesNotReject(() => onlineMissingSubmission.validate());

    const onlineSubmittedWithoutFile = new HomeworkSubmission({
        institutionId,
        homeworkId,
        sectionId,
        enrollmentId,
        studentMemberId,
        submissionMethod: "online_upload",
        status: "submitted",
    });
    await assert.rejects(
        () => onlineSubmittedWithoutFile.validate(),
        /Online homework submissions require file metadata/
    );

    const offlineSubmissionWithFile = new HomeworkSubmission({
        institutionId,
        homeworkId,
        sectionId,
        enrollmentId,
        studentMemberId,
        submissionMethod: "offline",
        fileKey: "should-be-cleared.pdf",
        originalFilename: "paper.pdf",
        mimeType: "application/pdf",
        sizeBytes: 123,
        status: "submitted",
    });
    await offlineSubmissionWithFile.validate();
    assert.equal(offlineSubmissionWithFile.fileKey, null);
    assert.equal(offlineSubmissionWithFile.originalFilename, null);
    assert.equal(offlineSubmissionWithFile.mimeType, null);
    assert.equal(offlineSubmissionWithFile.sizeBytes, null);

    const homeworkIndexes = Homework.schema.indexes().map(([fields]) => fields);
    assert.ok(homeworkIndexes.some((fields) => fields.institutionId === 1 && fields.sectionId === 1 && fields.status === 1));
    assert.ok(homeworkIndexes.some((fields) => fields.institutionId === 1 && fields.assessmentId === 1));

    const submissionIndexes = HomeworkSubmission.schema.indexes();
    assert.ok(
        submissionIndexes.some(
            ([fields, options]) =>
                fields.institutionId === 1 &&
                fields.homeworkId === 1 &&
                fields.enrollmentId === 1 &&
                options?.unique === true
        )
    );
});

test("homework upload middleware stores private generated PDF files and rejects invalid uploads", async () => {
    const validUpload = await postHomeworkUpload({
        filename: "student-original.pdf",
        mimeType: "application/pdf",
        bytes: Buffer.from("%PDF-1.4\nvalid\n"),
    });

    assert.equal(validUpload.status, 200);
    assert.equal(validUpload.body.originalname, "student-original.pdf");
    assert.equal(validUpload.body.mimetype, "application/pdf");
    assert.equal(validUpload.body.filename.endsWith(".pdf"), true);
    assert.notEqual(validUpload.body.filename, "student-original.pdf");
    assert.equal(path.dirname(path.resolve(validUpload.body.path)), privateHomeworkUploadDir);
    await fs.promises.unlink(validUpload.body.path);

    const invalidExtension = await postHomeworkUpload({
        filename: "student-original.txt",
        mimeType: "application/pdf",
        bytes: Buffer.from("not a pdf extension"),
    });
    assert.equal(invalidExtension.status, 400);
    assert.equal(invalidExtension.body.message, "Only PDF files are allowed");

    const invalidMime = await postHomeworkUpload({
        filename: "student-original.pdf",
        mimeType: "text/plain",
        bytes: Buffer.from("%PDF-1.4\nwrong mime\n"),
    });
    assert.equal(invalidMime.status, 400);
    assert.equal(invalidMime.body.message, "Only PDF files are allowed");

    const tooLarge = await postHomeworkUpload({
        filename: "too-large.pdf",
        mimeType: "application/pdf",
        bytes: Buffer.alloc((10 * 1024 * 1024) + 1, 1),
    });
    assert.equal(tooLarge.status, 400);
    assert.equal(tooLarge.body.message, "Homework submission file size exceeds 10MB limit");
});

test("private homework storage is not exposed through express static routes", async () => {
    const server = await listenOnEphemeralPort(app);
    try {
        const storageResponse = await fetch(`${server.baseUrl}/storage/homework-submissions/private.pdf`);
        assert.equal(storageResponse.status, 404);

        const directResponse = await fetch(`${server.baseUrl}/homework-submissions/private.pdf`);
        assert.equal(directResponse.status, 404);
    } finally {
        await server.close();
    }
});

test("create homework supports optional and valid assessment links", async (t) => {
    mockBaseHomeworkDependencies(t, { homework: null });

    const noAssessmentResult = await homeworkService.createHomework({
        institutionId,
        sectionId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: {
            title: "Math worksheet page 20",
            type: "homework",
            submissionMode: "offline",
            status: "assigned",
        },
    });
    assert.equal(noAssessmentResult.homework.assessmentId, null);
    assert.equal(noAssessmentResult.homework.status, "assigned");

    t.mock.reset();
    mockBaseHomeworkDependencies(t, {
        homework: null,
        assessment: buildAssessment(),
    });

    const linkedResult = await homeworkService.createHomework({
        institutionId,
        sectionId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: {
            title: "Research Project PDF",
            type: "project",
            assessmentId,
            submissionMode: "online_upload",
        },
    });
    assert.equal(linkedResult.homework.assessmentId, assessmentId);
});

test("creating assigned homework sends filtered best-effort student notification emails", async (t) => {
    const invalidEmailMemberId = "507f1f77bcf86cd799439073";
    const inactiveMemberId = "507f1f77bcf86cd799439074";
    const nonStudentMemberId = "507f1f77bcf86cd799439075";
    const wrongTenantMemberId = "507f1f77bcf86cd799439076";
    const invalidEmailUserId = "507f1f77bcf86cd799439093";
    const inactiveUserId = "507f1f77bcf86cd799439094";
    const nonStudentUserId = "507f1f77bcf86cd799439095";
    const wrongTenantUserId = "507f1f77bcf86cd799439096";
    const sentEmails = [];
    t.mock.method(emailService, "sendHomeworkAssignedEmail", async (payload) => {
        sentEmails.push(payload);
    });

    mockBaseHomeworkDependencies(t, {
        homework: null,
        enrollments: [
            buildEnrollment({ studentMemberId }),
            buildEnrollment({ _id: otherEnrollmentId, studentMemberId: otherStudentMemberId }),
            buildEnrollment({
                _id: "507f1f77bcf86cd799439063",
                studentMemberId: invalidEmailMemberId,
            }),
            buildEnrollment({
                _id: "507f1f77bcf86cd799439064",
                studentMemberId: inactiveMemberId,
            }),
            buildEnrollment({
                _id: "507f1f77bcf86cd799439065",
                studentMemberId: nonStudentMemberId,
            }),
            buildEnrollment({
                _id: "507f1f77bcf86cd799439066",
                studentMemberId: wrongTenantMemberId,
            }),
            buildEnrollment({
                _id: "507f1f77bcf86cd799439067",
                sectionId: otherSectionId,
                studentMemberId: "507f1f77bcf86cd799439077",
            }),
            buildEnrollment({
                _id: "507f1f77bcf86cd799439068",
                studentMemberId: "507f1f77bcf86cd799439078",
                status: "dropped",
            }),
        ],
        memberships: [
            { _id: studentMemberId, institutionId, userId: actorUserId, role: "student", status: "active" },
            { _id: otherStudentMemberId, institutionId, userId: otherUserId, role: "student", status: "active" },
            { _id: invalidEmailMemberId, institutionId, userId: invalidEmailUserId, role: "student", status: "active" },
            { _id: inactiveMemberId, institutionId, userId: inactiveUserId, role: "student", status: "suspended" },
            { _id: nonStudentMemberId, institutionId, userId: nonStudentUserId, role: "instructor", status: "active" },
            { _id: wrongTenantMemberId, institutionId: otherInstitutionId, userId: wrongTenantUserId, role: "student", status: "active" },
        ],
        users: [
            { _id: actorUserId, email: "Student@Example.com" },
            { _id: otherUserId, email: "student@example.com" },
            { _id: invalidEmailUserId, email: "not-an-email" },
            { _id: inactiveUserId, email: "inactive@example.com" },
            { _id: nonStudentUserId, email: "instructor@example.com" },
            { _id: wrongTenantUserId, email: "wrong-tenant@example.com" },
        ],
    });

    const result = await homeworkService.createHomework({
        institutionId,
        sectionId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: {
            title: "Research Project PDF",
            type: "project",
            dueAt: "2026-06-20T23:59:00.000Z",
            submissionMode: "online_upload",
            status: "assigned",
        },
    });

    assert.equal(result.homework.status, "assigned");
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, "student@example.com");
    assert.equal(sentEmails[0].homeworkTitle, "Research Project PDF");
    assert.equal(sentEmails[0].homeworkType, "project");
    assert.equal(sentEmails[0].sectionCode, "SEC-1");
    assert.equal(sentEmails[0].sectionTitle, "Section 1");
    assert.equal(sentEmails[0].dueAt, "2026-06-20T23:59:00.000Z");
    assert.equal(sentEmails[0].submissionMode, "online_upload");
    const payloadText = JSON.stringify(sentEmails[0]);
    assert.equal(payloadText.includes("fileKey"), false);
    assert.equal(payloadText.includes("storage/homework-submissions"), false);
});

test("homework assignment notification is not sent for non-assigned create or failed create", async (t) => {
    const sentEmails = [];
    t.mock.method(emailService, "sendHomeworkAssignedEmail", async (payload) => {
        sentEmails.push(payload);
    });

    for (const status of ["draft", "closed", "archived"]) {
        t.mock.reset();
        t.mock.method(emailService, "sendHomeworkAssignedEmail", async (payload) => {
            sentEmails.push(payload);
        });
        mockBaseHomeworkDependencies(t, {
            homework: null,
            enrollments: [buildEnrollment({ studentMemberId })],
            memberships: [{ _id: studentMemberId, institutionId, userId: actorUserId, role: "student", status: "active" }],
            users: [{ _id: actorUserId, email: "student@example.com" }],
        });

        await homeworkService.createHomework({
            institutionId,
            sectionId,
            actorUserId,
            actorMembership: buildActorMembership(),
            payload: {
                title: `${status} homework`,
                type: "homework",
                status,
            },
        });
    }
    assert.equal(sentEmails.length, 0);

    t.mock.reset();
    t.mock.method(emailService, "sendHomeworkAssignedEmail", async (payload) => {
        sentEmails.push(payload);
    });
    mockBaseHomeworkDependencies(t, {
        homework: null,
        homeworkCreateError: new Error("create failed"),
        enrollments: [buildEnrollment({ studentMemberId })],
        memberships: [{ _id: studentMemberId, institutionId, userId: actorUserId, role: "student", status: "active" }],
        users: [{ _id: actorUserId, email: "student@example.com" }],
    });

    await assert.rejects(
        () =>
            homeworkService.createHomework({
                institutionId,
                sectionId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: {
                    title: "Assigned homework",
                    type: "homework",
                    status: "assigned",
                },
            }),
        /create failed/
    );
    assert.equal(sentEmails.length, 0);
});

test("homework assignment email failures do not fail homework create or status assignment", async (t) => {
    const loggedErrors = [];
    t.mock.method(console, "error", (...args) => {
        loggedErrors.push(args);
    });
    t.mock.method(emailService, "sendHomeworkAssignedEmail", async () => {
        throw new Error("smtp down");
    });

    mockBaseHomeworkDependencies(t, {
        homework: null,
        enrollments: [buildEnrollment({ studentMemberId })],
        memberships: [{ _id: studentMemberId, institutionId, userId: actorUserId, role: "student", status: "active" }],
        users: [{ _id: actorUserId, email: "student@example.com" }],
    });

    const created = await homeworkService.createHomework({
        institutionId,
        sectionId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: {
            title: "Assigned homework",
            type: "homework",
            status: "assigned",
        },
    });
    assert.equal(created.homework.status, "assigned");
    assert.ok(loggedErrors.some((entry) => entry[0] === "Failed to send homework assigned notification email"));

    t.mock.reset();
    const statusLoggedErrors = [];
    t.mock.method(console, "error", (...args) => {
        statusLoggedErrors.push(args);
    });
    t.mock.method(emailService, "sendHomeworkAssignedEmail", async () => {
        throw new Error("smtp down");
    });
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ status: "draft" }),
        enrollments: [buildEnrollment({ studentMemberId })],
        memberships: [{ _id: studentMemberId, institutionId, userId: actorUserId, role: "student", status: "active" }],
        users: [{ _id: actorUserId, email: "student@example.com" }],
    });

    const assigned = await homeworkService.updateHomeworkStatus({
        institutionId,
        sectionId,
        homeworkId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: { status: "assigned" },
    });
    assert.equal(assigned.homework.status, "assigned");
    assert.ok(statusLoggedErrors.some((entry) => entry[0] === "Failed to send homework assigned notification email"));
});

test("create homework rejects cross-section and archived assessment links plus invalid input", async (t) => {
    mockBaseHomeworkDependencies(t, {
        homework: null,
        assessment: buildAssessment({ sectionId: otherSectionId }),
    });

    await assert.rejects(
        () =>
            homeworkService.createHomework({
                institutionId,
                sectionId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: {
                    title: "Research Project PDF",
                    type: "project",
                    assessmentId,
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Assessment not found");
            return true;
        }
    );

    t.mock.reset();
    mockBaseHomeworkDependencies(t, {
        homework: null,
        assessment: buildAssessment({ status: "archived" }),
    });

    await assert.rejects(
        () =>
            homeworkService.createHomework({
                institutionId,
                sectionId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: {
                    title: "Archived Assessment Link",
                    type: "project",
                    assessmentId,
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Archived assessments cannot be linked to homework");
            return true;
        }
    );

    assert.throws(
        () =>
            homeworkService.validateCreateHomeworkInput({
                title: "",
                type: "bad",
                submissionMode: "invalid_mode",
                dueAt: "not-a-date",
            }),
        /title is required/
    );
});

test("section homework list is tenant scoped and supports filters", async (t) => {
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ status: "assigned", type: "project", submissionMode: "online_upload" }),
    });

    const result = await homeworkService.listSectionHomeworks({
        institutionId,
        sectionId,
        actorUserId,
        actorMembership: buildActorMembership(),
        query: {
            status: "assigned",
            type: "project",
            submissionMode: "online_upload",
            page: "1",
            limit: "20",
        },
    });

    assert.equal(result.homeworks.length, 1);
    assert.equal(result.homeworks[0].institutionId, institutionId);
    assert.equal(result.pagination.total, 1);
});

test("student visibility uses active enrollments and assigned/closed statuses", async (t) => {
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ status: "assigned" }),
        enrollments: [buildEnrollment({ studentMemberId })],
    });

    const result = await homeworkService.listStudentHomeworks({
        institutionId,
        actorUserId,
        actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
        query: {},
    });
    assert.equal(result.homeworks.length, 1);
    assert.equal(result.homeworks[0].status, "assigned");

    t.mock.reset();
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ status: "draft" }),
        enrollments: [buildEnrollment({ studentMemberId })],
    });

    const draftResult = await homeworkService.listStudentHomeworks({
        institutionId,
        actorUserId,
        actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
        query: {},
    });
    assert.equal(draftResult.homeworks.length, 0);

    t.mock.reset();
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ status: "assigned" }),
        enrollments: [buildEnrollment({ studentMemberId, status: "dropped" })],
    });

    const droppedResult = await homeworkService.listStudentHomeworks({
        institutionId,
        actorUserId,
        actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
        query: {},
    });
    assert.equal(droppedResult.homeworks.length, 0);
});

test("student online submission enforces submission mode and late policy", async (t) => {
    const file = {
        filename: "saved.pdf",
        originalname: "project.pdf",
        mimetype: "application/pdf",
        size: 12345,
    };

    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ submissionMode: "none" }),
        enrollments: [buildEnrollment({ studentMemberId })],
    });

    await assert.rejects(
        () =>
            homeworkService.submitHomework({
                institutionId,
                sectionId,
                homeworkId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
                payload: {},
                file,
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "This homework does not accept submissions");
            return true;
        }
    );

    t.mock.reset();
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ submissionMode: "offline" }),
        enrollments: [buildEnrollment({ studentMemberId })],
    });

    await assert.rejects(
        () =>
            homeworkService.submitHomework({
                institutionId,
                sectionId,
                homeworkId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
                payload: {},
                file,
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "This homework accepts offline submissions only");
            return true;
        }
    );

    t.mock.reset();
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ submissionMode: "online_upload" }),
        enrollments: [buildEnrollment({ studentMemberId })],
    });

    await assert.rejects(
        () =>
            homeworkService.submitHomework({
                institutionId,
                sectionId,
                homeworkId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
                payload: {},
                file: null,
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "Submission file is required (field: submissionFile)");
            return true;
        }
    );

    await assert.rejects(
        () =>
            homeworkService.submitHomework({
                institutionId,
                sectionId,
                homeworkId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
                payload: {},
                file: { ...file, size: 0 },
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "Submission file must not be empty");
            return true;
        }
    );

    t.mock.reset();
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ submissionMode: "online_upload", dueAt: new Date("2000-01-01T00:00:00.000Z"), allowLate: true }),
        enrollments: [buildEnrollment({ studentMemberId })],
    });

    const lateResult = await homeworkService.submitHomework({
        institutionId,
        sectionId,
        homeworkId,
        actorUserId,
        actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
        payload: { studentNote: "Done" },
        file,
    });
    assert.equal(lateResult.submission.status, "late");
    assert.equal(lateResult.submission.originalFilename, "project.pdf");

    t.mock.reset();
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ submissionMode: "online_upload", dueAt: new Date("2000-01-01T00:00:00.000Z"), allowLate: false }),
        enrollments: [buildEnrollment({ studentMemberId })],
    });

    await assert.rejects(
        () =>
            homeworkService.submitHomework({
                institutionId,
                sectionId,
                homeworkId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
                payload: {},
                file,
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Late submissions are not allowed for this homework");
            return true;
        }
    );
});

test("student online submission keeps staff marker empty and replaces prior file state", async (t) => {
    let removedFile = null;
    t.mock.method(require("node:fs").promises, "unlink", async (filePath) => {
        removedFile = filePath;
    });

    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ submissionMode: "online_upload", dueAt: new Date("2999-01-01T00:00:00.000Z") }),
        enrollments: [buildEnrollment({ studentMemberId })],
        submissions: [
            buildSubmission({
                fileKey: "old-upload.pdf",
                instructorFeedback: "Please revise.",
                markedByUserId: actorUserId,
            }),
        ],
    });

    const result = await homeworkService.submitHomework({
        institutionId,
        sectionId,
        homeworkId,
        actorUserId,
        actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
        payload: { studentNote: "Updated file" },
        file: {
            filename: "new-upload.pdf",
            originalname: "project-v2.pdf",
            mimetype: "application/pdf",
            size: 23456,
        },
    });

    assert.equal(result.submission.markedByUserId, null);
    assert.equal(result.submission.instructorFeedback, "");
    assert.equal(result.submission.originalFilename, "project-v2.pdf");
    assert.ok(removedFile.endsWith("storage\\homework-submissions\\old-upload.pdf") || removedFile.endsWith("storage/homework-submissions/old-upload.pdf"));
});

test("student online submission requires active enrollment and assigned homework", async (t) => {
    const file = {
        filename: "saved.pdf",
        originalname: "project.pdf",
        mimetype: "application/pdf",
        size: 12345,
    };

    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ status: "closed" }),
        enrollments: [buildEnrollment({ studentMemberId })],
    });

    await assert.rejects(
        () =>
            homeworkService.submitHomework({
                institutionId,
                sectionId,
                homeworkId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
                payload: {},
                file,
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Only assigned homework can receive student submissions");
            return true;
        }
    );

    t.mock.reset();
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ status: "assigned" }),
        enrollments: [buildEnrollment({ studentMemberId, status: "dropped" })],
    });

    await assert.rejects(
        () =>
            homeworkService.submitHomework({
                institutionId,
                sectionId,
                homeworkId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
                payload: {},
                file,
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Student is not enrolled in this section");
            return true;
        }
    );
});

test("instructor manual marking creates offline submission records and validates enrollment scope", async (t) => {
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ submissionMode: "offline" }),
        enrollments: [buildEnrollment({ studentMemberId })],
    });

    const result = await homeworkService.markEnrollmentHomeworkSubmission({
        institutionId,
        sectionId,
        homeworkId,
        enrollmentId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: {
            status: "submitted",
            instructorFeedback: "Received in class.",
        },
    });

    assert.equal(result.submission.submissionMethod, "offline");
    assert.equal(result.submission.status, "submitted");
    assert.equal(result.submission.originalFilename, null);
    assert.equal(result.submission.instructorFeedback, "Received in class.");

    t.mock.reset();
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ submissionMode: "offline" }),
        enrollments: [buildEnrollment({ _id: otherEnrollmentId, sectionId: otherSectionId })],
    });

    await assert.rejects(
        () =>
            homeworkService.markEnrollmentHomeworkSubmission({
                institutionId,
                sectionId,
                homeworkId,
                enrollmentId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: { status: "missing" },
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Enrollment not found");
            return true;
        }
    );
});

test("manual marking requires active enrollment and offline submission mode", async (t) => {
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ submissionMode: "offline" }),
        enrollments: [buildEnrollment({ studentMemberId, status: "dropped" })],
    });

    await assert.rejects(
        () =>
            homeworkService.markEnrollmentHomeworkSubmission({
                institutionId,
                sectionId,
                homeworkId,
                enrollmentId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: { status: "submitted" },
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Only active enrollments can be marked for homework");
            return true;
        }
    );

    t.mock.reset();
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ submissionMode: "none" }),
        enrollments: [buildEnrollment({ studentMemberId })],
    });

    await assert.rejects(
        () =>
            homeworkService.markEnrollmentHomeworkSubmission({
                institutionId,
                sectionId,
                homeworkId,
                enrollmentId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: { status: "submitted" },
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "This homework does not accept submissions");
            return true;
        }
    );

    t.mock.reset();
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ submissionMode: "online_upload" }),
        enrollments: [buildEnrollment({ studentMemberId })],
    });

    await assert.rejects(
        () =>
            homeworkService.markEnrollmentHomeworkSubmission({
                institutionId,
                sectionId,
                homeworkId,
                enrollmentId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: { status: "submitted" },
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Manual homework submission marking is only allowed for offline homework");
            return true;
        }
    );
});

test("homework update blocks submissionMode changes after submissions exist", async (t) => {
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ submissionMode: "online_upload" }),
        submissions: [buildSubmission()],
    });

    await assert.rejects(
        () =>
            homeworkService.updateHomework({
                institutionId,
                sectionId,
                homeworkId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: { submissionMode: "offline" },
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Cannot change submissionMode after homework submissions exist");
            return true;
        }
    );

    t.mock.reset();
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ submissionMode: "online_upload" }),
        submissions: [],
    });

    const result = await homeworkService.updateHomework({
        institutionId,
        sectionId,
        homeworkId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: { submissionMode: "offline" },
    });
    assert.equal(result.homework.submissionMode, "offline");
});

test("submission update missing clears submitted state, file metadata, and old private file", async (t) => {
    let removedFile = null;
    t.mock.method(require("node:fs").promises, "unlink", async (filePath) => {
        removedFile = filePath;
    });

    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ submissionMode: "online_upload" }),
        submissions: [buildSubmission({ fileKey: "old-upload.pdf", instructorFeedback: "Reviewed" })],
    });

    const result = await homeworkService.updateHomeworkSubmission({
        institutionId,
        sectionId,
        homeworkId,
        submissionId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: { status: "missing", instructorFeedback: "Not received." },
    });

    assert.equal(result.submission.status, "missing");
    assert.equal(result.submission.submittedAt, null);
    assert.equal(result.submission.originalFilename, null);
    assert.equal(result.submission.mimeType, null);
    assert.equal(result.submission.sizeBytes, null);
    assert.equal(Object.hasOwn(result.submission, "fileKey"), false);
    assert.ok(removedFile.endsWith("storage\\homework-submissions\\old-upload.pdf") || removedFile.endsWith("storage/homework-submissions/old-upload.pdf"));
});

test("submission update does not delete old private file when missing update fails", async (t) => {
    let removedFile = null;
    t.mock.method(require("node:fs").promises, "unlink", async (filePath) => {
        removedFile = filePath;
    });

    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ submissionMode: "online_upload" }),
        submissions: [buildSubmission({ fileKey: "old-upload.pdf" })],
        homeworkSubmissionFindOneAndUpdateResult: null,
    });

    await assert.rejects(
        () =>
            homeworkService.updateHomeworkSubmission({
                institutionId,
                sectionId,
                homeworkId,
                submissionId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: { status: "missing" },
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Homework submission not found");
            return true;
        }
    );
    assert.equal(removedFile, null);
});

test("submission update rejects submitted-like status without submittedAt", async (t) => {
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ submissionMode: "offline" }),
        submissions: [
            buildSubmission({
                submissionMethod: "offline",
                fileKey: null,
                originalFilename: null,
                mimeType: null,
                sizeBytes: null,
                submittedAt: null,
                status: "missing",
            }),
        ],
    });

    await assert.rejects(
        () =>
            homeworkService.updateHomeworkSubmission({
                institutionId,
                sectionId,
                homeworkId,
                submissionId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: { status: "submitted" },
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Use manual homework submission marking to set submitted status");
            return true;
        }
    );
});

test("roster returns submitted and missing students from active enrollments only", async (t) => {
    const otherEnrollment = buildEnrollment({
        _id: otherEnrollmentId,
        studentMemberId: otherStudentMemberId,
    });
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ submissionMode: "offline" }),
        enrollments: [
            buildEnrollment({ studentMemberId }),
            otherEnrollment,
            buildEnrollment({
                _id: "507f1f77bcf86cd799439063",
                studentMemberId: "507f1f77bcf86cd799439073",
                status: "dropped",
            }),
        ],
        submissions: [buildSubmission({ enrollmentId, studentMemberId, status: "submitted" })],
        memberships: [
            { _id: studentMemberId, institutionId, userId: actorUserId },
            { _id: otherStudentMemberId, institutionId, userId: otherUserId },
        ],
        profiles: [
            { _id: "507f1f77bcf86cd7994390a1", institutionId, membershipId: studentMemberId, fullName: "Alice Student" },
            { _id: "507f1f77bcf86cd7994390a2", institutionId, membershipId: otherStudentMemberId, fullName: "Bob Student" },
        ],
        users: [
            { _id: actorUserId, email: "alice@example.com" },
            { _id: otherUserId, email: "bob@example.com" },
        ],
    });

    const result = await homeworkService.getHomeworkSubmissionsRoster({
        institutionId,
        sectionId,
        homeworkId,
        actorUserId,
        actorMembership: buildActorMembership(),
    });

    assert.equal(result.submissions.length, 2);
    assert.equal(result.submissions.find((item) => item.studentMemberId === studentMemberId).status, "submitted");
    assert.equal(result.submissions.find((item) => item.studentMemberId === otherStudentMemberId).status, "missing");
});

test("download access allows owner and instructor while rejecting unrelated students", async (t) => {
    const accessSubmission = buildSubmission({ studentMemberId, fileKey: "submission.pdf" });
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework(),
        submissions: [accessSubmission],
    });
    t.mock.method(require("node:fs").promises, "access", async () => undefined);

    const ownerAccess = await homeworkService.getHomeworkSubmissionFileAccess({
        institutionId,
        sectionId,
        homeworkId,
        submissionId,
        actorUserId,
        actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
    });
    assert.equal(ownerAccess.filename, "project.pdf");
    assert.equal(ownerAccess.mimeType, "application/pdf");
    assert.equal(ownerAccess.filePath.includes("storage"), true);

    const instructorAccess = await homeworkService.getHomeworkSubmissionFileAccess({
        institutionId,
        sectionId,
        homeworkId,
        submissionId,
        actorUserId,
        actorMembership: buildActorMembership(),
    });
    assert.equal(instructorAccess.filename, "project.pdf");

    await assert.rejects(
        () =>
            homeworkService.getHomeworkSubmissionFileAccess({
                institutionId,
                sectionId,
                homeworkId,
                submissionId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: otherStudentMemberId, role: "student" }),
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Students can only download their own homework submissions");
            return true;
        }
    );

    await assert.rejects(
        () =>
            homeworkService.getHomeworkSubmissionFileAccess({
                institutionId,
                sectionId,
                homeworkId,
                submissionId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: otherStudentMemberId, role: "instructor" }),
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Permission denied");
            return true;
        }
    );

    await assert.rejects(
        () =>
            homeworkService.getHomeworkSubmissionFileAccess({
                institutionId: otherInstitutionId,
                sectionId,
                homeworkId,
                submissionId,
                actorUserId,
                actorMembership: buildActorMembership({ institutionId: otherInstitutionId, role: "admin" }),
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Section not found");
            return true;
        }
    );
});

test("download rejects unsafe or missing private submission files", async (t) => {
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework(),
        submissions: [buildSubmission({ fileKey: "../secret.pdf" })],
    });

    await assert.rejects(
        () =>
            homeworkService.getHomeworkSubmissionFileAccess({
                institutionId,
                sectionId,
                homeworkId,
                submissionId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Submission file not found");
            return true;
        }
    );

    t.mock.reset();
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework(),
        submissions: [buildSubmission({ fileKey: "missing.pdf" })],
    });
    t.mock.method(require("node:fs").promises, "access", async () => {
        const error = new Error("missing");
        error.code = "ENOENT";
        throw error;
    });

    await assert.rejects(
        () =>
            homeworkService.getHomeworkSubmissionFileAccess({
                institutionId,
                sectionId,
                homeworkId,
                submissionId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Submission file not found");
            return true;
        }
    );
});

test("archived homework cannot be updated or submitted to", async (t) => {
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ status: "archived" }),
        enrollments: [buildEnrollment({ studentMemberId })],
    });

    await assert.rejects(
        () =>
            homeworkService.updateHomework({
                institutionId,
                sectionId,
                homeworkId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: { title: "Updated" },
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Archived homework is read-only");
            return true;
        }
    );

    await assert.rejects(
        () =>
            homeworkService.submitHomework({
                institutionId,
                sectionId,
                homeworkId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
                payload: {},
                file: {
                    filename: "saved.pdf",
                    originalname: "project.pdf",
                    mimetype: "application/pdf",
                    size: 12345,
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Archived homework cannot receive submissions");
            return true;
        }
    );
});

test("homework status transitions are constrained", async (t) => {
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ status: "draft" }),
    });

    const assigned = await homeworkService.updateHomeworkStatus({
        institutionId,
        sectionId,
        homeworkId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: { status: "assigned" },
    });
    assert.equal(assigned.homework.status, "assigned");

    t.mock.reset();
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ status: "closed" }),
    });

    await assert.rejects(
        () =>
            homeworkService.updateHomeworkStatus({
                institutionId,
                sectionId,
                homeworkId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: { status: "assigned" },
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Unsupported homework status transition");
            return true;
        }
    );
});

test("draft to assigned status transition sends assignment email only after successful update", async (t) => {
    const sentEmails = [];
    t.mock.method(emailService, "sendHomeworkAssignedEmail", async (payload) => {
        sentEmails.push(payload);
    });
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ status: "draft" }),
        enrollments: [buildEnrollment({ studentMemberId })],
        memberships: [{ _id: studentMemberId, institutionId, userId: actorUserId, role: "student", status: "active" }],
        users: [{ _id: actorUserId, email: "student@example.com" }],
    });

    const assigned = await homeworkService.updateHomeworkStatus({
        institutionId,
        sectionId,
        homeworkId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: { status: "assigned" },
    });
    assert.equal(assigned.homework.status, "assigned");
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, "student@example.com");

    t.mock.reset();
    const nonAssignmentEmails = [];
    t.mock.method(emailService, "sendHomeworkAssignedEmail", async (payload) => {
        nonAssignmentEmails.push(payload);
    });
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ status: "assigned" }),
        enrollments: [buildEnrollment({ studentMemberId })],
        memberships: [{ _id: studentMemberId, institutionId, userId: actorUserId, role: "student", status: "active" }],
        users: [{ _id: actorUserId, email: "student@example.com" }],
    });
    await homeworkService.updateHomeworkStatus({
        institutionId,
        sectionId,
        homeworkId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: { status: "closed" },
    });
    assert.equal(nonAssignmentEmails.length, 0);

    t.mock.reset();
    const invalidTransitionEmails = [];
    t.mock.method(emailService, "sendHomeworkAssignedEmail", async (payload) => {
        invalidTransitionEmails.push(payload);
    });
    mockBaseHomeworkDependencies(t, {
        homework: buildHomework({ status: "assigned" }),
        enrollments: [buildEnrollment({ studentMemberId })],
        memberships: [{ _id: studentMemberId, institutionId, userId: actorUserId, role: "student", status: "active" }],
        users: [{ _id: actorUserId, email: "student@example.com" }],
    });
    await assert.rejects(
        () =>
            homeworkService.updateHomeworkStatus({
                institutionId,
                sectionId,
                homeworkId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: { status: "assigned" },
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Homework is already in this status");
            return true;
        }
    );
    assert.equal(invalidTransitionEmails.length, 0);
});

test("homework controller returns service envelopes and cleans failed uploads", async (t) => {
    t.mock.method(homeworkService, "createHomework", async () => ({
        homework: homeworkService.toHomeworkResponse(buildHomework()),
    }));
    const createRes = createResponse();
    await homeworkController.createHomework(
        {
            params: { institutionId, sectionId },
            user: { id: actorUserId },
            membership: buildActorMembership(),
            body: { title: "Demo" },
        },
        createRes
    );
    assert.equal(createRes.statusCode, 201);
    assert.equal(createRes.body.homework.id, homeworkId);

    let removedFile = null;
    t.mock.method(require("node:fs").promises, "unlink", async (filePath) => {
        removedFile = filePath;
    });
    t.mock.method(homeworkService, "submitHomework", async () => {
        const error = new Error("Late submissions are not allowed for this homework");
        error.statusCode = 409;
        throw error;
    });
    const submitRes = createResponse();
    await homeworkController.submitHomework(
        {
            params: { institutionId, sectionId, homeworkId },
            user: { id: actorUserId },
            membership: buildActorMembership({ _id: studentMemberId, role: "student" }),
            body: {},
            file: { path: "storage/homework-submissions/saved.pdf" },
        },
        submitRes
    );
    assert.equal(submitRes.statusCode, 409);
    assert.equal(removedFile, path.join(privateHomeworkUploadDir, "saved.pdf"));

    t.mock.reset();
    t.mock.method(homeworkService, "submitHomework", async () => {
        const error = new Error("Late submissions are not allowed for this homework");
        error.statusCode = 409;
        throw error;
    });
    t.mock.method(fs.promises, "unlink", async () => {
        throw new Error("cleanup failed");
    });
    const cleanupFailureRes = createResponse();
    await homeworkController.submitHomework(
        {
            params: { institutionId, sectionId, homeworkId },
            user: { id: actorUserId },
            membership: buildActorMembership({ _id: studentMemberId, role: "student" }),
            body: {},
            file: { path: path.join(privateHomeworkUploadDir, "cleanup-fails.pdf") },
        },
        cleanupFailureRes
    );
    assert.equal(cleanupFailureRes.statusCode, 409);
    assert.equal(cleanupFailureRes.body.message, "Late submissions are not allowed for this homework");

    t.mock.reset();
    let attemptedUnsafeCleanup = false;
    t.mock.method(homeworkService, "submitHomework", async () => {
        const error = new Error("Late submissions are not allowed for this homework");
        error.statusCode = 409;
        throw error;
    });
    t.mock.method(fs.promises, "unlink", async () => {
        attemptedUnsafeCleanup = true;
    });
    const unsafePathRes = createResponse();
    await homeworkController.submitHomework(
        {
            params: { institutionId, sectionId, homeworkId },
            user: { id: actorUserId },
            membership: buildActorMembership({ _id: studentMemberId, role: "student" }),
            body: {},
            file: { path: path.resolve(__dirname, "not-private.pdf") },
        },
        unsafePathRes
    );
    assert.equal(unsafePathRes.statusCode, 409);
    assert.equal(attemptedUnsafeCleanup, false);
});

test("homework download controller delegates private file access to service", async (t) => {
    let receivedArgs = null;
    t.mock.method(homeworkService, "getHomeworkSubmissionFileAccess", async (args) => {
        receivedArgs = args;
        return {
            filePath: path.join(privateHomeworkUploadDir, "saved.pdf"),
            filename: "project.pdf",
            mimeType: "application/pdf",
        };
    });

    const res = createResponse();
    await homeworkController.downloadHomeworkSubmissionFile(
        {
            params: { institutionId, sectionId, homeworkId, submissionId },
            user: { id: actorUserId },
            membership: buildActorMembership({ _id: studentMemberId, role: "student" }),
        },
        res
    );

    assert.equal(receivedArgs.institutionId, institutionId);
    assert.equal(receivedArgs.sectionId, sectionId);
    assert.equal(receivedArgs.homeworkId, homeworkId);
    assert.equal(receivedArgs.submissionId, submissionId);
    assert.equal(res.headers["Content-Type"], "application/pdf");
    assert.deepEqual(res.downloaded, {
        filePath: path.join(privateHomeworkUploadDir, "saved.pdf"),
        filename: "project.pdf",
    });
});

test("homework routes are wired with expected protected middleware", () => {
    const findRoute = (path, method) =>
        institutionRoutes.stack
            .filter((layer) => layer.route)
            .map((layer) => layer.route)
            .find((route) => route.path === path && route.methods[method]);

    const createRoute = findRoute("/:institutionId/sections/:sectionId/homeworks", "post");
    const studentListRoute = findRoute("/:institutionId/students/me/homeworks", "get");
    const uploadRoute = findRoute("/:institutionId/sections/:sectionId/homeworks/:homeworkId/submission", "post");
    const rosterRoute = findRoute("/:institutionId/sections/:sectionId/homeworks/:homeworkId/submissions", "get");
    const downloadRoute = findRoute(
        "/:institutionId/sections/:sectionId/homeworks/:homeworkId/submissions/:submissionId/file",
        "get"
    );

    assert.ok(createRoute?.methods.post);
    assert.ok(studentListRoute?.methods.get);
    assert.ok(uploadRoute?.methods.post);
    assert.ok(rosterRoute?.methods.get);
    assert.ok(downloadRoute?.methods.get);
    assert.deepEqual(
        createRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "createHomework"]
    );
    assert.deepEqual(
        studentListRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "listStudentHomeworks"]
    );
    assert.deepEqual(
        uploadRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "uploadHomeworkSubmission", "submitHomework"]
    );
    assert.deepEqual(
        downloadRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "downloadHomeworkSubmissionFile"]
    );
});
