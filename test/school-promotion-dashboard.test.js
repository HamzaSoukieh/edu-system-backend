const test = require("node:test");
const assert = require("node:assert/strict");

const Assessment = require("../src/models/Assessment");
const AssessmentResult = require("../src/models/AssessmentResult");
const ClassLevel = require("../src/models/ClassLevel");
const ClassStudentAssignment = require("../src/models/ClassStudentAssignment");
const Enrollment = require("../src/models/Enrollment");
const Institution = require("../src/models/Institution");
const MemberProfile = require("../src/models/MemberProfile");
const Membership = require("../src/models/Membership");
const SchoolAcademicPolicy = require("../src/models/SchoolAcademicPolicy");
const SchoolClass = require("../src/models/SchoolClass");
const SchoolFinalOutcome = require("../src/models/SchoolFinalOutcome");
const Section = require("../src/models/Section");
const Subject = require("../src/models/Subject");
const User = require("../src/models/User");
const schoolPromotionDashboardController = require("../src/controllers/schoolPromotionDashboardController");
const institutionRoutes = require("../src/routes/institutionRoutes");
const schoolAcademicPolicyService = require("../src/services/schoolAcademicPolicyService");
const schoolOutcomeService = require("../src/services/schoolOutcomeService");
const schoolPromotionService = require("../src/services/schoolPromotionService");
const promotionDashboardService = require("../src/services/schoolPromotionDashboardService");

const institutionId = "507f1f77bcf86cd799439011";
const universityInstitutionId = "507f1f77bcf86cd799439099";
const otherInstitutionId = "507f1f77bcf86cd799439098";
const adminUserId = "507f1f77bcf86cd799439012";
const adminMembershipId = "507f1f77bcf86cd799439013";
const instructorUserId = "507f1f77bcf86cd799439014";
const instructorMembershipId = "507f1f77bcf86cd799439015";
const otherInstructorMembershipId = "507f1f77bcf86cd799439016";
const academicYearId = "507f1f77bcf86cd799439021";
const semesterOneId = "507f1f77bcf86cd799439031";
const semesterTwoId = "507f1f77bcf86cd799439032";
const classLevelId = "507f1f77bcf86cd799439041";
const otherClassLevelId = "507f1f77bcf86cd799439042";
const schoolClassId = "507f1f77bcf86cd799439051";
const otherSchoolClassId = "507f1f77bcf86cd799439052";
const promotedFinalStudentId = "507f1f77bcf86cd799439101";
const repeatFinalStudentId = "507f1f77bcf86cd799439102";
const conditionalLiveStudentId = "507f1f77bcf86cd799439103";
const manualLiveStudentId = "507f1f77bcf86cd799439104";
const incompleteLiveStudentId = "507f1f77bcf86cd799439105";
const noFinalStudentId = "507f1f77bcf86cd799439106";
const otherTenantStudentId = "507f1f77bcf86cd799439107";
const sectionOneId = "507f1f77bcf86cd799439201";
const sectionTwoId = "507f1f77bcf86cd799439202";
const sectionThreeId = "507f1f77bcf86cd799439203";
const sectionDroppedId = "507f1f77bcf86cd799439204";
const mathSubjectId = "507f1f77bcf86cd799439601";
const scienceSubjectId = "507f1f77bcf86cd799439602";

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

function matchesId(value, condition) {
    if (condition === undefined) {
        return true;
    }

    if (condition?.$in) {
        return idSet(condition.$in).has(normalizeId(value));
    }

    if (condition?.$ne !== undefined) {
        return normalizeId(value) !== normalizeId(condition.$ne);
    }

    return normalizeId(value) === normalizeId(condition);
}

