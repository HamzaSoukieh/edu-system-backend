const test = require("node:test");
const assert = require("node:assert/strict");

const {
    validateOutcomeThresholds,
    validateGpaBands,
    validateRepeatPolicyInput,
    validateAcademicStandingRulesInput,
    validateCreateAcademicPolicyInput,
    validateUpdateAcademicPolicyInput,
    resolveAllowedMaxCreditHours,
} = require("../src/services/universityAcademicPolicyService");
const InstitutionAcademicPolicy = require("../src/models/InstitutionAcademicPolicy");
const {
    classifyAcademicOutcome,
    resolveGradePointFromBands,
} = require("../src/services/universityAcademicOutcomeService");
const { validatePrerequisiteSubjectIds } = require("../src/services/subjectService");

function buildAcademicPolicyPayload(overrides = {}) {
    return {
        name: "Policy A",
        effectiveFromSemesterId: "507f1f77bcf86cd799439011",
        minimumEnrollmentCreditHours: 12,
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
            { minPercentage: 0, maxPercentage: 60, gradePoint: 0 },
            { minPercentage: 60, maxPercentage: 70, gradePoint: 2 },
            { minPercentage: 70, maxPercentage: 85, gradePoint: 3 },
            { minPercentage: 85, maxPercentage: 100, gradePoint: 4 },
        ],
        ...overrides,
    };
}

function buildAcademicStandingRules(overrides = {}) {
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
        requireManualReviewIfIncompleteProfile: false,
        noOutcomeStanding: "no_standing_yet",
        allowManualReview: true,
        ...overrides,
    };
}

test("validateOutcomeThresholds accepts ordered failed, improvable, and final pass bands", () => {
    const thresholds = validateOutcomeThresholds({
        failedMaxPercentage: 59.99,
        improvableMinPercentage: 60,
        improvableMaxPercentage: 69.99,
        finalPassMinPercentage: 70,
    });

    assert.deepEqual(thresholds, {
        failedMaxPercentage: 59.99,
        improvableMinPercentage: 60,
        improvableMaxPercentage: 69.99,
        finalPassMinPercentage: 70,
    });
});

test("validateOutcomeThresholds rejects overlapping threshold bands", () => {
    assert.throws(
        () =>
            validateOutcomeThresholds({
                failedMaxPercentage: 60,
                improvableMinPercentage: 60,
                improvableMaxPercentage: 69.99,
                finalPassMinPercentage: 70,
            }),
        /failedMaxPercentage must be < outcomeThresholds\.improvableMinPercentage/
    );
});

test("validateGpaBands sorts bands deterministically before validation", () => {
    const bands = validateGpaBands([
        { minPercentage: 85, maxPercentage: 100, gradePoint: 4 },
        { minPercentage: 0, maxPercentage: 60, gradePoint: 0 },
        { minPercentage: 60, maxPercentage: 70, gradePoint: 2 },
        { minPercentage: 70, maxPercentage: 85, gradePoint: 3 },
    ]);

    assert.equal(bands.length, 4);
    assert.equal(bands[0].minPercentage, 0);
    assert.equal(bands[3].maxPercentage, 100);
});

test("validateGpaBands rejects gaps in score coverage", () => {
    assert.throws(
        () =>
            validateGpaBands([
                { minPercentage: 0, maxPercentage: 59, gradePoint: 0 },
                { minPercentage: 60, maxPercentage: 70, gradePoint: 2 },
                { minPercentage: 70, maxPercentage: 100, gradePoint: 4 },
            ]),
        /gpaBands must fully cover 0 to 100 without gaps/
    );
});

test("validateCreateAcademicPolicyInput accepts legacy minCreditHours as minimumEnrollmentCreditHours", () => {
    const input = validateCreateAcademicPolicyInput({
        name: "Policy A",
        effectiveFromSemesterId: "507f1f77bcf86cd799439011",
        minCreditHours: 12,
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
            { minPercentage: 0, maxPercentage: 60, gradePoint: 0 },
            { minPercentage: 60, maxPercentage: 70, gradePoint: 2 },
            { minPercentage: 70, maxPercentage: 85, gradePoint: 3 },
            { minPercentage: 85, maxPercentage: 100, gradePoint: 4 },
        ],
    });

    assert.equal(input.minimumEnrollmentCreditHours, 12);
});

test("old policies without repeatPolicy resolve to the default repeatPolicy on create validation", () => {
    const input = validateCreateAcademicPolicyInput({
        name: "Policy A",
        effectiveFromSemesterId: "507f1f77bcf86cd799439011",
        minimumEnrollmentCreditHours: 12,
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
            { minPercentage: 0, maxPercentage: 60, gradePoint: 0 },
            { minPercentage: 60, maxPercentage: 70, gradePoint: 2 },
            { minPercentage: 70, maxPercentage: 85, gradePoint: 3 },
            { minPercentage: 85, maxPercentage: 100, gradePoint: 4 },
        ],
    });

    assert.deepEqual(input.repeatPolicy, {
        enabled: true,
        gpaCalculationMethod: "best_attempt_only",
        earnedCreditsMethod: "count_once_per_subject",
        prerequisiteMethod: "best_passed_attempt",
        allowGradeImprovementRepeats: true,
        blockRepeatAfterFinalPass: true,
    });
});

