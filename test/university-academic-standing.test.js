const test = require("node:test");
const assert = require("node:assert/strict");

const {
    resolveAcademicStanding,
    resolveAcademicStandingRules,
    validateAcademicStandingRulesInput,
} = require("../src/services/universityAcademicStandingService");

function buildSummary(cumulativeGpa) {
    return {
        cumulativeGpa,
        totalEarnedCreditHours: 12,
        totalAttemptedCreditHours: 12,
        totalPassedSubjects: 4,
        totalFailedSubjects: 0,
    };
}

function buildOutcome() {
    return {
        enrollmentId: "enrollment-1",
        subjectId: "subject-1",
        outcomeStatus: "passed_final",
    };
}

function buildCustomRules(overrides = {}) {
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
        ...overrides,
    };
}

function buildDefaultRules(overrides = {}) {
    return {
        enabled: true,
        bands: [
            {
                standing: "suspension",
                maxCumulativeGpaExclusive: 1,
                allowedToContinue: false,
                requiresAdvisorReview: true,
            },
            {
                standing: "probation",
                minCumulativeGpa: 1,
                maxCumulativeGpaExclusive: 1.7,
                allowedToContinue: true,
                requiresAdvisorReview: true,
            },
            {
                standing: "academic_warning",
                minCumulativeGpa: 1.7,
                maxCumulativeGpaExclusive: 2,
                allowedToContinue: true,
                requiresAdvisorReview: false,
            },
            {
                standing: "good_standing",
                minCumulativeGpa: 2,
                allowedToContinue: true,
                requiresAdvisorReview: false,
            },
        ],
        requireManualReviewIfIncompleteProfile: true,
        noOutcomeStanding: "no_standing_yet",
        allowManualReview: true,
        ...overrides,
    };
}

test("old policy without academicStandingRules resolves default rules", () => {
    const rules = resolveAcademicStandingRules({});

    assert.equal(rules.enabled, true);
    assert.equal(rules.noOutcomeStanding, "no_standing_yet");
    assert.equal(rules.requireManualReviewIfIncompleteProfile, true);
    assert.deepEqual(
        rules.bands.map((band) => band.standing),
        ["suspension", "probation", "academic_warning", "good_standing"]
    );
});

test("academic standing uses default GPA boundaries", () => {
    const outcomes = [buildOutcome()];

    assert.equal(
        resolveAcademicStanding({ summary: buildSummary(2), outcomes }).standing,
        "good_standing"
    );
    assert.equal(
        resolveAcademicStanding({ summary: buildSummary(1.999), outcomes }).standing,
        "academic_warning"
    );
    assert.equal(
        resolveAcademicStanding({ summary: buildSummary(1.7), outcomes }).standing,
        "academic_warning"
    );
    assert.equal(
        resolveAcademicStanding({ summary: buildSummary(1.699), outcomes }).standing,
        "probation"
    );
    assert.equal(
        resolveAcademicStanding({ summary: buildSummary(1), outcomes }).standing,
        "probation"
    );
    assert.equal(
        resolveAcademicStanding({ summary: buildSummary(0.99), outcomes }).standing,
        "suspension"
    );
    assert.equal(
        resolveAcademicStanding({ summary: buildSummary(4), outcomes }).standing,
        "good_standing"
    );
});

test("admin-configured GPA thresholds drive standing calculation", () => {
    const academicStandingRules = buildCustomRules();
    const outcomes = [buildOutcome()];

    assert.equal(
        resolveAcademicStanding({
            academicStandingRules,
            summary: buildSummary(1.1),
            outcomes,
        }).standing,
        "suspension"
    );
    assert.equal(
        resolveAcademicStanding({
            academicStandingRules,
            summary: buildSummary(1.2),
            outcomes,
        }).standing,
        "probation"
    );
    assert.equal(
        resolveAcademicStanding({
            academicStandingRules,
            summary: buildSummary(2.5),
            outcomes,
        }).standing,
        "good_standing"
    );
});

test("academic standing matches GPA scale max when top band explicitly ends at 4", () => {
    const academicStandingRules = buildCustomRules({
        bands: [
            {
                standing: "suspension",
                maxCumulativeGpaExclusive: 1,
                allowedToContinue: false,
                requiresAdvisorReview: true,
            },
            {
                standing: "probation",
                minCumulativeGpa: 1,
                maxCumulativeGpaExclusive: 1.7,
                allowedToContinue: true,
                requiresAdvisorReview: true,
            },
            {
                standing: "academic_warning",
                minCumulativeGpa: 1.7,
                maxCumulativeGpaExclusive: 2,
                allowedToContinue: true,
                requiresAdvisorReview: false,
            },
            {
                standing: "good_standing",
                minCumulativeGpa: 2,
                maxCumulativeGpaExclusive: 4,
                allowedToContinue: true,
                requiresAdvisorReview: false,
            },
        ],
    });

    const standing = resolveAcademicStanding({
        academicStandingRules,
        summary: buildSummary(4),
        outcomes: [buildOutcome()],
    });

    assert.equal(standing.standing, "good_standing");
});

