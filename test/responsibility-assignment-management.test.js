const test = require("node:test");
const assert = require("node:assert/strict");

const ClassLevel = require("../src/models/ClassLevel");
const Department = require("../src/models/Department");
const Institution = require("../src/models/Institution");
const Membership = require("../src/models/Membership");
const ResponsibilityAssignment = require("../src/models/ResponsibilityAssignment");
const SchoolClass = require("../src/models/SchoolClass");
const Section = require("../src/models/Section");
const {
    ROLE_PERMISSIONS,
    RESPONSIBILITY_PERMISSIONS,
} = require("../src/auth/permissions");
const {
    hasResponsibilityPermissionWithinScope,
    isResponsibilityAssignmentActiveNow,
} = require("../src/auth/scopedResponsibilities");
const responsibilityAssignmentController = require("../src/controllers/responsibilityAssignmentController");
const responsibilityAssignmentService = require("../src/services/responsibilityAssignmentService");
const institutionRoutes = require("../src/routes/institutionRoutes");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439012";
const ownerUserId = "507f1f77bcf86cd799439021";
const adminUserId = "507f1f77bcf86cd799439022";
const instructorUserId = "507f1f77bcf86cd799439023";
const studentUserId = "507f1f77bcf86cd799439024";
const otherUserId = "507f1f77bcf86cd799439025";
const adminMembershipId = "507f1f77bcf86cd799439031";
const instructorMembershipId = "507f1f77bcf86cd799439032";
const studentMembershipId = "507f1f77bcf86cd799439033";
const ownerMembershipId = "507f1f77bcf86cd799439034";
const departmentId = "507f1f77bcf86cd799439041";
const otherDepartmentId = "507f1f77bcf86cd799439042";
const classLevelId = "507f1f77bcf86cd799439043";
const schoolClassId = "507f1f77bcf86cd799439044";
const sectionId = "507f1f77bcf86cd799439045";
const otherSectionId = "507f1f77bcf86cd799439046";
const assignmentId = "507f1f77bcf86cd799439051";

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

function normalizeId(value) {
    return value === undefined || value === null ? null : value.toString();
}

function matchesId(value, condition) {
    if (condition === undefined) {
        return true;
    }

    if (condition?.$in) {
        return condition.$in.map(normalizeId).includes(normalizeId(value));
    }

    if (condition?.$ne !== undefined) {
        return normalizeId(value) !== normalizeId(condition.$ne);
    }

    return normalizeId(value) === normalizeId(condition);
}

function matchesRecord(record, query = {}) {
    return Object.entries(query).every(([field, condition]) => matchesId(record[field], condition));
}

function buildInstitution(overrides = {}) {
    return {
        _id: institutionId,
        ownerUserId,
        type: "university",
        status: "active",
        ...overrides,
    };
}

function buildMembership(overrides = {}) {
    return {
        _id: adminMembershipId,
        institutionId,
        userId: adminUserId,
        role: "admin",
        status: "active",
        ...overrides,
    };
}

function buildAssignment(overrides = {}) {
    return {
        _id: assignmentId,
        institutionId,
        userId: instructorUserId,
        responsibilityType: "coordinator",
        scopeType: "section",
        scopeId: sectionId,
        isActive: true,
        startAt: null,
        endAt: null,
        permissions: ["billing.manage", "membership.manage"],
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-01T00:00:00.000Z"),
        ...overrides,
    };
}

function buildDataset(overrides = {}) {
    return {
        institutions: [
            buildInstitution(),
            buildInstitution({ _id: otherInstitutionId, ownerUserId: otherUserId }),
        ],
        memberships: [
            buildMembership(),
            buildMembership({ _id: instructorMembershipId, userId: instructorUserId, role: "instructor" }),
            buildMembership({ _id: studentMembershipId, userId: studentUserId, role: "student" }),
            buildMembership({ _id: ownerMembershipId, userId: ownerUserId, role: "student" }),
            buildMembership({ _id: "507f1f77bcf86cd799439035", institutionId: otherInstitutionId, userId: otherUserId, role: "instructor" }),
        ],
        departments: [
            { _id: departmentId, institutionId },
            { _id: otherDepartmentId, institutionId: otherInstitutionId },
        ],
        classLevels: [
            { _id: classLevelId, institutionId },
        ],
        schoolClasses: [
            { _id: schoolClassId, institutionId, classLevelId },
        ],
        sections: [
            { _id: sectionId, institutionId },
            { _id: otherSectionId, institutionId: otherInstitutionId },
        ],
        assignments: [],
        queryLog: [],
        ...overrides,
    };
}

