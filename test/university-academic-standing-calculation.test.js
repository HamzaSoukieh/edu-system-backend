const test = require("node:test");
const assert = require("node:assert/strict");

const Assessment = require("../src/models/Assessment");
const AssessmentResult = require("../src/models/AssessmentResult");
const Department = require("../src/models/Department");
const Enrollment = require("../src/models/Enrollment");
const Institution = require("../src/models/Institution");
const InstitutionAcademicPolicy = require("../src/models/InstitutionAcademicPolicy");
const MemberProfile = require("../src/models/MemberProfile");
const Membership = require("../src/models/Membership");
const Section = require("../src/models/Section");
const Semester = require("../src/models/Semester");
const Subject = require("../src/models/Subject");
const User = require("../src/models/User");
const { buildUniversityAcademicProfile } = require("../src/services/universityAcademicProfileService");
const standingReportService = require("../src/services/universityAcademicStandingReportService");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439099";
const actorUserId = "507f1f77bcf86cd799439012";
const actorMembershipId = "507f1f77bcf86cd799439013";
const instructorMembershipId = "507f1f77bcf86cd799439014";
const otherInstructorMembershipId = "507f1f77bcf86cd799439015";
const semesterId = "507f1f77bcf86cd799439031";
const departmentId = "507f1f77bcf86cd799439041";
const subjectId = "507f1f77bcf86cd799439051";
const policyId = "507f1f77bcf86cd799439061";
const goodStudentId = "507f1f77bcf86cd799439101";
const warningStudentId = "507f1f77bcf86cd799439102";
const probationStudentId = "507f1f77bcf86cd799439103";
const suspensionStudentId = "507f1f77bcf86cd799439104";
const noOutcomeStudentId = "507f1f77bcf86cd799439105";
const reviewStudentId = "507f1f77bcf86cd799439106";
const repeatStudentId = "507f1f77bcf86cd799439107";

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

function matchesIn(value, condition) {
    if (!condition?.$in) {
        return true;
    }

    const ids = new Set(condition.$in.map(normalizeId));
    return ids.has(normalizeId(value));
}

function matchesId(value, condition) {
    if (condition?.$in) {
        return matchesIn(value, condition);
    }

    if (condition?.$ne) {
        return normalizeId(value) !== normalizeId(condition.$ne);
    }

    if (condition === undefined) {
        return true;
    }

    return normalizeId(value) === normalizeId(condition);
}

