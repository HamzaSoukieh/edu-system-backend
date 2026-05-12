const test = require("node:test");
const assert = require("node:assert/strict");

const Department = require("../src/models/Department");
const Enrollment = require("../src/models/Enrollment");
const Institution = require("../src/models/Institution");
const MemberProfile = require("../src/models/MemberProfile");
const Membership = require("../src/models/Membership");
const Section = require("../src/models/Section");
const Semester = require("../src/models/Semester");
const Subject = require("../src/models/Subject");
const User = require("../src/models/User");
const institutionRoutes = require("../src/routes/institutionRoutes");
const universityAcademicOutcomeService = require("../src/services/universityAcademicOutcomeService");
const standingReportService = require("../src/services/universityAcademicStandingReportService");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439099";
const schoolInstitutionId = "507f1f77bcf86cd799439098";
const adminUserId = "507f1f77bcf86cd799439012";
const adminMembershipId = "507f1f77bcf86cd799439013";
const instructorUserId = "507f1f77bcf86cd799439014";
const instructorMembershipId = "507f1f77bcf86cd799439015";
const otherInstructorMembershipId = "507f1f77bcf86cd799439016";
const goodStudentId = "507f1f77bcf86cd799439021";
const warningStudentId = "507f1f77bcf86cd799439022";
const probationStudentId = "507f1f77bcf86cd799439023";
const suspensionStudentId = "507f1f77bcf86cd799439024";
const noOutcomeStudentId = "507f1f77bcf86cd799439025";
const reviewStudentId = "507f1f77bcf86cd799439026";
const otherTenantStudentId = "507f1f77bcf86cd799439027";
const semesterId = "507f1f77bcf86cd799439031";
const subjectId = "507f1f77bcf86cd799439041";
const sectionOneId = "507f1f77bcf86cd799439051";
const sectionTwoId = "507f1f77bcf86cd799439052";
const sectionThreeId = "507f1f77bcf86cd799439053";
const departmentId = "507f1f77bcf86cd799439061";

function createQuery(result) {
    return {
        select() {
            return this;
        },
        sort() {
            return this;
        },
        lean: async () => result,
    };
}

function normalizeId(value) {
    return value === undefined || value === null ? null : value.toString();
}

function idSet(values = []) {
    return new Set(values.map(normalizeId).filter(Boolean));
}

function matchesOptionalIn(value, condition) {
    if (!condition?.$in) {
        return true;
    }

    return idSet(condition.$in).has(normalizeId(value));
}

function buildActorMembership(overrides = {}) {
    return {
        _id: adminMembershipId,
        institutionId,
        role: "admin",
        status: "active",
        ...overrides,
    };
}

function buildCustomStandingRules() {
    return {
        enabled: true,
        bands: [
            {
                standing: "suspension",
                maxCumulativeGpaExclusive: 1.2,
                allowedToContinue: false,
                requiresAdvisorReview: true,
            },
            {
                standing: "probation",
                minCumulativeGpa: 1.2,
                maxCumulativeGpaExclusive: 2,
                allowedToContinue: true,
                requiresAdvisorReview: true,
            },
            {
                standing: "academic_warning",
                minCumulativeGpa: 2,
                maxCumulativeGpaExclusive: 2.5,
                allowedToContinue: true,
                requiresAdvisorReview: false,
            },
            {
                standing: "good_standing",
                minCumulativeGpa: 2.5,
                allowedToContinue: true,
                requiresAdvisorReview: false,
            },
        ],
        requireManualReviewIfIncompleteProfile: true,
        noOutcomeStanding: "no_standing_yet",
        allowManualReview: true,
    };
}