function applySet(record, update) {
    if (update?.$set) {
        Object.assign(record, update.$set);
    }

    record.updatedAt = new Date("2026-06-09T00:00:00.000Z");
    return record;
}

function mockResponsibilityAssignmentDependencies(t, overrides = {}) {
    const data = buildDataset(overrides);

    t.mock.method(Institution, "findOne", (query) => {
        data.queryLog.push({ model: "Institution", method: "findOne", query });
        return createQuery(data.institutions.find((item) => matchesRecord(item, query)) || null);
    });
    t.mock.method(Membership, "findOne", (query) => {
        data.queryLog.push({ model: "Membership", method: "findOne", query });
        return createQuery(data.memberships.find((item) => matchesRecord(item, query)) || null);
    });
    t.mock.method(Department, "findOne", (query) => {
        data.queryLog.push({ model: "Department", method: "findOne", query });
        return createQuery(data.departments.find((item) => matchesRecord(item, query)) || null);
    });
    t.mock.method(ClassLevel, "findOne", (query) => {
        data.queryLog.push({ model: "ClassLevel", method: "findOne", query });
        return createQuery(data.classLevels.find((item) => matchesRecord(item, query)) || null);
    });
    t.mock.method(SchoolClass, "findOne", (query) => {
        data.queryLog.push({ model: "SchoolClass", method: "findOne", query });
        return createQuery(data.schoolClasses.find((item) => matchesRecord(item, query)) || null);
    });
    t.mock.method(Section, "findOne", (query) => {
        data.queryLog.push({ model: "Section", method: "findOne", query });
        return createQuery(data.sections.find((item) => matchesRecord(item, query)) || null);
    });
    t.mock.method(ResponsibilityAssignment, "findOne", (query) => {
        data.queryLog.push({ model: "ResponsibilityAssignment", method: "findOne", query });
        return createQuery(data.assignments.find((item) => matchesRecord(item, query)) || null);
    });
    t.mock.method(ResponsibilityAssignment, "find", (query) => {
        data.queryLog.push({ model: "ResponsibilityAssignment", method: "find", query });
        return createQuery(data.assignments.filter((item) => matchesRecord(item, query)));
    });
    t.mock.method(ResponsibilityAssignment, "create", async (payload) => {
        data.queryLog.push({ model: "ResponsibilityAssignment", method: "create", query: payload });
        const created = buildAssignment({
            ...payload,
            _id: assignmentId,
            createdAt: new Date("2026-06-09T00:00:00.000Z"),
            updatedAt: new Date("2026-06-09T00:00:00.000Z"),
        });
        data.assignments.push(created);
        return created;
    });
    t.mock.method(ResponsibilityAssignment, "findOneAndUpdate", (query, update) => {
        data.queryLog.push({ model: "ResponsibilityAssignment", method: "findOneAndUpdate", query, update });
        const assignment = data.assignments.find((item) => matchesRecord(item, query));
        return createQuery(assignment ? applySet(assignment, update) : null);
    });

    return data;
}

function adminActor(overrides = {}) {
    return {
        actorUserId: adminUserId,
        actorMembership: buildMembership(overrides),
    };
}

async function assertRejectsWith(promiseFactory, statusCode, message) {
    await assert.rejects(
        promiseFactory,
        (error) => {
            assert.equal(error.statusCode, statusCode);
            assert.equal(error.message, message);
            return true;
        }
    );
}