function matchesSchoolClassNotNull(value, condition) {
    if (condition?.$ne === null) {
        return value !== null && value !== undefined;
    }

    return matchesId(value, condition);
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

function buildControllerRequest({
    userId = adminUserId,
    actorMembership = buildActorMembership(),
    params = {},
    query = {},
} = {}) {
    return {
        params: {
            institutionId,
            academicYearId,
            ...params,
        },
        user: {
            id: userId,
        },
        membership: actorMembership,
        query,
    };
}

function createMockResponse() {
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

function buildPolicy(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439301",
        id: "507f1f77bcf86cd799439301",
        institutionId,
        name: "Promotion Dashboard Policy",
        status: "active",
        appliesTo: {
            academicYearId,
            schoolStageId: null,
            classLevelId,
        },
        gradingRules: {
            gradingMode: "percentage",
            scaleMax: 100,
            subjectPassMinPercentage: 50,
            yearPassMinPercentage: 60,
        },
        aggregationRules: {
            yearCalculationMethod: "weighted_semesters",
            semesterWeights: [
                { semesterId: semesterOneId, weight: 50 },
                { semesterId: semesterTwoId, weight: 50 },
            ],
        },
        failureRules: {
            failIfAnyCriticalSubjectFailed: true,
            criticalSubjectRules: [],
            failIfFailedSubjectCountAtLeast: 3,
            countCriticalSubjectsInFailedSubjectTotal: true,
        },
        promotionRules: {
            enabled: true,
            passDecision: "promoted",
            failDecision: "repeat_year",
            allowConditionalPromotion: true,
            allowManualReview: true,
        },
        ...overrides,
    };
}

function buildStudent({ id, userId, name, email, tenantId = institutionId }) {
    return {
        membership: {
            _id: id,
            institutionId: tenantId,
            userId,
            role: "student",
            status: "active",
        },
        profile: {
            _id: userId.replace("2", "3"),
            institutionId: tenantId,
            membershipId: id,
            fullName: name,
        },
        user: {
            _id: userId,
            email,
        },
    };
}

function buildYearOutcome({
    studentMembershipId,
    yearlyAveragePercentage,
    failedSubjectCount = 0,
    criticalFailedSubjects = [],
    complete = true,
    hasMissingResults = false,
    missingResults = [],
    promotionDecision,
}) {
    return {
        studentMembershipId,
        academicYearId,
        classLevelId,
        yearlyAveragePercentage,
        passedYearAverage: yearlyAveragePercentage >= 60,
        passedYearAverageBasedOnAvailableResults: yearlyAveragePercentage >= 60,
        complete,
        hasMissingResults,
        subjects: [],
        failedSubjectCount,
        criticalFailedSubjects,
        missingResults,
        promotionDecision,
    };
}

function buildFinalOutcome({
    studentMembershipId,
    finalDecision,
    calculatedDecision = finalDecision,
    finalReasonCodes = [],
    finalWarnings = [],
    isOverridden = false,
    status = "finalized",
    yearlyAveragePercentage = 82,
    complete = true,
    hasMissingResults = false,
}) {
    return {
        _id: `507f1f77bcf86cd79943${studentMembershipId.slice(-4)}`,
        institutionId,
        academicYearId,
        classLevelId,
        schoolClassId,
        studentMembershipId,
        outcomeSnapshot: {
            yearlyAveragePercentage,
            failedSubjectCount: finalDecision === "repeat_year" ? 3 : 0,
            criticalFailedSubjects: [],
            complete,
            hasMissingResults,
            missingResults: [],
        },
        calculatedDecision,
        calculatedReasonCodes: [],
        calculatedWarnings: [],
        finalDecision,
        finalReasonCodes,
        finalWarnings,
        override: {
            isOverridden,
        },
        status,
        finalizedAt: new Date("2026-05-01T00:00:00.000Z"),
    };
}

function buildDataset(overrides = {}) {
    const students = [
        buildStudent({
            id: promotedFinalStudentId,
            userId: "507f1f77bcf86cd799439401",
            name: "A Promoted Final",
            email: "promoted-final@example.com",
        }),
        buildStudent({
            id: repeatFinalStudentId,
            userId: "507f1f77bcf86cd799439402",
            name: "B Repeat Final",
            email: "repeat-final@example.com",
        }),
        buildStudent({
            id: conditionalLiveStudentId,
            userId: "507f1f77bcf86cd799439403",
            name: "C Conditional Live",
            email: "conditional-live@example.com",
        }),
        buildStudent({
            id: manualLiveStudentId,
            userId: "507f1f77bcf86cd799439404",
            name: "D Manual Review",
            email: "manual-live@example.com",
        }),
        buildStudent({
            id: incompleteLiveStudentId,
            userId: "507f1f77bcf86cd799439405",
            name: "E Incomplete Live",
            email: "incomplete-live@example.com",
        }),
        buildStudent({
            id: noFinalStudentId,
            userId: "507f1f77bcf86cd799439406",
            name: "F No Final",
            email: "no-final@example.com",
        }),
        buildStudent({
            id: otherTenantStudentId,
            userId: "507f1f77bcf86cd799439407",
            name: "Other Tenant Student",
            email: "other-tenant@example.com",
            tenantId: otherInstitutionId,
        }),
    ];

    const dataset = {
        institutions: [
            { _id: institutionId, type: "school" },
            { _id: universityInstitutionId, type: "university" },
            { _id: otherInstitutionId, type: "school" },
        ],
        policies: [buildPolicy()],
        memberships: students.map((student) => student.membership),
        profiles: students.map((student) => student.profile),
        users: students.map((student) => student.user),
        schoolClasses: [
            {
                _id: schoolClassId,
                institutionId,
                classLevelId,
                name: "Grade 7 A",
                code: "G7-A",
                status: "active",
            },
            {
                _id: otherSchoolClassId,
                institutionId,
                classLevelId: otherClassLevelId,
                name: "Grade 8 A",
                code: "G8-A",
                status: "active",
            },
        ],
        classLevels: [
            { _id: classLevelId, institutionId, name: "Grade 7", code: "G7", status: "active" },
            { _id: otherClassLevelId, institutionId, name: "Grade 8", code: "G8", status: "active" },
        ],
        subjects: [
            {
                _id: mathSubjectId,
                institutionId,
                classLevelId,
                departmentId: null,
                name: "Math",
                code: "MATH",
                status: "active",
            },
            {
                _id: scienceSubjectId,
                institutionId,
                classLevelId,
                departmentId: null,
                name: "Science",
                code: "SCI",
                status: "active",
            },
        ],
        assignments: [],
        sections: [
            {
                _id: sectionOneId,
                institutionId,
                semesterId: semesterOneId,
                subjectId: mathSubjectId,
                schoolClassId,
                instructorMemberId: instructorMembershipId,
                code: "MATH-1",
                title: "Math Lecture",
            },
            {
                _id: sectionTwoId,
                institutionId,
                semesterId: semesterTwoId,
                subjectId: scienceSubjectId,
                schoolClassId,
                instructorMemberId: instructorMembershipId,
                code: "SCI-2",
                title: "Science Lab",
            },
            {
                _id: sectionThreeId,
                institutionId,
                semesterId: semesterOneId,
                subjectId: mathSubjectId,
                schoolClassId,
                instructorMemberId: otherInstructorMembershipId,
                code: "MATH-OTHER",
                title: "Other Math",
            },
            {
                _id: sectionDroppedId,
                institutionId,
                semesterId: semesterOneId,
                subjectId: mathSubjectId,
                schoolClassId,
                instructorMemberId: instructorMembershipId,
                code: "MATH-DROP",
                title: "Dropped Math",
            },
        ],
        enrollments: [
            {
                _id: "507f1f77bcf86cd799439501",
                institutionId,
                sectionId: sectionOneId,
                studentMemberId: promotedFinalStudentId,
                status: "enrolled",
            },
            {
                _id: "507f1f77bcf86cd799439502",
                institutionId,
                sectionId: sectionTwoId,
                studentMemberId: promotedFinalStudentId,
                status: "enrolled",
            },
            {
                _id: "507f1f77bcf86cd799439503",
                institutionId,
                sectionId: sectionOneId,
                studentMemberId: conditionalLiveStudentId,
                status: "enrolled",
            },
            {
                _id: "507f1f77bcf86cd799439504",
                institutionId,
                sectionId: sectionThreeId,
                studentMemberId: manualLiveStudentId,
                status: "enrolled",
            },
            {
                _id: "507f1f77bcf86cd799439505",
                institutionId,
                sectionId: sectionOneId,
                studentMemberId: incompleteLiveStudentId,
                status: "enrolled",
            },
            {
                _id: "507f1f77bcf86cd799439506",
                institutionId,
                sectionId: sectionDroppedId,
                studentMemberId: repeatFinalStudentId,
                status: "dropped",
            },
        ],
        finalOutcomes: [
            buildFinalOutcome({
                studentMembershipId: promotedFinalStudentId,
                finalDecision: "promoted",
                calculatedDecision: "manual_review",
                yearlyAveragePercentage: 78,
            }),
            buildFinalOutcome({
                studentMembershipId: repeatFinalStudentId,
                finalDecision: "repeat_year",
                calculatedDecision: "promoted",
                finalReasonCodes: ["ADMIN_FINAL_DECISION"],
                isOverridden: true,
                yearlyAveragePercentage: 88,
            }),
        ],
        assessments: [
            {
                _id: "507f1f77bcf86cd799439701",
                institutionId,
                sectionId: sectionOneId,
                maxScore: 100,
                weight: 100,
                status: "published",
            },
            {
                _id: "507f1f77bcf86cd799439702",
                institutionId,
                sectionId: sectionTwoId,
                maxScore: 100,
                weight: 100,
                status: "published",
            },
            {
                _id: "507f1f77bcf86cd799439703",
                institutionId,
                sectionId: sectionThreeId,
                maxScore: 100,
                weight: 100,
                status: "published",
            },
        ],
        assessmentResults: [
            {
                _id: "507f1f77bcf86cd799439801",
                institutionId,
                assessmentId: "507f1f77bcf86cd799439701",
                enrollmentId: "507f1f77bcf86cd799439501",
                sectionId: sectionOneId,
                studentMemberId: promotedFinalStudentId,
                score: 92,
            },
            {
                _id: "507f1f77bcf86cd799439802",
                institutionId,
                assessmentId: "507f1f77bcf86cd799439702",
                enrollmentId: "507f1f77bcf86cd799439502",
                sectionId: sectionTwoId,
                studentMemberId: promotedFinalStudentId,
                score: 45,
            },
            {
                _id: "507f1f77bcf86cd799439803",
                institutionId,
                assessmentId: "507f1f77bcf86cd799439701",
                enrollmentId: "507f1f77bcf86cd799439503",
                sectionId: sectionOneId,
                studentMemberId: conditionalLiveStudentId,
                score: "75",
            },
            {
                _id: "507f1f77bcf86cd799439804",
                institutionId,
                assessmentId: "507f1f77bcf86cd799439703",
                enrollmentId: "507f1f77bcf86cd799439504",
                sectionId: sectionThreeId,
                studentMemberId: manualLiveStudentId,
                score: 88,
            },
        ],
        yearOutcomesByStudentId: {
            [conditionalLiveStudentId]: buildYearOutcome({
                studentMembershipId: conditionalLiveStudentId,
                yearlyAveragePercentage: 72,
                failedSubjectCount: 1,
                promotionDecision: {
                    decision: "conditional_promotion",
                    allowedToPromote: true,
                    reasonCodes: ["FAILED_SUBJECT_COUNT_BELOW_LIMIT"],
                    warnings: [],
                },
            }),
            [manualLiveStudentId]: buildYearOutcome({
                studentMembershipId: manualLiveStudentId,
                yearlyAveragePercentage: 55,
                failedSubjectCount: 2,
                criticalFailedSubjects: [{ subjectId: "507f1f77bcf86cd799439601" }],
                promotionDecision: {
                    decision: "manual_review",
                    allowedToPromote: false,
                    reasonCodes: ["CRITICAL_SUBJECT_FAILED"],
                    warnings: [{ code: "CRITICAL_SUBJECT_FAILED", message: "Critical subject failed." }],
                },
            }),
            [incompleteLiveStudentId]: buildYearOutcome({
                studentMembershipId: incompleteLiveStudentId,
                yearlyAveragePercentage: 69,
                complete: false,
                hasMissingResults: true,
                missingResults: [{ code: "missing_assessment_result", message: "Missing score." }],
                promotionDecision: {
                    decision: "manual_review",
                    allowedToPromote: true,
                    reasonCodes: ["MISSING_REQUIRED_RESULTS"],
                    warnings: [{ reasonCode: "MISSING_REQUIRED_RESULTS", subjectId: mathSubjectId }],
                },
            }),
        },
        ...overrides,
    };

    for (const studentId of [
        promotedFinalStudentId,
        repeatFinalStudentId,
        conditionalLiveStudentId,
        manualLiveStudentId,
        incompleteLiveStudentId,
    ]) {
        dataset.assignments.push(
            {
                _id: `507f1f77bcf86cd799438${studentId.slice(-3)}`,
                institutionId,
                semesterId: semesterOneId,
                classId: schoolClassId,
                studentMemberId: studentId,
                status: "assigned",
            },
            {
                _id: `507f1f77bcf86cd799437${studentId.slice(-3)}`,
                institutionId,
                semesterId: semesterTwoId,
                classId: schoolClassId,
                studentMemberId: studentId,
                status: "assigned",
            }
        );
    }

    return dataset;
}

function mockDashboardDependencies(t, dataset, queryLog = {}) {
    queryLog.enrollmentFindQueries = [];
    queryLog.liveOutcomeStudentIds = [];
    queryLog.promotionStudentIds = [];

    t.mock.method(Institution, "findOne", (query) =>
        createQuery(dataset.institutions.find((institution) => matchesId(institution._id, query._id)) || null)
    );

    t.mock.method(SchoolAcademicPolicy, "find", (query) =>
        createQuery(
            dataset.policies.filter(
                (policy) =>
                    matchesId(policy.institutionId, query.institutionId) &&
                    policy.status === query.status &&
                    matchesId(policy.appliesTo?.academicYearId, query["appliesTo.academicYearId"])
            )
        )
    );

    t.mock.method(Membership, "find", (query) => {
        queryLog.membershipFindQuery = query;
        return createQuery(
            dataset.memberships.filter(
                (membership) =>
                    matchesId(membership.institutionId, query.institutionId) &&
                    membership.role === query.role &&
                    membership.status === query.status &&
                    matchesId(membership._id, query._id)
            )
        );
    });

    t.mock.method(MemberProfile, "find", (query) =>
        createQuery(
            dataset.profiles.filter(
                (profile) =>
                    matchesId(profile.institutionId, query.institutionId) &&
                    matchesId(profile.membershipId, query.membershipId)
            )
        )
    );

    t.mock.method(User, "find", (query) =>
        createQuery(dataset.users.filter((user) => matchesId(user._id, query._id)))
    );

    t.mock.method(ClassStudentAssignment, "find", (query) =>
        createQuery(
            dataset.assignments.filter(
                (assignment) =>
                    matchesId(assignment.institutionId, query.institutionId) &&
                    matchesId(assignment.studentMemberId, query.studentMemberId) &&
                    matchesId(assignment.semesterId, query.semesterId) &&
                    assignment.status === query.status
            )
        )
    );

    t.mock.method(SchoolClass, "find", (query) =>
        createQuery(
            dataset.schoolClasses.filter(
                (schoolClass) =>
                    matchesId(schoolClass.institutionId, query.institutionId) &&
                    matchesId(schoolClass._id, query._id)
            )
        )
    );

    t.mock.method(ClassLevel, "find", (query) =>
        createQuery(
            dataset.classLevels.filter(
                (classLevel) =>
                    matchesId(classLevel.institutionId, query.institutionId) &&
                    matchesId(classLevel._id, query._id)
            )
        )
    );

    t.mock.method(SchoolFinalOutcome, "find", (query) =>
        createQuery(
            dataset.finalOutcomes.filter(
                (outcome) =>
                    matchesId(outcome.institutionId, query.institutionId) &&
                    matchesId(outcome.academicYearId, query.academicYearId) &&
                    matchesId(outcome.studentMembershipId, query.studentMembershipId) &&
                    matchesId(outcome.status, query.status)
            )
        )
    );

    t.mock.method(Subject, "find", (query) =>
        createQuery(
            dataset.subjects.filter(
                (subject) =>
                    matchesId(subject.institutionId, query.institutionId) &&
                    matchesId(subject._id, query._id)
            )
        )
    );

    t.mock.method(Section, "find", (query) =>
        createQuery(
            dataset.sections.filter(
                (section) =>
                    matchesId(section.institutionId, query.institutionId) &&
                    matchesId(section.instructorMemberId, query.instructorMemberId) &&
                    matchesId(section.semesterId, query.semesterId) &&
                    matchesId(section._id, query._id) &&
                    matchesId(section.subjectId, query.subjectId) &&
                    matchesSchoolClassNotNull(section.schoolClassId, query.schoolClassId)
            )
        )
    );

    t.mock.method(Enrollment, "find", (query) => {
        queryLog.enrollmentFindQueries.push(query);
        return createQuery(
            dataset.enrollments.filter(
                (enrollment) =>
                    matchesId(enrollment.institutionId, query.institutionId) &&
                    matchesId(enrollment.sectionId, query.sectionId) &&
                    matchesId(enrollment.status, query.status)
            )
        );
    });

    t.mock.method(Assessment, "find", (query) =>
        createQuery(
            dataset.assessments.filter(
                (assessment) =>
                    matchesId(assessment.institutionId, query.institutionId) &&
                    matchesId(assessment.sectionId, query.sectionId) &&
                    matchesId(assessment.status, query.status)
            )
        )
    );

    t.mock.method(AssessmentResult, "find", (query) =>
        createQuery(
            dataset.assessmentResults.filter(
                (result) =>
                    matchesId(result.institutionId, query.institutionId) &&
                    matchesId(result.assessmentId, query.assessmentId) &&
                    matchesId(result.enrollmentId, query.enrollmentId) &&
                    matchesId(result.sectionId, query.sectionId) &&
                    matchesId(result.studentMemberId, query.studentMemberId)
            )
        )
    );

    t.mock.method(schoolAcademicPolicyService, "resolveSchoolAcademicPolicyForClassLevel", async () => ({
        policy:
            Object.prototype.hasOwnProperty.call(dataset, "resolvedPolicy")
                ? dataset.resolvedPolicy
                : dataset.policies[0] || null,
        resolutionLevel: "class_level",
    }));

    t.mock.method(schoolOutcomeService, "calculateSchoolStudentYearOutcome", async ({ studentMembershipId }) => {
        queryLog.liveOutcomeStudentIds.push(normalizeId(studentMembershipId));
        const outcome = dataset.yearOutcomesByStudentId[normalizeId(studentMembershipId)];
        if (!outcome) {
            const error = new Error("Live outcome fixture missing");
            error.statusCode = 404;
            throw error;
        }

        return outcome;
    });

    t.mock.method(schoolPromotionService, "resolveSchoolPromotionDecision", ({ studentYearOutcome }) => {
        queryLog.promotionStudentIds.push(normalizeId(studentYearOutcome.studentMembershipId));
        return studentYearOutcome.promotionDecision;
    });
}

test("school promotion dashboard summary counts final and live decisions", async (t) => {
    mockDashboardDependencies(t, buildDataset());

    const result = await promotionDashboardService.summarizeSchoolPromotionDashboard({
        institutionId,
        academicYearId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: {},
    });

    assert.deepEqual(result.promotionSummary, {
        totalStudents: 6,
        promoted: 1,
        repeat_year: 1,
        conditional_promotion: 1,
        manual_review: 1,
        incomplete: 1,
        no_final_outcome_yet: 1,
        finalized: 2,
        live: 4,
    });
});

test("school promotion dashboard list returns compact rows and pagination", async (t) => {
    mockDashboardDependencies(t, buildDataset());

    const result = await promotionDashboardService.listSchoolPromotionDashboardStudents({
        institutionId,
        academicYearId,
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
            decision: student.decision,
            decisionSource: student.decisionSource,
            finalized: student.finalized,
            calculatedDecision: student.calculatedDecision,
            finalDecision: student.finalDecision,
        })),
        [
            {
                studentMembershipId: conditionalLiveStudentId,
                decision: "conditional_promotion",
                decisionSource: "live_promotion_calculation",
                finalized: false,
                calculatedDecision: "conditional_promotion",
                finalDecision: null,
            },
            {
                studentMembershipId: manualLiveStudentId,
                decision: "manual_review",
                decisionSource: "live_promotion_calculation",
                finalized: false,
                calculatedDecision: "manual_review",
                finalDecision: null,
            },
        ]
    );
    assert.equal(result.students[0].schoolClassId, schoolClassId);
    assert.equal(result.students[0].classLevelId, classLevelId);
    assert.ok(Array.isArray(result.students[0].warnings));
});

