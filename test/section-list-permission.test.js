const test = require("node:test");
const assert = require("node:assert/strict");

const Department = require("../src/models/Department");
const Institution = require("../src/models/Institution");
const Section = require("../src/models/Section");
const Subject = require("../src/models/Subject");
const sectionController = require("../src/controllers/sectionController");
const sectionService = require("../src/services/sectionService");
const institutionRoutes = require("../src/routes/institutionRoutes");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439012";
const semesterId = "507f1f77bcf86cd799439021";
const subjectId = "507f1f77bcf86cd799439031";
const otherSubjectId = "507f1f77bcf86cd799439032";
const departmentId = "507f1f77bcf86cd799439041";
const instructorMemberId = "507f1f77bcf86cd799439051";
const otherInstructorMemberId = "507f1f77bcf86cd799439052";
const actorUserId = "507f1f77bcf86cd799439061";

function createQuery(result) {
    return {
        select() {
            return this;
        },
        sort() {
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

    return normalizeId(value) === normalizeId(condition);
}

function buildSection(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439071",
        institutionId,
        semesterId,
        subjectId,
        schoolClassId: null,
        code: "SEC-1",
        title: "Section 1",
        instructorMemberId,
        capacity: 30,
        schedule: [],
        status: "active",
        updatedAt: new Date("2026-06-05T00:00:00.000Z"),
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

function mockSectionListDependencies(t, dataset = {}) {
    const data = {
        institution: { _id: institutionId, type: "university" },
        department: { _id: departmentId, institutionId },
        subjects: [
            { _id: subjectId, institutionId, departmentId },
            { _id: otherSubjectId, institutionId, departmentId: "507f1f77bcf86cd799439042" },
        ],
        sections: [
            buildSection({ _id: "507f1f77bcf86cd799439071", code: "OWN-1" }),
            buildSection({
                _id: "507f1f77bcf86cd799439072",
                code: "OTHER-1",
                instructorMemberId: otherInstructorMemberId,
            }),
            buildSection({
                _id: "507f1f77bcf86cd799439073",
                institutionId: otherInstitutionId,
                code: "TENANT-OTHER",
            }),
        ],
        queryLog: [],
        ...dataset,
    };

    t.mock.method(Institution, "findOne", (query) => {
        data.queryLog.push({ model: "Institution", method: "findOne", query });
        return createQuery(matchesId(data.institution?._id, query._id) ? data.institution : null);
    });
    t.mock.method(Department, "findOne", (query) => {
        data.queryLog.push({ model: "Department", method: "findOne", query });
        return createQuery(
            matchesId(data.department?._id, query._id) && matchesId(data.department?.institutionId, query.institutionId)
                ? data.department
                : null
        );
    });
    t.mock.method(Subject, "find", (query) => {
        data.queryLog.push({ model: "Subject", method: "find", query });
        const subjects = data.subjects
            .filter((subject) => matchesId(subject.institutionId, query.institutionId))
            .filter((subject) => matchesId(subject.departmentId, query.departmentId || subject.departmentId));
        return createQuery(subjects);
    });
    t.mock.method(Section, "find", (query) => {
        data.queryLog.push({ model: "Section", method: "find", query });
        const sections = data.sections
            .filter((section) => matchesId(section.institutionId, query.institutionId))
            .filter((section) => matchesId(section.semesterId, query.semesterId || section.semesterId))
            .filter((section) => matchesId(section.subjectId, query.subjectId || section.subjectId))
            .filter((section) => matchesId(section.instructorMemberId, query.instructorMemberId || section.instructorMemberId))
            .filter((section) => matchesId(section.status, query.status || section.status));
        return createQuery(sections);
    });

    return data;
}

function createResponse() {
    return {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

test("instructor with section.read can list only assigned sections", async (t) => {
    const data = mockSectionListDependencies(t);

    const result = await sectionService.listSections({
        institutionId,
        query: {},
        actorMembership: buildActorMembership(),
    });

    assert.deepEqual(
        result.sections.map((section) => section.code),
        ["OWN-1"]
    );

    const sectionRead = data.queryLog.find((entry) => entry.model === "Section" && entry.method === "find");
    assert.equal(normalizeId(sectionRead.query.institutionId), institutionId);
    assert.equal(normalizeId(sectionRead.query.instructorMemberId), instructorMemberId);
});

test("instructor section list does not trust client-provided instructorMemberId", async (t) => {
    const data = mockSectionListDependencies(t);

    const result = await sectionService.listSections({
        institutionId,
        query: {
            instructorMemberId: otherInstructorMemberId,
        },
        actorMembership: buildActorMembership(),
    });

    assert.deepEqual(result.sections, []);
    assert.equal(data.queryLog.some((entry) => entry.model === "Section"), false);
});

test("instructor section list remains tenant scoped", async (t) => {
    const data = mockSectionListDependencies(t);

    const result = await sectionService.listSections({
        institutionId,
        query: {},
        actorMembership: buildActorMembership(),
    });

    assert.equal(result.sections.some((section) => section.code === "TENANT-OTHER"), false);

    const tenantScopedReads = data.queryLog.filter((entry) => ["Institution", "Section"].includes(entry.model));
    assert.ok(tenantScopedReads.length > 0);
    for (const entry of tenantScopedReads) {
        assert.equal(normalizeId(entry.query.institutionId || entry.query._id), institutionId);
    }
});

test("admin section list preserves broad filters", async (t) => {
    const data = mockSectionListDependencies(t);

    const result = await sectionService.listSections({
        institutionId,
        query: {
            status: "active",
            departmentId,
        },
        actorMembership: buildActorMembership({
            _id: "507f1f77bcf86cd799439099",
            role: "admin",
        }),
    });

    assert.deepEqual(
        result.sections.map((section) => section.code),
        ["OWN-1", "OTHER-1"]
    );

    const sectionRead = data.queryLog.find((entry) => entry.model === "Section" && entry.method === "find");
    assert.equal(normalizeId(sectionRead.query.institutionId), institutionId);
    assert.equal(sectionRead.query.instructorMemberId, undefined);
    assert.deepEqual(sectionRead.query.subjectId.$in.map(normalizeId), [subjectId]);
    assert.equal(sectionRead.query.status, "active");
});

test("student cannot use generic staff section list", async (t) => {
    mockSectionListDependencies(t);

    await assert.rejects(
        () =>
            sectionService.listSections({
                institutionId,
                query: {},
                actorMembership: buildActorMembership({
                    _id: "507f1f77bcf86cd799439098",
                    role: "student",
                }),
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Permission denied");
            return true;
        }
    );
});

test("section list controller passes authenticated membership context", async (t) => {
    let receivedArgs = null;
    t.mock.method(sectionService, "listSections", async (args) => {
        receivedArgs = args;
        return { sections: [] };
    });

    const res = createResponse();
    const actorMembership = buildActorMembership();
    await sectionController.listSections(
        {
            params: { institutionId },
            query: { status: "active" },
            membership: actorMembership,
        },
        res
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { sections: [] });
    assert.equal(receivedArgs.actorMembership, actorMembership);
});

test("generic section list route is guarded by section.read", () => {
    const route = institutionRoutes.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route)
        .find((candidate) => candidate.path === "/:institutionId/sections" && candidate.methods.get);

    assert.ok(route);
    assert.deepEqual(
        route.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "<anonymous>", "listSections"]
    );
    assert.equal(route.stack[3].handle.requiredPermission, "section.read");
});
