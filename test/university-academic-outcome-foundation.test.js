const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildOutcomeSummary,
    buildSubjectOutcomeSummaries,
    classifyAcademicOutcome,
    resolveBestAcademicOutcomeStatus,
    resolveFinalizedEnrollmentMetrics,
} = require("../src/services/universityAcademicOutcomeService");

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