test("final SchoolFinalOutcome wins over live promotion calculation", async (t) => {
    const queryLog = {};
    mockDashboardDependencies(t, buildDataset(), queryLog);

    const result = await promotionDashboardService.listSchoolPromotionDashboardStudents({
        institutionId,
        academicYearId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: { decision: "repeat_year" },
    });

    assert.equal(result.pagination.total, 1);
    assert.deepEqual(result.students[0], {
        studentMembershipId: repeatFinalStudentId,
        name: "B Repeat Final",
        email: "repeat-final@example.com",
        academicYearId,
        schoolClassId,
        classLevelId,
        yearlyAveragePercentage: 88,
        failedSubjectCount: 3,
        criticalFailedSubjects: [],
        complete: true,
        hasMissingResults: false,
        finalized: true,
        decisionSource: "final_outcome",
        decision: "repeat_year",
        calculatedDecision: "promoted",
        finalDecision: "repeat_year",
        finalOutcomeStatus: "finalized",
        isOverridden: true,
        allowedToPromote: false,
        reasonCodes: ["ADMIN_FINAL_DECISION"],
        warnings: [],
    });
    assert.equal(queryLog.liveOutcomeStudentIds.includes(promotedFinalStudentId), false);
    assert.equal(queryLog.liveOutcomeStudentIds.includes(repeatFinalStudentId), false);
});

