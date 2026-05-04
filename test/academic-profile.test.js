const test = require("node:test");
const assert = require("node:assert/strict");

const Institution = require("../src/models/Institution");
const institutionRoutes = require("../src/routes/institutionRoutes");
const schoolAcademicProfileService = require("../src/services/schoolAcademicProfileService");
const universityAcademicProfileService = require("../src/services/universityAcademicProfileService");
const academicProfileService = require("../src/services/academicProfileService");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439099";
const actorUserId = "507f1f77bcf86cd799439012";
const studentMembershipId = "507f1f77bcf86cd799439021";
const targetStudentMembershipId = "507f1f77bcf86cd799439022";
const academicYearId = "507f1f77bcf86cd799439031";
const semesterId = "507f1f77bcf86cd799439041";

function createQuery(result) {
    return {
        select() {
            return this;
        },
        lean: async () => result,
    };
}

function buildActorMembership(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439013",
        institutionId,
        role: "admin",
        status: "active",
        ...overrides,
    };
}

function buildStudentMembership(overrides = {}) {
    return buildActorMembership({
        _id: studentMembershipId,
        role: "student",
        ...overrides,
    });
}

function mockInstitution(t, type) {
    t.mock.method(Institution, "findOne", (query) => {
        if (query._id !== institutionId) {
            return createQuery(null);
        }

        return createQuery({
            _id: institutionId,
            type,
        });
    });
}

function buildProfile(type, studentId) {
    return {
        institutionType: type,
        student: {
            studentMembershipId: studentId,
            name: "Student",
            email: "student@example.com",
        },
        summary: {},
        warnings: [],
    };
}

test("shared self academic profile route behavior dispatches to school provider", async (t) => {
    const queryLog = {};
    mockInstitution(t, "school");
    t.mock.method(schoolAcademicProfileService, "buildSchoolAcademicProfile", async (args) => {
        queryLog.schoolArgs = args;
        return buildProfile("school", args.studentMembershipId);
    });
    t.mock.method(universityAcademicProfileService, "buildUniversityAcademicProfile", async () => {
        throw new Error("university provider should not be called");
    });

    const result = await academicProfileService.buildMyAcademicProfile({
        institutionId,
        actorUserId,
        actorMembership: buildStudentMembership(),
        query: {
            academicYearId,
            semesterId,
        },
    });

    assert.deepEqual(result.academicProfile, buildProfile("school", studentMembershipId));
    assert.equal(queryLog.schoolArgs.institutionId, institutionId);
    assert.equal(queryLog.schoolArgs.studentMembershipId, studentMembershipId);
    assert.equal(queryLog.schoolArgs.academicYearId, academicYearId);
    assert.equal(queryLog.schoolArgs.semesterId, semesterId);
    assert.equal(queryLog.schoolArgs.accessMode, "self");
});

test("shared self academic profile route behavior dispatches to university provider", async (t) => {
    const queryLog = {};
    mockInstitution(t, "university");
    t.mock.method(schoolAcademicProfileService, "buildSchoolAcademicProfile", async () => {
        throw new Error("school provider should not be called");
    });
    t.mock.method(universityAcademicProfileService, "buildUniversityAcademicProfile", async (args) => {
        queryLog.universityArgs = args;
        return buildProfile("university", args.studentMembershipId);
    });

    const result = await academicProfileService.buildMyAcademicProfile({
        institutionId,
        actorUserId,
        actorMembership: buildStudentMembership(),
        query: {
            semesterId,
        },
    });

    assert.deepEqual(result.academicProfile, buildProfile("university", studentMembershipId));
    assert.equal(queryLog.universityArgs.institutionId, institutionId);
    assert.equal(queryLog.universityArgs.studentMembershipId, studentMembershipId);
    assert.equal(queryLog.universityArgs.semesterId, semesterId);
    assert.equal(queryLog.universityArgs.accessMode, "self");
    assert.equal("academicYearId" in queryLog.universityArgs, false);
});

test("shared admin academic profile dispatches to school provider for same-institution target", async (t) => {
    const queryLog = {};
    mockInstitution(t, "school");
    t.mock.method(schoolAcademicProfileService, "buildSchoolAcademicProfile", async (args) => {
        queryLog.schoolArgs = args;
        return buildProfile("school", args.studentMembershipId);
    });

    const result = await academicProfileService.buildStudentAcademicProfile({
        institutionId,
        studentMembershipId: targetStudentMembershipId,
        actorUserId,
        actorMembership: buildActorMembership(),
        query: {
            academicYearId,
        },
    });

    assert.deepEqual(result.academicProfile, buildProfile("school", targetStudentMembershipId));
    assert.equal(queryLog.schoolArgs.accessMode, "staff");
    assert.equal(queryLog.schoolArgs.academicYearId, academicYearId);
});