test("admin can create a valid head department assignment", async (t) => {
    const data = mockResponsibilityAssignmentDependencies(t);

    const result = await responsibilityAssignmentService.createResponsibilityAssignment({
        institutionId,
        ...adminActor(),
        payload: {
            userId: instructorUserId,
            responsibilityType: "head",
            scopeType: "department",
            scopeId: departmentId,
        },
    });

    assert.equal(result.responsibilityAssignment.responsibilityType, "head");
    assert.equal(result.responsibilityAssignment.scopeType, "department");
    assert.equal(result.responsibilityAssignment.scopeId, departmentId);
    assert.equal(result.responsibilityAssignment.isActive, true);
    assert.equal(result.responsibilityAssignment.permissions, undefined);
    assert.equal(data.assignments[0].permissions.length, 0);
});

test("owner can create coordinator section and mentor class assignments without changing membership role", async (t) => {
    const data = mockResponsibilityAssignmentDependencies(t);

    const coordinator = await responsibilityAssignmentService.createResponsibilityAssignment({
        institutionId,
        actorUserId: ownerUserId,
        actorMembership: buildMembership({ _id: ownerMembershipId, userId: ownerUserId, role: "student" }),
        payload: {
            userId: instructorUserId,
            responsibilityType: "coordinator",
            scopeType: "section",
            scopeId: sectionId,
            isActive: true,
        },
    });

    const mentor = await responsibilityAssignmentService.createResponsibilityAssignment({
        institutionId,
        actorUserId: ownerUserId,
        actorMembership: buildMembership({ _id: ownerMembershipId, userId: ownerUserId, role: "student" }),
        payload: {
            userId: instructorUserId,
            responsibilityType: "mentor",
            scopeType: "class",
            scopeId: schoolClassId,
        },
    });

    assert.equal(coordinator.responsibilityAssignment.scopeType, "section");
    assert.equal(mentor.responsibilityAssignment.scopeType, "class");
    assert.equal(data.memberships.find((membership) => membership.userId === instructorUserId).role, "instructor");
    assert.equal(data.memberships.find((membership) => membership.userId === studentUserId).role, "student");
});

test("missing or non-active actor membership status is rejected", async (t) => {
    mockResponsibilityAssignmentDependencies(t);

    const payload = {
        userId: instructorUserId,
        responsibilityType: "head",
        scopeType: "department",
        scopeId: departmentId,
    };

    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.createResponsibilityAssignment({
                institutionId,
                actorUserId: adminUserId,
                actorMembership: buildMembership({ status: undefined }),
                payload,
            }),
        403,
        "Institution access denied"
    );

    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.createResponsibilityAssignment({
                institutionId,
                actorUserId: adminUserId,
                actorMembership: buildMembership({ status: "suspended" }),
                payload,
            }),
        403,
        "Institution access denied"
    );
});

test("non-admin instructor, student, and scoped responsibility holder cannot create assignments", async (t) => {
    mockResponsibilityAssignmentDependencies(t, {
        assignments: [
            buildAssignment({ userId: instructorUserId, responsibilityType: "coordinator", scopeType: "section", scopeId: sectionId }),
        ],
    });

    const payload = {
        userId: studentUserId,
        responsibilityType: "mentor",
        scopeType: "section",
        scopeId: sectionId,
    };

    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.createResponsibilityAssignment({
                institutionId,
                actorUserId: instructorUserId,
                actorMembership: buildMembership({ _id: instructorMembershipId, userId: instructorUserId, role: "instructor" }),
                payload,
            }),
        403,
        "Permission denied"
    );

    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.createResponsibilityAssignment({
                institutionId,
                actorUserId: studentUserId,
                actorMembership: buildMembership({ _id: studentMembershipId, userId: studentUserId, role: "student" }),
                payload,
            }),
        403,
        "Permission denied"
    );
});

