const test = require("node:test");
const assert = require("node:assert/strict");

const {
    SCHOOL_PROMOTION_REASON_CODES,
    resolveSchoolPromotionDecision,
} = require("../src/services/schoolPromotionService");

const mathSubjectId = "507f1f77bcf86cd799439031";
const arabicSubjectId = "507f1f77bcf86cd799439032";
const physicsSubjectId = "507f1f77bcf86cd799439033";
const englishSubjectId = "507f1f77bcf86cd799439034";

function buildPolicy(overrides = {}) {
    return {
        gradingRules: {
            yearPassMinPercentage: 60,
        },
        failureRules: {
            failIfAnyCriticalSubjectFailed: true,
            criticalSubjectRules: [
                {
                    subjectId: arabicSubjectId,
                    failAction: "repeat_year",
                },
            ],
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

function buildSubjectOutcome({ subjectId, percentage = 70, failed = false, name = null }) {
    return {
        subjectId,
        subjectName: name,
        yearlyPercentage: percentage,
        passed: !failed,
        failed,
        passedBasedOnAvailableResults: !failed,
        failedBasedOnAvailableResults: failed,
        complete: true,
        hasMissingResults: false,
        missingResults: [],
    };
}

function buildStudentYearOutcome(overrides = {}) {
    const subjects = overrides.subjects || [
        buildSubjectOutcome({ subjectId: mathSubjectId, percentage: 80 }),
        buildSubjectOutcome({ subjectId: arabicSubjectId, percentage: 75, name: "Arabic" }),
    ];
    const failedSubjectCount =
        overrides.failedSubjectCount ?? subjects.filter((subject) => subject.failedBasedOnAvailableResults).length;
    const criticalFailedSubjects =
        overrides.criticalFailedSubjects ??
        subjects
            .filter((subject) => subject.failedBasedOnAvailableResults && subject.subjectId === arabicSubjectId)
            .map((subject) => ({
                subjectId: subject.subjectId,
                yearlyPercentage: subject.yearlyPercentage,
                failAction: "repeat_year",
            }));

    return {
        studentMembershipId: "507f1f77bcf86cd799439012",
        academicYearId: "507f1f77bcf86cd799439013",
        classLevelId: "507f1f77bcf86cd799439014",
        yearlyAveragePercentage: 75,
        complete: true,
        hasMissingResults: false,
        subjects,
        failedSubjectCount,
        criticalFailedSubjects,
        missingResults: [],
        ...overrides,
    };
}

test("critical subject failed returns repeat_year from configured failAction", () => {
    const decision = resolveSchoolPromotionDecision({
        policy: buildPolicy(),
        studentYearOutcome: buildStudentYearOutcome({
            yearlyAveragePercentage: 70,
            subjects: [
                buildSubjectOutcome({
                    subjectId: arabicSubjectId,
                    percentage: 45,
                    failed: true,
                    name: "Arabic",
                }),
                buildSubjectOutcome({ subjectId: mathSubjectId, percentage: 90 }),
            ],
        }),
    });

    assert.equal(decision.decision, "repeat_year");
    assert.equal(decision.allowedToPromote, false);
    assert.deepEqual(decision.reasonCodes, [SCHOOL_PROMOTION_REASON_CODES.CRITICAL_SUBJECT_FAILED]);
    assert.equal(decision.reasons[0].criticalFailedSubjects[0].subjectId, arabicSubjectId);
});

test("failing Arabic works only because Arabic subjectId is configured in policy", () => {
    const studentYearOutcome = buildStudentYearOutcome({
        yearlyAveragePercentage: 80,
        subjects: [
            buildSubjectOutcome({
                subjectId: arabicSubjectId,
                percentage: 40,
                failed: true,
                name: "Arabic",
            }),
            buildSubjectOutcome({ subjectId: mathSubjectId, percentage: 90 }),
        ],
        criticalFailedSubjects: [],
    });
    const policy = buildPolicy({
        failureRules: {
            failIfAnyCriticalSubjectFailed: true,
            criticalSubjectRules: [{ subjectId: physicsSubjectId, failAction: "repeat_year" }],
            failIfFailedSubjectCountAtLeast: 3,
            countCriticalSubjectsInFailedSubjectTotal: true,
        },
    });

    const decision = resolveSchoolPromotionDecision({
        policy,
        studentYearOutcome,
    });

    assert.equal(decision.decision, "promoted");
    assert.deepEqual(decision.reasonCodes, []);
});

test("3 failed subjects returns repeat_year when threshold is 3", () => {
    const decision = resolveSchoolPromotionDecision({
        policy: buildPolicy({
            failureRules: {
                failIfAnyCriticalSubjectFailed: false,
                criticalSubjectRules: [],
                failIfFailedSubjectCountAtLeast: 3,
                countCriticalSubjectsInFailedSubjectTotal: true,
            },
        }),
        studentYearOutcome: buildStudentYearOutcome({
            yearlyAveragePercentage: 70,
            subjects: [
                buildSubjectOutcome({ subjectId: mathSubjectId, percentage: 45, failed: true }),
                buildSubjectOutcome({ subjectId: physicsSubjectId, percentage: 40, failed: true }),
                buildSubjectOutcome({ subjectId: englishSubjectId, percentage: 35, failed: true }),
            ],
        }),
    });

    assert.equal(decision.decision, "repeat_year");
    assert.deepEqual(decision.reasonCodes, [
        SCHOOL_PROMOTION_REASON_CODES.FAILED_SUBJECT_COUNT_LIMIT_REACHED,
    ]);
});

test("2 failed subjects returns promoted when threshold is 3 and no other blockers exist", () => {
    const decision = resolveSchoolPromotionDecision({
        policy: buildPolicy({
            failureRules: {
                failIfAnyCriticalSubjectFailed: false,
                criticalSubjectRules: [],
                failIfFailedSubjectCountAtLeast: 3,
                countCriticalSubjectsInFailedSubjectTotal: true,
            },
        }),
        studentYearOutcome: buildStudentYearOutcome({
            yearlyAveragePercentage: 70,
            subjects: [
                buildSubjectOutcome({ subjectId: mathSubjectId, percentage: 45, failed: true }),
                buildSubjectOutcome({ subjectId: physicsSubjectId, percentage: 40, failed: true }),
                buildSubjectOutcome({ subjectId: englishSubjectId, percentage: 90 }),
            ],
        }),
    });

    assert.equal(decision.decision, "promoted");
    assert.equal(decision.allowedToPromote, true);
    assert.deepEqual(decision.reasonCodes, []);
});

test("yearly average below minimum returns fail decision", () => {
    const decision = resolveSchoolPromotionDecision({
        policy: buildPolicy(),
        studentYearOutcome: buildStudentYearOutcome({
            yearlyAveragePercentage: 55,
            subjects: [
                buildSubjectOutcome({ subjectId: mathSubjectId, percentage: 55 }),
                buildSubjectOutcome({ subjectId: arabicSubjectId, percentage: 55, name: "Arabic" }),
            ],
            criticalFailedSubjects: [],
        }),
    });

    assert.equal(decision.decision, "repeat_year");
    assert.deepEqual(decision.reasonCodes, [SCHOOL_PROMOTION_REASON_CODES.YEAR_AVERAGE_BELOW_MINIMUM]);
    assert.equal(decision.reasons[0].yearPassMinPercentage, 60);
});

test("missing results returns manual_review with explanation", () => {
    const decision = resolveSchoolPromotionDecision({
        policy: buildPolicy(),
        studentYearOutcome: buildStudentYearOutcome({
            yearlyAveragePercentage: 80,
            complete: false,
            hasMissingResults: true,
            missingResults: [
                {
                    code: "missing_assessment_result",
                    subjectId: mathSubjectId,
                },
            ],
        }),
    });

    assert.equal(decision.decision, "manual_review");
    assert.equal(decision.allowedToPromote, false);
    assert.deepEqual(decision.reasonCodes, [SCHOOL_PROMOTION_REASON_CODES.MISSING_REQUIRED_RESULTS]);
    assert.equal(decision.reasons[0].missingResultCount, 1);
    assert.equal(decision.warnings.length, 1);
});

test("missing results falls back to failDecision when manual review is disabled", () => {
    const decision = resolveSchoolPromotionDecision({
        policy: buildPolicy({
            promotionRules: {
                enabled: true,
                passDecision: "promoted",
                failDecision: "repeat_year",
                allowConditionalPromotion: true,
                allowManualReview: false,
            },
        }),
        studentYearOutcome: buildStudentYearOutcome({
            yearlyAveragePercentage: 80,
            complete: false,
            hasMissingResults: true,
        }),
    });

    assert.equal(decision.decision, "repeat_year");
    assert.deepEqual(decision.reasonCodes, [SCHOOL_PROMOTION_REASON_CODES.MISSING_REQUIRED_RESULTS]);
});

test("successful student returns promoted", () => {
    const decision = resolveSchoolPromotionDecision({
        policy: buildPolicy(),
        studentYearOutcome: buildStudentYearOutcome({
            yearlyAveragePercentage: 85,
            subjects: [
                buildSubjectOutcome({ subjectId: mathSubjectId, percentage: 90 }),
                buildSubjectOutcome({ subjectId: arabicSubjectId, percentage: 80, name: "Arabic" }),
            ],
            gpa: 0,
            creditHours: 0,
        }),
    });

    assert.equal(decision.decision, "promoted");
    assert.equal(decision.allowedToPromote, true);
    assert.deepEqual(decision.reasonCodes, []);
    assert.deepEqual(decision.reasons, []);
    assert.deepEqual(decision.warnings, []);
});

test("successful student derives allowedToPromote from passDecision", () => {
    const manualReviewDecision = resolveSchoolPromotionDecision({
        policy: buildPolicy({
            promotionRules: {
                enabled: true,
                passDecision: "manual_review",
                failDecision: "repeat_year",
                allowConditionalPromotion: true,
                allowManualReview: true,
            },
        }),
        studentYearOutcome: buildStudentYearOutcome({
            yearlyAveragePercentage: 85,
        }),
    });

    const promotedDecision = resolveSchoolPromotionDecision({
        policy: buildPolicy({
            promotionRules: {
                enabled: true,
                passDecision: "promoted",
                failDecision: "repeat_year",
                allowConditionalPromotion: true,
                allowManualReview: true,
            },
        }),
        studentYearOutcome: buildStudentYearOutcome({
            yearlyAveragePercentage: 85,
        }),
    });

    assert.equal(manualReviewDecision.decision, "manual_review");
    assert.equal(manualReviewDecision.allowedToPromote, false);
    assert.equal(promotedDecision.decision, "promoted");
    assert.equal(promotedDecision.allowedToPromote, true);
});

test("decision object includes reasonCodes and reason objects", () => {
    const decision = resolveSchoolPromotionDecision({
        policy: buildPolicy(),
        studentYearOutcome: buildStudentYearOutcome({
            yearlyAveragePercentage: 50,
            subjects: [
                buildSubjectOutcome({ subjectId: mathSubjectId, percentage: 50 }),
                buildSubjectOutcome({ subjectId: arabicSubjectId, percentage: 50, name: "Arabic" }),
            ],
            criticalFailedSubjects: [],
        }),
    });

    assert.ok(Array.isArray(decision.reasonCodes));
    assert.ok(Array.isArray(decision.reasons));
    assert.equal(decision.reasonCodes[0], decision.reasons[0].code);
});
