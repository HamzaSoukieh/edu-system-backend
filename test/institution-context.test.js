const test = require("node:test");
const assert = require("node:assert/strict");

const Institution = require("../src/models/Institution");
const Membership = require("../src/models/Membership");
const MemberProfile = require("../src/models/MemberProfile");
const ResponsibilityAssignment = require("../src/models/ResponsibilityAssignment");
const Semester = require("../src/models/Semester");
const AcademicYear = require("../src/models/AcademicYear");
const institutionController = require("../src/controllers/institutionController");
const institutionService = require("../src/services/institutionService");
const institutionRoutes = require("../src/routes/institutionRoutes");
const { ROLE_PERMISSIONS, RESPONSIBILITY_PERMISSIONS } = require("../src/auth/permissions");

const userId = "507f1f77bcf86cd799439001";
const otherUserId = "507f1f77bcf86cd799439002";
const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439012";
const outsideInstitutionId = "507f1f77bcf86cd799439013";
const membershipId = "507f1f77bcf86cd799439021";
const otherMembershipId = "507f1f77bcf86cd799439022";
const outsideMembershipId = "507f1f77bcf86cd799439023";
const academicYearId = "507f1f77bcf86cd799439031";
const semesterId = "507f1f77bcf86cd799439041";
const departmentId = "507f1f77bcf86cd799439051";
const classLevelId = "507f1f77bcf86cd799439052";
const sectionId = "507f1f77bcf86cd799439053";
const classId = "507f1f77bcf86cd799439054";

function normalizeId(value) {
    return value === undefined || value === null ? null : value.toString();
}

function matchesId(value, condition) {
    if (condition?.$in) {
        return condition.$in.map(normalizeId).includes(normalizeId(value));
    }

    return normalizeId(value) === normalizeId(condition);
}

function matchesRecord(record, query = {}) {
    return Object.entries(query).every(([field, condition]) => matchesId(record[field], condition));
}