function buildOutcomeResult({ cumulativeGpa, excluded = [], academicStandingRules } = {}) {
    if (cumulativeGpa === null) {
        return {
            outcomes: [],
            summary: {
                attemptedCreditHours: 0,
                earnedCreditHours: 0,
                qualityPoints: 0,
                cumulativeGpa: null,
            },
            excluded,
            academicStandingRules,
        };
    }

    return {
        outcomes: [
            {
                enrollmentId: "507f1f77bcf86cd799439071",
                sectionId: sectionOneId,
                semesterId,
                subjectId,
                outcomeStatus: "passed_final",
                attemptedCreditHours: 3,
                earnedCreditHours: 3,
                gradePoint: cumulativeGpa,
                qualityPoints: cumulativeGpa * 3,
            },
        ],
        summary: {
            attemptedCreditHours: 3,
            earnedCreditHours: 3,
            qualityPoints: cumulativeGpa * 3,
            cumulativeGpa,
        },
        excluded,
        academicStandingRules,
    };
}

function buildDataset(overrides = {}) {
    return {
        institutions: [
            { _id: institutionId, type: "university" },
            { _id: otherInstitutionId, type: "university" },
            { _id: schoolInstitutionId, type: "school" },
        ],
        memberships: [
            {
                _id: goodStudentId,
                institutionId,
                userId: "507f1f77bcf86cd799439081",
                role: "student",
                status: "active",
            },
            {
                _id: warningStudentId,
                institutionId,
                userId: "507f1f77bcf86cd799439082",
                role: "student",
                status: "active",
            },
            {
                _id: probationStudentId,
                institutionId,
                userId: "507f1f77bcf86cd799439083",
                role: "student",
                status: "active",
            },
            {
                _id: suspensionStudentId,
                institutionId,
                userId: "507f1f77bcf86cd799439084",
                role: "student",
                status: "active",
            },
            {
                _id: noOutcomeStudentId,
                institutionId,
                userId: "507f1f77bcf86cd799439085",
                role: "student",
                status: "active",
            },
            {
                _id: reviewStudentId,
                institutionId,
                userId: "507f1f77bcf86cd799439086",
                role: "student",
                status: "active",
            },
            {
                _id: otherTenantStudentId,
                institutionId: otherInstitutionId,
                userId: "507f1f77bcf86cd799439087",
                role: "student",
                status: "active",
            },
        ],
        profiles: [
            { _id: "507f1f77bcf86cd799439091", institutionId, membershipId: goodStudentId, fullName: "A Good" },
            { _id: "507f1f77bcf86cd799439092", institutionId, membershipId: warningStudentId, fullName: "B Warning" },
            { _id: "507f1f77bcf86cd799439093", institutionId, membershipId: probationStudentId, fullName: "C Probation" },
            { _id: "507f1f77bcf86cd799439094", institutionId, membershipId: suspensionStudentId, fullName: "D Suspension" },
            { _id: "507f1f77bcf86cd799439095", institutionId, membershipId: noOutcomeStudentId, fullName: "E No Outcome" },
            { _id: "507f1f77bcf86cd799439096", institutionId, membershipId: reviewStudentId, fullName: "F Review" },
            {
                _id: "507f1f77bcf86cd799439097",
                institutionId: otherInstitutionId,
                membershipId: otherTenantStudentId,
                fullName: "Other Tenant",
            },
        ],
        users: [
            { _id: "507f1f77bcf86cd799439081", email: "good@example.com" },
            { _id: "507f1f77bcf86cd799439082", email: "warning@example.com" },
            { _id: "507f1f77bcf86cd799439083", email: "probation@example.com" },
            { _id: "507f1f77bcf86cd799439084", email: "suspension@example.com" },
            { _id: "507f1f77bcf86cd799439085", email: "no-outcome@example.com" },
            { _id: "507f1f77bcf86cd799439086", email: "review@example.com" },
            { _id: "507f1f77bcf86cd799439087", email: "other@example.com" },
        ],
        semesters: [{ _id: semesterId, institutionId }],
        departments: [{ _id: departmentId, institutionId }],
        subjects: [{ _id: subjectId, institutionId, departmentId }],
        sections: [
            {
                _id: sectionOneId,
                institutionId,
                semesterId,
                subjectId,
                instructorMemberId: instructorMembershipId,
            },
            {
                _id: sectionTwoId,
                institutionId,
                semesterId,
                subjectId,
                instructorMemberId: instructorMembershipId,
            },
            {
                _id: sectionThreeId,
                institutionId,
                semesterId,
                subjectId,
                instructorMemberId: otherInstructorMembershipId,
            },
        ],
        enrollments: [
            {
                _id: "507f1f77bcf86cd7994390a1",
                institutionId,
                sectionId: sectionOneId,
                studentMemberId: goodStudentId,
                status: "enrolled",
            },
            {
                _id: "507f1f77bcf86cd7994390a2",
                institutionId,
                sectionId: sectionTwoId,
                studentMemberId: goodStudentId,
                status: "enrolled",
            },
            {
                _id: "507f1f77bcf86cd7994390a3",
                institutionId,
                sectionId: sectionOneId,
                studentMemberId: suspensionStudentId,
                status: "enrolled",
            },
            {
                _id: "507f1f77bcf86cd7994390a4",
                institutionId,
                sectionId: sectionThreeId,
                studentMemberId: warningStudentId,
                status: "enrolled",
            },
        ],
        outcomeResultsByStudentId: {
            [goodStudentId]: buildOutcomeResult({ cumulativeGpa: 3.2 }),
            [warningStudentId]: buildOutcomeResult({ cumulativeGpa: 1.8 }),
            [probationStudentId]: buildOutcomeResult({ cumulativeGpa: 1.2 }),
            [suspensionStudentId]: buildOutcomeResult({ cumulativeGpa: 0.8 }),
            [noOutcomeStudentId]: buildOutcomeResult({ cumulativeGpa: null }),
            [reviewStudentId]: buildOutcomeResult({
                cumulativeGpa: 3,
                excluded: [{ reasonCode: "missing_assessment_result", message: "Missing result" }],
            }),
        },
        ...overrides,
    };
}