test("old policies without academicStandingRules resolve to the default standing rules on create validation", () => {
    const input = validateCreateAcademicPolicyInput({
        name: "Policy A",
        effectiveFromSemesterId: "507f1f77bcf86cd799439011",
        minimumEnrollmentCreditHours: 12,
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
            { minPercentage: 0, maxPercentage: 60, gradePoint: 0 },
            { minPercentage: 60, maxPercentage: 70, gradePoint: 2 },
            { minPercentage: 70, maxPercentage: 85, gradePoint: 3 },
            { minPercentage: 85, maxPercentage: 100, gradePoint: 4 },
        ],
    });

    assert.equal(input.academicStandingRules.enabled, true);
    assert.equal(input.academicStandingRules.noOutcomeStanding, "no_standing_yet");
    assert.equal(input.academicStandingRules.requireManualReviewIfIncompleteProfile, true);
    assert.deepEqual(
        input.academicStandingRules.bands.map((band) => band.standing),
        ["suspension", "probation", "academic_warning", "good_standing"]
    );
});

test("validateRepeatPolicyInput accepts explicit legacy GPA and earned-credit behavior", () => {
    const repeatPolicy = validateRepeatPolicyInput({
        enabled: true,
        gpaCalculationMethod: "all_attempts",
        earnedCreditsMethod: "count_each_passed_attempt",
        prerequisiteMethod: "latest_attempt",
        allowGradeImprovementRepeats: false,
        blockRepeatAfterFinalPass: false,
    });

    assert.deepEqual(repeatPolicy, {
        enabled: true,
        gpaCalculationMethod: "all_attempts",
        earnedCreditsMethod: "count_each_passed_attempt",
        prerequisiteMethod: "latest_attempt",
        allowGradeImprovementRepeats: false,
        blockRepeatAfterFinalPass: false,
    });
});

test("validateRepeatPolicyInput rejects invalid repeatPolicy values", () => {
    assert.throws(
        () => validateRepeatPolicyInput({ enabled: "false" }),
        /repeatPolicy\.enabled must be boolean/
    );
    assert.throws(
        () => validateRepeatPolicyInput({ gpaCalculationMethod: "best" }),
        /repeatPolicy\.gpaCalculationMethod must be one of/
    );
});

test("validateAcademicStandingRulesInput accepts custom standing thresholds", () => {
    const rules = validateAcademicStandingRulesInput(buildAcademicStandingRules());

    assert.equal(rules.bands[0].standing, "suspension");
    assert.equal(rules.bands[0].maxCumulativeGpaExclusive, 1.2);
    assert.equal(rules.requireManualReviewIfIncompleteProfile, false);
});

test("validateCreateAcademicPolicyInput accepts custom academicStandingRules", () => {
    const input = validateCreateAcademicPolicyInput(
        buildAcademicPolicyPayload({
            academicStandingRules: buildAcademicStandingRules(),
        })
    );

    assert.equal(input.academicStandingRules.enabled, true);
    assert.equal(input.academicStandingRules.bands[0].standing, "suspension");
    assert.equal(input.academicStandingRules.bands[0].maxCumulativeGpaExclusive, 1.2);
    assert.equal(input.academicStandingRules.requireManualReviewIfIncompleteProfile, false);
});

test("validateUpdateAcademicPolicyInput accepts partial academicStandingRules patches", () => {
    const updates = validateUpdateAcademicPolicyInput({
        academicStandingRules: {
            requireManualReviewIfIncompleteProfile: false,
        },
    });

    assert.deepEqual(updates, {
        academicStandingRules: {
            requireManualReviewIfIncompleteProfile: false,
        },
    });
});

test("validateUpdateAcademicPolicyInput accepts replacement academicStandingRules bands", () => {
    const updates = validateUpdateAcademicPolicyInput({
        academicStandingRules: {
            bands: buildAcademicStandingRules().bands,
        },
    });

    assert.deepEqual(
        updates.academicStandingRules.bands.map((band) => band.standing),
        ["suspension", "probation", "academic_warning", "good_standing"]
    );
    assert.equal(updates.academicStandingRules.bands[0].maxCumulativeGpaExclusive, 1.2);
});