test("school promotion dashboard supports decision, class, completion, missing-result, finalized, and search filters", async (t) => {
    mockDashboardDependencies(t, buildDataset());

    const decisionResult = await promotionDashboardService.listSchoolPromotionDashboardStudents({
        institutionId,
        academicYearId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: { decision: "incomplete" },
    });
    assert.deepEqual(
        decisionResult.students.map((student) => student.studentMembershipId),
        [incompleteLiveStudentId]
    );
    assert.equal(decisionResult.students[0].decision, "incomplete");
    assert.equal(decisionResult.students[0].allowedToPromote, false);
    assert.deepEqual(decisionResult.students[0].warnings, [
        {
            code: "missing_assessment_result",
            message: "Missing score.",
        },
        {
            code: "MISSING_REQUIRED_RESULTS",
            message: "Live promotion calculation includes a warning.",
            subjectId: mathSubjectId,
        },
    ]);

    const classResult = await promotionDashboardService.listSchoolPromotionDashboardStudents({
        institutionId,
        academicYearId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: { schoolClassId, classLevelId },
    });
    assert.equal(classResult.pagination.total, 5);

    const incompleteResult = await promotionDashboardService.listSchoolPromotionDashboardStudents({
        institutionId,
        academicYearId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: { complete: "false" },
    });
    assert.deepEqual(
        incompleteResult.students.map((student) => student.studentMembershipId),
        [incompleteLiveStudentId, noFinalStudentId]
    );

    const missingResult = await promotionDashboardService.listSchoolPromotionDashboardStudents({
        institutionId,
        academicYearId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: { hasMissingResults: "true" },
    });
    assert.deepEqual(
        missingResult.students.map((student) => student.studentMembershipId),
        [incompleteLiveStudentId]
    );

    const finalizedResult = await promotionDashboardService.listSchoolPromotionDashboardStudents({
        institutionId,
        academicYearId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: { finalized: "true" },
    });
    assert.deepEqual(
        finalizedResult.students.map((student) => student.studentMembershipId),
        [promotedFinalStudentId, repeatFinalStudentId]
    );

    const searchResult = await promotionDashboardService.listSchoolPromotionDashboardStudents({
        institutionId,
        academicYearId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: { search: "manual" },
    });
    assert.deepEqual(
        searchResult.students.map((student) => student.studentMembershipId),
        [manualLiveStudentId]
    );
});