function mockStandingReportDependencies(t, dataset, queryLog = {}) {
    queryLog.outcomeStudentIds = [];
    queryLog.enrollmentFindQueries = [];

    t.mock.method(Institution, "findOne", (query) =>
        createQuery(dataset.institutions.find((institution) => normalizeId(institution._id) === normalizeId(query._id)) || null)
    );

    t.mock.method(Semester, "findOne", (query) =>
        createQuery(
            dataset.semesters.find(
                (semester) =>
                    normalizeId(semester._id) === normalizeId(query._id) &&
                    normalizeId(semester.institutionId) === normalizeId(query.institutionId)
            ) || null
        )
    );

    t.mock.method(Department, "findOne", (query) =>
        createQuery(
            dataset.departments.find(
                (department) =>
                    normalizeId(department._id) === normalizeId(query._id) &&
                    normalizeId(department.institutionId) === normalizeId(query.institutionId)
            ) || null
        )
    );

    t.mock.method(Subject, "find", (query) =>
        createQuery(
            dataset.subjects.filter(
                (subject) =>
                    normalizeId(subject.institutionId) === normalizeId(query.institutionId) &&
                    (query.departmentId === undefined ||
                        normalizeId(subject.departmentId) === normalizeId(query.departmentId)) &&
                    matchesOptionalIn(subject._id, query._id)
            )
        )
    );

    t.mock.method(Section, "find", (query) =>
        createQuery(
            dataset.sections.filter(
                (section) =>
                    normalizeId(section.institutionId) === normalizeId(query.institutionId) &&
                    (query.semesterId === undefined ||
                        normalizeId(section.semesterId) === normalizeId(query.semesterId)) &&
                    (query.instructorMemberId === undefined ||
                        normalizeId(section.instructorMemberId) === normalizeId(query.instructorMemberId)) &&
                    matchesOptionalIn(section.subjectId, query.subjectId) &&
                    matchesOptionalIn(section._id, query._id)
            )
        )
    );

    t.mock.method(Enrollment, "find", (query) => {
        queryLog.enrollmentFindQueries.push(query);
        return createQuery(
            dataset.enrollments.filter(
                (enrollment) =>
                    normalizeId(enrollment.institutionId) === normalizeId(query.institutionId) &&
                    (query.status === undefined || enrollment.status === query.status) &&
                    matchesOptionalIn(enrollment.sectionId, query.sectionId)
            )
        );
    });

    t.mock.method(Membership, "find", (query) => {
        queryLog.membershipFindQuery = query;
        return createQuery(
            dataset.memberships.filter(
                (membership) =>
                    normalizeId(membership.institutionId) === normalizeId(query.institutionId) &&
                    membership.role === query.role &&
                    membership.status === query.status &&
                    matchesOptionalIn(membership._id, query._id)
            )
        );
    });

    t.mock.method(MemberProfile, "find", (query) =>
        createQuery(
            dataset.profiles.filter(
                (profile) =>
                    normalizeId(profile.institutionId) === normalizeId(query.institutionId) &&
                    matchesOptionalIn(profile.membershipId, query.membershipId)
            )
        )
    );

    t.mock.method(User, "find", (query) =>
        createQuery(dataset.users.filter((user) => matchesOptionalIn(user._id, query._id)))
    );

    t.mock.method(universityAcademicOutcomeService, "listStudentAcademicOutcomes", async (args) => {
        queryLog.outcomeStudentIds.push(args.studentMemberId);
        if (typeof dataset.resolveOutcomeResult === "function") {
            return dataset.resolveOutcomeResult(args);
        }

        return dataset.outcomeResultsByStudentId[args.studentMemberId] || buildOutcomeResult({ cumulativeGpa: null });
    });
}

