const test = require("node:test");
const assert = require("node:assert/strict");

const Department = require("../src/models/Department");
const Institution = require("../src/models/Institution");
const ResponsibilityAssignment = require("../src/models/ResponsibilityAssignment");
const SchoolClass = require("../src/models/SchoolClass");
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
const otherDepartmentId = "507f1f77bcf86cd799439042";
const classLevelId = "507f1f77bcf86cd799439043";
const schoolClassId = "507f1f77bcf86cd799439044";
const instructorMemberId = "507f1f77bcf86cd799439051";
const otherInstructorMemberId = "507f1f77bcf86cd799439052";
const coordinatorMemberId = "507f1f77bcf86cd799439053";
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

function matchesCondition(record, condition = {}) {
    return Object.entries(condition).every(([key, value]) => matchesId(record[key], value));
}

function matchesSectionQuery(section, query) {
    return Object.entries(query)
        .filter(([key]) => key !== "$or")
        .every(([key, value]) => matchesId(section[key], value)) &&
        (!query.$or || query.$or.some((condition) => matchesCondition(section, condition)));
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
        createdByUserId: "507f1f77bcf86cd799439063",
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
        departments: [
            { _id: departmentId, institutionId },
            { _id: otherDepartmentId, institutionId },
        ],
        subjects: [
            { _id: subjectId, institutionId, departmentId },
            { _id: otherSubjectId, institutionId, departmentId: otherDepartmentId },
        ],
        schoolClasses: [
            { _id: schoolClassId, institutionId, classLevelId },
        ],
        responsibilityAssignments: [],
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
        const department = data.departments.find(
            (record) => matchesId(record._id, query._id) && matchesId(record.institutionId, query.institutionId)
        );
        return createQuery(department || null);
    });
    t.mock.method(Subject, "find", (query) => {
        data.queryLog.push({ model: "Subject", method: "find", query });
        const subjects = data.subjects
            .filter((subject) => matchesId(subject.institutionId, query.institutionId))
            .filter((subject) => matchesId(subject.departmentId, query.departmentId || subject.departmentId))
            .filter((subject) => matchesId(subject.classLevelId, query.classLevelId || subject.classLevelId));
        return createQuery(subjects);
    });
    t.mock.method(SchoolClass, "find", (query) => {
        data.queryLog.push({ model: "SchoolClass", method: "find", query });
        const schoolClasses = data.schoolClasses
            .filter((schoolClass) => matchesId(schoolClass.institutionId, query.institutionId))
            .filter((schoolClass) => matchesId(schoolClass.classLevelId, query.classLevelId || schoolClass.classLevelId));
        return createQuery(schoolClasses);
    });
    t.mock.method(ResponsibilityAssignment, "find", (query) => {
        data.queryLog.push({ model: "ResponsibilityAssignment", method: "find", query });
        const assignments = data.responsibilityAssignments
            .filter((assignment) => matchesId(assignment.institutionId, query.institutionId))
            .filter((assignment) => matchesId(assignment.userId, query.userId))
            .filter((assignment) => matchesId(assignment.isActive, query.isActive))
            .filter((assignment) => matchesId(assignment.responsibilityType, query.responsibilityType || assignment.responsibilityType))
            .filter((assignment) => matchesId(assignment.scopeType, query.scopeType || assignment.scopeType));
        return createQuery(assignments);
    });
    t.mock.method(Section, "find", (query) => {
        data.queryLog.push({ model: "Section", method: "find", query });
        const sections = data.sections.filter((section) => matchesSectionQuery(section, query));
        return createQuery(sections);
    });
    t.mock.method(Section, "findOne", (query) => {
        data.queryLog.push({ model: "Section", method: "findOne", query });
        return createQuery(data.sections.find((section) => matchesSectionQuery(section, query)) || null);
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
    assert.deepEqual(sectionRead.query.$or, [{ instructorMemberId }]);
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
    const sectionRead = data.queryLog.find((entry) => entry.model === "Section" && entry.method === "find");
    assert.equal(normalizeId(sectionRead.query.instructorMemberId), otherInstructorMemberId);
    assert.deepEqual(sectionRead.query.$or, [{ instructorMemberId }]);
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

test("admin section list can filter by instructorMemberId", async (t) => {
    const data = mockSectionListDependencies(t);

    const result = await sectionService.listSections({
        institutionId,
        query: {
            instructorMemberId: otherInstructorMemberId,
        },
        actorMembership: buildActorMembership({
            _id: "507f1f77bcf86cd799439099",
            role: "admin",
        }),
    });

    assert.deepEqual(
        result.sections.map((section) => section.code),
        ["OTHER-1"]
    );

    const sectionRead = data.queryLog.find((entry) => entry.model === "Section" && entry.method === "find");
    assert.equal(normalizeId(sectionRead.query.institutionId), institutionId);
    assert.equal(normalizeId(sectionRead.query.instructorMemberId), otherInstructorMemberId);
});

test("owner section list preserves institution-wide access separately from admin role", async (t) => {
    const data = mockSectionListDependencies(t, {
        institution: { _id: institutionId, type: "university", ownerUserId: actorUserId },
    });

    const result = await sectionService.listSections({
        institutionId,
        query: {},
        actorMembership: buildActorMembership({
            _id: "507f1f77bcf86cd799439097",
            role: "student",
            userId: actorUserId,
        }),
    });

    assert.deepEqual(
        result.sections.map((section) => section.code),
        ["OWN-1", "OTHER-1"]
    );

    const sectionRead = data.queryLog.find((entry) => entry.model === "Section" && entry.method === "find");
    assert.equal(sectionRead.query.$or, undefined);
});

test("coordinator section list is limited to assigned department scope", async (t) => {
    const data = mockSectionListDependencies(t, {
        sections: [
            buildSection({ _id: "507f1f77bcf86cd799439071", code: "DEPT-1", subjectId }),
            buildSection({ _id: "507f1f77bcf86cd799439072", code: "DEPT-OTHER", subjectId: otherSubjectId }),
        ],
        responsibilityAssignments: [
            {
                _id: "507f1f77bcf86cd799439081",
                institutionId,
                userId: actorUserId,
                responsibilityType: "coordinator",
                scopeType: "department",
                scopeId: departmentId,
                isActive: true,
            },
        ],
    });

    const result = await sectionService.listSections({
        institutionId,
        query: {},
        actorMembership: buildActorMembership({
            _id: coordinatorMemberId,
            role: "instructor",
        }),
    });

    assert.deepEqual(
        result.sections.map((section) => section.code),
        ["DEPT-1"]
    );

    const sectionRead = data.queryLog.find((entry) => entry.model === "Section" && entry.method === "find");
    assert.deepEqual(sectionRead.query.$or, [{ instructorMemberId: coordinatorMemberId }, { subjectId: { $in: [subjectId] } }]);
});

test("head section list does not grant generic operational section read", async (t) => {
    const data = mockSectionListDependencies(t, {
        sections: [
            buildSection({ _id: "507f1f77bcf86cd799439071", code: "DEPT-1", subjectId }),
            buildSection({ _id: "507f1f77bcf86cd799439072", code: "DEPT-OTHER", subjectId: otherSubjectId }),
        ],
        responsibilityAssignments: [
            {
                _id: "507f1f77bcf86cd799439081",
                institutionId,
                userId: actorUserId,
                responsibilityType: "head",
                scopeType: "department",
                scopeId: departmentId,
                permissions: ["section.read_scope"],
                isActive: true,
            },
        ],
    });

    const result = await sectionService.listSections({
        institutionId,
        query: { departmentId: otherDepartmentId },
        actorMembership: buildActorMembership({
            _id: coordinatorMemberId,
            role: "instructor",
        }),
    });

    assert.deepEqual(result.sections, []);

    const sectionRead = data.queryLog.find((entry) => entry.model === "Section" && entry.method === "find");
    assert.deepEqual(sectionRead.query.subjectId.$in.map(normalizeId), [otherSubjectId]);
    assert.deepEqual(sectionRead.query.$or, [{ instructorMemberId: coordinatorMemberId }]);
});

test("cross-tenant responsibility assignment does not grant section list access", async (t) => {
    mockSectionListDependencies(t, {
        responsibilityAssignments: [
            {
                _id: "507f1f77bcf86cd799439081",
                institutionId: otherInstitutionId,
                userId: actorUserId,
                responsibilityType: "coordinator",
                scopeType: "department",
                scopeId: departmentId,
                isActive: true,
            },
        ],
    });

    const result = await sectionService.listSections({
        institutionId,
        query: {},
        actorMembership: buildActorMembership({
            _id: coordinatorMemberId,
            role: "instructor",
        }),
    });

    assert.deepEqual(result.sections, []);
});

test("inactive and expired responsibility assignments do not grant section list access", async (t) => {
    mockSectionListDependencies(t, {
        responsibilityAssignments: [
            {
                _id: "507f1f77bcf86cd799439081",
                institutionId,
                userId: actorUserId,
                responsibilityType: "coordinator",
                scopeType: "department",
                scopeId: departmentId,
                isActive: false,
            },
            {
                _id: "507f1f77bcf86cd799439082",
                institutionId,
                userId: actorUserId,
                responsibilityType: "head",
                scopeType: "department",
                scopeId: departmentId,
                isActive: true,
                endAt: new Date("2020-01-01T00:00:00.000Z"),
            },
        ],
    });

    const result = await sectionService.listSections({
        institutionId,
        query: {},
        actorMembership: buildActorMembership({
            _id: coordinatorMemberId,
            role: "instructor",
        }),
    });

    assert.deepEqual(result.sections, []);
});

test("mentor responsibility does not grant staff section list management scope", async (t) => {
    mockSectionListDependencies(t, {
        responsibilityAssignments: [
            {
                _id: "507f1f77bcf86cd799439081",
                institutionId,
                userId: actorUserId,
                responsibilityType: "mentor",
                scopeType: "department",
                scopeId: departmentId,
                permissions: ["section.manage_scope"],
                isActive: true,
            },
        ],
    });

    const result = await sectionService.listSections({
        institutionId,
        query: {},
        actorMembership: buildActorMembership({
            _id: coordinatorMemberId,
            role: "instructor",
        }),
    });

    assert.deepEqual(result.sections, []);
});

test("student cannot use coordinator responsibility to access generic staff section list", async (t) => {
    mockSectionListDependencies(t, {
        responsibilityAssignments: [
            {
                _id: "507f1f77bcf86cd799439081",
                institutionId,
                userId: actorUserId,
                responsibilityType: "coordinator",
                scopeType: "department",
                scopeId: departmentId,
                isActive: true,
            },
        ],
    });

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

test("instructor section get by id is limited to assigned sections", async (t) => {
    mockSectionListDependencies(t);

    const ownResult = await sectionService.getSectionById({
        institutionId,
        sectionId: "507f1f77bcf86cd799439071",
        actorMembership: buildActorMembership(),
    });

    assert.equal(ownResult.section.code, "OWN-1");
    assert.equal(ownResult.section.createdByUserId, undefined);

    await assert.rejects(
        () =>
            sectionService.getSectionById({
                institutionId,
                sectionId: "507f1f77bcf86cd799439072",
                actorMembership: buildActorMembership(),
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Section not found");
            return true;
        }
    );
});

test("admin and owner section get by id keep full institution-wide detail access", async (t) => {
    mockSectionListDependencies(t, {
        institution: { _id: institutionId, type: "university", ownerUserId: actorUserId },
    });

    const adminResult = await sectionService.getSectionById({
        institutionId,
        sectionId: "507f1f77bcf86cd799439072",
        actorMembership: buildActorMembership({
            _id: "507f1f77bcf86cd799439099",
            userId: "507f1f77bcf86cd799439099",
            role: "admin",
        }),
    });
    assert.equal(adminResult.section.code, "OTHER-1");
    assert.equal(adminResult.section.createdByUserId, "507f1f77bcf86cd799439063");

    const ownerResult = await sectionService.getSectionById({
        institutionId,
        sectionId: "507f1f77bcf86cd799439072",
        actorMembership: buildActorMembership({
            _id: "507f1f77bcf86cd799439097",
            role: "student",
            userId: actorUserId,
        }),
    });
    assert.equal(ownerResult.section.code, "OTHER-1");
    assert.equal(ownerResult.section.createdByUserId, "507f1f77bcf86cd799439063");
});

test("coordinator section get by id is limited to assigned department scope", async (t) => {
    mockSectionListDependencies(t, {
        sections: [
            buildSection({ _id: "507f1f77bcf86cd799439071", code: "DEPT-1", subjectId }),
            buildSection({ _id: "507f1f77bcf86cd799439072", code: "DEPT-OTHER", subjectId: otherSubjectId }),
        ],
        responsibilityAssignments: [
            {
                _id: "507f1f77bcf86cd799439081",
                institutionId,
                userId: actorUserId,
                responsibilityType: "coordinator",
                scopeType: "department",
                scopeId: departmentId,
                isActive: true,
            },
        ],
    });

    const scopedResult = await sectionService.getSectionById({
        institutionId,
        sectionId: "507f1f77bcf86cd799439071",
        actorMembership: buildActorMembership({
            _id: coordinatorMemberId,
            role: "instructor",
        }),
    });
    assert.equal(scopedResult.section.code, "DEPT-1");
    assert.equal(scopedResult.section.createdByUserId, undefined);

    await assert.rejects(
        () =>
            sectionService.getSectionById({
                institutionId,
                sectionId: "507f1f77bcf86cd799439072",
                actorMembership: buildActorMembership({
                    _id: coordinatorMemberId,
                    role: "instructor",
                }),
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Section not found");
            return true;
        }
    );
});

test("student cannot use coordinator responsibility to read generic staff section detail", async (t) => {
    mockSectionListDependencies(t, {
        responsibilityAssignments: [
            {
                _id: "507f1f77bcf86cd799439081",
                institutionId,
                userId: actorUserId,
                responsibilityType: "coordinator",
                scopeType: "department",
                scopeId: departmentId,
                isActive: true,
            },
        ],
    });

    await assert.rejects(
        () =>
            sectionService.getSectionById({
                institutionId,
                sectionId: "507f1f77bcf86cd799439071",
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

test("cross-tenant instructor section list access is blocked", async (t) => {
    mockSectionListDependencies(t);

    await assert.rejects(
        () =>
            sectionService.listSections({
                institutionId,
                query: {},
                actorMembership: buildActorMembership({
                    institutionId: otherInstitutionId,
                }),
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Institution access denied");
            return true;
        }
    );
});

test("inactive membership cannot list sections", async (t) => {
    mockSectionListDependencies(t);

    await assert.rejects(
        () =>
            sectionService.listSections({
                institutionId,
                query: {},
                actorMembership: buildActorMembership({
                    status: "suspended",
                }),
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Institution access denied");
            return true;
        }
    );
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

test("generic section detail route is guarded by section.read", () => {
    const route = institutionRoutes.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route)
        .find((candidate) => candidate.path === "/:institutionId/sections/:sectionId" && candidate.methods.get);

    assert.ok(route);
    assert.deepEqual(
        route.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "<anonymous>", "getSectionById"]
    );
    assert.equal(route.stack[3].handle.requiredPermission, "section.read");
});