test("school promotion dashboard validates academicYearId and query filters", async () => {
    await assert.rejects(
        () =>
            promotionDashboardService.listSchoolPromotionDashboardStudents({
                institutionId,
                actorUserId: adminUserId,
                actorMembership: buildActorMembership(),
                query: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "academicYearId is invalid");
            return true;
        }
    );

    assert.throws(
        () => promotionDashboardService.validatePromotionDashboardQuery({ decision: "good_standing" }),
        /decision must be one of/
    );
    assert.throws(
        () => promotionDashboardService.validatePromotionDashboardQuery({ finalized: "sometimes" }),
        /finalized must be true or false/
    );
    assert.throws(
        () => promotionDashboardService.validateInstructorSectionDashboardQuery({ decision: "promoted" }),
        /decision is not supported/
    );
    assert.throws(
        () => promotionDashboardService.validateInstructorSectionDashboardQuery({ finalized: "true" }),
        /finalized is not supported/
    );
});

test("school promotion dashboard preserves tenant isolation and rejects non-school institutions", async (t) => {
    const queryLog = {};
    mockDashboardDependencies(t, buildDataset(), queryLog);

    const result = await promotionDashboardService.listSchoolPromotionDashboardStudents({
        institutionId,
        academicYearId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: {},
    });

    assert.equal(result.pagination.total, 6);
    assert.equal(queryLog.liveOutcomeStudentIds.includes(otherTenantStudentId), false);
    assert.equal(queryLog.membershipFindQuery.institutionId, institutionId);

    await assert.rejects(
        () =>
            promotionDashboardService.summarizeSchoolPromotionDashboard({
                institutionId: universityInstitutionId,
                academicYearId,
                actorUserId: adminUserId,
                actorMembership: buildActorMembership({ institutionId: universityInstitutionId }),
                query: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "School promotion dashboard is only supported for school institutions");
            return true;
        }
    );
});