test("university academic standing summary counts students by live standing", async (t) => {
    mockStandingReportDependencies(t, buildDataset());

    const result = await standingReportService.summarizeUniversityAcademicStandings({
        institutionId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: {},
    });

    assert.deepEqual(result.standingSummary, {
        totalStudents: 6,
        good_standing: 1,
        academic_warning: 1,
        probation: 1,
        suspension: 1,
        review_required: 1,
        no_standing_yet: 1,
    });
});

test("university academic standing list returns compact details and pagination", async (t) => {
    mockStandingReportDependencies(t, buildDataset());

    const result = await standingReportService.listUniversityAcademicStandingStudents({
        institutionId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: { page: "2", limit: "2" },
    });

    assert.deepEqual(result.pagination, {
        page: 2,
        limit: 2,
        total: 6,
        totalPages: 3,
    });
    assert.deepEqual(
        result.students.map((student) => ({
            studentMembershipId: student.studentMembershipId,
            name: student.name,
            standing: student.academicStanding.standing,
            calculationMode: student.academicStanding.calculationMode,
            source: student.academicStanding.source,
        })),
        [
            {
                studentMembershipId: probationStudentId,
                name: "C Probation",
                standing: "probation",
                calculationMode: "live",
                source: "academic_profile",
            },
            {
                studentMembershipId: suspensionStudentId,
                name: "D Suspension",
                standing: "suspension",
                calculationMode: "live",
                source: "academic_profile",
            },
        ]
    );
    assert.equal(result.students[0].academicStanding.enabled, true);
    assert.ok(Array.isArray(result.students[0].academicStanding.reasonCodes));
});

test("university academic standing list filters by standing", async (t) => {
    mockStandingReportDependencies(t, buildDataset());

    const result = await standingReportService.listUniversityAcademicStandingStudents({
        institutionId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: { standing: "suspension" },
    });

    assert.equal(result.pagination.total, 1);
    assert.equal(result.students[0].studentMembershipId, suspensionStudentId);
    assert.equal(result.students[0].academicStanding.standing, "suspension");
    assert.equal(result.standingSummary.suspension, 1);
});

test("custom academicStandingRules threshold affects summary and list", async (t) => {
    mockStandingReportDependencies(
        t,
        buildDataset({
            outcomeResultsByStudentId: {
                [goodStudentId]: buildOutcomeResult({ cumulativeGpa: 3.2 }),
                [warningStudentId]: buildOutcomeResult({ cumulativeGpa: 1.8 }),
                [probationStudentId]: buildOutcomeResult({ cumulativeGpa: 1.3 }),
                [suspensionStudentId]: buildOutcomeResult({
                    cumulativeGpa: 1.1,
                    academicStandingRules: buildCustomStandingRules(),
                }),
            },
        })
    );

    const result = await standingReportService.listUniversityAcademicStandingStudents({
        institutionId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: { standing: "suspension" },
    });

    assert.equal(result.standingSummary.suspension, 1);
    assert.equal(result.students[0].studentMembershipId, suspensionStudentId);
    assert.equal(result.students[0].cumulativeGpa, 1.1);
    assert.equal(result.students[0].academicStanding.appliedBand.maxCumulativeGpaExclusive, 1.2);
});