test("no finalized academic outcomes return no_standing_yet", () => {
    const standing = resolveAcademicStanding({
        summary: { cumulativeGpa: null },
        outcomes: [],
    });

    assert.equal(standing.standing, "no_standing_yet");
    assert.deepEqual(standing.reasonCodes, ["no_finalized_academic_outcomes"]);
    assert.equal(standing.allowedToContinue, null);
});

test("null cumulative GPA returns no_standing_yet even when outcomes are present", () => {
    const standing = resolveAcademicStanding({
        summary: { cumulativeGpa: null },
        outcomes: [buildOutcome()],
    });

    assert.equal(standing.standing, "no_standing_yet");
    assert.deepEqual(standing.reasonCodes, ["no_finalized_academic_outcomes"]);
});

test("incomplete profile data returns review_required when configured", () => {
    const standing = resolveAcademicStanding({
        summary: buildSummary(3),
        outcomes: [buildOutcome()],
        excluded: [
            {
                reasonCode: "missing_assessment_result",
                message: "Missing result",
            },
        ],
    });

    assert.equal(standing.standing, "review_required");
    assert.equal(standing.requiresAdvisorReview, true);
    assert.deepEqual(standing.reasonCodes, ["incomplete_academic_profile_requires_review"]);
});

test("section_not_closed does not force review when finalized GPA exists", () => {
    const standing = resolveAcademicStanding({
        summary: buildSummary(3),
        outcomes: [buildOutcome()],
        excluded: [
            {
                reasonCode: "section_not_closed",
                message: "Current section is not finalized yet.",
            },
        ],
    });

    assert.equal(standing.standing, "good_standing");
    assert.deepEqual(standing.reasonCodes, ["cumulative_gpa_in_good_standing_range"]);
});

test("repeat-policy exclusions do not force standing review", () => {
    const standing = resolveAcademicStanding({
        summary: buildSummary(3),
        outcomes: [buildOutcome()],
        excluded: [
            {
                reasonCode: "repeat_policy_best_attempt_only",
                message: "Official repeat exclusion",
            },
        ],
    });

    assert.equal(standing.standing, "good_standing");
});

test("incomplete profile data does not force review when disabled", () => {
    const standing = resolveAcademicStanding({
        academicStandingRules: buildCustomRules({
            requireManualReviewIfIncompleteProfile: false,
        }),
        summary: buildSummary(3),
        outcomes: [buildOutcome()],
        excluded: [
            {
                reasonCode: "missing_assessment_result",
                message: "Missing result",
            },
        ],
    });

    assert.equal(standing.standing, "good_standing");
});

test("disabled academicStandingRules return a disabled live standing shape", () => {
    const standing = resolveAcademicStanding({
        academicStandingRules: {
            enabled: false,
        },
        summary: buildSummary(3),
        outcomes: [buildOutcome()],
    });

    assert.equal(standing.enabled, false);
    assert.equal(standing.standing, null);
    assert.deepEqual(standing.reasonCodes, ["standing_rules_disabled"]);
});

test("academicStandingRules validation rejects overlapping bands", () => {
    assert.throws(
        () =>
            validateAcademicStandingRulesInput(
                buildCustomRules({
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
                })
            ),
        /academicStandingRules\.bands must be non-overlapping/
    );
});

test("academicStandingRules validation rejects gaps between GPA bands", () => {
    assert.throws(
        () =>
            validateAcademicStandingRulesInput(
                buildDefaultRules({
                    bands: [
                        {
                            standing: "suspension",
                            maxCumulativeGpaExclusive: 1,
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
                            standing: "good_standing",
                            minCumulativeGpa: 2,
                            allowedToContinue: true,
                            requiresAdvisorReview: false,
                        },
                    ],
                })
            ),
        /must fully cover GPA 0 to 4 without gaps/
    );
});

test("academicStandingRules validation rejects bands that do not start at GPA 0", () => {
    assert.throws(
        () =>
            validateAcademicStandingRulesInput(
                buildDefaultRules({
                    bands: [
                        {
                            standing: "probation",
                            minCumulativeGpa: 1,
                            maxCumulativeGpaExclusive: 2,
                            allowedToContinue: true,
                            requiresAdvisorReview: true,
                        },
                        {
                            standing: "good_standing",
                            minCumulativeGpa: 2,
                            allowedToContinue: true,
                            requiresAdvisorReview: false,
                        },
                    ],
                })
            ),
        /must start at GPA 0/
    );
});