test("target instructor with active membership can receive head, coordinator, and mentor assignments", async (t) => {
    const data = mockResponsibilityAssignmentDependencies(t);

    const head = await responsibilityAssignmentService.createResponsibilityAssignment({
        institutionId,
        ...adminActor(),
        payload: {
            userId: instructorUserId,
            responsibilityType: "head",
            scopeType: "department",
            scopeId: departmentId,
        },
    });
    const coordinator = await responsibilityAssignmentService.createResponsibilityAssignment({
        institutionId,
        ...adminActor(),
        payload: {
            userId: instructorUserId,
            responsibilityType: "coordinator",
            scopeType: "section",
            scopeId: sectionId,
        },
    });
    const mentor = await responsibilityAssignmentService.createResponsibilityAssignment({
        institutionId,
        ...adminActor(),
        payload: {
            userId: instructorUserId,
            responsibilityType: "mentor",
            scopeType: "class",
            scopeId: schoolClassId,
        },
    });

    assert.equal(head.responsibilityAssignment.responsibilityType, "head");
    assert.equal(coordinator.responsibilityAssignment.responsibilityType, "coordinator");
    assert.equal(mentor.responsibilityAssignment.responsibilityType, "mentor");
    assert.equal(data.memberships.find((membership) => membership.userId === instructorUserId).role, "instructor");
});

test("target student and admin cannot receive scoped responsibility assignments", async (t) => {
    mockResponsibilityAssignmentDependencies(t);

    for (const responsibilityType of ["head", "coordinator", "mentor"]) {
        await assertRejectsWith(
            () =>
                responsibilityAssignmentService.createResponsibilityAssignment({
                    institutionId,
                    ...adminActor(),
                    payload: {
                        userId: studentUserId,
                        responsibilityType,
                        scopeType: responsibilityType === "head" ? "department" : "section",
                        scopeId: responsibilityType === "head" ? departmentId : sectionId,
                    },
                }),
            400,
            "Target user is not eligible for responsibility assignment"
        );

        await assertRejectsWith(
            () =>
                responsibilityAssignmentService.createResponsibilityAssignment({
                    institutionId,
                    ...adminActor(),
                    payload: {
                        userId: adminUserId,
                        responsibilityType,
                        scopeType: responsibilityType === "head" ? "department" : "section",
                        scopeId: responsibilityType === "head" ? departmentId : sectionId,
                    },
                }),
            400,
            "Target user is not eligible for responsibility assignment"
        );
    }
});

test("target user must have active membership in the same institution", async (t) => {
    mockResponsibilityAssignmentDependencies(t, {
        memberships: [
            buildMembership(),
            buildMembership({ _id: "507f1f77bcf86cd799439035", institutionId: otherInstitutionId, userId: otherUserId, role: "instructor" }),
            buildMembership({ _id: instructorMembershipId, userId: instructorUserId, role: "instructor", status: "suspended" }),
        ],
    });

    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.createResponsibilityAssignment({
                institutionId,
                ...adminActor(),
                payload: {
                    userId: instructorUserId,
                    responsibilityType: "head",
                    scopeType: "department",
                    scopeId: departmentId,
                },
            }),
        400,
        "Target user must have active membership in this institution"
    );

    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.createResponsibilityAssignment({
                institutionId,
                ...adminActor(),
                payload: {
                    userId: otherUserId,
                    responsibilityType: "head",
                    scopeType: "department",
                    scopeId: departmentId,
                },
            }),
        400,
        "Target user must have active membership in this institution"
    );
});

test("create validates responsibility type, scope type, combinations, tenant scope, and dangerous body fields", async (t) => {
    mockResponsibilityAssignmentDependencies(t);

    const basePayload = {
        userId: instructorUserId,
        responsibilityType: "head",
        scopeType: "department",
        scopeId: departmentId,
    };

    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.createResponsibilityAssignment({
                institutionId,
                ...adminActor(),
                payload: { ...basePayload, responsibilityType: "principal" },
            }),
        400,
        "responsibilityType must be head, coordinator, or mentor"
    );
    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.createResponsibilityAssignment({
                institutionId,
                ...adminActor(),
                payload: { ...basePayload, scopeType: "campus" },
            }),
        400,
        "scopeType must be institution, department, classLevel, class, or section"
    );
    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.createResponsibilityAssignment({
                institutionId,
                ...adminActor(),
                payload: { ...basePayload, responsibilityType: "head", scopeType: "section", scopeId: sectionId },
            }),
        400,
        "scopeType is not allowed for responsibilityType"
    );
    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.createResponsibilityAssignment({
                institutionId,
                ...adminActor(),
                payload: { ...basePayload, scopeId: "507f1f77bcf86cd799439099" },
            }),
        404,
        "Scope not found"
    );
    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.createResponsibilityAssignment({
                institutionId,
                ...adminActor(),
                payload: { ...basePayload, scopeId: otherDepartmentId },
            }),
        404,
        "Scope not found"
    );
    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.createResponsibilityAssignment({
                institutionId,
                ...adminActor(),
                payload: { ...basePayload, permissions: ["membership.manage"] },
            }),
        400,
        "Cannot set: permissions"
    );
    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.createResponsibilityAssignment({
                institutionId,
                ...adminActor(),
                payload: { ...basePayload, institutionId: otherInstitutionId },
            }),
        400,
        "Cannot set: institutionId"
    );
    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.createResponsibilityAssignment({
                institutionId,
                ...adminActor(),
                payload: { ...basePayload, role: "admin" },
            }),
        400,
        "Cannot set: role"
    );
    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.createResponsibilityAssignment({
                institutionId,
                ...adminActor(),
                payload: { ...basePayload, createdByUserId: adminUserId },
            }),
        400,
        "Cannot set: createdByUserId"
    );
});

