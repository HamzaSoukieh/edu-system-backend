const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const Enrollment = require("../src/models/Enrollment");
const ResponsibilityAssignment = require("../src/models/ResponsibilityAssignment");
const SchoolClass = require("../src/models/SchoolClass");
const Section = require("../src/models/Section");
const SectionMaterial = require("../src/models/SectionMaterial");
const SectionSession = require("../src/models/SectionSession");
const Subject = require("../src/models/Subject");
const app = require("../src/app");
const sectionMaterialController = require("../src/controllers/sectionMaterialController");
const uploadSectionMaterial = require("../src/middleware/uploadSectionMaterial");
const sectionMaterialService = require("../src/services/sectionMaterialService");
const institutionRoutes = require("../src/routes/institutionRoutes");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439012";
const sectionId = "507f1f77bcf86cd799439021";
const otherSectionId = "507f1f77bcf86cd799439022";
const subjectId = "507f1f77bcf86cd799439031";
const sectionSessionId = "507f1f77bcf86cd799439041";
const materialId = "507f1f77bcf86cd799439051";
const enrollmentId = "507f1f77bcf86cd799439061";
const studentMemberId = "507f1f77bcf86cd799439071";
const instructorMemberId = "507f1f77bcf86cd799439081";
const actorUserId = "507f1f77bcf86cd799439091";
const otherMemberId = "507f1f77bcf86cd799439092";
const privateMaterialUploadDir = path.resolve(__dirname, "..", "storage", "section-materials");

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

function buildSectionSession(overrides = {}) {
    return {
        _id: sectionSessionId,
        institutionId,
        sectionId,
        status: "scheduled",
        ...overrides,
    };
}