test("academicStandingRules validation rejects bands that do not end at GPA scale max", () => {
    assert.throws(
        () =>
            validateAcademicStandingRulesInput(
                buildDefaultRules({
                    bands: [
                        {
                            standing: "suspension",
                            maxCumulativeGpaExclusive: 1,
                            allowedToContinue: false,
                            requiresAdvisorReview: true,
                        },
                        {
                            standing: "good_standing",
                            minCumulativeGpa: 1,
                            maxCumulativeGpaExclusive: 3.5,
                            allowedToContinue: true,
                            requiresAdvisorReview: false,
                        },
                    ],
                })
            ),
        /must end at GPA 4/
    );
});

test("academicStandingRules validation rejects out-of-scale GPA bounds", () => {
    assert.throws(
        () =>
            validateAcademicStandingRulesInput(
                buildCustomRules({
                    bands: [
                        {
                            standing: "suspension",
                            maxCumulativeGpaExclusive: 4.5,
                            allowedToContinue: false,
                            requiresAdvisorReview: true,
                        },
                        {
                            standing: "good_standing",
                            minCumulativeGpa: 4.5,
                            allowedToContinue: true,
                            requiresAdvisorReview: false,
                        },
                    ],
                })
            ),
        /maxCumulativeGpaExclusive must be a number between 0 and 4/
    );
});

test("academicStandingRules validation rejects inverted GPA bounds", () => {
    assert.throws(
        () =>
            validateAcademicStandingRulesInput(
                buildDefaultRules({
                    bands: [
                        {
                            standing: "suspension",
                            minCumulativeGpa: 2,
                            maxCumulativeGpaExclusive: 1,
                            allowedToContinue: false,
                            requiresAdvisorReview: true,
                        },
                        {
                            standing: "good_standing",
                            minCumulativeGpa: 1,
                            allowedToContinue: true,
                            requiresAdvisorReview: false,
                        },
                    ],
                })
            ),
        /maxCumulativeGpaExclusive must be greater than minCumulativeGpa/
    );
});

test("academicStandingRules validation rejects invalid standing enums", () => {
    assert.throws(
        () =>
            validateAcademicStandingRulesInput(
                buildCustomRules({
                    bands: [
                        {
                            standing: "review_required",
                            maxCumulativeGpaExclusive: 2,
                            allowedToContinue: false,
                            requiresAdvisorReview: true,
                        },
                        {
                            standing: "good_standing",
                            minCumulativeGpa: 2,
                            allowedToContinue: true,
                            requiresAdvisorReview: false,
                        },
                    ],
                })
            ),
        /standing must be one of/
    );
});

test("academicStandingRules validation rejects missing good_standing band", () => {
    assert.throws(
        () =>
            validateAcademicStandingRulesInput(
                buildCustomRules({
                    bands: [
                        {
                            standing: "suspension",
                            maxCumulativeGpaExclusive: 2,
                            allowedToContinue: false,
                            requiresAdvisorReview: true,
                        },
                        {
                            standing: "probation",
                            minCumulativeGpa: 2,
                            allowedToContinue: true,
                            requiresAdvisorReview: true,
                        },
                    ],
                })
            ),
        /must include a good_standing band/
    );
});

test("academicStandingRules validation rejects non-boolean band flags", () => {
    assert.throws(
        () =>
            validateAcademicStandingRulesInput(
                buildDefaultRules({
                    bands: [
                        {
                            standing: "suspension",
                            maxCumulativeGpaExclusive: 1,
                            allowedToContinue: "false",
                            requiresAdvisorReview: true,
                        },
                        {
                            standing: "good_standing",
                            minCumulativeGpa: 1,
                            allowedToContinue: true,
                            requiresAdvisorReview: false,
                        },
                    ],
                })
            ),
        /allowedToContinue must be boolean/
    );

    assert.throws(
        () =>
            validateAcademicStandingRulesInput(
                buildDefaultRules({
                    bands: [
                        {
                            standing: "suspension",
                            maxCumulativeGpaExclusive: 1,
                            allowedToContinue: false,
                            requiresAdvisorReview: "true",
                        },
                        {
                            standing: "good_standing",
                            minCumulativeGpa: 1,
                            allowedToContinue: true,
                            requiresAdvisorReview: false,
                        },
                    ],
                })
            ),
        /requiresAdvisorReview must be boolean/
    );
});

test("academicStandingRules validation rejects invalid system fields", () => {
    assert.throws(
        () => validateAcademicStandingRulesInput(buildDefaultRules({ enabled: "true" })),
        /academicStandingRules\.enabled must be boolean/
    );

    assert.throws(
        () => validateAcademicStandingRulesInput(buildDefaultRules({ noOutcomeStanding: "review_required" })),
        /academicStandingRules\.noOutcomeStanding must be one of/
    );
});
