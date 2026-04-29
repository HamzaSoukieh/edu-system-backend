const test = require("node:test");
const assert = require("node:assert/strict");

const {
    validateOutcomeThresholds,
    validateGpaBands,
    validateCreateAcademicPolicyInput,
    resolveAllowedMaxCreditHours,
} = require("../src/services/universityAcademicPolicyService");
const InstitutionAcademicPolicy = require("../src/models/InstitutionAcademicPolicy");
const {
    classifyAcademicOutcome,
    resolveGradePointFromBands,
} = require("../src/services/universityAcademicOutcomeService");
const { validatePrerequisiteSubjectIds } = require("../src/services/subjectService");

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