test("university academic standing list supports GPA, search, semester, and department filters", async (t) => {
    mockStandingReportDependencies(t, buildDataset());

    const result = await standingReportService.listUniversityAcademicStandingStudents({
        institutionId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: {
            minGpa: "1.7",
            maxGpa: "1.999",
            search: "warning",
            semesterId,
            departmentId,
        },
    });

    assert.equal(result.pagination.total, 1);
    assert.equal(result.students[0].studentMembershipId, warningStudentId);
    assert.equal(result.students[0].academicStanding.standing, "academic_warning");
});

test("semester and department standing scopes include only enrolled section enrollments", async (t) => {
    const queryLog = {};
    mockStandingReportDependencies(
        t,
        buildDataset({
            enrollments: [
                {
                    _id: "507f1f77bcf86cd7994390b1",
                    institutionId,
                    sectionId: sectionOneId,
                    studentMemberId: goodStudentId,
                    status: "enrolled",
                },
                {
                    _id: "507f1f77bcf86cd7994390b2",
                    institutionId,
                    sectionId: sectionOneId,
                    studentMemberId: suspensionStudentId,
                    status: "dropped",
                },
            ],
        }),
        queryLog
    );

    const result = await standingReportService.listUniversityAcademicStandingStudents({
        institutionId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: {
            semesterId,
            departmentId,
        },
    });

    assert.deepEqual(
        result.students.map((student) => student.studentMembershipId),
        [goodStudentId]
    );
    assert.equal(queryLog.enrollmentFindQueries.every((query) => query.status === "enrolled"), true);
});

test("instructor standing scope includes only enrolled students in assigned sections", async (t) => {
    const queryLog = {};
    mockStandingReportDependencies(
        t,
        buildDataset({
            enrollments: [
                {
                    _id: "507f1f77bcf86cd7994390c1",
                    institutionId,
                    sectionId: sectionOneId,
                    studentMemberId: goodStudentId,
                    status: "enrolled",
                },
                {
                    _id: "507f1f77bcf86cd7994390c2",
                    institutionId,
                    sectionId: sectionTwoId,
                    studentMemberId: suspensionStudentId,
                    status: "dropped",
                },
                {
                    _id: "507f1f77bcf86cd7994390c3",
                    institutionId,
                    sectionId: sectionThreeId,
                    studentMemberId: warningStudentId,
                    status: "enrolled",
                },
            ],
        }),
        queryLog
    );

    const result = await standingReportService.listMyUniversityAcademicStandingStudents({
        institutionId,
        actorUserId: instructorUserId,
        actorMembership: buildActorMembership({
            _id: instructorMembershipId,
            role: "instructor",
        }),
        query: {},
    });

    assert.deepEqual(
        result.students.map((student) => student.studentMembershipId),
        [goodStudentId]
    );
    assert.equal(queryLog.enrollmentFindQueries.every((query) => query.status === "enrolled"), true);
});

test("university academic standing report builds rows with bounded concurrency", async (t) => {
    const dataset = buildDataset();
    let activeOutcomeReads = 0;
    let maxActiveOutcomeReads = 0;
    dataset.resolveOutcomeResult = async (args) => {
        activeOutcomeReads += 1;
        maxActiveOutcomeReads = Math.max(maxActiveOutcomeReads, activeOutcomeReads);
        await new Promise((resolve) => {
            setTimeout(resolve, 5);
        });
        activeOutcomeReads -= 1;
        return dataset.outcomeResultsByStudentId[args.studentMemberId] || buildOutcomeResult({ cumulativeGpa: null });
    };
    mockStandingReportDependencies(t, dataset);

    const result = await standingReportService.listUniversityAcademicStandingStudents({
        institutionId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: {},
    });

    assert.equal(result.pagination.total, 6);
    assert.ok(maxActiveOutcomeReads > 1);
    assert.ok(maxActiveOutcomeReads <= 5);
});