function createQuery(result, logEntry = null) {
    return {
        select(fields) {
            if (logEntry) {
                logEntry.select = fields;
            }
            return this;
        },
        sort(sort) {
            if (logEntry) {
                logEntry.sort = sort;
            }
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
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

function buildMembership(overrides = {}) {
    return {
        _id: membershipId,
        userId,
        institutionId,
        role: "admin",
        status: "active",
        joinedAt: new Date("2026-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ...overrides,
    };
}

function buildInstitution(overrides = {}) {
    return {
        _id: institutionId,
        name: "Main University",
        type: "university",
        status: "active",
        ownerUserId: userId,
        ...overrides,
    };
}

function buildProfile(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439061",
        membershipId,
        institutionId,
        userId,
        fullName: "Owner Admin",
        firstName: "Owner",
        lastName: "Admin",
        fatherName: "Hidden Father",
        motherName: "Hidden Mother",
        nationalNumber: "PRIVATE-NATIONAL-NUMBER",
        mobile: "+963900000001",
        profilePictureUrl: "/uploads/member-profiles/owner.png",
        ...overrides,
    };
}

function buildAssignment(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439071",
        institutionId,
        userId,
        responsibilityType: "head",
        scopeType: "department",
        scopeId: departmentId,
        isActive: true,
        startAt: null,
        endAt: null,
        permissions: ["billing.manage", "membership.manage"],
        ...overrides,
    };
}

function buildSemester(overrides = {}) {
    return {
        _id: semesterId,
        institutionId,
        academicYearId,
        name: "Fall 2026",
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        endDate: new Date("2026-12-20T00:00:00.000Z"),
        status: "active",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        ...overrides,
    };
}

function buildAcademicYear(overrides = {}) {
    return {
        _id: academicYearId,
        institutionId,
        name: "2026-2027",
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        endDate: new Date("2027-06-30T00:00:00.000Z"),
        status: "active",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        ...overrides,
    };
}

function buildDataset(overrides = {}) {
    return {
        memberships: [
            buildMembership(),
            buildMembership({
                _id: otherMembershipId,
                institutionId: otherInstitutionId,
                role: "admin",
                joinedAt: new Date("2026-02-01T00:00:00.000Z"),
                createdAt: new Date("2026-02-01T00:00:00.000Z"),
            }),
        ],
        institutions: [
            buildInstitution(),
            buildInstitution({
                _id: otherInstitutionId,
                name: "Other School",
                type: "school",
                status: "archived",
                ownerUserId: otherUserId,
            }),
            buildInstitution({
                _id: outsideInstitutionId,
                name: "Outside Tenant",
                ownerUserId: otherUserId,
            }),
        ],
        profiles: [
            buildProfile(),
            buildProfile({
                _id: "507f1f77bcf86cd799439062",
                membershipId: otherMembershipId,
                institutionId: outsideInstitutionId,
                fullName: "Cross Tenant Profile",
                firstName: "Cross",
                lastName: "Tenant",
            }),
            buildProfile({
                _id: "507f1f77bcf86cd799439063",
                membershipId: outsideMembershipId,
                institutionId,
                fullName: "Wrong Membership Profile",
                firstName: "Wrong",
                lastName: "Membership",
            }),
        ],
        assignments: [
            buildAssignment(),
            buildAssignment({
                _id: "507f1f77bcf86cd799439072",
                responsibilityType: "coordinator",
                scopeType: "section",
                scopeId: sectionId,
                permissions: ["institution.manage"],
            }),
            buildAssignment({
                _id: "507f1f77bcf86cd799439073",
                institutionId: otherInstitutionId,
                responsibilityType: "mentor",
                scopeType: "class",
                scopeId: classId,
                permissions: ["section.read_scope"],
            }),
            buildAssignment({ _id: "507f1f77bcf86cd799439074", isActive: false }),
            buildAssignment({ _id: "507f1f77bcf86cd799439075", startAt: new Date("2999-01-01T00:00:00.000Z") }),
            buildAssignment({ _id: "507f1f77bcf86cd799439076", endAt: new Date("2000-01-01T00:00:00.000Z") }),
            buildAssignment({ _id: "507f1f77bcf86cd799439077", userId: otherUserId }),
            buildAssignment({ _id: "507f1f77bcf86cd799439078", institutionId: outsideInstitutionId }),
            buildAssignment({
                _id: "507f1f77bcf86cd799439079",
                responsibilityType: "head",
                scopeType: "section",
                scopeId: sectionId,
            }),
        ],
        semesters: [
            buildSemester(),
            buildSemester({
                _id: "507f1f77bcf86cd799439042",
                institutionId,
                name: "Old Archived Semester",
                status: "archived",
            }),
            buildSemester({
                _id: "507f1f77bcf86cd799439043",
                institutionId: outsideInstitutionId,
                name: "Outside Active Semester",
            }),
        ],
        academicYears: [
            buildAcademicYear(),
            buildAcademicYear({
                _id: "507f1f77bcf86cd799439032",
                institutionId,
                name: "Archived Year",
                status: "archived",
            }),
            buildAcademicYear({
                _id: "507f1f77bcf86cd799439033",
                institutionId: outsideInstitutionId,
                name: "Outside Active Year",
            }),
        ],
        queryLog: [],
        ...overrides,
    };
}

function mockInstitutionContextDependencies(t, overrides = {}) {
    const data = buildDataset(overrides);

    t.mock.method(Membership, "find", (query) => {
        const entry = { model: "Membership", method: "find", query };
        data.queryLog.push(entry);
        return createQuery(data.memberships.filter((item) => matchesRecord(item, query)), entry);
    });

    t.mock.method(Institution, "find", (query) => {
        const entry = { model: "Institution", method: "find", query };
        data.queryLog.push(entry);
        return createQuery(data.institutions.filter((item) => matchesRecord(item, query)), entry);
    });

    t.mock.method(MemberProfile, "find", (query) => {
        const entry = { model: "MemberProfile", method: "find", query };
        data.queryLog.push(entry);
        return createQuery(data.profiles.filter((item) => matchesRecord(item, query)), entry);
    });

    t.mock.method(ResponsibilityAssignment, "find", (query) => {
        const entry = { model: "ResponsibilityAssignment", method: "find", query };
        data.queryLog.push(entry);
        return createQuery(data.assignments.filter((item) => matchesRecord(item, query)), entry);
    });

    t.mock.method(Semester, "find", (query) => {
        const entry = { model: "Semester", method: "find", query };
        data.queryLog.push(entry);
        return createQuery(data.semesters.filter((item) => matchesRecord(item, query)), entry);
    });

    t.mock.method(AcademicYear, "find", (query) => {
        const entry = { model: "AcademicYear", method: "find", query };
        data.queryLog.push(entry);
        return createQuery(data.academicYears.filter((item) => matchesRecord(item, query)), entry);
    });

    return data;
}

function authUser(overrides = {}) {
    return {
        id: userId,
        email: "owner@example.com",
        status: "active",
        isEmailVerified: true,
        ...overrides,
    };
}

async function getContext(t, overrides = {}, userOverrides = {}) {
    mockInstitutionContextDependencies(t, {
        profiles: [],
        assignments: [],
        semesters: [],
        academicYears: [],
        ...overrides,
    });

    return institutionService.getMyInstitutionContext(authUser(userOverrides));
}

test("GET /institutions/me service preserves top-level response and enriches membership rows", async (t) => {
    const data = mockInstitutionContextDependencies(t);

    const result = await institutionService.getMyInstitutionContext(authUser());

    assert.deepEqual(Object.keys(result), ["user", "institutions", "activeInstitutionId", "onboarding"]);
    assert.deepEqual(result.user, {
        id: userId,
        email: "owner@example.com",
        status: "active",
        isEmailVerified: true,
    });
    assert.equal(result.activeInstitutionId, institutionId);
    assert.deepEqual(result.onboarding, {
        isEmailVerified: true,
        hasInstitutions: true,
        hasActiveMembership: true,
        hasAdminMembership: true,
        activeInstitutionType: "university",
        nextStep: "build_academic_structure",
    });

    const main = result.institutions.find((item) => item.institutionId === institutionId);
    const other = result.institutions.find((item) => item.institutionId === otherInstitutionId);

    assert.equal(main.membershipId, membershipId);
    assert.equal(main.name, "Main University");
    assert.equal(main.type, "university");
    assert.equal(main.institutionStatus, "active");
    assert.equal(main.role, "admin");
    assert.equal(main.membershipStatus, "active");
    assert.ok(main.joinedAt);
    assert.equal(main.isOwner, true);
    assert.equal(main.role, "admin");
    assert.notEqual(main.role, "owner");

    assert.equal(other.membershipId, otherMembershipId);
    assert.equal(other.name, "Other School");
    assert.equal(other.type, "school");
    assert.equal(other.institutionStatus, "archived");
    assert.equal(other.role, "admin");
    assert.equal(other.isOwner, false);
    assert.notEqual(other.name, "Outside Tenant");

    assert.equal(data.queryLog.length, 6);
});

test("GET /institutions/me member profiles are tenant and membership scoped with limited fields", async (t) => {
    const data = mockInstitutionContextDependencies(t);

    const result = await institutionService.getMyInstitutionContext(authUser());
    const main = result.institutions.find((item) => item.institutionId === institutionId);
    const other = result.institutions.find((item) => item.institutionId === otherInstitutionId);

    assert.deepEqual(main.memberProfile, {
        fullName: "Owner Admin",
        firstName: "Owner",
        lastName: "Admin",
        mobile: "+963900000001",
        profilePictureUrl: "/uploads/member-profiles/owner.png",
    });
    assert.equal(main.memberProfile.nationalNumber, undefined);
    assert.equal(main.memberProfile.fatherName, undefined);
    assert.equal(other.memberProfile, null);

    const profileQuery = data.queryLog.find((entry) => entry.model === "MemberProfile").query;
    assert.deepEqual(profileQuery.institutionId, { $in: [institutionId, otherInstitutionId] });
    assert.deepEqual(profileQuery.membershipId, { $in: [membershipId, otherMembershipId] });
});

test("GET /institutions/me separates base permissions from scoped capabilities", async (t) => {
    mockInstitutionContextDependencies(t);

    const result = await institutionService.getMyInstitutionContext(authUser());
    const main = result.institutions.find((item) => item.institutionId === institutionId);
    const other = result.institutions.find((item) => item.institutionId === otherInstitutionId);

    assert.deepEqual(main.permissions, ROLE_PERMISSIONS.admin);
    assert.notEqual(main.permissions, ROLE_PERMISSIONS.admin);
    assert.equal(main.permissions.includes("academicDecision.review"), true);
    assert.equal(main.permissions.includes("academicRisk.read_scope"), false);
    assert.equal(main.permissions.includes("sectionSession.manage_scope"), false);

    assert.deepEqual(
        main.scopedCapabilities,
        [
            {
                responsibilityType: "head",
                scopeType: "department",
                scopeId: departmentId,
                permissions: RESPONSIBILITY_PERMISSIONS.head,
            },
            {
                responsibilityType: "coordinator",
                scopeType: "section",
                scopeId: sectionId,
                permissions: RESPONSIBILITY_PERMISSIONS.coordinator,
            },
        ]
    );
    assert.notEqual(main.scopedCapabilities[0].permissions, RESPONSIBILITY_PERMISSIONS.head);
    assert.equal(main.scopedCapabilities[0].permissions.includes("billing.manage"), false);
    assert.equal(main.scopedCapabilities[1].permissions.includes("institution.manage"), false);

    assert.deepEqual(other.scopedCapabilities, [
        {
            responsibilityType: "mentor",
            scopeType: "class",
            scopeId: classId,
            permissions: ["academicProfile.read_scope", "academicStanding.read_scope"],
        },
    ]);
});

test("GET /institutions/me active semester and academic year are read-only tenant summaries", async (t) => {
    mockInstitutionContextDependencies(t);

    const result = await institutionService.getMyInstitutionContext(authUser());
    const main = result.institutions.find((item) => item.institutionId === institutionId);
    const other = result.institutions.find((item) => item.institutionId === otherInstitutionId);

    assert.deepEqual(main.activeSemester, {
        id: semesterId,
        academicYearId,
        name: "Fall 2026",
        startDate: "2026-09-01",
        endDate: "2026-12-20",
        status: "active",
    });
    assert.deepEqual(main.activeAcademicYear, {
        id: academicYearId,
        name: "2026-2027",
        startDate: "2026-09-01",
        endDate: "2027-06-30",
        status: "active",
    });
    assert.equal(other.activeSemester, null);
    assert.equal(other.activeAcademicYear, null);
});

test("GET /institutions/me handles missing context safely", async (t) => {
    mockInstitutionContextDependencies(t, {
        memberships: [
            buildMembership({
                _id: membershipId,
                role: "unknown-role",
            }),
        ],
        profiles: [],
        assignments: [],
        semesters: [],
        academicYears: [],
    });

    const result = await institutionService.getMyInstitutionContext(authUser());
    assert.deepEqual(result.institutions[0].permissions, []);
    assert.deepEqual(result.institutions[0].scopedCapabilities, []);
    assert.equal(result.institutions[0].memberProfile, null);
    assert.equal(result.institutions[0].activeSemester, null);
    assert.equal(result.institutions[0].activeAcademicYear, null);
});

test("GET /institutions/me onboarding sends unverified users to email verification first", async (t) => {
    const result = await getContext(
        t,
        {
            memberships: [buildMembership({ role: "instructor" })],
        },
        { isEmailVerified: false }
    );

    assert.deepEqual(result.onboarding, {
        isEmailVerified: false,
        hasInstitutions: true,
        hasActiveMembership: true,
        hasAdminMembership: false,
        activeInstitutionType: "university",
        nextStep: "verify_email",
    });
});

test("GET /institutions/me onboarding sends users without memberships to create or join", async (t) => {
    const result = await getContext(t, { memberships: [] });

    assert.deepEqual(result.onboarding, {
        isEmailVerified: true,
        hasInstitutions: false,
        hasActiveMembership: false,
        hasAdminMembership: false,
        activeInstitutionType: null,
        nextStep: "create_or_join_institution",
    });
});

test("GET /institutions/me onboarding waits only when no membership is active", async (t) => {
    const result = await getContext(t, {
        memberships: [buildMembership({ role: "instructor", status: "suspended" })],
    });

    assert.deepEqual(result.onboarding, {
        isEmailVerified: true,
        hasInstitutions: true,
        hasActiveMembership: false,
        hasAdminMembership: false,
        activeInstitutionType: "university",
        nextStep: "wait_for_membership_activation",
    });
});

test("GET /institutions/me onboarding treats active instructor and student memberships as complete", async (t) => {
    await t.test("active instructor", async (t) => {
        const result = await getContext(t, {
            memberships: [buildMembership({ role: "instructor" })],
        });

        assert.equal(result.onboarding.hasActiveMembership, true);
        assert.equal(result.onboarding.hasAdminMembership, false);
        assert.equal(result.onboarding.nextStep, null);
    });

    await t.test("active student", async (t) => {
        const result = await getContext(t, {
            memberships: [buildMembership({ role: "student" })],
        });

        assert.equal(result.onboarding.hasActiveMembership, true);
        assert.equal(result.onboarding.hasAdminMembership, false);
        assert.equal(result.onboarding.nextStep, null);
    });
});

test("GET /institutions/me onboarding treats active scoped responsibility users as complete", async (t) => {
    const scopedCases = [
        { responsibilityType: "head", scopeType: "institution", scopeId: institutionId },
        { responsibilityType: "coordinator", scopeType: "section", scopeId: sectionId },
        { responsibilityType: "mentor", scopeType: "class", scopeId: classId },
    ];

    for (const scopedCase of scopedCases) {
        await t.test(scopedCase.responsibilityType, async (t) => {
            const result = await getContext(t, {
                memberships: [buildMembership({ role: "instructor" })],
                assignments: [buildAssignment(scopedCase)],
            });
            const institution = result.institutions[0];

            assert.equal(result.onboarding.hasActiveMembership, true);
            assert.equal(result.onboarding.hasAdminMembership, false);
            assert.equal(result.onboarding.nextStep, null);
            assert.deepEqual(institution.permissions, ROLE_PERMISSIONS.instructor);
            assert.deepEqual(institution.scopedCapabilities, [
                {
                    responsibilityType: scopedCase.responsibilityType,
                    scopeType: scopedCase.scopeType,
                    scopeId: scopedCase.scopeId,
                    permissions: RESPONSIBILITY_PERMISSIONS[scopedCase.responsibilityType],
                },
            ]);
        });
    }
});

test("GET /institutions/me onboarding keeps active admin academic-structure guidance", async (t) => {
    const result = await getContext(t, {
        memberships: [buildMembership({ role: "admin", status: "active" })],
    });

    assert.equal(result.onboarding.hasActiveMembership, true);
    assert.equal(result.onboarding.hasAdminMembership, true);
    assert.equal(result.onboarding.nextStep, "build_academic_structure");
});

test("GET /institutions/me onboarding does not treat inactive admin as admin access", async (t) => {
    const result = await getContext(t, {
        memberships: [
            buildMembership({ role: "admin", status: "suspended" }),
            buildMembership({
                _id: otherMembershipId,
                institutionId: otherInstitutionId,
                role: "instructor",
                status: "active",
            }),
        ],
        institutions: [
            buildInstitution(),
            buildInstitution({
                _id: otherInstitutionId,
                name: "Other School",
                type: "school",
                ownerUserId: otherUserId,
            }),
        ],
    });

    assert.equal(result.onboarding.hasInstitutions, true);
    assert.equal(result.onboarding.hasActiveMembership, true);
    assert.equal(result.onboarding.hasAdminMembership, false);
    assert.equal(result.onboarding.nextStep, null);
    assert.equal(result.activeInstitutionId, otherInstitutionId);
});

test("GET /institutions/me batch-loads related records and keeps tenant scoped queries", async (t) => {
    const data = mockInstitutionContextDependencies(t);

    await institutionService.getMyInstitutionContext(authUser());

    assert.deepEqual(
        data.queryLog.map((entry) => `${entry.model}.${entry.method}`),
        [
            "Membership.find",
            "Institution.find",
            "MemberProfile.find",
            "ResponsibilityAssignment.find",
            "Semester.find",
            "AcademicYear.find",
        ]
    );

    const membershipQuery = data.queryLog.find((entry) => entry.model === "Membership").query;
    assert.deepEqual(membershipQuery, { userId });

    const institutionQuery = data.queryLog.find((entry) => entry.model === "Institution").query;
    assert.deepEqual(institutionQuery._id, { $in: [institutionId, otherInstitutionId] });

    const assignmentQuery = data.queryLog.find((entry) => entry.model === "ResponsibilityAssignment").query;
    assert.deepEqual(assignmentQuery.institutionId, { $in: [institutionId, otherInstitutionId] });
    assert.equal(assignmentQuery.userId, userId);
    assert.equal(assignmentQuery.isActive, true);

    const semesterEntry = data.queryLog.find((entry) => entry.model === "Semester");
    assert.deepEqual(semesterEntry.query, {
        institutionId: { $in: [institutionId, otherInstitutionId] },
        status: "active",
    });
    assert.deepEqual(semesterEntry.sort, { startDate: -1, createdAt: -1, _id: -1 });

    const academicYearEntry = data.queryLog.find((entry) => entry.model === "AcademicYear");
    assert.deepEqual(academicYearEntry.query, {
        institutionId: { $in: [institutionId, otherInstitutionId] },
        status: "active",
    });
    assert.deepEqual(academicYearEntry.sort, { startDate: -1, createdAt: -1, _id: -1 });
});

test("GET /institutions/me controller delegates and route keeps auth middleware", async (t) => {
    let receivedUser = null;
    t.mock.method(institutionService, "getMyInstitutionContext", async (user) => {
        receivedUser = user;
        return {
            user,
            institutions: [],
            activeInstitutionId: null,
            onboarding: {
                isEmailVerified: true,
                hasInstitutions: false,
                hasActiveMembership: false,
                hasAdminMembership: false,
                activeInstitutionType: null,
                nextStep: "create_or_join_institution",
            },
        };
    });

    const req = { user: authUser() };
    const res = createResponse();
    await institutionController.getMyInstitutionContext(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(receivedUser, req.user);
    assert.deepEqual(res.body.institutions, []);

    const route = institutionRoutes.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route)
        .find((item) => item.path === "/me" && item.methods.get);

    assert.ok(route);
    assert.deepEqual(
        route.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "getMyInstitutionContext"]
    );
    assert.equal(route.stack.some((layer) => layer.handle.requiredPermission), false);
});