test("institution scope requires scopeId to match route institutionId", async (t) => {
    mockResponsibilityAssignmentDependencies(t);

    const result = await responsibilityAssignmentService.createResponsibilityAssignment({
        institutionId,
        ...adminActor(),
        payload: {
            userId: instructorUserId,
            responsibilityType: "head",
            scopeType: "institution",
            scopeId: institutionId,
        },
    });

    assert.equal(result.responsibilityAssignment.scopeId, institutionId);

    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.createResponsibilityAssignment({
                institutionId,
                ...adminActor(),
                payload: {
                    userId: instructorUserId,
                    responsibilityType: "head",
                    scopeType: "institution",
                    scopeId: otherInstitutionId,
                },
            }),
        400,
        "scopeId must match institutionId for institution scope"
    );
});

test("classLevel scope validation uses same-institution ClassLevel records", async (t) => {
    const data = mockResponsibilityAssignmentDependencies(t);

    const result = await responsibilityAssignmentService.createResponsibilityAssignment({
        institutionId,
        ...adminActor(),
        payload: {
            userId: instructorUserId,
            responsibilityType: "head",
            scopeType: "classLevel",
            scopeId: classLevelId,
        },
    });

    assert.equal(result.responsibilityAssignment.scopeType, "classLevel");
    assert.equal(result.responsibilityAssignment.scopeId, classLevelId);

    const classLevelQuery = data.queryLog.find(
        (entry) => entry.model === "ClassLevel" && entry.method === "findOne"
    ).query;
    assert.equal(normalizeId(classLevelQuery.institutionId), institutionId);
    assert.equal(normalizeId(classLevelQuery._id), classLevelId);
});