function buildActorMembership(overrides = {}) {
    return {
        _id: actorMembershipId,
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

function buildPolicy(overrides = {}) {
    return {
        _id: policyId,
        institutionId,
        name: "Standing Calculation Policy",
        status: "active",
        effectiveFromSemesterId: semesterId,
        minimumEnrollmentCreditHours: 0,
        defaultMaxCreditHours: 18,
        overloadMinGpa: 3,
        overloadMaxCreditHours: 21,
        outcomeThresholds: {
            failedMaxPercentage: 59.99,
            improvableMinPercentage: 60,
            improvableMaxPercentage: 69.99,
            finalPassMinPercentage: 70,
        },
        gpaBands: [
            { minPercentage: 0, maxPercentage: 60, gradePoint: 0.8 },
            { minPercentage: 60, maxPercentage: 70, gradePoint: 1.1 },
            { minPercentage: 70, maxPercentage: 80, gradePoint: 1.8 },
            { minPercentage: 80, maxPercentage: 100, gradePoint: 3.2 },
        ],
        repeatPolicy: {
            enabled: true,
            gpaCalculationMethod: "best_attempt_only",
            earnedCreditsMethod: "count_once_per_subject",
            prerequisiteMethod: "best_passed_attempt",
            allowGradeImprovementRepeats: true,
            blockRepeatAfterFinalPass: true,
        },
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        ...overrides,
    };
}

function buildBaseDataset({ policyOverrides = {}, includeRepeatStudent = false } = {}) {
    const dataset = {
        institutions: [
            { _id: institutionId, type: "university" },
            { _id: otherInstitutionId, type: "university" },
        ],
        semesters: [
            {
                _id: semesterId,
                institutionId,
                name: "Verified Term",
                startDate: new Date("2026-01-05T00:00:00.000Z"),
                endDate: new Date("2026-05-05T00:00:00.000Z"),
                status: "archived",
            },
        ],
        policies: [buildPolicy(policyOverrides)],
        departments: [{ _id: departmentId, institutionId }],
        subjects: [
            {
                _id: subjectId,
                institutionId,
                departmentId,
                code: "STAND101",
                name: "Standing Verification",
                creditHours: 3,
                status: "active",
            },
        ],
        memberships: [
            {
                _id: goodStudentId,
                institutionId,
                userId: "507f1f77bcf86cd799439201",
                role: "student",
                status: "active",
            },
            {
                _id: warningStudentId,
                institutionId,
                userId: "507f1f77bcf86cd799439202",
                role: "student",
                status: "active",
            },
            {
                _id: probationStudentId,
                institutionId,
                userId: "507f1f77bcf86cd799439203",
                role: "student",
                status: "active",
            },
            {
                _id: suspensionStudentId,
                institutionId,
                userId: "507f1f77bcf86cd799439204",
                role: "student",
                status: "active",
            },
            {
                _id: noOutcomeStudentId,
                institutionId,
                userId: "507f1f77bcf86cd799439205",
                role: "student",
                status: "active",
            },
            {
                _id: reviewStudentId,
                institutionId,
                userId: "507f1f77bcf86cd799439206",
                role: "student",
                status: "active",
            },
        ],
        profiles: [
            { _id: "507f1f77bcf86cd799439301", institutionId, membershipId: goodStudentId, fullName: "A Good Standing" },
            { _id: "507f1f77bcf86cd799439302", institutionId, membershipId: warningStudentId, fullName: "B Academic Warning" },
            { _id: "507f1f77bcf86cd799439303", institutionId, membershipId: probationStudentId, fullName: "C Probation" },
            { _id: "507f1f77bcf86cd799439304", institutionId, membershipId: suspensionStudentId, fullName: "D Suspension" },
            { _id: "507f1f77bcf86cd799439305", institutionId, membershipId: noOutcomeStudentId, fullName: "E No Outcome" },
            { _id: "507f1f77bcf86cd799439306", institutionId, membershipId: reviewStudentId, fullName: "F Review Required" },
        ],
        users: [
            { _id: "507f1f77bcf86cd799439201", email: "good-standing@example.com" },
            { _id: "507f1f77bcf86cd799439202", email: "academic-warning@example.com" },
            { _id: "507f1f77bcf86cd799439203", email: "probation@example.com" },
            { _id: "507f1f77bcf86cd799439204", email: "suspension@example.com" },
            { _id: "507f1f77bcf86cd799439205", email: "no-outcome@example.com" },
            { _id: "507f1f77bcf86cd799439206", email: "review-required@example.com" },
        ],
        sections: [],
        enrollments: [],
        assessments: [],
        assessmentResults: [],
    };

    addFinalizedAttempt(dataset, {
        studentMembershipId: goodStudentId,
        score: 85,
        index: 1,
        instructorMemberId: instructorMembershipId,
    });
    addFinalizedAttempt(dataset, {
        studentMembershipId: warningStudentId,
        score: 75,
        index: 2,
        instructorMemberId: otherInstructorMembershipId,
    });
    addFinalizedAttempt(dataset, {
        studentMembershipId: probationStudentId,
        score: 65,
        index: 3,
        instructorMemberId: null,
    });
    addFinalizedAttempt(dataset, {
        studentMembershipId: suspensionStudentId,
        score: 50,
        index: 4,
        instructorMemberId: instructorMembershipId,
    });
    addFinalizedAttempt(dataset, {
        studentMembershipId: reviewStudentId,
        score: 85,
        index: 5,
        instructorMemberId: otherInstructorMembershipId,
    });
    addMissingResultAttempt(dataset, {
        studentMembershipId: reviewStudentId,
        index: 6,
        instructorMemberId: otherInstructorMembershipId,
    });

    if (includeRepeatStudent) {
        dataset.memberships.push({
            _id: repeatStudentId,
            institutionId,
            userId: "507f1f77bcf86cd799439207",
            role: "student",
            status: "active",
        });
        dataset.profiles.push({
            _id: "507f1f77bcf86cd799439307",
            institutionId,
            membershipId: repeatStudentId,
            fullName: "G Repeated Attempt",
        });
        dataset.users.push({
            _id: "507f1f77bcf86cd799439207",
            email: "repeat@example.com",
        });
        addFinalizedAttempt(dataset, {
            studentMembershipId: repeatStudentId,
            score: 85,
            index: 7,
            instructorMemberId: instructorMembershipId,
        });
        addFinalizedAttempt(dataset, {
            studentMembershipId: repeatStudentId,
            score: 50,
            index: 8,
            instructorMemberId: instructorMembershipId,
        });
    }

    return dataset;
}

function addFinalizedAttempt(dataset, { studentMembershipId, score, index, instructorMemberId }) {
    const sectionId = `507f1f77bcf86cd7994394${String(index).padStart(2, "0")}`;
    const enrollmentId = `507f1f77bcf86cd7994395${String(index).padStart(2, "0")}`;
    const assessmentId = `507f1f77bcf86cd7994396${String(index).padStart(2, "0")}`;
    const resultId = `507f1f77bcf86cd7994397${String(index).padStart(2, "0")}`;

    dataset.sections.push({
        _id: sectionId,
        institutionId,
        semesterId,
        subjectId,
        code: `SEC-${index}`,
        title: `Section ${index}`,
        status: "closed",
        instructorMemberId,
        createdAt: new Date(`2026-01-${String(index).padStart(2, "0")}T00:00:00.000Z`),
        updatedAt: new Date(`2026-05-${String(index).padStart(2, "0")}T00:00:00.000Z`),
    });
    dataset.enrollments.push({
        _id: enrollmentId,
        institutionId,
        sectionId,
        studentMemberId: studentMembershipId,
        status: "enrolled",
        enrolledAt: new Date(`2026-01-${String(index).padStart(2, "0")}T00:00:00.000Z`),
    });
    dataset.assessments.push({
        _id: assessmentId,
        institutionId,
        sectionId,
        maxScore: 100,
        weight: 100,
        status: "published",
    });
    dataset.assessmentResults.push({
        _id: resultId,
        institutionId,
        assessmentId,
        enrollmentId,
        sectionId,
        studentMemberId: studentMembershipId,
        score,
    });
}

function addMissingResultAttempt(dataset, { studentMembershipId, index, instructorMemberId }) {
    const sectionId = `507f1f77bcf86cd7994394${String(index).padStart(2, "0")}`;
    const enrollmentId = `507f1f77bcf86cd7994395${String(index).padStart(2, "0")}`;
    const assessmentId = `507f1f77bcf86cd7994396${String(index).padStart(2, "0")}`;

    dataset.sections.push({
        _id: sectionId,
        institutionId,
        semesterId,
        subjectId,
        code: `SEC-${index}`,
        title: `Section ${index}`,
        status: "closed",
        instructorMemberId,
        createdAt: new Date(`2026-01-${String(index).padStart(2, "0")}T00:00:00.000Z`),
        updatedAt: new Date(`2026-05-${String(index).padStart(2, "0")}T00:00:00.000Z`),
    });
    dataset.enrollments.push({
        _id: enrollmentId,
        institutionId,
        sectionId,
        studentMemberId: studentMembershipId,
        status: "enrolled",
        enrolledAt: new Date(`2026-01-${String(index).padStart(2, "0")}T00:00:00.000Z`),
    });
    dataset.assessments.push({
        _id: assessmentId,
        institutionId,
        sectionId,
        maxScore: 100,
        weight: 100,
        status: "published",
    });
}

function mockRealStandingFixture(t, dataset, queryLog = {}) {
    queryLog.enrollmentFindQueries = [];

    t.mock.method(Institution, "findOne", (query) =>
        createQuery(
            dataset.institutions.find((institution) => normalizeId(institution._id) === normalizeId(query._id)) ||
                null
        )
    );

    t.mock.method(Membership, "findOne", (query) =>
        createQuery(
            dataset.memberships.find(
                (membership) =>
                    matchesId(membership._id, query._id) &&
                    matchesId(membership.institutionId, query.institutionId)
            ) || null
        )
    );

    t.mock.method(Membership, "find", (query) =>
        createQuery(
            dataset.memberships.filter(
                (membership) =>
                    matchesId(membership.institutionId, query.institutionId) &&
                    (query.role === undefined || membership.role === query.role) &&
                    (query.status === undefined || membership.status === query.status) &&
                    matchesId(membership._id, query._id)
            )
        )
    );

    t.mock.method(MemberProfile, "findOne", (query) =>
        createQuery(
            dataset.profiles.find(
                (profile) =>
                    matchesId(profile.institutionId, query.institutionId) &&
                    matchesId(profile.membershipId, query.membershipId)
            ) || null
        )
    );

    t.mock.method(MemberProfile, "find", (query) =>
        createQuery(
            dataset.profiles.filter(
                (profile) =>
                    matchesId(profile.institutionId, query.institutionId) &&
                    matchesId(profile.membershipId, query.membershipId)
            )
        )
    );

    t.mock.method(User, "findOne", (query) =>
        createQuery(dataset.users.find((user) => matchesId(user._id, query._id)) || null)
    );

    t.mock.method(User, "find", (query) =>
        createQuery(dataset.users.filter((user) => matchesId(user._id, query._id)))
    );

    t.mock.method(Department, "findOne", (query) =>
        createQuery(
            dataset.departments.find(
                (department) =>
                    matchesId(department._id, query._id) &&
                    matchesId(department.institutionId, query.institutionId)
            ) || null
        )
    );

    t.mock.method(Semester, "findOne", (query) =>
        createQuery(
            dataset.semesters.find(
                (semester) =>
                    matchesId(semester._id, query._id) &&
                    matchesId(semester.institutionId, query.institutionId)
            ) || null
        )
    );

    t.mock.method(Semester, "find", (query) =>
        createQuery(
            dataset.semesters.filter(
                (semester) =>
                    matchesId(semester.institutionId, query.institutionId) &&
                    matchesId(semester._id, query._id)
            )
        )
    );

    t.mock.method(Subject, "find", (query) =>
        createQuery(
            dataset.subjects.filter(
                (subject) =>
                    matchesId(subject.institutionId, query.institutionId) &&
                    matchesId(subject._id, query._id) &&
                    matchesId(subject.departmentId, query.departmentId)
            )
        )
    );

    t.mock.method(Section, "find", (query) =>
        createQuery(
            dataset.sections.filter(
                (section) =>
                    matchesId(section.institutionId, query.institutionId) &&
                    matchesId(section._id, query._id) &&
                    matchesId(section.semesterId, query.semesterId) &&
                    matchesId(section.subjectId, query.subjectId) &&
                    matchesId(section.instructorMemberId, query.instructorMemberId)
            )
        )
    );

    t.mock.method(Enrollment, "find", (query) => {
        queryLog.enrollmentFindQueries.push(query);
        return createQuery(
            dataset.enrollments.filter(
                (enrollment) =>
                    matchesId(enrollment.institutionId, query.institutionId) &&
                    matchesId(enrollment.studentMemberId, query.studentMemberId) &&
                    matchesId(enrollment.sectionId, query.sectionId) &&
                    (query.status === undefined || enrollment.status === query.status)
            )
        );
    });

    t.mock.method(Assessment, "find", (query) =>
        createQuery(
            dataset.assessments.filter(
                (assessment) =>
                    matchesId(assessment.institutionId, query.institutionId) &&
                    matchesId(assessment.sectionId, query.sectionId)
            )
        )
    );

    t.mock.method(AssessmentResult, "find", (query) =>
        createQuery(
            dataset.assessmentResults.filter(
                (result) =>
                    matchesId(result.institutionId, query.institutionId) &&
                    matchesId(result.studentMemberId, query.studentMemberId) &&
                    matchesId(result.assessmentId, query.assessmentId) &&
                    matchesId(result.enrollmentId, query.enrollmentId)
            )
        )
    );

    t.mock.method(InstitutionAcademicPolicy, "find", (query) =>
        createQuery(
            dataset.policies.filter(
                (policy) =>
                    matchesId(policy.institutionId, query.institutionId) &&
                    (query.status?.$in === undefined || query.status.$in.includes(policy.status))
            )
        )
    );
}

async function buildProfileFor(studentMembershipId) {
    return buildUniversityAcademicProfile({
        institutionId,
        studentMembershipId,
        actorUserId,
        actorMembership: buildActorMembership(),
    });
}

test("real finalized fixtures drive single-student profile academic standing bands", async (t) => {
    mockRealStandingFixture(t, buildBaseDataset());

    const scenarios = [
        {
            studentMembershipId: goodStudentId,
            expectedGpa: 3.2,
            standing: "good_standing",
            reasonCode: "cumulative_gpa_in_good_standing_range",
            allowedToContinue: true,
            requiresAdvisorReview: false,
            appliedBand: { standing: "good_standing", minCumulativeGpa: 2 },
        },
        {
            studentMembershipId: warningStudentId,
            expectedGpa: 1.8,
            standing: "academic_warning",
            reasonCode: "cumulative_gpa_in_academic_warning_range",
            allowedToContinue: true,
            requiresAdvisorReview: false,
            appliedBand: {
                standing: "academic_warning",
                minCumulativeGpa: 1.7,
                maxCumulativeGpaExclusive: 2,
            },
        },
        {
            studentMembershipId: probationStudentId,
            expectedGpa: 1.1,
            standing: "probation",
            reasonCode: "cumulative_gpa_in_probation_range",
            allowedToContinue: true,
            requiresAdvisorReview: true,
            appliedBand: {
                standing: "probation",
                minCumulativeGpa: 1,
                maxCumulativeGpaExclusive: 1.7,
            },
        },
        {
            studentMembershipId: suspensionStudentId,
            expectedGpa: 0.8,
            standing: "suspension",
            reasonCode: "cumulative_gpa_in_suspension_range",
            allowedToContinue: false,
            requiresAdvisorReview: true,
            appliedBand: { standing: "suspension", maxCumulativeGpaExclusive: 1 },
        },
    ];

    for (const scenario of scenarios) {
        const profile = await buildProfileFor(scenario.studentMembershipId);

        assert.equal(profile.summary.cumulativeGpa, scenario.expectedGpa);
        assert.equal(profile.academicStanding.standing, scenario.standing);
        assert.deepEqual(profile.academicStanding.reasonCodes, [scenario.reasonCode]);
        assert.equal(profile.academicStanding.allowedToContinue, scenario.allowedToContinue);
        assert.equal(profile.academicStanding.requiresAdvisorReview, scenario.requiresAdvisorReview);
        assert.equal(profile.academicStanding.calculationMode, "live");
        assert.equal(profile.academicStanding.source, "academic_profile");
        assert.equal(profile.academicStanding.appliedBand.standing, scenario.appliedBand.standing);
        if (scenario.appliedBand.minCumulativeGpa !== undefined) {
            assert.equal(
                profile.academicStanding.appliedBand.minCumulativeGpa,
                scenario.appliedBand.minCumulativeGpa
            );
        }
        if (scenario.appliedBand.maxCumulativeGpaExclusive !== undefined) {
            assert.equal(
                profile.academicStanding.appliedBand.maxCumulativeGpaExclusive,
                scenario.appliedBand.maxCumulativeGpaExclusive
            );
        }
    }
});

test("custom academicStandingRules threshold changes real profile standing calculation", async (t) => {
    mockRealStandingFixture(
        t,
        buildBaseDataset({
            policyOverrides: {
                academicStandingRules: buildCustomStandingRules(),
            },
        })
    );

    const profile = await buildProfileFor(probationStudentId);

    assert.equal(profile.summary.cumulativeGpa, 1.1);
    assert.equal(profile.academicStanding.standing, "suspension");
    assert.deepEqual(profile.academicStanding.reasonCodes, ["cumulative_gpa_in_suspension_range"]);
    assert.equal(profile.academicStanding.appliedBand.maxCumulativeGpaExclusive, 1.2);
});

test("real finalized fixtures drive admin standing dashboard summary, list, filters, and pagination", async (t) => {
    mockRealStandingFixture(t, buildBaseDataset());

    const summaryResult = await standingReportService.summarizeUniversityAcademicStandings({
        institutionId,
        actorUserId,
        actorMembership: buildActorMembership(),
        query: {},
    });
    assert.deepEqual(summaryResult.standingSummary, {
        totalStudents: 6,
        good_standing: 1,
        academic_warning: 1,
        probation: 1,
        suspension: 1,
        review_required: 1,
        no_standing_yet: 1,
    });

    const paginatedList = await standingReportService.listUniversityAcademicStandingStudents({
        institutionId,
        actorUserId,
        actorMembership: buildActorMembership(),
        query: { page: "2", limit: "2" },
    });
    assert.deepEqual(paginatedList.pagination, {
        page: 2,
        limit: 2,
        total: 6,
        totalPages: 3,
    });
    assert.deepEqual(
        paginatedList.students.map((student) => ({
            studentMembershipId: student.studentMembershipId,
            cumulativeGpa: student.cumulativeGpa,
            standing: student.academicStanding.standing,
            mode: student.academicStanding.calculationMode,
            source: student.academicStanding.source,
        })),
        [
            {
                studentMembershipId: probationStudentId,
                cumulativeGpa: 1.1,
                standing: "probation",
                mode: "live",
                source: "academic_profile",
            },
            {
                studentMembershipId: suspensionStudentId,
                cumulativeGpa: 0.8,
                standing: "suspension",
                mode: "live",
                source: "academic_profile",
            },
        ]
    );

    const suspensionList = await standingReportService.listUniversityAcademicStandingStudents({
        institutionId,
        actorUserId,
        actorMembership: buildActorMembership(),
        query: { standing: "suspension" },
    });
    assert.equal(suspensionList.pagination.total, 1);
    assert.equal(suspensionList.students[0].studentMembershipId, suspensionStudentId);

    const gpaRangeList = await standingReportService.listUniversityAcademicStandingStudents({
        institutionId,
        actorUserId,
        actorMembership: buildActorMembership(),
        query: { minGpa: "1.7", maxGpa: "1.9" },
    });
    assert.deepEqual(
        gpaRangeList.students.map((student) => student.studentMembershipId),
        [warningStudentId]
    );
});

test("custom standing threshold affects real dashboard summary and suspension filter", async (t) => {
    mockRealStandingFixture(
        t,
        buildBaseDataset({
            policyOverrides: {
                academicStandingRules: buildCustomStandingRules(),
            },
        })
    );

    const result = await standingReportService.listUniversityAcademicStandingStudents({
        institutionId,
        actorUserId,
        actorMembership: buildActorMembership(),
        query: { standing: "suspension" },
    });

    assert.equal(result.standingSummary.suspension, 2);
    assert.deepEqual(
        result.students.map((student) => ({
            studentMembershipId: student.studentMembershipId,
            cumulativeGpa: student.cumulativeGpa,
            standing: student.academicStanding.standing,
        })),
        [
            {
                studentMembershipId: probationStudentId,
                cumulativeGpa: 1.1,
                standing: "suspension",
            },
            {
                studentMembershipId: suspensionStudentId,
                cumulativeGpa: 0.8,
                standing: "suspension",
            },
        ]
    );
});

test("real instructor dashboard scope includes only students in assigned enrolled sections", async (t) => {
    mockRealStandingFixture(t, buildBaseDataset());

    const result = await standingReportService.listMyUniversityAcademicStandingStudents({
        institutionId,
        actorUserId,
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

test("real fixtures keep no outcomes and blocking incomplete data standing behavior", async (t) => {
    mockRealStandingFixture(t, buildBaseDataset());

    const noOutcomeProfile = await buildProfileFor(noOutcomeStudentId);
    assert.equal(noOutcomeProfile.summary.cumulativeGpa, null);
    assert.equal(noOutcomeProfile.academicStanding.standing, "no_standing_yet");
    assert.deepEqual(noOutcomeProfile.academicStanding.reasonCodes, ["no_finalized_academic_outcomes"]);

    const reviewProfile = await buildProfileFor(reviewStudentId);
    assert.equal(reviewProfile.summary.cumulativeGpa, 3.2);
    assert.equal(reviewProfile.academicStanding.standing, "review_required");
    assert.equal(reviewProfile.academicStanding.requiresAdvisorReview, true);
    assert.deepEqual(reviewProfile.academicStanding.reasonCodes, [
        "incomplete_academic_profile_requires_review",
    ]);
    assert.ok(
        reviewProfile.excluded.some((exclusion) => exclusion.reasonCode === "missing_assessment_result")
    );
});

test("academic standing uses official GPA after repeatPolicy calculation", async (t) => {
    mockRealStandingFixture(
        t,
        buildBaseDataset({
            includeRepeatStudent: true,
            policyOverrides: {
                academicStandingRules: buildCustomStandingRules(),
            },
        })
    );

    const profile = await buildProfileFor(repeatStudentId);

    assert.equal(profile.repeatPolicy.gpaCalculationMethod, "best_attempt_only");
    assert.equal(profile.summary.cumulativeGpa, 3.2);
    assert.equal(profile.academicStanding.standing, "good_standing");
    assert.deepEqual(
        profile.subjectAttempts.map((attempt) => ({
            percentage: attempt.percentage,
            includedInOfficialGpa: attempt.includedInOfficialGpa,
            excludedReasonCode: attempt.excludedReasonCode,
        })),
        [
            {
                percentage: 85,
                includedInOfficialGpa: true,
                excludedReasonCode: null,
            },
            {
                percentage: 50,
                includedInOfficialGpa: false,
                excludedReasonCode: "repeat_policy_best_attempt_only",
            },
        ]
    );
});
