const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildOutcomeSummary,
    buildSubjectOutcomeSummaries,
    classifyAcademicOutcome,
    listStudentAcademicOutcomes,
    resolveBestAcademicOutcomeStatus,
    resolveFinalizedEnrollmentMetrics,
} = require("../src/services/universityAcademicOutcomeService");
const Assessment = require("../src/models/Assessment");
const AssessmentResult = require("../src/models/AssessmentResult");
const Enrollment = require("../src/models/Enrollment");
const Institution = require("../src/models/Institution");
const InstitutionAcademicPolicy = require("../src/models/InstitutionAcademicPolicy");
const Section = require("../src/models/Section");
const Semester = require("../src/models/Semester");
const Subject = require("../src/models/Subject");

const institutionId = "507f1f77bcf86cd799439011";
const studentMemberId = "507f1f77bcf86cd799439012";
const enrollmentId = "507f1f77bcf86cd799439013";
const sectionId = "507f1f77bcf86cd799439014";
const semesterId = "507f1f77bcf86cd799439015";
const subjectId = "507f1f77bcf86cd799439016";
const assessmentId = "507f1f77bcf86cd799439017";
const policyId = "507f1f77bcf86cd799439018";

function normalizeId(value) {
    return value?.toString();
}

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

function buildAcademicPolicy(overrides = {}) {
    return {
        _id: policyId,
        institutionId,
        name: "Default Policy",
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
            { minPercentage: 0, maxPercentage: 59.99, gradePoint: 0 },
            { minPercentage: 60, maxPercentage: 69.99, gradePoint: 2 },
            { minPercentage: 70, maxPercentage: 100, gradePoint: 4 },
        ],
        createdByUserId: "507f1f77bcf86cd799439019",
        updatedByUserId: "507f1f77bcf86cd799439019",
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        updatedAt: new Date("2025-01-01T00:00:00.000Z"),
        ...overrides,
    };
}

function buildAcademicOutcomeDataset(overrides = {}) {
    return {
        institution: { _id: institutionId, type: "university" },
        semesters: [
            {
                _id: semesterId,
                institutionId,
                name: "Fall 2025",
                startDate: new Date("2025-09-01T00:00:00.000Z"),
                endDate: new Date("2025-12-20T00:00:00.000Z"),
                status: "closed",
            },
        ],
        policies: [buildAcademicPolicy()],
        enrollments: [
            {
                _id: enrollmentId,
                institutionId,
                sectionId,
                studentMemberId,
                status: "enrolled",
            },
        ],
        sections: [
            {
                _id: sectionId,
                institutionId,
                semesterId,
                subjectId,
                status: "closed",
            },
        ],
        subjects: [
            {
                _id: subjectId,
                institutionId,
                code: "MATH101",
                name: "Calculus",
                creditHours: 3,
            },
        ],
        assessments: [
            {
                _id: assessmentId,
                institutionId,
                sectionId,
                maxScore: 100,
                weight: 100,
                status: "published",
            },
        ],
        assessmentResults: [
            {
                _id: "507f1f77bcf86cd799439020",
                institutionId,
                assessmentId,
                enrollmentId,
                sectionId,
                studentMemberId,
                score: 85,
            },
        ],
        ...overrides,
    };
}