function buildMaterial(overrides = {}) {
    return {
        _id: materialId,
        institutionId,
        sectionId,
        sectionSessionId: null,
        title: "Lecture 1 Slides",
        titleNormalized: "lecture 1 slides",
        description: "Intro notes",
        materialType: "lecture_pdf",
        sourceType: "file",
        fileKey: "lecture.pdf",
        originalFilename: "Lecture 1.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12345,
        status: "published",
        uploadedByUserId: actorUserId,
        publishedAt: new Date("2026-05-20T00:00:00.000Z"),
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

function buildFile(overrides = {}) {
    return {
        filename: "saved.pdf",
        originalname: "lecture.pdf",
        mimetype: "application/pdf",
        size: 12345,
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

async function postMaterialUpload({ filename, mimeType, bytes }) {
    const uploadApp = express();
    uploadApp.post("/upload", uploadSectionMaterial, (req, res) => {
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
        form.append("materialFile", new Blob([bytes], { type: mimeType }), filename);
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

function mockBaseSectionMaterialDependencies(t, dataset = {}) {
    const data = {
        section: buildSection(),
        subject: buildSubject(),
        schoolClass: null,
        sectionSession: null,
        materials: [buildMaterial()],
        enrollments: [buildEnrollment()],
        responsibilityAssignments: [],
        updateThrows: null,
        queryLog: [],
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
    t.mock.method(SectionMaterial, "findOne", (query) => {
        data.queryLog.push({ model: "SectionMaterial", method: "findOne", query });
        const material =
            data.materials.find(
                (item) =>
                    matchesId(item._id, query._id || item._id) &&
                    matchesId(item.institutionId, query.institutionId) &&
                    matchesId(item.sectionId, query.sectionId || item.sectionId)
            ) || null;
        return createQuery(material);
    });
    t.mock.method(SectionMaterial, "find", (query) => {
        data.queryLog.push({ model: "SectionMaterial", method: "find", query });
        const materials = data.materials
            .filter((item) => matchesId(item.institutionId, query.institutionId))
            .filter((item) => matchesId(item.sectionId, query.sectionId || item.sectionId))
            .filter((item) => (query.status ? matchesId(item.status, query.status) : true))
            .filter((item) => (query.materialType ? matchesId(item.materialType, query.materialType) : true))
            .filter((item) =>
                query.sectionSessionId !== undefined ? matchesId(item.sectionSessionId, query.sectionSessionId) : true
            )
            .filter((item) =>
                query.titleNormalized?.$regex ? new RegExp(query.titleNormalized.$regex, "i").test(item.titleNormalized) : true
            );
        return createQuery(materials);
    });
    t.mock.method(SectionMaterial, "countDocuments", async (query) => {
        data.queryLog.push({ model: "SectionMaterial", method: "countDocuments", query });
        const materials = await SectionMaterial.find(query).lean();
        return materials.length;
    });
    t.mock.method(SectionMaterial, "create", async (payload) => ({
        _id: materialId,
        createdAt: new Date("2026-05-20T00:00:00.000Z"),
        updatedAt: new Date("2026-05-20T00:00:00.000Z"),
        ...payload,
    }));
    t.mock.method(SectionMaterial, "findOneAndUpdate", (filter, update) => {
        data.queryLog.push({ model: "SectionMaterial", method: "findOneAndUpdate", query: filter });
        if (data.updateThrows) {
            throw data.updateThrows;
        }

        if (Object.hasOwn(data, "materialFindOneAndUpdateResult")) {
            return createQuery(data.materialFindOneAndUpdateResult);
        }

        const existing =
            data.materials.find(
                (item) =>
                    matchesId(item._id, filter._id) &&
                    matchesId(item.institutionId, filter.institutionId) &&
                    matchesId(item.sectionId, filter.sectionId)
            ) || null;
        if (!existing) {
            return createQuery(null);
        }

        return createQuery({
            ...existing,
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
                    matchesId(item.sectionId, query.sectionId || item.sectionId) &&
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
}

test("section material model requires file metadata and exposes tenant indexes", async () => {
    const material = new SectionMaterial({
        institutionId,
        sectionId,
        title: "Lecture PDF",
        titleNormalized: "lecture pdf",
        materialType: "lecture_pdf",
        sourceType: "file",
        fileKey: "safe.pdf",
        originalFilename: "Lecture.pdf",
        mimeType: "application/pdf",
        sizeBytes: 123,
        uploadedByUserId: actorUserId,
    });
    await assert.doesNotReject(() => material.validate());

    const missingFileMetadata = new SectionMaterial({
        institutionId,
        sectionId,
        title: "Lecture PDF",
        titleNormalized: "lecture pdf",
        materialType: "lecture_pdf",
        uploadedByUserId: actorUserId,
    });
    await assert.rejects(() => missingFileMetadata.validate(), /File section materials require file metadata/);

    const indexes = SectionMaterial.schema.indexes().map(([fields]) => fields);
    assert.ok(indexes.some((fields) => fields.institutionId === 1 && fields.sectionId === 1 && fields.status === 1));
    assert.ok(indexes.some((fields) => fields.institutionId === 1 && fields.sectionId === 1 && fields.sectionSessionId === 1));
    assert.ok(indexes.some((fields) => fields.institutionId === 1 && fields.sectionId === 1 && fields.titleNormalized === 1));
    assert.ok(indexes.some((fields) => fields.institutionId === 1 && fields.uploadedByUserId === 1));
});

test("section material upload middleware stores private generated PDFs and rejects invalid uploads", async () => {
    const validUpload = await postMaterialUpload({
        filename: "original.pdf",
        mimeType: "application/pdf",
        bytes: Buffer.from("%PDF-1.4\nvalid\n"),
    });

    assert.equal(validUpload.status, 200);
    assert.equal(validUpload.body.originalname, "original.pdf");
    assert.equal(validUpload.body.filename.endsWith(".pdf"), true);
    assert.notEqual(validUpload.body.filename, "original.pdf");
    assert.equal(path.dirname(path.resolve(validUpload.body.path)), privateMaterialUploadDir);
    await fs.promises.unlink(validUpload.body.path);

    const invalidExtension = await postMaterialUpload({
        filename: "original.txt",
        mimeType: "application/pdf",
        bytes: Buffer.from("wrong extension"),
    });
    assert.equal(invalidExtension.status, 400);
    assert.equal(invalidExtension.body.message, "Only PDF files are allowed");

    const invalidMime = await postMaterialUpload({
        filename: "original.pdf",
        mimeType: "text/plain",
        bytes: Buffer.from("%PDF-1.4\nwrong mime\n"),
    });
    assert.equal(invalidMime.status, 400);
    assert.equal(invalidMime.body.message, "Only PDF files are allowed");

    const tooLarge = await postMaterialUpload({
        filename: "too-large.pdf",
        mimeType: "application/pdf",
        bytes: Buffer.alloc((10 * 1024 * 1024) + 1, 1),
    });
    assert.equal(tooLarge.status, 400);
    assert.equal(tooLarge.body.message, "Section material file size exceeds 10MB limit");
});

test("section material service validates uploaded PDF metadata even when middleware is bypassed", () => {
    const payload = { title: "Lecture PDF" };
    const accepted = sectionMaterialService.validateCreateSectionMaterialInput(payload, buildFile());
    assert.equal(accepted.file.fileKey, "saved.pdf");

    assert.throws(
        () => sectionMaterialService.validateCreateSectionMaterialInput(payload, null),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "Material file is required (field: materialFile)");
            return true;
        }
    );
    assert.throws(
        () => sectionMaterialService.validateCreateSectionMaterialInput(payload, buildFile({ size: 0 })),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "Material file must not be empty");
            return true;
        }
    );
    assert.throws(
        () => sectionMaterialService.validateCreateSectionMaterialInput(payload, buildFile({ mimetype: "text/plain" })),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "Only PDF files are allowed");
            return true;
        }
    );
    assert.throws(
        () => sectionMaterialService.validateCreateSectionMaterialInput(payload, buildFile({ originalname: "lecture.txt" })),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "Only PDF files are allowed");
            return true;
        }
    );
    assert.throws(
        () => sectionMaterialService.validateCreateSectionMaterialInput(payload, buildFile({ filename: "../saved.pdf" })),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "Invalid material file");
            return true;
        }
    );
    assert.throws(
        () => sectionMaterialService.validateCreateSectionMaterialInput(payload, buildFile({ filename: "" })),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "Invalid material file");
            return true;
        }
    );
});