test("duplicate active assignment is rejected and inactive same-key row can be reactivated", async (t) => {
    const inactiveAssignment = buildAssignment({
        isActive: false,
        endAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    const data = mockResponsibilityAssignmentDependencies(t, {
        assignments: [buildAssignment()],
    });

    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.createResponsibilityAssignment({
                institutionId,
                ...adminActor(),
                payload: {
                    userId: instructorUserId,
                    responsibilityType: "coordinator",
                    scopeType: "section",
                    scopeId: sectionId,
                },
            }),
        409,
        "Active responsibility assignment already exists"
    );

    t.mock.reset();
    const secondData = mockResponsibilityAssignmentDependencies(t, {
        assignments: [inactiveAssignment],
    });
    const result = await responsibilityAssignmentService.createResponsibilityAssignment({
        institutionId,
        ...adminActor(),
        payload: {
            userId: instructorUserId,
            responsibilityType: "coordinator",
            scopeType: "section",
            scopeId: sectionId,
            startAt: "2026-06-10T00:00:00.000Z",
            endAt: null,
        },
    });

    assert.equal(result.responsibilityAssignment.id, inactiveAssignment._id);
    assert.equal(result.responsibilityAssignment.isActive, true);
    assert.equal(secondData.assignments.length, 1);
    assert.equal(data.assignments.length, 1);
});

test("admin can update dates/isActive, but not identity/type/permissions, and date windows are validated", async (t) => {
    const data = mockResponsibilityAssignmentDependencies(t, {
        assignments: [buildAssignment()],
    });

    const result = await responsibilityAssignmentService.updateResponsibilityAssignment({
        institutionId,
        assignmentId,
        ...adminActor(),
        payload: {
            startAt: "2026-06-01T00:00:00.000Z",
            endAt: "2026-06-30T00:00:00.000Z",
            isActive: false,
        },
    });

    assert.equal(result.responsibilityAssignment.isActive, false);
    assert.equal(data.assignments[0].permissions.includes("membership.manage"), true);
    assert.equal(result.responsibilityAssignment.permissions, undefined);

    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.updateResponsibilityAssignment({
                institutionId,
                assignmentId,
                ...adminActor(),
                payload: { userId: studentUserId },
            }),
        400,
        "Cannot set: userId"
    );
    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.updateResponsibilityAssignment({
                institutionId,
                assignmentId,
                ...adminActor(),
                payload: { responsibilityType: "head" },
            }),
        400,
        "Cannot set: responsibilityType"
    );
    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.updateResponsibilityAssignment({
                institutionId,
                assignmentId,
                ...adminActor(),
                payload: { permissions: ["membership.manage"] },
            }),
        400,
        "Cannot set: permissions"
    );
    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.updateResponsibilityAssignment({
                institutionId,
                assignmentId,
                ...adminActor(),
                payload: { role: "admin" },
            }),
        400,
        "Cannot set: role"
    );
    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.updateResponsibilityAssignment({
                institutionId,
                assignmentId,
                ...adminActor(),
                payload: {
                    startAt: "2026-06-30T00:00:00.000Z",
                    endAt: "2026-06-01T00:00:00.000Z",
                },
            }),
        400,
        "endAt must be after startAt"
    );
});

test("updating inactive assignment to active checks duplicate active same scope", async (t) => {
    mockResponsibilityAssignmentDependencies(t, {
        assignments: [
            buildAssignment({ _id: assignmentId, isActive: false }),
            buildAssignment({ _id: "507f1f77bcf86cd799439052", isActive: true }),
        ],
    });

    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.updateResponsibilityAssignment({
                institutionId,
                assignmentId,
                ...adminActor(),
                payload: { isActive: true },
            }),
        409,
        "Active responsibility assignment already exists"
    );
});

test("updating scope checks duplicate active assignment", async (t) => {
    mockResponsibilityAssignmentDependencies(t, {
        assignments: [
            buildAssignment({ _id: assignmentId, isActive: false, scopeId: schoolClassId, scopeType: "class" }),
            buildAssignment({ _id: "507f1f77bcf86cd799439052", isActive: true, scopeId: sectionId, scopeType: "section" }),
        ],
    });

    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.updateResponsibilityAssignment({
                institutionId,
                assignmentId,
                ...adminActor(),
                payload: {
                    scopeType: "section",
                    scopeId: sectionId,
                },
            }),
        409,
        "Active responsibility assignment already exists"
    );
});

test("non-admin update/delete is rejected and tenant-scoped update/get/delete cannot cross institutions", async (t) => {
    const data = mockResponsibilityAssignmentDependencies(t, {
        assignments: [
            buildAssignment(),
            buildAssignment({ _id: "507f1f77bcf86cd799439052", institutionId: otherInstitutionId, scopeId: otherSectionId }),
        ],
    });

    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.updateResponsibilityAssignment({
                institutionId,
                assignmentId,
                actorUserId: instructorUserId,
                actorMembership: buildMembership({ _id: instructorMembershipId, userId: instructorUserId, role: "instructor" }),
                payload: { isActive: false },
            }),
        403,
        "Permission denied"
    );

    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.getResponsibilityAssignmentById({
                institutionId,
                assignmentId: "507f1f77bcf86cd799439052",
                ...adminActor(),
            }),
        404,
        "Responsibility assignment not found"
    );

    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.updateResponsibilityAssignment({
                institutionId,
                assignmentId: "507f1f77bcf86cd799439052",
                ...adminActor(),
                payload: { isActive: false },
            }),
        404,
        "Responsibility assignment not found"
    );

    await responsibilityAssignmentService.deactivateResponsibilityAssignment({
        institutionId,
        assignmentId,
        ...adminActor(),
    });

    assert.equal(data.assignments[0].isActive, false);
    assert.equal(isResponsibilityAssignmentActiveNow(data.assignments[0]), false);

    await assertRejectsWith(
        () =>
            responsibilityAssignmentService.deactivateResponsibilityAssignment({
                institutionId,
                assignmentId,
                actorUserId: studentUserId,
                actorMembership: buildMembership({ _id: studentMembershipId, userId: studentUserId, role: "student" }),
            }),
        403,
        "Permission denied"
    );
});