function mockAcademicOutcomeDependencies(t, dataset) {
    t.mock.method(Enrollment, "find", (query) =>
        createQuery(
            dataset.enrollments.filter(
                (enrollment) =>
                    normalizeId(enrollment.institutionId) === normalizeId(query.institutionId) &&
                    normalizeId(enrollment.studentMemberId) === normalizeId(query.studentMemberId)
            )
        )
    );

    t.mock.method(Section, "find", (query) => {
        const sectionIds = new Set((query._id?.$in || []).map(normalizeId));
        return createQuery(
            dataset.sections.filter(
                (section) =>
                    normalizeId(section.institutionId) === normalizeId(query.institutionId) &&
                    sectionIds.has(normalizeId(section._id))
            )
        );
    });

    t.mock.method(Subject, "find", (query) => {
        const subjectIds = new Set((query._id?.$in || []).map(normalizeId));
        return createQuery(
            dataset.subjects.filter(
                (subject) =>
                    normalizeId(subject.institutionId) === normalizeId(query.institutionId) &&
                    subjectIds.has(normalizeId(subject._id))
            )
        );
    });

    t.mock.method(Assessment, "find", (query) => {
        const sectionIds = new Set((query.sectionId?.$in || []).map(normalizeId));
        return createQuery(
            dataset.assessments.filter(
                (assessment) =>
                    normalizeId(assessment.institutionId) === normalizeId(query.institutionId) &&
                    sectionIds.has(normalizeId(assessment.sectionId))
            )
        );
    });

    t.mock.method(AssessmentResult, "find", (query) => {
        const assessmentIds = new Set((query.assessmentId?.$in || []).map(normalizeId));
        const enrollmentIds = new Set((query.enrollmentId?.$in || []).map(normalizeId));
        return createQuery(
            dataset.assessmentResults.filter(
                (result) =>
                    normalizeId(result.institutionId) === normalizeId(query.institutionId) &&
                    normalizeId(result.studentMemberId) === normalizeId(query.studentMemberId) &&
                    assessmentIds.has(normalizeId(result.assessmentId)) &&
                    enrollmentIds.has(normalizeId(result.enrollmentId))
            )
        );
    });

    t.mock.method(Institution, "findOne", (query) =>
        createQuery(normalizeId(query._id) === institutionId ? dataset.institution : null)
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

    t.mock.method(Semester, "find", (query) => {
        const semesterIds = new Set((query._id?.$in || []).map(normalizeId));
        return createQuery(
            dataset.semesters.filter(
                (semester) =>
                    normalizeId(semester.institutionId) === normalizeId(query.institutionId) &&
                    semesterIds.has(normalizeId(semester._id))
            )
        );
    });

    t.mock.method(InstitutionAcademicPolicy, "find", (query) =>
        createQuery(
            dataset.policies.filter(
                (policy) =>
                    normalizeId(policy.institutionId) === normalizeId(query.institutionId) &&
                    (!query.status?.$in || query.status.$in.includes(policy.status))
            )
        )
    );
}

function buildOutcome(overrides = {}) {
    return {
        enrollmentId: "enrollment-1",
        sectionId: "section-1",
        semesterId: "semester-1",
        subjectId: "subject-1",
        outcomeStatus: "failed",
        percentage: 50,
        attemptedCreditHours: 3,
        earnedCreditHours: 0,
        gradePoint: 0,
        qualityPoints: 0,
        ...overrides,
    };
}

function findExclusion(exclusions, reasonCode) {
    return exclusions.find((exclusion) => exclusion.reasonCode === reasonCode) || null;
}

test("classifyAcademicOutcome keeps improvable and final-pass boundaries distinct", () => {
    const outcomeThresholds = {
        failedMaxPercentage: 59.99,
        improvableMinPercentage: 60,
        improvableMaxPercentage: 69.99,
        finalPassMinPercentage: 70,
    };

    assert.equal(classifyAcademicOutcome({ percentage: 60, outcomeThresholds }), "passed_improvable");
    assert.equal(classifyAcademicOutcome({ percentage: 69.99, outcomeThresholds }), "passed_improvable");
    assert.equal(classifyAcademicOutcome({ percentage: 70, outcomeThresholds }), "passed_final");
});

test("buildSubjectOutcomeSummaries resolves repeated attempts by strongest finalized outcome meaning", () => {
    const subjectOutcomeSummaries = buildSubjectOutcomeSummaries([
        buildOutcome({
            enrollmentId: "enrollment-failed",
            sectionId: "section-failed",
            subjectId: "subject-repeat-1",
            outcomeStatus: "failed",
            percentage: 55,
        }),
        buildOutcome({
            enrollmentId: "enrollment-improvable",
            sectionId: "section-improvable",
            subjectId: "subject-repeat-1",
            outcomeStatus: "passed_improvable",
            percentage: 66,
            earnedCreditHours: 3,
            gradePoint: 2,
            qualityPoints: 6,
        }),
        buildOutcome({
            enrollmentId: "enrollment-final",
            sectionId: "section-final",
            subjectId: "subject-repeat-1",
            outcomeStatus: "passed_final",
            percentage: 78,
            earnedCreditHours: 3,
            gradePoint: 3,
            qualityPoints: 9,
        }),
    ]);

    assert.equal(subjectOutcomeSummaries.length, 1);
    assert.deepEqual(subjectOutcomeSummaries[0], {
        subjectId: "subject-repeat-1",
        attemptCount: 3,
        bestOutcomeStatus: "passed_final",
        bestOutcomeEnrollmentId: "enrollment-final",
        bestOutcomeSectionId: "section-final",
        hasFailedAttempt: true,
        hasPassedImprovableAttempt: true,
        hasPassedFinalAttempt: true,
    });
});

test("resolveBestAcademicOutcomeStatus keeps prior same-subject final pass stronger than later weaker attempts", () => {
    const bestOutcomeStatus = resolveBestAcademicOutcomeStatus([
        buildOutcome({
            enrollmentId: "enrollment-final",
            sectionId: "section-final",
            subjectId: "subject-repeat-2",
            outcomeStatus: "passed_final",
            percentage: 71,
            earnedCreditHours: 3,
            gradePoint: 3,
            qualityPoints: 9,
        }),
        buildOutcome({
            enrollmentId: "enrollment-later-failed",
            sectionId: "section-later-failed",
            subjectId: "subject-repeat-2",
            outcomeStatus: "failed",
            percentage: 58,
        }),
    ]);

    assert.equal(bestOutcomeStatus, "passed_final");
});

test("resolveFinalizedEnrollmentMetrics excludes incomplete finalized inputs", () => {
    const assessmentById = new Map([
        [
            "assessment-1",
            {
                _id: "assessment-1",
                maxScore: 100,
                weight: 40,
            },
        ],
        [
            "assessment-2",
            {
                _id: "assessment-2",
                maxScore: 100,
                weight: 60,
            },
        ],
    ]);

    const missingResultMetrics = resolveFinalizedEnrollmentMetrics({
        sectionAssessments: [...assessmentById.values()],
        enrollmentResults: [
            {
                assessmentId: "assessment-1",
                score: 80,
            },
        ],
        assessmentById,
    });
    const nullScoreMetrics = resolveFinalizedEnrollmentMetrics({
        sectionAssessments: [...assessmentById.values()],
        enrollmentResults: [
            {
                assessmentId: "assessment-1",
                score: 80,
            },
            {
                assessmentId: "assessment-2",
                score: null,
            },
        ],
        assessmentById,
    });

    assert.equal(missingResultMetrics, null);
    assert.equal(nullScoreMetrics, null);
});

test("resolveFinalizedEnrollmentMetrics excludes non-finalized published weight totals", () => {
    const assessmentById = new Map([
        [
            "assessment-1",
            {
                _id: "assessment-1",
                maxScore: 100,
                weight: 30,
            },
        ],
        [
            "assessment-2",
            {
                _id: "assessment-2",
                maxScore: 100,
                weight: 30,
            },
        ],
    ]);

    const metrics = resolveFinalizedEnrollmentMetrics({
        sectionAssessments: [...assessmentById.values()],
        enrollmentResults: [
            {
                assessmentId: "assessment-1",
                score: 80,
            },
            {
                assessmentId: "assessment-2",
                score: 90,
            },
        ],
        assessmentById,
    });

    assert.equal(metrics, null);
});

test("buildOutcomeSummary normalizes cumulative GPA precision at policy-sensitive boundaries", () => {
    const summary = buildOutcomeSummary([
        buildOutcome({
            subjectId: "subject-gpa-1",
            attemptedCreditHours: 3,
            earnedCreditHours: 3,
            gradePoint: 3,
            qualityPoints: 8.999999999999,
        }),
    ]);

    assert.equal(summary.attemptedCreditHours, 3);
    assert.equal(summary.earnedCreditHours, 3);
    assert.equal(summary.qualityPoints, 9);
    assert.equal(summary.cumulativeGpa, 3);
});

test("listStudentAcademicOutcomes explains open sections without counting them in GPA", async (t) => {
    mockAcademicOutcomeDependencies(
        t,
        buildAcademicOutcomeDataset({
            sections: [
                {
                    _id: sectionId,
                    institutionId,
                    semesterId,
                    subjectId,
                    status: "active",
                },
            ],
        })
    );

    const result = await listStudentAcademicOutcomes({ institutionId, studentMemberId });

    assert.deepEqual(result.outcomes, []);
    assert.equal(result.summary.cumulativeGpa, null);
    assert.equal(result.summary.attemptedCreditHours, 0);
    assert.deepEqual(result.excluded, [
        {
            reasonCode: "section_not_closed",
            message: "This section is not finalized yet, so it is not included in official GPA.",
            enrollmentId,
            sectionId,
            semesterId,
            subjectId,
            studentMembershipId: studentMemberId,
        },
    ]);
});

test("listStudentAcademicOutcomes explains missing finalized assessment results", async (t) => {
    mockAcademicOutcomeDependencies(
        t,
        buildAcademicOutcomeDataset({
            assessmentResults: [],
        })
    );

    const result = await listStudentAcademicOutcomes({ institutionId, studentMemberId });

    assert.deepEqual(result.outcomes, []);
    assert.equal(result.summary.cumulativeGpa, null);
    assert.deepEqual(result.excluded, [
        {
            reasonCode: "missing_assessment_result",
            message: "A published assessment is missing a recorded score, so this enrollment is not included in official GPA.",
            enrollmentId,
            sectionId,
            semesterId,
            subjectId,
            assessmentId,
            studentMembershipId: studentMemberId,
        },
    ]);
});

test("listStudentAcademicOutcomes explains invalid credit hours without counting official GPA", async (t) => {
    mockAcademicOutcomeDependencies(
        t,
        buildAcademicOutcomeDataset({
            subjects: [
                {
                    _id: subjectId,
                    institutionId,
                    code: "MATH101",
                    name: "Calculus",
                    creditHours: 0,
                },
            ],
        })
    );

    const result = await listStudentAcademicOutcomes({ institutionId, studentMemberId });

    assert.deepEqual(result.outcomes, []);
    assert.equal(result.summary.cumulativeGpa, null);
    assert.equal(result.summary.attemptedCreditHours, 0);
    assert.deepEqual(result.excluded, [
        {
            reasonCode: "invalid_credit_hours",
            message: "The subject is missing valid credit hours, so this enrollment is not included in official GPA.",
            enrollmentId,
            sectionId,
            semesterId,
            subjectId,
            studentMembershipId: studentMemberId,
        },
    ]);
});

test("listStudentAcademicOutcomes explains unpublished assessments without counting official GPA", async (t) => {
    mockAcademicOutcomeDependencies(
        t,
        buildAcademicOutcomeDataset({
            assessments: [
                {
                    _id: assessmentId,
                    institutionId,
                    sectionId,
                    maxScore: 100,
                    weight: 100,
                    status: "announced",
                },
            ],
        })
    );

    const result = await listStudentAcademicOutcomes({ institutionId, studentMemberId });
    const unpublishedAssessment = result.excluded.find(
        (exclusion) =>
            exclusion.reasonCode === "assessment_not_published" &&
            exclusion.assessmentId === assessmentId
    );

    assert.deepEqual(result.outcomes, []);
    assert.equal(result.summary.cumulativeGpa, null);
    assert.ok(unpublishedAssessment);
    assert.equal(unpublishedAssessment.sectionId, sectionId);
    assert.equal(unpublishedAssessment.semesterId, semesterId);
    assert.equal(unpublishedAssessment.subjectId, subjectId);
});

test("listStudentAcademicOutcomes explains invalid published assessment configuration", async (t) => {
    mockAcademicOutcomeDependencies(
        t,
        buildAcademicOutcomeDataset({
            assessments: [
                {
                    _id: assessmentId,
                    institutionId,
                    sectionId,
                    maxScore: 0,
                    weight: 100,
                    status: "published",
                },
            ],
        })
    );

    const result = await listStudentAcademicOutcomes({ institutionId, studentMemberId });
    const invalidConfig = findExclusion(result.excluded, "invalid_assessment_configuration");

    assert.deepEqual(result.outcomes, []);
    assert.equal(result.summary.cumulativeGpa, null);
    assert.deepEqual(invalidConfig, {
        reasonCode: "invalid_assessment_configuration",
        message: "A published assessment has invalid grading configuration, so the section is not included in official GPA.",
        sectionId,
        semesterId,
        subjectId,
        assessmentId,
    });
});

test("listStudentAcademicOutcomes explains incomplete published assessment weight totals", async (t) => {
    mockAcademicOutcomeDependencies(
        t,
        buildAcademicOutcomeDataset({
            assessments: [
                {
                    _id: assessmentId,
                    institutionId,
                    sectionId,
                    maxScore: 100,
                    weight: 50,
                    status: "published",
                },
            ],
        })
    );

    const result = await listStudentAcademicOutcomes({ institutionId, studentMemberId });

    assert.deepEqual(result.outcomes, []);
    assert.equal(result.summary.cumulativeGpa, null);
    assert.deepEqual(result.excluded, [
        {
            reasonCode: "incomplete_assessment_weight_total",
            message: "Published assessments do not total 100%, so this section is not included in official GPA.",
            sectionId,
            semesterId,
            subjectId,
        },
    ]);
});

test("listStudentAcademicOutcomes explains missing academic policy without crashing", async (t) => {
    mockAcademicOutcomeDependencies(
        t,
        buildAcademicOutcomeDataset({
            policies: [],
        })
    );

    const result = await listStudentAcademicOutcomes({ institutionId, studentMemberId });

    assert.deepEqual(result.outcomes, []);
    assert.equal(result.summary.cumulativeGpa, null);
    assert.deepEqual(result.excluded, [
        {
            reasonCode: "missing_academic_policy",
            message: "No academic policy is configured for this semester, so the section is not included in official GPA.",
            sectionId,
            semesterId,
            subjectId,
        },
    ]);
});

test("listStudentAcademicOutcomes deduplicates duplicate explanations", async (t) => {
    mockAcademicOutcomeDependencies(
        t,
        buildAcademicOutcomeDataset({
            enrollments: [
                {
                    _id: enrollmentId,
                    institutionId,
                    sectionId,
                    studentMemberId,
                    status: "enrolled",
                },
                {
                    _id: enrollmentId,
                    institutionId,
                    sectionId,
                    studentMemberId,
                    status: "enrolled",
                },
            ],
            sections: [
                {
                    _id: sectionId,
                    institutionId,
                    semesterId,
                    subjectId,
                    status: "active",
                },
            ],
        })
    );

    const result = await listStudentAcademicOutcomes({ institutionId, studentMemberId });

    assert.equal(result.excluded.length, 1);
    assert.equal(result.excluded[0].reasonCode, "section_not_closed");
});