test("validateUpdateAcademicPolicyInput rejects invalid academicStandingRules with 400", () => {
    assert.throws(
        () =>
            validateUpdateAcademicPolicyInput({
                academicStandingRules: {
                    bands: [
                        {
                            standing: "suspension",
                            maxCumulativeGpaExclusive: 2,
                            allowedToContinue: false,
                            requiresAdvisorReview: true,
                        },
                        {
                            standing: "good_standing",
                            minCumulativeGpa: 1.5,
                            allowedToContinue: true,
                            requiresAdvisorReview: false,
                        },
                    ],
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.match(error.message, /academicStandingRules\.bands must be non-overlapping/);
            return true;
        }
    );
});

test("validateAcademicStandingRulesInput rejects invalid academicStandingRules values", () => {
    assert.throws(
        () => validateAcademicStandingRulesInput({ enabled: "true" }),
        /academicStandingRules\.enabled must be boolean/
    );
    assert.throws(
        () =>
            validateAcademicStandingRulesInput({
                bands: [
                    {
                        standing: "manual_review",
                        maxCumulativeGpaExclusive: 4,
                        allowedToContinue: true,
                        requiresAdvisorReview: false,
                    },
                ],
            }),
        /standing must be one of/
    );
});

test("validatePrerequisiteSubjectIds deduplicates university prerequisite ids", () => {
    const prerequisiteSubjectIds = validatePrerequisiteSubjectIds(
        ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
        "university"
    );

    assert.deepEqual(prerequisiteSubjectIds, [
        "507f1f77bcf86cd799439011",
        "507f1f77bcf86cd799439012",
    ]);
});

test("validatePrerequisiteSubjectIds rejects school prerequisite configuration", () => {
    assert.throws(
        () => validatePrerequisiteSubjectIds([], "school"),
        /prerequisiteSubjectIds is not supported for school subjects/
    );
});

test("classifyAcademicOutcome respects policy-aware threshold boundaries", () => {
    const outcomeThresholds = {
        failedMaxPercentage: 59.99,
        improvableMinPercentage: 60,
        improvableMaxPercentage: 69.99,
        finalPassMinPercentage: 70,
    };

    assert.equal(classifyAcademicOutcome({ percentage: 59.99, outcomeThresholds }), "failed");
    assert.equal(classifyAcademicOutcome({ percentage: 60, outcomeThresholds }), "passed_improvable");
    assert.equal(classifyAcademicOutcome({ percentage: 70, outcomeThresholds }), "passed_final");
});

test("resolveGradePointFromBands honors boundary cutoffs", () => {
    const gpaBands = [
        { minPercentage: 0, maxPercentage: 60, gradePoint: 0 },
        { minPercentage: 60, maxPercentage: 70, gradePoint: 2 },
        { minPercentage: 70, maxPercentage: 85, gradePoint: 3 },
        { minPercentage: 85, maxPercentage: 100, gradePoint: 4 },
    ];

    assert.equal(resolveGradePointFromBands({ percentage: 59.99, gpaBands }), 0);
    assert.equal(resolveGradePointFromBands({ percentage: 60, gpaBands }), 2);
    assert.equal(resolveGradePointFromBands({ percentage: 85, gpaBands }), 4);
});

test("resolveAllowedMaxCreditHours applies overload threshold from institution policy", () => {
    const policy = {
        minimumEnrollmentCreditHours: 12,
        defaultMaxCreditHours: 18,
        overloadMinGpa: 3,
        overloadMaxCreditHours: 21,
        gpaBands: [{ minPercentage: 0, maxPercentage: 100, gradePoint: 4 }],
    };

    assert.equal(resolveAllowedMaxCreditHours({ policy, cumulativeGpa: null }), 18);
    assert.equal(resolveAllowedMaxCreditHours({ policy, cumulativeGpa: 2.99 }), 18);
    assert.equal(resolveAllowedMaxCreditHours({ policy, cumulativeGpa: 3 }), 21);
});

test("InstitutionAcademicPolicy async validation sorts GPA bands without throwing", async () => {
    const policy = new InstitutionAcademicPolicy({
        institutionId: "507f1f77bcf86cd799439011",
        name: "Validation Policy",
        status: "draft",
        effectiveFromSemesterId: "507f1f77bcf86cd799439012",
        minimumEnrollmentCreditHours: 12,
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
            { minPercentage: 85, maxPercentage: 100, gradePoint: 4 },
            { minPercentage: 70, maxPercentage: 85, gradePoint: 3 },
            { minPercentage: 60, maxPercentage: 70, gradePoint: 2 },
            { minPercentage: 0, maxPercentage: 60, gradePoint: 0 },
        ],
        createdByUserId: "507f1f77bcf86cd799439013",
        updatedByUserId: "507f1f77bcf86cd799439014",
    });

    await policy.validate();

    assert.deepEqual(
        policy.gpaBands.map((band) => band.minPercentage),
        [0, 60, 70, 85]
    );
});