test("list/get are admin scoped, filters are safe, and permissions are omitted", async (t) => {
    const data = mockResponsibilityAssignmentDependencies(t, {
        assignments: [
            buildAssignment({ _id: assignmentId, responsibilityType: "coordinator", scopeType: "section", scopeId: sectionId }),
            buildAssignment({ _id: "507f1f77bcf86cd799439052", userId: studentUserId, responsibilityType: "mentor", scopeType: "class", scopeId: schoolClassId }),
            buildAssignment({ _id: "507f1f77bcf86cd799439053", institutionId: otherInstitutionId, scopeId: otherSectionId }),
        ],
    });

    const list = await responsibilityAssignmentService.listResponsibilityAssignments({
        institutionId,
        ...adminActor(),
        query: {
            responsibilityType: "coordinator",
            scopeType: "section",
            isActive: "true",
            page: "1",
            limit: "10",
        },
    });

    assert.equal(list.responsibilityAssignments.length, 1);
    assert.equal(list.responsibilityAssignments[0].id, assignmentId);
    assert.equal(list.responsibilityAssignments[0].permissions, undefined);
    assert.equal(list.pagination.total, 1);

    const findQuery = data.queryLog.find(
        (entry) => entry.model === "ResponsibilityAssignment" && entry.method === "find"
    ).query;
    assert.equal(normalizeId(findQuery.institutionId), institutionId);
    assert.equal(findQuery.responsibilityType, "coordinator");
    assert.equal(findQuery.scopeType, "section");

    const getResult = await responsibilityAssignmentService.getResponsibilityAssignmentById({
        institutionId,
        assignmentId,
        ...adminActor(),
    });

    assert.equal(getResult.responsibilityAssignment.id, assignmentId);
    assert.equal(getResult.responsibilityAssignment.permissions, undefined);
});

test("activeNow=true returns currently active assignments only and remains tenant scoped", async (t) => {
    const data = mockResponsibilityAssignmentDependencies(t, {
        assignments: [
            buildAssignment({ _id: assignmentId, isActive: true, startAt: null, endAt: null }),
            buildAssignment({ _id: "507f1f77bcf86cd799439052", isActive: false, responsibilityType: "mentor", scopeType: "class", scopeId: schoolClassId }),
            buildAssignment({ _id: "507f1f77bcf86cd799439053", startAt: new Date("2999-01-01T00:00:00.000Z") }),
            buildAssignment({ _id: "507f1f77bcf86cd799439054", endAt: new Date("2000-01-01T00:00:00.000Z") }),
            buildAssignment({ _id: "507f1f77bcf86cd799439055", institutionId: otherInstitutionId, scopeId: otherSectionId }),
        ],
    });

    const list = await responsibilityAssignmentService.listResponsibilityAssignments({
        institutionId,
        ...adminActor(),
        query: {
            activeNow: "true",
        },
    });

    assert.deepEqual(
        list.responsibilityAssignments.map((assignment) => assignment.id),
        [assignmentId]
    );

    const findQuery = data.queryLog.find(
        (entry) => entry.model === "ResponsibilityAssignment" && entry.method === "find"
    ).query;
    assert.equal(normalizeId(findQuery.institutionId), institutionId);
});