test("university academic standing report preserves tenant isolation", async (t) => {
    const queryLog = {};
    mockStandingReportDependencies(t, buildDataset(), queryLog);

    const result = await standingReportService.listUniversityAcademicStandingStudents({
        institutionId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: {},
    });

    assert.equal(result.pagination.total, 6);
    assert.equal(queryLog.outcomeStudentIds.includes(otherTenantStudentId), false);
    assert.equal(queryLog.membershipFindQuery.institutionId, institutionId);
});

test("university academic standing report rejects non-university institutions", async (t) => {
    mockStandingReportDependencies(t, buildDataset());

    await assert.rejects(
        () =>
            standingReportService.summarizeUniversityAcademicStandings({
                institutionId: schoolInstitutionId,
                actorUserId: adminUserId,
                actorMembership: buildActorMembership({ institutionId: schoolInstitutionId }),
                query: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Academic standing dashboard is only supported for university institutions");
            return true;
        }
    );
});

test("university academic standing report blocks unauthorized institution-wide access", async (t) => {
    mockStandingReportDependencies(t, buildDataset());

    await assert.rejects(
        () =>
            standingReportService.listUniversityAcademicStandingStudents({
                institutionId,
                actorUserId: adminUserId,
                actorMembership: buildActorMembership({
                    _id: goodStudentId,
                    role: "student",
                }),
                query: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Permission denied");
            return true;
        }
    );
});

test("instructor academic standing report is scoped to assigned sections and dedupes students", async (t) => {
    mockStandingReportDependencies(t, buildDataset());

    const result = await standingReportService.listMyUniversityAcademicStandingStudents({
        institutionId,
        actorUserId: instructorUserId,
        actorMembership: buildActorMembership({
            _id: instructorMembershipId,
            role: "instructor",
        }),
        query: {},
    });

    assert.deepEqual(result.standingSummary, {
        totalStudents: 2,
        good_standing: 1,
        academic_warning: 0,
        probation: 0,
        suspension: 1,
        review_required: 0,
        no_standing_yet: 0,
    });
    assert.deepEqual(
        result.students.map((student) => student.studentMembershipId),
        [goodStudentId, suspensionStudentId]
    );
});

test("non-instructors cannot use instructor academic standing report", async (t) => {
    mockStandingReportDependencies(t, buildDataset());

    await assert.rejects(
        () =>
            standingReportService.summarizeMyUniversityAcademicStandings({
                institutionId,
                actorUserId: adminUserId,
                actorMembership: buildActorMembership(),
                query: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Only instructors can access their academic standing dashboard");
            return true;
        }
    );
});

test("university academic standing routes are wired with expected guard shape", () => {
    const routeByPath = new Map(
        institutionRoutes.stack
            .filter((layer) => layer.route)
            .map((layer) => [layer.route.path, layer.route])
    );

    const adminSummaryRoute = routeByPath.get("/:institutionId/academic-standing/university/summary");
    const adminListRoute = routeByPath.get("/:institutionId/academic-standing/university/students");
    const instructorSummaryRoute = routeByPath.get("/:institutionId/instructors/me/academic-standing/summary");
    const instructorListRoute = routeByPath.get("/:institutionId/instructors/me/academic-standing/students");

    assert.ok(adminSummaryRoute);
    assert.ok(adminListRoute);
    assert.ok(instructorSummaryRoute);
    assert.ok(instructorListRoute);
    assert.deepEqual(
        adminSummaryRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "<anonymous>", "getUniversityAcademicStandingSummary"]
    );
    assert.deepEqual(
        adminListRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "<anonymous>", "listUniversityAcademicStandingStudents"]
    );
    assert.deepEqual(
        instructorSummaryRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "getMyInstructorAcademicStandingSummary"]
    );
    assert.deepEqual(
        instructorListRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "listMyInstructorAcademicStandingStudents"]
    );
});