test("school promotion dashboard blocks unauthorized institution-wide access", async (t) => {
    mockDashboardDependencies(t, buildDataset());

    await assert.rejects(
        () =>
            promotionDashboardService.listSchoolPromotionDashboardStudents({
                institutionId,
                academicYearId,
                actorUserId: adminUserId,
                actorMembership: buildActorMembership({
                    _id: promotedFinalStudentId,
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

    await assert.rejects(
        () =>
            promotionDashboardService.listSchoolPromotionDashboardStudents({
                institutionId,
                academicYearId,
                actorUserId: null,
                actorMembership: buildActorMembership(),
                query: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 401);
            assert.equal(error.message, "Unauthorized");
            return true;
        }
    );

    await assert.rejects(
        () =>
            promotionDashboardService.listSchoolPromotionDashboardStudents({
                institutionId,
                academicYearId,
                actorUserId: adminUserId,
                actorMembership: buildActorMembership({
                    status: "inactive",
                }),
                query: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Membership is not active");
            return true;
        }
    );
});

test("instructor school promotion dashboard is scoped to assigned enrolled sections and section outcomes", async (t) => {
    const queryLog = {};
    mockDashboardDependencies(t, buildDataset(), queryLog);

    const result = await promotionDashboardService.listMySchoolPromotionDashboardStudents({
        institutionId,
        academicYearId,
        actorUserId: instructorUserId,
        actorMembership: buildActorMembership({
            _id: instructorMembershipId,
            role: "instructor",
        }),
        query: {},
    });

    assert.deepEqual(result.sectionOutcomeSummary, {
        totalRows: 4,
        totalStudents: 3,
        sections: 2,
        complete: 3,
        incomplete: 1,
        passed: 2,
        failed: 1,
        hasMissingResults: 1,
    });
    assert.equal(result.students, undefined);
    assert.deepEqual(
        result.sectionOutcomes.map((row) => ({
            studentMembershipId: row.studentMembershipId,
            sectionId: row.sectionId,
            sectionName: row.sectionName,
            subjectName: row.subjectName,
            percentage: row.percentage,
            passed: row.passed,
            complete: row.complete,
            hasMissingResults: row.hasMissingResults,
        })),
        [
            {
                studentMembershipId: promotedFinalStudentId,
                sectionId: sectionOneId,
                sectionName: "Math Lecture",
                subjectName: "Math",
                percentage: 92,
                passed: true,
                complete: true,
                hasMissingResults: false,
            },
            {
                studentMembershipId: promotedFinalStudentId,
                sectionId: sectionTwoId,
                sectionName: "Science Lab",
                subjectName: "Science",
                percentage: 45,
                passed: false,
                complete: true,
                hasMissingResults: false,
            },
            {
                studentMembershipId: conditionalLiveStudentId,
                sectionId: sectionOneId,
                sectionName: "Math Lecture",
                subjectName: "Math",
                percentage: 75,
                passed: true,
                complete: true,
                hasMissingResults: false,
            },
            {
                studentMembershipId: incompleteLiveStudentId,
                sectionId: sectionOneId,
                sectionName: "Math Lecture",
                subjectName: "Math",
                percentage: null,
                passed: false,
                complete: false,
                hasMissingResults: true,
            },
        ]
    );
    for (const forbiddenField of [
        "decision",
        "finalDecision",
        "calculatedDecision",
        "allowedToPromote",
        "yearlyAveragePercentage",
        "criticalFailedSubjects",
    ]) {
        assert.equal(forbiddenField in result.sectionOutcomes[0], false);
    }
    assert.equal(
        result.sectionOutcomes.some((row) => row.studentMembershipId === manualLiveStudentId),
        false
    );
    assert.deepEqual(
        result.sectionOutcomes.find((row) => row.studentMembershipId === incompleteLiveStudentId).missingResults,
        [
            {
                code: "missing_assessment_result",
                message: "A published assessment is missing a recorded score for this student.",
                academicYearId,
                semesterId: semesterOneId,
                subjectId: mathSubjectId,
                sectionId: sectionOneId,
                assessmentId: "507f1f77bcf86cd799439701",
                enrollmentId: "507f1f77bcf86cd799439505",
                studentMembershipId: incompleteLiveStudentId,
            },
        ]
    );
    assert.equal(queryLog.enrollmentFindQueries.every((query) => query.status === "enrolled"), true);
    assert.equal(queryLog.liveOutcomeStudentIds.length, 0);
});

test("instructor school promotion dashboard supports section pagination and strict section filters", async (t) => {
    mockDashboardDependencies(t, buildDataset());

    const result = await promotionDashboardService.listMySchoolPromotionDashboardStudents({
        institutionId,
        academicYearId,
        actorUserId: instructorUserId,
        actorMembership: buildActorMembership({
            _id: instructorMembershipId,
            role: "instructor",
        }),
        query: { page: "2", limit: "2", complete: "true" },
    });

    assert.deepEqual(result.pagination, {
        page: 2,
        limit: 2,
        total: 3,
        totalPages: 2,
    });
    assert.deepEqual(
        result.sectionOutcomes.map((row) => ({
            studentMembershipId: row.studentMembershipId,
            sectionId: row.sectionId,
            complete: row.complete,
        })),
        [
            {
                studentMembershipId: conditionalLiveStudentId,
                sectionId: sectionOneId,
                complete: true,
            },
        ]
    );

    const missingResult = await promotionDashboardService.listMySchoolPromotionDashboardStudents({
        institutionId,
        academicYearId,
        actorUserId: instructorUserId,
        actorMembership: buildActorMembership({
            _id: instructorMembershipId,
            role: "instructor",
        }),
        query: { hasMissingResults: "true" },
    });
    assert.deepEqual(
        missingResult.sectionOutcomes.map((row) => ({
            studentMembershipId: row.studentMembershipId,
            sectionId: row.sectionId,
            hasMissingResults: row.hasMissingResults,
        })),
        [
            {
                studentMembershipId: incompleteLiveStudentId,
                sectionId: sectionOneId,
                hasMissingResults: true,
            },
        ]
    );

    await assert.rejects(
        () =>
            promotionDashboardService.listMySchoolPromotionDashboardStudents({
                institutionId,
                academicYearId,
                actorUserId: instructorUserId,
                actorMembership: buildActorMembership({
                    _id: instructorMembershipId,
                    role: "instructor",
                }),
                query: { decision: "promoted" },
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "decision is not supported for instructor section dashboard");
            return true;
        }
    );
    await assert.rejects(
        () =>
            promotionDashboardService.listMySchoolPromotionDashboardStudents({
                institutionId,
                academicYearId,
                actorUserId: instructorUserId,
                actorMembership: buildActorMembership({
                    _id: instructorMembershipId,
                    role: "instructor",
                }),
                query: { finalized: "false" },
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "finalized is not supported for instructor section dashboard");
            return true;
        }
    );
});

test("instructor section dashboard normalizes no-policy warnings", async (t) => {
    const noPolicyDataset = buildDataset({ resolvedPolicy: null });
    mockDashboardDependencies(t, noPolicyDataset);

    const noPolicyResult = await promotionDashboardService.listMySchoolPromotionDashboardStudents({
        institutionId,
        academicYearId,
        actorUserId: instructorUserId,
        actorMembership: buildActorMembership({
            _id: instructorMembershipId,
            role: "instructor",
        }),
        query: { search: "conditional" },
    });
    assert.deepEqual(noPolicyResult.sectionOutcomes[0].warnings, [
        {
            code: "ACTIVE_SCHOOL_POLICY_NOT_FOUND",
            message: "Active school academic policy was not found for this class level and academic year.",
            academicYearId,
            semesterId: semesterOneId,
            subjectId: mathSubjectId,
            sectionId: sectionOneId,
            enrollmentId: "507f1f77bcf86cd799439503",
            studentMembershipId: conditionalLiveStudentId,
            schoolClassId,
            classLevelId,
        },
    ]);
});

test("instructor section dashboard normalizes missing and invalid assessment configuration warnings", async (t) => {
    const dataset = buildDataset();
    dataset.assessments = dataset.assessments
        .filter((assessment) => assessment.sectionId !== sectionTwoId)
        .map((assessment) =>
            assessment.sectionId === sectionOneId
                ? { ...assessment, maxScore: assessment._id === "507f1f77bcf86cd799439701" ? 100 : assessment.maxScore }
                : assessment
        );
    dataset.assessments.push({
        _id: "507f1f77bcf86cd799439704",
        institutionId,
        sectionId: sectionOneId,
        maxScore: 0,
        weight: 10,
        status: "published",
    });
    mockDashboardDependencies(t, dataset);

    const result = await promotionDashboardService.listMySchoolPromotionDashboardStudents({
        institutionId,
        academicYearId,
        actorUserId: instructorUserId,
        actorMembership: buildActorMembership({
            _id: instructorMembershipId,
            role: "instructor",
        }),
        query: { search: "promoted" },
    });
    const sectionOneRow = result.sectionOutcomes.find((row) => row.sectionId === sectionOneId);
    const sectionTwoRow = result.sectionOutcomes.find((row) => row.sectionId === sectionTwoId);

    assert.ok(
        sectionOneRow.warnings.some(
            (warning) =>
                warning.code === "invalid_assessment_configuration" &&
                warning.academicYearId === academicYearId &&
                warning.sectionId === sectionOneId &&
                warning.assessmentId === "507f1f77bcf86cd799439704" &&
                warning.enrollmentId === "507f1f77bcf86cd799439501" &&
                warning.studentMembershipId === promotedFinalStudentId
        )
    );
    assert.deepEqual(sectionTwoRow.warnings, [
        {
            code: "no_published_assessments",
            message: "No published assessments were found for this section.",
            academicYearId,
            semesterId: semesterTwoId,
            subjectId: scienceSubjectId,
            sectionId: sectionTwoId,
            enrollmentId: "507f1f77bcf86cd799439502",
            studentMembershipId: promotedFinalStudentId,
        },
    ]);
});

test("instructor school promotion dashboard rejects non-instructors and institution-wide instructor access", async (t) => {
    mockDashboardDependencies(t, buildDataset());

    await assert.rejects(
        () =>
            promotionDashboardService.summarizeMySchoolPromotionDashboard({
                institutionId,
                academicYearId,
                actorUserId: adminUserId,
                actorMembership: buildActorMembership(),
                query: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Only instructors can access their school promotion dashboard");
            return true;
        }
    );

    await assert.rejects(
        () =>
            promotionDashboardService.listSchoolPromotionDashboardStudents({
                institutionId,
                academicYearId,
                actorUserId: instructorUserId,
                actorMembership: buildActorMembership({
                    _id: instructorMembershipId,
                    role: "instructor",
                }),
                query: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Permission denied");
            return true;
        }
    );

    await assert.rejects(
        () =>
            promotionDashboardService.listMySchoolPromotionDashboardStudents({
                institutionId,
                academicYearId,
                actorUserId: instructorUserId,
                actorMembership: buildActorMembership({
                    _id: instructorMembershipId,
                    role: "instructor",
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

test("admin dashboard resolves transfer assignments across different semesters", async (t) => {
    const dataset = buildDataset();
    dataset.assignments = dataset.assignments.map((assignment) =>
        assignment.studentMemberId === conditionalLiveStudentId && assignment.semesterId === semesterTwoId
            ? { ...assignment, classId: otherSchoolClassId }
            : assignment
    );
    mockDashboardDependencies(t, dataset);

    const result = await promotionDashboardService.listSchoolPromotionDashboardStudents({
        institutionId,
        academicYearId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: { search: "conditional" },
    });

    assert.equal(result.pagination.total, 1);
    assert.equal(result.students[0].studentMembershipId, conditionalLiveStudentId);
    assert.equal(result.students[0].decision, "conditional_promotion");
    assert.equal(result.students[0].schoolClassId, otherSchoolClassId);
    assert.equal(result.students[0].classLevelId, otherClassLevelId);
});

test("admin dashboard returns normalized warning for ambiguous same-semester assignments", async (t) => {
    const dataset = buildDataset();
    dataset.assignments.push({
        _id: "507f1f77bcf86cd799438999",
        institutionId,
        semesterId: semesterOneId,
        classId: otherSchoolClassId,
        studentMemberId: conditionalLiveStudentId,
        status: "assigned",
    });
    mockDashboardDependencies(t, dataset);

    const result = await promotionDashboardService.listSchoolPromotionDashboardStudents({
        institutionId,
        academicYearId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: { search: "conditional" },
    });

    assert.equal(result.pagination.total, 1);
    assert.equal(result.students[0].decision, "no_final_outcome_yet");
    assert.deepEqual(result.students[0].warnings, [
        {
            code: "AMBIGUOUS_CLASS_ASSIGNMENTS_FOR_SEMESTER",
            message: "Student has multiple active class assignments in the same semester.",
            semesterId: semesterOneId,
            studentMembershipId: conditionalLiveStudentId,
        },
    ]);
});

test("school promotion dashboard controllers return the four dashboard route envelopes", async (t) => {
    const serviceCalls = [];

    t.mock.method(promotionDashboardService, "summarizeSchoolPromotionDashboard", async (args) => {
        serviceCalls.push({ method: "summarizeSchoolPromotionDashboard", args });
        return {
            promotionSummary: {
                totalStudents: 2,
                promoted: 1,
                repeat_year: 1,
                conditional_promotion: 0,
                manual_review: 0,
                incomplete: 0,
                no_final_outcome_yet: 0,
                finalized: 1,
                live: 1,
            },
        };
    });
    t.mock.method(promotionDashboardService, "listSchoolPromotionDashboardStudents", async (args) => {
        serviceCalls.push({ method: "listSchoolPromotionDashboardStudents", args });
        return {
            promotionSummary: {
                totalStudents: 2,
                promoted: 1,
                repeat_year: 0,
                conditional_promotion: 0,
                manual_review: 0,
                incomplete: 1,
                no_final_outcome_yet: 0,
                finalized: 1,
                live: 1,
            },
            students: [
                {
                    studentMembershipId: promotedFinalStudentId,
                    decisionSource: "final_outcome",
                    decision: "promoted",
                    finalDecision: "promoted",
                    calculatedDecision: "manual_review",
                    finalized: true,
                    allowedToPromote: true,
                    warnings: [],
                },
                {
                    studentMembershipId: incompleteLiveStudentId,
                    decisionSource: "live_promotion_calculation",
                    decision: "incomplete",
                    finalDecision: null,
                    calculatedDecision: "manual_review",
                    finalized: false,
                    allowedToPromote: false,
                    warnings: [
                        {
                            code: "MISSING_REQUIRED_RESULTS",
                            message: "Live promotion calculation includes a warning.",
                        },
                    ],
                },
            ],
            pagination: {
                page: 1,
                limit: 25,
                total: 2,
                totalPages: 1,
            },
        };
    });
    t.mock.method(promotionDashboardService, "summarizeMySchoolPromotionDashboard", async (args) => {
        serviceCalls.push({ method: "summarizeMySchoolPromotionDashboard", args });
        return {
            sectionOutcomeSummary: {
                totalRows: 1,
                totalStudents: 1,
                sections: 1,
                complete: 1,
                incomplete: 0,
                passed: 1,
                failed: 0,
                hasMissingResults: 0,
            },
        };
    });
    t.mock.method(promotionDashboardService, "listMySchoolPromotionDashboardStudents", async (args) => {
        serviceCalls.push({ method: "listMySchoolPromotionDashboardStudents", args });
        return {
            sectionOutcomeSummary: {
                totalRows: 1,
                totalStudents: 1,
                sections: 1,
                complete: 1,
                incomplete: 0,
                passed: 1,
                failed: 0,
                hasMissingResults: 0,
            },
            sectionOutcomes: [
                {
                    studentMembershipId: promotedFinalStudentId,
                    academicYearId,
                    semesterId: semesterOneId,
                    sectionId: sectionOneId,
                    sectionName: "Math Lecture",
                    subjectId: mathSubjectId,
                    subjectName: "Math",
                    schoolClassId,
                    classLevelId,
                    percentage: 92,
                    passed: true,
                    complete: true,
                    hasMissingResults: false,
                    missingResults: [],
                    warnings: [],
                },
            ],
            pagination: {
                page: 1,
                limit: 25,
                total: 1,
                totalPages: 1,
            },
        };
    });

    const adminSummaryRes = createMockResponse();
    await schoolPromotionDashboardController.getSchoolPromotionDashboardSummary(
        buildControllerRequest({ query: { decision: "promoted" } }),
        adminSummaryRes
    );
    assert.equal(adminSummaryRes.statusCode, 200);
    assert.ok(adminSummaryRes.body.promotionSummary);

    const adminListRes = createMockResponse();
    await schoolPromotionDashboardController.listSchoolPromotionDashboardStudents(
        buildControllerRequest({ query: { finalized: "true", page: "1", limit: "25" } }),
        adminListRes
    );
    assert.equal(adminListRes.statusCode, 200);
    assert.ok(Array.isArray(adminListRes.body.students));
    assert.ok(adminListRes.body.pagination);
    assert.equal(adminListRes.body.students[0].finalDecision, "promoted");
    assert.equal(adminListRes.body.students[1].allowedToPromote, false);
    assert.deepEqual(adminListRes.body.students[1].warnings[0], {
        code: "MISSING_REQUIRED_RESULTS",
        message: "Live promotion calculation includes a warning.",
    });

    const instructorMembership = buildActorMembership({
        _id: instructorMembershipId,
        role: "instructor",
    });
    const instructorSummaryRes = createMockResponse();
    await schoolPromotionDashboardController.getMyInstructorSchoolPromotionDashboardSummary(
        buildControllerRequest({
            userId: instructorUserId,
            actorMembership: instructorMembership,
            query: { complete: "true" },
        }),
        instructorSummaryRes
    );
    assert.equal(instructorSummaryRes.statusCode, 200);
    assert.ok(instructorSummaryRes.body.sectionOutcomeSummary);

    const instructorListRes = createMockResponse();
    await schoolPromotionDashboardController.listMyInstructorSchoolPromotionDashboardStudents(
        buildControllerRequest({
            userId: instructorUserId,
            actorMembership: instructorMembership,
            query: { hasMissingResults: "false" },
        }),
        instructorListRes
    );
    assert.equal(instructorListRes.statusCode, 200);
    assert.equal(instructorListRes.body.students, undefined);
    assert.ok(Array.isArray(instructorListRes.body.sectionOutcomes));
    assert.ok(instructorListRes.body.pagination);
    for (const forbiddenField of [
        "finalDecision",
        "calculatedDecision",
        "allowedToPromote",
        "yearlyAveragePercentage",
        "criticalFailedSubjects",
    ]) {
        assert.equal(forbiddenField in instructorListRes.body.sectionOutcomes[0], false);
    }

    assert.deepEqual(
        serviceCalls.map((call) => call.method),
        [
            "summarizeSchoolPromotionDashboard",
            "listSchoolPromotionDashboardStudents",
            "summarizeMySchoolPromotionDashboard",
            "listMySchoolPromotionDashboardStudents",
        ]
    );
    assert.deepEqual(serviceCalls[0].args, {
        institutionId,
        academicYearId,
        actorUserId: adminUserId,
        actorMembership: buildActorMembership(),
        query: { decision: "promoted" },
    });
    assert.deepEqual(serviceCalls[3].args.query, { hasMissingResults: "false" });
});

test("school promotion dashboard controllers return service validation and access errors", async (t) => {
    t.mock.method(promotionDashboardService, "listMySchoolPromotionDashboardStudents", async () => {
        const error = new Error("decision is not supported for instructor section dashboard");
        error.statusCode = 400;
        throw error;
    });
    t.mock.method(promotionDashboardService, "summarizeSchoolPromotionDashboard", async () => {
        const error = new Error("School promotion dashboard is only supported for school institutions");
        error.statusCode = 409;
        throw error;
    });

    const instructorListRes = createMockResponse();
    await schoolPromotionDashboardController.listMyInstructorSchoolPromotionDashboardStudents(
        buildControllerRequest({
            userId: instructorUserId,
            actorMembership: buildActorMembership({
                _id: instructorMembershipId,
                role: "instructor",
            }),
            query: { decision: "promoted" },
        }),
        instructorListRes
    );
    assert.equal(instructorListRes.statusCode, 400);
    assert.deepEqual(instructorListRes.body, {
        message: "decision is not supported for instructor section dashboard",
    });

    const adminSummaryRes = createMockResponse();
    await schoolPromotionDashboardController.getSchoolPromotionDashboardSummary(
        buildControllerRequest({
            params: { institutionId: universityInstitutionId },
            actorMembership: buildActorMembership({ institutionId: universityInstitutionId }),
        }),
        adminSummaryRes
    );
    assert.equal(adminSummaryRes.statusCode, 409);
    assert.deepEqual(adminSummaryRes.body, {
        message: "School promotion dashboard is only supported for school institutions",
    });
});

test("school promotion dashboard routes are wired with expected guard shape", () => {
    const routeByPath = new Map(
        institutionRoutes.stack
            .filter((layer) => layer.route)
            .map((layer) => [layer.route.path, layer.route])
    );

    const adminSummaryRoute = routeByPath.get(
        "/:institutionId/school-outcomes/academic-years/:academicYearId/promotion-dashboard/summary"
    );
    const adminListRoute = routeByPath.get(
        "/:institutionId/school-outcomes/academic-years/:academicYearId/promotion-dashboard/students"
    );
    const instructorSummaryRoute = routeByPath.get(
        "/:institutionId/instructors/me/school-outcomes/academic-years/:academicYearId/promotion-dashboard/summary"
    );
    const instructorListRoute = routeByPath.get(
        "/:institutionId/instructors/me/school-outcomes/academic-years/:academicYearId/promotion-dashboard/students"
    );

    assert.ok(adminSummaryRoute);
    assert.ok(adminListRoute);
    assert.ok(instructorSummaryRoute);
    assert.ok(instructorListRoute);
    assert.deepEqual(
        adminSummaryRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "<anonymous>", "getSchoolPromotionDashboardSummary"]
    );
    assert.deepEqual(
        adminListRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "<anonymous>", "listSchoolPromotionDashboardStudents"]
    );
    assert.deepEqual(
        instructorSummaryRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "getMyInstructorSchoolPromotionDashboardSummary"]
    );
    assert.deepEqual(
        instructorListRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "listMyInstructorSchoolPromotionDashboardStudents"]
    );
});