test("activeNow=false returns inactive future and expired assignments only", async (t) => {
    mockResponsibilityAssignmentDependencies(t, {
        assignments: [
            buildAssignment({ _id: assignmentId, isActive: true, startAt: null, endAt: null }),
            buildAssignment({ _id: "507f1f77bcf86cd799439052", isActive: false, responsibilityType: "mentor", scopeType: "class", scopeId: schoolClassId }),
            buildAssignment({ _id: "507f1f77bcf86cd799439053", startAt: new Date("2999-01-01T00:00:00.000Z") }),
            buildAssignment({ _id: "507f1f77bcf86cd799439054", endAt: new Date("2000-01-01T00:00:00.000Z") }),
            buildAssignment({ _id: "507f1f77bcf86cd799439055", institutionId: otherInstitutionId, scopeId: otherSectionId }),
        ],
    });

    const list = await responsibilityAssignmentService.listResponsibilityAssignments({
        institutionId,
        ...adminActor(),
        query: {
            activeNow: "false",
        },
    });

    assert.deepEqual(
        list.responsibilityAssignments.map((assignment) => assignment.id),
        [
            "507f1f77bcf86cd799439052",
            "507f1f77bcf86cd799439053",
            "507f1f77bcf86cd799439054",
        ]
    );
});

test("controller passes actor context and route exposes responsibility assignment management endpoints", async (t) => {
    let receivedArgs = null;
    t.mock.method(responsibilityAssignmentService, "createResponsibilityAssignment", async (args) => {
        receivedArgs = args;
        return {
            responsibilityAssignment: {
                id: assignmentId,
            },
        };
    });

    const res = createResponse();
    const membership = buildMembership();
    await responsibilityAssignmentController.createResponsibilityAssignment(
        {
            params: { institutionId },
            user: { id: adminUserId },
            membership,
            body: {
                userId: instructorUserId,
                responsibilityType: "head",
                scopeType: "department",
                scopeId: departmentId,
            },
        },
        res
    );

    assert.equal(res.statusCode, 201);
    assert.equal(receivedArgs.actorMembership, membership);
    assert.equal(receivedArgs.actorUserId, adminUserId);

    const routes = institutionRoutes.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route)
        .filter((route) => String(route.path).includes("responsibility-assignments"));

    assert.equal(routes.length, 5);
    for (const route of routes) {
        const handles = route.stack.map((layer) => layer.handle);
        assert.equal(handles.some((handle) => handle.requiredPermission), false);
    }
});

test("regression: base admin permissions and scoped responsibility catalog remain unchanged", () => {
    assert.equal(ROLE_PERMISSIONS.admin.includes("membership.manage"), true);
    assert.equal(ROLE_PERMISSIONS.instructor.includes("membership.manage"), false);
    assert.deepEqual(RESPONSIBILITY_PERMISSIONS.head, []);
    assert.deepEqual(RESPONSIBILITY_PERMISSIONS.mentor, []);
    assert.equal(RESPONSIBILITY_PERMISSIONS.coordinator.includes("section.read_scope"), true);
    assert.equal(RESPONSIBILITY_PERMISSIONS.coordinator.includes("attendance.manage_scope"), true);

    const coordinator = buildAssignment({
        responsibilityType: "coordinator",
        scopeType: "section",
        scopeId: sectionId,
        permissions: [],
    });
    const head = buildAssignment({
        responsibilityType: "head",
        scopeType: "department",
        scopeId: departmentId,
        permissions: ["section.read_scope", "attendance.manage_scope"],
    });
    const mentor = buildAssignment({
        responsibilityType: "mentor",
        scopeType: "section",
        scopeId: sectionId,
        permissions: ["section.read_scope", "attendance.manage_scope"],
    });

    assert.equal(
        hasResponsibilityPermissionWithinScope({
            assignment: coordinator,
            permission: "section.read_scope",
            scopeType: "section",
            scopeId: sectionId,
        }),
        true
    );
    assert.equal(
        hasResponsibilityPermissionWithinScope({
            assignment: coordinator,
            permission: "membership.manage",
            scopeType: "section",
            scopeId: sectionId,
        }),
        false
    );
    assert.equal(
        hasResponsibilityPermissionWithinScope({
            assignment: head,
            permission: "section.read_scope",
            scopeType: "department",
            scopeId: departmentId,
        }),
        false
    );
    assert.equal(
        hasResponsibilityPermissionWithinScope({
            assignment: mentor,
            permission: "attendance.manage_scope",
            scopeType: "section",
            scopeId: sectionId,
        }),
        false
    );
});
