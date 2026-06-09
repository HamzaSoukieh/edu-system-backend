const test = require("node:test");
const assert = require("node:assert/strict");

const ResponsibilityAssignment = require("../src/models/ResponsibilityAssignment");
const {
    RESPONSIBILITY_ALLOWED_SCOPES,
    RESPONSIBILITY_PERMISSIONS,
    isResponsibilityScopeAllowed,
} = require("../src/auth/permissions");
const {
    getEffectiveResponsibilityPermissions,
    hasResponsibilityPermissionWithinScope,
    isResponsibilityAssignmentActiveNow,
    resolveScopedResponsibilities,
} = require("../src/auth/scopedResponsibilities");
const { requirePermission, withScope } = require("../src/middleware/authorize");

const institutionId = "507f1f77bcf86cd799439011";
const departmentId = "507f1f77bcf86cd799439041";
const actorUserId = "507f1f77bcf86cd799439061";
const actorMembershipId = "507f1f77bcf86cd799439051";
const sectionId = "507f1f77bcf86cd799439071";

function createQuery(result) {
    return {
        select() {
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

function buildRequest(overrides = {}) {
    return {
        user: { id: actorUserId },
        membership: {
            _id: actorMembershipId,
            institutionId,
            userId: actorUserId,
            role: "instructor",
            status: "active",
        },
        ...overrides,
    };
}

async function runMiddlewareStack(req, res, middlewares) {
    let index = 0;
    let finalNextCalled = false;

    const next = async (error) => {
        if (error) {
            throw error;
        }

        const middleware = middlewares[index];
        index += 1;
        if (!middleware) {
            finalNextCalled = true;
            return;
        }

        await middleware(req, res, next);
    };

    await next();
    return finalNextCalled;
}

function buildAssignment(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439081",
        institutionId,
        userId: actorUserId,
        responsibilityType: "coordinator",
        scopeType: "department",
        scopeId: departmentId,
        isActive: true,
        startAt: null,
        endAt: null,
        ...overrides,
    };
}

test("responsibility helper treats institutionId plus userId as assignment identity", async (t) => {
    let receivedQuery = null;
    t.mock.method(ResponsibilityAssignment, "find", (query) => {
        receivedQuery = query;
        return createQuery([buildAssignment()]);
    });

    const assignments = await resolveScopedResponsibilities({
        institutionId,
        userId: actorUserId,
        responsibilityTypes: ["coordinator"],
        scopeTypes: ["department"],
        permission: "section.read_scope",
    });

    assert.equal(receivedQuery.institutionId, institutionId);
    assert.equal(receivedQuery.userId, actorUserId);
    assert.equal(receivedQuery.membershipId, undefined);
    assert.deepEqual(receivedQuery.responsibilityType, { $in: ["coordinator"] });
    assert.deepEqual(receivedQuery.scopeType, { $in: ["department"] });
    assert.equal(assignments.length, 1);
});

test("responsibility catalog contains only currently enforced scoped permissions", () => {
    assert.deepEqual(RESPONSIBILITY_PERMISSIONS, {
        head: [],
        coordinator: [
            "section.read_scope",
            "sectionSession.read_scope",
            "sectionSession.manage_scope",
            "attendance.read_scope",
            "attendance.manage_scope",
        ],
        mentor: [],
    });

    assert.deepEqual(getEffectiveResponsibilityPermissions("head"), RESPONSIBILITY_PERMISSIONS.head);
    assert.deepEqual(getEffectiveResponsibilityPermissions("coordinator"), RESPONSIBILITY_PERMISSIONS.coordinator);
    assert.deepEqual(getEffectiveResponsibilityPermissions("mentor"), []);
    assert.deepEqual(getEffectiveResponsibilityPermissions("head"), []);

    const activePermissions = Object.values(RESPONSIBILITY_PERMISSIONS).flat();
    assert.equal(activePermissions.includes("academicDecision.review_scope"), false);
    assert.equal(activePermissions.includes("studentDropRisk.review_scope"), false);
    assert.equal(activePermissions.includes("enrollment.review_scope"), false);
    assert.equal(activePermissions.includes("academicProfile.read_scope"), false);
    assert.equal(activePermissions.includes("studentProfile.read_scope"), false);
    assert.equal(activePermissions.includes("attendance.excuse_manage_scope"), false);
    assert.equal(activePermissions.includes("section.manage_scope"), false);
    assert.equal(activePermissions.includes("membership.manage_scope"), false);
    assert.equal(activePermissions.includes("student.kick"), false);
});

test("responsibility allowed scope combinations are backend-defined", () => {
    assert.deepEqual(RESPONSIBILITY_ALLOWED_SCOPES, {
        head: ["institution", "department", "classLevel"],
        coordinator: ["department", "classLevel", "class", "section"],
        mentor: ["class", "section"],
    });

    assert.equal(isResponsibilityScopeAllowed("head", "institution"), true);
    assert.equal(isResponsibilityScopeAllowed("head", "section"), false);
    assert.equal(isResponsibilityScopeAllowed("coordinator", "section"), true);
    assert.equal(isResponsibilityScopeAllowed("coordinator", "institution"), false);
    assert.equal(isResponsibilityScopeAllowed("mentor", "class"), true);
    assert.equal(isResponsibilityScopeAllowed("mentor", "department"), false);
    assert.equal(isResponsibilityScopeAllowed("unknown", "section"), false);
});

test("responsibility model validates type, scope type, and type/scope combinations", () => {
    const valid = new ResponsibilityAssignment(buildAssignment({
        responsibilityType: "head",
        scopeType: "department",
    }));
    assert.equal(valid.validateSync(), undefined);

    const invalidType = new ResponsibilityAssignment(buildAssignment({
        responsibilityType: "principal",
        scopeType: "department",
    }));
    assert.equal(invalidType.validateSync().errors.responsibilityType.kind, "enum");

    const invalidScopeType = new ResponsibilityAssignment(buildAssignment({
        responsibilityType: "coordinator",
        scopeType: "campus",
    }));
    assert.equal(invalidScopeType.validateSync().errors.scopeType.kind, "enum");

    const invalidCombination = new ResponsibilityAssignment(buildAssignment({
        responsibilityType: "head",
        scopeType: "section",
        scopeId: sectionId,
    }));
    assert.equal(
        invalidCombination.validateSync().errors.scopeType.message,
        "scopeType is not allowed for responsibilityType"
    );
});

test("responsibility helper validates active date windows safely", () => {
    const now = new Date("2026-06-09T00:00:00.000Z");

    assert.equal(isResponsibilityAssignmentActiveNow(buildAssignment(), now), true);
    assert.equal(isResponsibilityAssignmentActiveNow(buildAssignment({ isActive: false }), now), false);
    assert.equal(
        isResponsibilityAssignmentActiveNow(
            buildAssignment({ startAt: new Date("2026-06-10T00:00:00.000Z") }),
            now
        ),
        false
    );
    assert.equal(
        isResponsibilityAssignmentActiveNow(
            buildAssignment({ endAt: new Date("2026-06-08T00:00:00.000Z") }),
            now
        ),
        false
    );
    assert.equal(isResponsibilityAssignmentActiveNow(buildAssignment({ startAt: "not-a-date" }), now), false);
    assert.equal(isResponsibilityAssignmentActiveNow(buildAssignment({ endAt: "not-a-date" }), now), false);
});

test("responsibility helper checks backend catalog permission and exact scope", () => {
    const assignment = buildAssignment({
        permissions: ["billing.manage", "institution.manage", "membership.manage"],
    });

    assert.equal(
        hasResponsibilityPermissionWithinScope({
            assignment,
            permission: "section.read_scope",
            scopeType: "department",
            scopeId: departmentId,
        }),
        true
    );
    assert.equal(
        hasResponsibilityPermissionWithinScope({
            assignment,
            permission: "billing.manage",
            scopeType: "department",
            scopeId: departmentId,
        }),
        false
    );
    assert.equal(
        hasResponsibilityPermissionWithinScope({
            assignment,
            permission: "section.read_scope",
            scopeType: "classLevel",
            scopeId: departmentId,
        }),
        false
    );
    assert.equal(
        hasResponsibilityPermissionWithinScope({
            assignment,
            permission: "section.read_scope",
            scopeType: "department",
            scopeId: "507f1f77bcf86cd799439042",
        }),
        false
    );
    assert.equal(
        hasResponsibilityPermissionWithinScope({
            assignment: buildAssignment({
                responsibilityType: "head",
                scopeType: "department",
                scopeId: departmentId,
                permissions: [
                    "section.read_scope",
                    "sectionSession.read_scope",
                    "sectionSession.manage_scope",
                    "attendance.read_scope",
                    "attendance.manage_scope",
                ],
            }),
            permission: "section.read_scope",
            scopeType: "department",
            scopeId: departmentId,
        }),
        false
    );
    assert.equal(
        hasResponsibilityPermissionWithinScope({
            assignment: buildAssignment({
                responsibilityType: "head",
                scopeType: "section",
                scopeId: sectionId,
            }),
            permission: "section.read_scope",
            scopeType: "section",
            scopeId: sectionId,
        }),
        false
    );
});

test("scoped responsibility middleware ignores arbitrary stored dangerous permissions", async (t) => {
    t.mock.method(ResponsibilityAssignment, "find", () =>
        createQuery([
            buildAssignment({
                permissions: ["billing.manage", "institution.manage", "membership.manage"],
            }),
        ])
    );

    const req = buildRequest();
    const res = createResponse();
    const completed = await runMiddlewareStack(req, res, [
        withScope("department", departmentId),
        requirePermission("billing.manage"),
    ]);

    assert.equal(completed, false);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { message: "Permission denied" });
});

test("scoped responsibility middleware allows backend-defined scoped permissions", async (t) => {
    t.mock.method(ResponsibilityAssignment, "find", () =>
        createQuery([
            buildAssignment({ permissions: [] }),
        ])
    );

    const req = buildRequest();
    const res = createResponse();
    const completed = await runMiddlewareStack(req, res, [
        withScope("department", departmentId),
        requirePermission("section.read_scope"),
    ]);

    assert.equal(completed, true);
    assert.equal(res.statusCode, null);
    assert.equal(res.body, null);
});

test("scoped responsibility middleware does not allow stored operational permissions for head", async (t) => {
    t.mock.method(ResponsibilityAssignment, "find", () =>
        createQuery([
            buildAssignment({
                responsibilityType: "head",
                permissions: [
                    "section.read_scope",
                    "sectionSession.read_scope",
                    "sectionSession.manage_scope",
                    "attendance.read_scope",
                    "attendance.manage_scope",
                ],
            }),
        ])
    );

    const req = buildRequest();
    const res = createResponse();
    const completed = await runMiddlewareStack(req, res, [
        withScope("department", departmentId),
        requirePermission("section.read_scope"),
    ]);

    assert.equal(completed, false);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { message: "Permission denied" });
});