test("shared admin academic profile dispatches to university provider for same-institution target", async (t) => {
    const queryLog = {};
    mockInstitution(t, "university");
    t.mock.method(universityAcademicProfileService, "buildUniversityAcademicProfile", async (args) => {
        queryLog.universityArgs = args;
        return buildProfile("university", args.studentMembershipId);
    });

    const result = await academicProfileService.buildStudentAcademicProfile({
        institutionId,
        studentMembershipId: targetStudentMembershipId,
        actorUserId,
        actorMembership: buildActorMembership(),
        query: {},
    });

    assert.deepEqual(result.academicProfile, buildProfile("university", targetStudentMembershipId));
    assert.equal(queryLog.universityArgs.accessMode, "staff");
    assert.equal(queryLog.universityArgs.semesterId, null);
});

test("shared academic profile blocks students from reading another student profile", async () => {
    await assert.rejects(
        () =>
            academicProfileService.buildStudentAcademicProfile({
                institutionId,
                studentMembershipId: targetStudentMembershipId,
                actorUserId,
                actorMembership: buildStudentMembership(),
                query: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Students can only view their own academic profile");
            return true;
        }
    );
});

test("shared academic profile blocks cross-tenant actor membership", async () => {
    await assert.rejects(
        () =>
            academicProfileService.buildMyAcademicProfile({
                institutionId,
                actorUserId,
                actorMembership: buildStudentMembership({
                    institutionId: otherInstitutionId,
                }),
                query: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Institution access denied");
            return true;
        }
    );
});

test("shared self academic profile rejects non-active student membership", async () => {
    await assert.rejects(
        () =>
            academicProfileService.buildMyAcademicProfile({
                institutionId,
                actorUserId,
                actorMembership: buildStudentMembership({
                    status: "suspended",
                }),
                query: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Only active students can view their own academic profile");
            return true;
        }
    );
});

test("shared school academic profile preserves provider academicYearId requirement", async (t) => {
    mockInstitution(t, "school");
    t.mock.method(schoolAcademicProfileService, "buildSchoolAcademicProfile", async (args) => {
        if (!args.academicYearId) {
            const error = new Error("academicYearId is required");
            error.statusCode = 400;
            throw error;
        }

        return buildProfile("school", args.studentMembershipId);
    });

    await assert.rejects(
        () =>
            academicProfileService.buildMyAcademicProfile({
                institutionId,
                actorUserId,
                actorMembership: buildStudentMembership(),
                query: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "academicYearId is required");
            return true;
        }
    );
});

test("shared university academic profile does not require academicYearId", async (t) => {
    mockInstitution(t, "university");
    t.mock.method(universityAcademicProfileService, "buildUniversityAcademicProfile", async (args) =>
        buildProfile("university", args.studentMembershipId)
    );

    const result = await academicProfileService.buildMyAcademicProfile({
        institutionId,
        actorUserId,
        actorMembership: buildStudentMembership(),
        query: {},
    });

    assert.deepEqual(result.academicProfile, buildProfile("university", studentMembershipId));
});

test("shared academic profile routes are wired with expected guard shape", () => {
    const routeByPath = new Map(
        institutionRoutes.stack
            .filter((layer) => layer.route)
            .map((layer) => [layer.route.path, layer.route])
    );

    const selfRoute = routeByPath.get("/:institutionId/students/me/academic-profile");
    const staffRoute = routeByPath.get("/:institutionId/students/:studentMembershipId/academic-profile");

    assert.ok(selfRoute);
    assert.ok(staffRoute);
    assert.equal(selfRoute.methods.get, true);
    assert.equal(staffRoute.methods.get, true);
    assert.deepEqual(
        selfRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "getMyAcademicProfile"]
    );
    assert.deepEqual(
        staffRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "<anonymous>", "getStudentAcademicProfile"]
    );
});

test("shared academic profile rejects unsupported institution types safely", async (t) => {
    mockInstitution(t, "training_center");

    await assert.rejects(
        () =>
            academicProfileService.buildMyAcademicProfile({
                institutionId,
                actorUserId,
                actorMembership: buildStudentMembership(),
                query: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Academic profile is not supported for this institution type");
            return true;
        }
    );
});

test("shared academic profile rejects missing actor membership context", async () => {
    await assert.rejects(
        () =>
            academicProfileService.buildMyAcademicProfile({
                institutionId,
                actorUserId,
                actorMembership: null,
                query: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 500);
            assert.equal(error.message, "Membership context missing");
            return true;
        }
    );
});