test("private section material storage is not exposed through express static routes", async () => {
    const server = await listenOnEphemeralPort(app);
    try {
        const storageResponse = await fetch(`${server.baseUrl}/storage/section-materials/private.pdf`);
        assert.equal(storageResponse.status, 404);

        const directResponse = await fetch(`${server.baseUrl}/section-materials/private.pdf`);
        assert.equal(directResponse.status, 404);
    } finally {
        await server.close();
    }
});

test("staff can create draft or published materials with same-section session validation", async (t) => {
    mockBaseSectionMaterialDependencies(t, { materials: [], sectionSession: buildSectionSession() });

    const draft = await sectionMaterialService.createSectionMaterial({
        institutionId,
        sectionId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: { title: "Lecture 1", materialType: "lecture_pdf", sectionSessionId },
        file: buildFile(),
    });
    assert.equal(draft.material.status, "draft");
    assert.equal(draft.material.sectionSessionId, sectionSessionId);
    assert.equal(draft.material.fileKey, undefined);

    const published = await sectionMaterialService.createSectionMaterial({
        institutionId,
        sectionId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: { title: "Lecture 2", materialType: "note_pdf", status: "published" },
        file: buildFile({ filename: "saved-2.pdf" }),
    });
    assert.equal(published.material.status, "published");
    assert.ok(published.material.publishedAt);

    t.mock.reset();
    mockBaseSectionMaterialDependencies(t, {
        materials: [],
        sectionSession: buildSectionSession({ sectionId: otherSectionId }),
    });
    await assert.rejects(
        () =>
            sectionMaterialService.createSectionMaterial({
                institutionId,
                sectionId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: { title: "Wrong session", sectionSessionId },
                file: buildFile(),
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Section session not found");
            return true;
        }
    );
});

test("students and unrelated instructors cannot create section materials", async (t) => {
    mockBaseSectionMaterialDependencies(t, { materials: [] });

    await assert.rejects(
        () =>
            sectionMaterialService.createSectionMaterial({
                institutionId,
                sectionId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
                payload: { title: "Student upload" },
                file: buildFile(),
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Students cannot manage section materials");
            return true;
        }
    );

    await assert.rejects(
        () =>
            sectionMaterialService.createSectionMaterial({
                institutionId,
                sectionId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: otherMemberId, role: "instructor" }),
                payload: { title: "Other instructor" },
                file: buildFile(),
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Permission denied");
            return true;
        }
    );

    await assert.rejects(
        () =>
            sectionMaterialService.createSectionMaterial({
                institutionId: otherInstitutionId,
                sectionId,
                actorUserId,
                actorMembership: buildActorMembership({ institutionId: otherInstitutionId, role: "admin" }),
                payload: { title: "Other tenant" },
                file: buildFile(),
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Section not found");
            return true;
        }
    );
});

test("staff list is scoped and filters status materialType session and search", async (t) => {
    mockBaseSectionMaterialDependencies(t, {
        materials: [
            buildMaterial({ status: "draft", materialType: "lecture_pdf", sectionSessionId, titleNormalized: "intro lecture" }),
            buildMaterial({
                _id: "507f1f77bcf86cd799439052",
                status: "published",
                materialType: "note_pdf",
                titleNormalized: "other notes",
            }),
        ],
        sectionSession: buildSectionSession(),
    });

    const result = await sectionMaterialService.listSectionMaterialsForStaff({
        institutionId,
        sectionId,
        actorUserId,
        actorMembership: buildActorMembership(),
        query: {
            status: "draft",
            materialType: "lecture_pdf",
            sectionSessionId,
            search: "intro",
            page: "1",
            limit: "20",
        },
    });

    assert.equal(result.materials.length, 1);
    assert.equal(result.materials[0].status, "draft");
    assert.equal(result.materials[0].materialType, "lecture_pdf");
    assert.equal(result.pagination.total, 1);
});

test("student list returns only published materials from active enrolled sections", async (t) => {
    mockBaseSectionMaterialDependencies(t, {
        materials: [
            buildMaterial({ status: "published", materialType: "lecture_pdf" }),
            buildMaterial({ _id: "507f1f77bcf86cd799439052", status: "draft", titleNormalized: "draft" }),
            buildMaterial({ _id: "507f1f77bcf86cd799439053", status: "archived", titleNormalized: "archived" }),
            buildMaterial({
                _id: "507f1f77bcf86cd799439054",
                sectionId: otherSectionId,
                status: "published",
                titleNormalized: "other section",
            }),
        ],
        enrollments: [
            buildEnrollment({ studentMemberId }),
            buildEnrollment({ _id: "507f1f77bcf86cd799439062", sectionId: otherSectionId, studentMemberId, status: "dropped" }),
        ],
    });

    const result = await sectionMaterialService.listMySectionMaterials({
        institutionId,
        actorUserId,
        actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
        query: { page: "1", limit: "10" },
    });

    assert.equal(result.materials.length, 1);
    assert.equal(result.materials[0].status, "published");
    assert.equal(result.materials[0].sectionId, sectionId);
});

test("section material service keeps material reads and updates tenant and section scoped", async (t) => {
    const queryLog = [];
    t.mock.method(fs.promises, "access", async () => undefined);
    t.mock.method(fs.promises, "unlink", async () => undefined);
    mockBaseSectionMaterialDependencies(t, {
        queryLog,
        materials: [buildMaterial({ status: "published", fileKey: "old.pdf" })],
        enrollments: [buildEnrollment({ studentMemberId })],
    });

    await sectionMaterialService.getSectionMaterialByIdForStaff({
        institutionId,
        sectionId,
        materialId,
        actorUserId,
        actorMembership: buildActorMembership(),
    });
    await sectionMaterialService.listSectionMaterialsForStaff({
        institutionId,
        sectionId,
        actorUserId,
        actorMembership: buildActorMembership(),
        query: { status: "published" },
    });
    await sectionMaterialService.updateSectionMaterial({
        institutionId,
        sectionId,
        materialId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: { description: "Scoped update" },
        file: null,
    });
    await sectionMaterialService.updateSectionMaterial({
        institutionId,
        sectionId,
        materialId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: {},
        file: buildFile({ filename: "new.pdf" }),
    });
    await sectionMaterialService.updateSectionMaterialStatus({
        institutionId,
        sectionId,
        materialId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: { status: "archived" },
    });
    await sectionMaterialService.getSectionMaterialFileAccess({
        institutionId,
        sectionId,
        materialId,
        actorUserId,
        actorMembership: buildActorMembership(),
    });
    await sectionMaterialService.listMySectionMaterials({
        institutionId,
        actorUserId,
        actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
        query: {},
    });

    const sectionMaterialLogs = queryLog.filter((entry) => entry.model === "SectionMaterial");
    assert.ok(sectionMaterialLogs.length > 0);
    for (const entry of sectionMaterialLogs) {
        assert.equal(normalizeId(entry.query.institutionId), institutionId, `${entry.method} must include institutionId`);

        if (entry.query._id !== undefined || entry.method === "findOneAndUpdate") {
            assert.equal(normalizeId(entry.query._id), materialId, `${entry.method} must target materialId`);
            assert.equal(normalizeId(entry.query.sectionId), sectionId, `${entry.method} must include sectionId`);
        }
    }

    const updateFilters = sectionMaterialLogs.filter((entry) => entry.method === "findOneAndUpdate");
    assert.equal(updateFilters.length, 3);
    for (const entry of updateFilters) {
        assert.deepEqual(
            {
                _id: normalizeId(entry.query._id),
                institutionId: normalizeId(entry.query.institutionId),
                sectionId: normalizeId(entry.query.sectionId),
            },
            { _id: materialId, institutionId, sectionId }
        );
    }

    const staffListQuery = sectionMaterialLogs.find(
        (entry) => entry.method === "find" && normalizeId(entry.query.sectionId) === sectionId
    );
    assert.ok(staffListQuery);
    assert.equal(staffListQuery.query.status, "published");

    const studentListQuery = sectionMaterialLogs.find(
        (entry) => entry.method === "find" && Array.isArray(entry.query.sectionId?.$in)
    );
    assert.ok(studentListQuery);
    assert.equal(studentListQuery.query.status, "published");
    assert.deepEqual(studentListQuery.query.sectionId.$in.map(normalizeId), [sectionId]);
});

test("metadata update normalizes title and archived materials are read-only", async (t) => {
    mockBaseSectionMaterialDependencies(t, {
        materials: [buildMaterial({ status: "published" })],
    });

    const result = await sectionMaterialService.updateSectionMaterial({
        institutionId,
        sectionId,
        materialId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: { title: "  New Lecture   Title  ", description: "Updated", materialType: "resource_pdf" },
        file: null,
    });
    assert.equal(result.material.title, "New Lecture   Title");
    assert.equal(result.material.materialType, "resource_pdf");

    const storedTitleNormalized = sectionMaterialService.validateUpdateSectionMaterialInput({
        title: "  New Lecture   Title  ",
    }).titleNormalized;
    assert.equal(storedTitleNormalized, "new lecture title");

    t.mock.reset();
    mockBaseSectionMaterialDependencies(t, {
        materials: [buildMaterial({ status: "archived" })],
    });

    await assert.rejects(
        () =>
            sectionMaterialService.updateSectionMaterial({
                institutionId,
                sectionId,
                materialId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: { title: "Nope" },
                file: null,
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Archived section material is read-only");
            return true;
        }
    );
});

test("file replacement deletes old file only after successful database update", async (t) => {
    let removedFile = null;
    t.mock.method(fs.promises, "unlink", async (filePath) => {
        removedFile = filePath;
    });
    mockBaseSectionMaterialDependencies(t, {
        materials: [buildMaterial({ fileKey: "old.pdf" })],
    });

    const result = await sectionMaterialService.updateSectionMaterial({
        institutionId,
        sectionId,
        materialId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: {},
        file: buildFile({ filename: "new.pdf" }),
    });
    assert.equal(result.material.originalFilename, "lecture.pdf");
    assert.equal(removedFile, path.join(privateMaterialUploadDir, "old.pdf"));

    t.mock.reset();
    let removedOnFailure = null;
    t.mock.method(fs.promises, "unlink", async (filePath) => {
        removedOnFailure = filePath;
    });
    mockBaseSectionMaterialDependencies(t, {
        materials: [buildMaterial({ fileKey: "old.pdf" })],
        updateThrows: new Error("db failed"),
    });

    await assert.rejects(
        () =>
            sectionMaterialService.updateSectionMaterial({
                institutionId,
                sectionId,
                materialId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: {},
                file: buildFile({ filename: "new.pdf" }),
            }),
        /db failed/
    );
    assert.equal(removedOnFailure, null);
});

test("empty uploaded material files are rejected through service validation", async (t) => {
    mockBaseSectionMaterialDependencies(t, { materials: [] });

    await assert.rejects(
        () =>
            sectionMaterialService.createSectionMaterial({
                institutionId,
                sectionId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: { title: "Empty" },
                file: buildFile({ size: 0 }),
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "Material file must not be empty");
            return true;
        }
    );
});

test("section material status transitions control publication and archive timestamps", async (t) => {
    mockBaseSectionMaterialDependencies(t, {
        materials: [buildMaterial({ status: "draft", publishedAt: null })],
    });

    const published = await sectionMaterialService.updateSectionMaterialStatus({
        institutionId,
        sectionId,
        materialId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: { status: "published" },
    });
    assert.equal(published.material.status, "published");
    assert.ok(published.material.publishedAt);

    t.mock.reset();
    mockBaseSectionMaterialDependencies(t, {
        materials: [buildMaterial({ status: "published" })],
    });
    const archived = await sectionMaterialService.updateSectionMaterialStatus({
        institutionId,
        sectionId,
        materialId,
        actorUserId,
        actorMembership: buildActorMembership(),
        payload: { status: "archived" },
    });
    assert.equal(archived.material.status, "archived");
    assert.ok(archived.material.archivedAt);

    t.mock.reset();
    mockBaseSectionMaterialDependencies(t, {
        materials: [buildMaterial({ status: "archived" })],
    });
    await assert.rejects(
        () =>
            sectionMaterialService.updateSectionMaterialStatus({
                institutionId,
                sectionId,
                materialId,
                actorUserId,
                actorMembership: buildActorMembership(),
                payload: { status: "published" },
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Unsupported section material status transition");
            return true;
        }
    );
});

test("download allows staff and enrolled students for published materials only", async (t) => {
    mockBaseSectionMaterialDependencies(t, {
        materials: [buildMaterial({ status: "published", fileKey: "lecture.pdf" })],
        enrollments: [buildEnrollment({ studentMemberId })],
    });
    t.mock.method(fs.promises, "access", async () => undefined);

    const staffAccess = await sectionMaterialService.getSectionMaterialFileAccess({
        institutionId,
        sectionId,
        materialId,
        actorUserId,
        actorMembership: buildActorMembership(),
    });
    assert.equal(staffAccess.filename, "Lecture 1.pdf");

    const studentAccess = await sectionMaterialService.getSectionMaterialFileAccess({
        institutionId,
        sectionId,
        materialId,
        actorUserId,
        actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
    });
    assert.equal(studentAccess.mimeType, "application/pdf");

    await assert.rejects(
        () =>
            sectionMaterialService.getSectionMaterialFileAccess({
                institutionId,
                sectionId,
                materialId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: otherMemberId, role: "instructor" }),
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Permission denied");
            return true;
        }
    );

    await assert.rejects(
        () =>
            sectionMaterialService.getSectionMaterialFileAccess({
                institutionId: otherInstitutionId,
                sectionId,
                materialId,
                actorUserId,
                actorMembership: buildActorMembership({ institutionId: otherInstitutionId, role: "admin" }),
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Section not found");
            return true;
        }
    );

    t.mock.reset();
    mockBaseSectionMaterialDependencies(t, {
        materials: [buildMaterial({ status: "published", sectionId: otherSectionId })],
        enrollments: [buildEnrollment({ studentMemberId })],
    });

    await assert.rejects(
        () =>
            sectionMaterialService.getSectionMaterialFileAccess({
                institutionId,
                sectionId,
                materialId,
                actorUserId,
                actorMembership: buildActorMembership(),
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Section material file not found");
            return true;
        }
    );

    t.mock.reset();
    mockBaseSectionMaterialDependencies(t, {
        materials: [buildMaterial({ status: "draft" })],
        enrollments: [buildEnrollment({ studentMemberId })],
    });

    await assert.rejects(
        () =>
            sectionMaterialService.getSectionMaterialFileAccess({
                institutionId,
                sectionId,
                materialId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Section material not found");
            return true;
        }
    );
});

test("download rejects unenrolled students unsafe file keys and missing files", async (t) => {
    mockBaseSectionMaterialDependencies(t, {
        materials: [buildMaterial({ fileKey: "../secret.pdf" })],
        enrollments: [buildEnrollment({ studentMemberId })],
    });

    await assert.rejects(
        () =>
            sectionMaterialService.getSectionMaterialFileAccess({
                institutionId,
                sectionId,
                materialId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Section material file not found");
            return true;
        }
    );

    t.mock.reset();
    mockBaseSectionMaterialDependencies(t, {
        materials: [buildMaterial({ fileKey: "missing.pdf" })],
        enrollments: [buildEnrollment({ studentMemberId, status: "dropped" })],
    });
    await assert.rejects(
        () =>
            sectionMaterialService.getSectionMaterialFileAccess({
                institutionId,
                sectionId,
                materialId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Student is not enrolled in this section");
            return true;
        }
    );

    t.mock.reset();
    mockBaseSectionMaterialDependencies(t, {
        materials: [buildMaterial({ fileKey: "missing.pdf" })],
        enrollments: [buildEnrollment({ studentMemberId })],
    });
    t.mock.method(fs.promises, "access", async () => {
        throw new Error("missing");
    });
    await assert.rejects(
        () =>
            sectionMaterialService.getSectionMaterialFileAccess({
                institutionId,
                sectionId,
                materialId,
                actorUserId,
                actorMembership: buildActorMembership({ _id: studentMemberId, role: "student" }),
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Section material file not found");
            return true;
        }
    );
});

test("section material controller returns envelopes delegates downloads and cleans failed uploads", async (t) => {
    t.mock.method(sectionMaterialService, "createSectionMaterial", async () => ({
        material: sectionMaterialService.toSectionMaterialResponse(buildMaterial()),
    }));
    const createRes = createResponse();
    await sectionMaterialController.createSectionMaterial(
        {
            params: { institutionId, sectionId },
            user: { id: actorUserId },
            membership: buildActorMembership(),
            body: { title: "Demo" },
            file: buildFile(),
        },
        createRes
    );
    assert.equal(createRes.statusCode, 201);
    assert.equal(createRes.body.material.id, materialId);

    t.mock.reset();
    let removedCreateFile = null;
    t.mock.method(fs.promises, "unlink", async (filePath) => {
        removedCreateFile = filePath;
    });
    t.mock.method(sectionMaterialService, "createSectionMaterial", async () => {
        const error = new Error("Section session not found");
        error.statusCode = 404;
        throw error;
    });
    const failedCreateRes = createResponse();
    await sectionMaterialController.createSectionMaterial(
        {
            params: { institutionId, sectionId },
            user: { id: actorUserId },
            membership: buildActorMembership(),
            body: { title: "Demo" },
            file: { path: path.join(privateMaterialUploadDir, "new-create.pdf") },
        },
        failedCreateRes
    );
    assert.equal(failedCreateRes.statusCode, 404);
    assert.equal(failedCreateRes.body.message, "Section session not found");
    assert.equal(removedCreateFile, path.join(privateMaterialUploadDir, "new-create.pdf"));

    t.mock.reset();
    let removedFile = null;
    t.mock.method(fs.promises, "unlink", async (filePath) => {
        removedFile = filePath;
    });
    t.mock.method(sectionMaterialService, "updateSectionMaterial", async () => {
        const error = new Error("Archived section material is read-only");
        error.statusCode = 409;
        throw error;
    });
    const updateRes = createResponse();
    await sectionMaterialController.updateSectionMaterial(
        {
            params: { institutionId, sectionId, materialId },
            user: { id: actorUserId },
            membership: buildActorMembership(),
            body: {},
            file: { path: path.join(privateMaterialUploadDir, "new.pdf") },
        },
        updateRes
    );
    assert.equal(updateRes.statusCode, 409);
    assert.equal(removedFile, path.join(privateMaterialUploadDir, "new.pdf"));

    t.mock.reset();
    t.mock.method(fs.promises, "unlink", async () => {
        throw new Error("cleanup failed");
    });
    t.mock.method(sectionMaterialService, "updateSectionMaterial", async () => {
        const error = new Error("Archived section material is read-only");
        error.statusCode = 409;
        throw error;
    });
    const cleanupFailureRes = createResponse();
    await sectionMaterialController.updateSectionMaterial(
        {
            params: { institutionId, sectionId, materialId },
            user: { id: actorUserId },
            membership: buildActorMembership(),
            body: {},
            file: { path: path.join(privateMaterialUploadDir, "cleanup-fails.pdf") },
        },
        cleanupFailureRes
    );
    assert.equal(cleanupFailureRes.statusCode, 409);
    assert.equal(cleanupFailureRes.body.message, "Archived section material is read-only");

    t.mock.reset();
    let attemptedUnsafeCleanup = false;
    t.mock.method(fs.promises, "unlink", async () => {
        attemptedUnsafeCleanup = true;
    });
    t.mock.method(sectionMaterialService, "updateSectionMaterial", async () => {
        const error = new Error("Archived section material is read-only");
        error.statusCode = 409;
        throw error;
    });
    const unsafeCleanupRes = createResponse();
    await sectionMaterialController.updateSectionMaterial(
        {
            params: { institutionId, sectionId, materialId },
            user: { id: actorUserId },
            membership: buildActorMembership(),
            body: {},
            file: { path: path.resolve(__dirname, "not-private.pdf") },
        },
        unsafeCleanupRes
    );
    assert.equal(unsafeCleanupRes.statusCode, 409);
    assert.equal(attemptedUnsafeCleanup, false);

    t.mock.reset();
    let receivedArgs = null;
    t.mock.method(sectionMaterialService, "getSectionMaterialFileAccess", async (args) => {
        receivedArgs = args;
        return {
            filePath: path.join(privateMaterialUploadDir, "lecture.pdf"),
            filename: "Lecture.pdf",
            mimeType: "application/pdf",
        };
    });
    const downloadRes = createResponse();
    await sectionMaterialController.downloadSectionMaterialFile(
        {
            params: { institutionId, sectionId, materialId },
            user: { id: actorUserId },
            membership: buildActorMembership({ _id: studentMemberId, role: "student" }),
        },
        downloadRes
    );
    assert.equal(receivedArgs.materialId, materialId);
    assert.equal(downloadRes.headers["Content-Type"], "application/pdf");
    assert.deepEqual(downloadRes.downloaded, {
        filePath: path.join(privateMaterialUploadDir, "lecture.pdf"),
        filename: "Lecture.pdf",
    });
});

test("section material routes are wired with protected middleware and upload only where needed", () => {
    const findRoute = (routePath, method) =>
        institutionRoutes.stack
            .filter((layer) => layer.route)
            .map((layer) => layer.route)
            .find((route) => route.path === routePath && route.methods[method]);

    const createRoute = findRoute("/:institutionId/sections/:sectionId/materials", "post");
    const listRoute = findRoute("/:institutionId/sections/:sectionId/materials", "get");
    const studentListRoute = findRoute("/:institutionId/students/me/materials", "get");
    const updateRoute = findRoute("/:institutionId/sections/:sectionId/materials/:materialId", "patch");
    const statusRoute = findRoute("/:institutionId/sections/:sectionId/materials/:materialId/status", "patch");
    const downloadRoute = findRoute("/:institutionId/sections/:sectionId/materials/:materialId/file", "get");

    assert.deepEqual(
        createRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "uploadSectionMaterial", "createSectionMaterial"]
    );
    assert.deepEqual(
        listRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "listSectionMaterialsForStaff"]
    );
    assert.deepEqual(
        studentListRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "listMySectionMaterials"]
    );
    assert.deepEqual(
        updateRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "uploadSectionMaterial", "updateSectionMaterial"]
    );
    assert.deepEqual(
        statusRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "updateSectionMaterialStatus"]
    );
    assert.deepEqual(
        downloadRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "downloadSectionMaterialFile"]
    );
});
