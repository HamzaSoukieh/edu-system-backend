const test = require("node:test");
const assert = require("node:assert/strict");

const {
    resolveSelfEnrollmentEligibility,
    resolveSelfEnrollmentSubmissionEligibility,
} = require("../src/services/universitySelfEnrollmentEligibilityService");

function buildPolicy(overrides = {}) {
    return {
        minimumEnrollmentCreditHours: 12,
        defaultMaxCreditHours: 18,
        overloadMinGpa: 3,
        overloadMaxCreditHours: 21,
        gpaBands: [{ minPercentage: 0, maxPercentage: 100, gradePoint: 4 }],
        ...overrides,
    };
}

function buildEligibilityContext(overrides = {}) {
    const baseContext = {
        studentMembership: {
            _id: "member-student-1",
            role: "student",
            status: "active",
        },
        activeSemester: {
            _id: "semester-active-1",
        },
        targetSection: {
            _id: "section-target-1",
            semesterId: "semester-active-1",
            status: "draft",
            capacity: 30,
        },
        targetSubject: {
            _id: "subject-target-1",
            creditHours: 3,
            prerequisiteSubjectIds: [],
            status: "active",
        },
        policy: buildPolicy(),
        existingSectionEnrollment: null,
        currentSectionSeatCount: 10,
        academicOutcomeSummary: {
            outcomes: [],
            summary: {
                cumulativeGpa: 2.5,
            },
        },
        prerequisiteSubjects: [],
        currentActiveSemesterSections: [],
        currentActiveSemesterSubjects: [],
    };

    return {
        ...baseContext,
        ...overrides,
        studentMembership: {
            ...baseContext.studentMembership,
            ...(overrides.studentMembership || {}),
        },
        activeSemester: {
            ...baseContext.activeSemester,
            ...(overrides.activeSemester || {}),
        },
        targetSection: {
            ...baseContext.targetSection,
            ...(overrides.targetSection || {}),
        },
        targetSubject: {
            ...baseContext.targetSubject,
            ...(overrides.targetSubject || {}),
        },
        policy: buildPolicy(overrides.policy || {}),
        academicOutcomeSummary: {
            ...baseContext.academicOutcomeSummary,
            ...(overrides.academicOutcomeSummary || {}),
            summary: {
                ...baseContext.academicOutcomeSummary.summary,
                ...(overrides.academicOutcomeSummary?.summary || {}),
            },
            outcomes:
                overrides.academicOutcomeSummary?.outcomes || baseContext.academicOutcomeSummary.outcomes,
        },
    };
}

function buildSubmissionSelection(overrides = {}) {
    return {
        targetSection: {
            _id: "section-submission-1",
            semesterId: "semester-active-1",
            subjectId: "subject-submission-1",
            code: "A",
            title: "Section A",
            status: "active",
            capacity: 30,
        },
        targetSubject: {
            _id: "subject-submission-1",
            code: "CS201",
            name: "Data Structures",
            creditHours: 3,
            prerequisiteSubjectIds: [],
            status: "active",
        },
        existingSectionEnrollment: null,
        currentSectionSeatCount: 10,
        prerequisiteSubjects: [],
        ...overrides,
        targetSection: {
            _id: "section-submission-1",
            semesterId: "semester-active-1",
            subjectId: "subject-submission-1",
            code: "A",
            title: "Section A",
            status: "active",
            capacity: 30,
            ...(overrides.targetSection || {}),
        },
        targetSubject: {
            _id: "subject-submission-1",
            code: "CS201",
            name: "Data Structures",
            creditHours: 3,
            prerequisiteSubjectIds: [],
            status: "active",
            ...(overrides.targetSubject || {}),
        },
    };
}

test("resolveSelfEnrollmentEligibility returns an eligible decision when requirements are satisfied", () => {
    const decision = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            policy: { minimumEnrollmentCreditHours: 3 },
        })
    );

    assert.equal(decision.isEligible, true);
    assert.deepEqual(decision.blockingReasonCodes, []);
    assert.equal(decision.currentCreditHours, 0);
    assert.equal(decision.projectedCreditHours, 3);
    assert.equal(decision.capacitySummary.remainingSeatCount, 20);
    assert.equal(decision.blockingReasons.length, 0);
    assert.equal(decision.duplicateEnrollment.hasExistingEnrollment, false);
    assert.equal(decision.sectionCapacity.isFull, false);
    assert.equal(decision.prerequisiteSummary.requiredCount, 0);
    assert.equal(decision.sameSubjectSummary.bestOutcomeStatus, null);
    assert.equal(decision.loadSummary.currentCreditHours, 0);
    assert.equal(decision.loadSummary.projectedCreditHours, 3);
    assert.equal(decision.loadSummary.belowMinimumEnrollment, false);
    assert.equal(decision.loadSummary.exceedsAllowedMax, false);
    assert.ok(decision.infos.some((item) => item.code === "no_prerequisites_configured"));
    assert.ok(decision.infos.some((item) => item.code === "projected_credit_load_meets_minimum_enrollment"));
});

test("resolveSelfEnrollmentEligibility does not enforce academicStandingRules allowedToContinue", () => {
    const decision = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            policy: {
                minimumEnrollmentCreditHours: 3,
                academicStandingRules: {
                    enabled: true,
                    bands: [
                        {
                            standing: "suspension",
                            maxCumulativeGpaExclusive: 4,
                            allowedToContinue: false,
                            requiresAdvisorReview: true,
                        },
                    ],
                    requireManualReviewIfIncompleteProfile: true,
                    noOutcomeStanding: "no_standing_yet",
                    allowManualReview: true,
                },
            },
            academicOutcomeSummary: {
                outcomes: [],
                summary: {
                    cumulativeGpa: 0.5,
                },
            },
        })
    );

    assert.equal(decision.isEligible, true);
    assert.deepEqual(decision.blockingReasonCodes, []);
    assert.equal("academicStandingRules" in decision.policySummary, false);
});

test("resolveSelfEnrollmentEligibility counts one enrolled section for one subject once", () => {
    const decision = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            policy: {
                minimumEnrollmentCreditHours: 3,
                defaultMaxCreditHours: 9,
                overloadMaxCreditHours: 12,
            },
            currentActiveSemesterSections: [
                {
                    _id: "section-current-1",
                    subjectId: "subject-current-1",
                },
            ],
            currentActiveSemesterSubjects: [
                {
                    _id: "subject-current-1",
                    creditHours: 3,
                },
            ],
        })
    );

    assert.equal(decision.currentCreditHours, 3);
    assert.equal(decision.projectedCreditHours, 6);
    assert.equal(decision.loadSummary.currentCreditHours, 3);
});

test("resolveSelfEnrollmentEligibility counts multiple enrolled sections for the same subject once", () => {
    const decision = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            policy: {
                minimumEnrollmentCreditHours: 3,
                defaultMaxCreditHours: 6,
                overloadMaxCreditHours: 9,
            },
            currentActiveSemesterSections: [
                {
                    _id: "section-current-1",
                    subjectId: "subject-current-1",
                },
                {
                    _id: "section-current-2",
                    subjectId: "subject-current-1",
                },
            ],
            currentActiveSemesterSubjects: [
                {
                    _id: "subject-current-1",
                    creditHours: 3,
                },
            ],
        })
    );

    assert.equal(decision.currentCreditHours, 3);
    assert.equal(decision.projectedCreditHours, 6);
    assert.equal(decision.isEligible, true);
    assert.equal(decision.loadSummary.currentCreditHours, 3);
});

test("resolveSelfEnrollmentEligibility keeps different active-semester subjects counting normally", () => {
    const decision = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            policy: {
                minimumEnrollmentCreditHours: 3,
                defaultMaxCreditHours: 6,
                overloadMaxCreditHours: 9,
            },
            currentActiveSemesterSections: [
                {
                    _id: "section-current-1",
                    subjectId: "subject-current-1",
                },
                {
                    _id: "section-current-2",
                    subjectId: "subject-current-2",
                },
            ],
            currentActiveSemesterSubjects: [
                {
                    _id: "subject-current-1",
                    creditHours: 3,
                },
                {
                    _id: "subject-current-2",
                    creditHours: 3,
                },
            ],
        })
    );

    assert.equal(decision.currentCreditHours, 6);
    assert.equal(decision.projectedCreditHours, 9);
    assert.equal(decision.loadSummary.currentCreditHours, 6);
});

test("resolveSelfEnrollmentEligibility blocks an existing same-section enrollment record", () => {
    const decision = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            policy: { minimumEnrollmentCreditHours: 3 },
            existingSectionEnrollment: {
                _id: "enrollment-existing-1",
                status: "dropped",
            },
        })
    );

    assert.equal(decision.isEligible, false);
    assert.deepEqual(decision.blockingReasonCodes, ["existing_section_enrollment_record"]);
    assert.deepEqual(
        decision.blockingReasons.map((item) => item.code),
        ["existing_section_enrollment_record"]
    );
    assert.equal(decision.duplicateEnrollment.hasExistingEnrollment, true);
    assert.equal(decision.duplicateEnrollment.existingEnrollmentStatus, "dropped");
});

test("resolveSelfEnrollmentEligibility blocks missing prerequisites", () => {
    const decision = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            policy: { minimumEnrollmentCreditHours: 3 },
            targetSubject: {
                prerequisiteSubjectIds: ["subject-prereq-1"],
            },
            prerequisiteSubjects: [
                {
                    _id: "subject-prereq-1",
                    code: "CS101",
                    name: "Intro to CS",
                },
            ],
        })
    );

    assert.equal(decision.isEligible, false);
    assert.deepEqual(decision.blockingReasonCodes, ["missing_prerequisites"]);
    assert.equal(decision.prerequisiteChecks[0].met, false);
    assert.equal(decision.prerequisiteSummary.requiredCount, 1);
    assert.equal(decision.prerequisiteSummary.missingCount, 1);
    assert.deepEqual(
        decision.blockingReasons.map((item) => item.code),
        ["missing_prerequisites"]
    );
});

test("prerequisiteMethod best_passed_attempt satisfies prerequisite if any passed attempt exists", () => {
    const decision = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            policy: { minimumEnrollmentCreditHours: 3 },
            targetSubject: {
                prerequisiteSubjectIds: ["subject-prereq-1"],
            },
            prerequisiteSubjects: [
                {
                    _id: "subject-prereq-1",
                    code: "CS101",
                    name: "Intro to CS",
                },
            ],
            academicOutcomeSummary: {
                outcomes: [
                    {
                        enrollmentId: "older-pass",
                        subjectId: "subject-prereq-1",
                        outcomeStatus: "passed_final",
                        percentage: 80,
                    },
                    {
                        enrollmentId: "later-fail",
                        subjectId: "subject-prereq-1",
                        outcomeStatus: "failed",
                        percentage: 50,
                    },
                ],
                summary: { cumulativeGpa: 2.5 },
            },
        })
    );

    assert.equal(decision.isEligible, true);
    assert.equal(decision.prerequisiteSummary.method, "best_passed_attempt");
    assert.equal(decision.prerequisiteChecks[0].met, true);
});

test("prerequisiteMethod latest_attempt evaluates the latest prerequisite attempt", () => {
    const decision = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            policy: {
                minimumEnrollmentCreditHours: 3,
                repeatPolicy: {
                    prerequisiteMethod: "latest_attempt",
                },
            },
            targetSubject: {
                prerequisiteSubjectIds: ["subject-prereq-1"],
            },
            prerequisiteSubjects: [
                {
                    _id: "subject-prereq-1",
                    code: "CS101",
                    name: "Intro to CS",
                },
            ],
            academicOutcomeSummary: {
                outcomes: [
                    {
                        enrollmentId: "older-pass",
                        subjectId: "subject-prereq-1",
                        outcomeStatus: "passed_final",
                        percentage: 80,
                        createdAt: new Date("2025-01-01T00:00:00.000Z"),
                    },
                    {
                        enrollmentId: "later-fail",
                        subjectId: "subject-prereq-1",
                        outcomeStatus: "failed",
                        percentage: 50,
                        createdAt: new Date("2026-01-01T00:00:00.000Z"),
                    },
                ],
                summary: { cumulativeGpa: 2.5 },
            },
        })
    );

    assert.equal(decision.isEligible, false);
    assert.deepEqual(decision.blockingReasonCodes, ["missing_prerequisites"]);
    assert.equal(decision.prerequisiteSummary.method, "latest_attempt");
    assert.equal(decision.prerequisiteChecks[0].outcomeStatus, "failed");
});

test("resolveSelfEnrollmentEligibility blocks a subject already passed final", () => {
    const decision = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            policy: { minimumEnrollmentCreditHours: 3 },
            academicOutcomeSummary: {
                outcomes: [
                    {
                        subjectId: "subject-target-1",
                        outcomeStatus: "passed_final",
                    },
                ],
            },
        })
    );

    assert.equal(decision.isEligible, false);
    assert.deepEqual(decision.blockingReasonCodes, ["same_subject_already_passed_final"]);
    assert.equal(decision.sameSubjectSummary.bestOutcomeStatus, "passed_final");
    assert.equal(decision.sameSubjectSummary.blockingReasonCode, "same_subject_already_passed_final");
});

test("allowGradeImprovementRepeats controls repeats after passed_improvable", () => {
    const allowedDecision = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            policy: { minimumEnrollmentCreditHours: 3 },
            academicOutcomeSummary: {
                outcomes: [
                    {
                        subjectId: "subject-target-1",
                        outcomeStatus: "passed_improvable",
                    },
                ],
                summary: { cumulativeGpa: 2.5 },
            },
        })
    );
    const blockedDecision = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            policy: {
                minimumEnrollmentCreditHours: 3,
                repeatPolicy: {
                    allowGradeImprovementRepeats: false,
                },
            },
            academicOutcomeSummary: {
                outcomes: [
                    {
                        subjectId: "subject-target-1",
                        outcomeStatus: "passed_improvable",
                    },
                ],
                summary: { cumulativeGpa: 2.5 },
            },
        })
    );

    assert.equal(allowedDecision.isEligible, true);
    assert.equal(blockedDecision.isEligible, false);
    assert.deepEqual(blockedDecision.blockingReasonCodes, ["repeat_blocked_grade_improvement_not_allowed"]);
});

test("blockRepeatAfterFinalPass controls repeats after passed_final", () => {
    const decision = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            policy: {
                minimumEnrollmentCreditHours: 3,
                repeatPolicy: {
                    blockRepeatAfterFinalPass: false,
                },
            },
            academicOutcomeSummary: {
                outcomes: [
                    {
                        subjectId: "subject-target-1",
                        outcomeStatus: "passed_final",
                    },
                ],
                summary: { cumulativeGpa: 2.5 },
            },
        })
    );

    assert.equal(decision.isEligible, true);
    assert.equal(decision.sameSubjectSummary.blockingReasonCode, null);
});

test("resolveSelfEnrollmentEligibility blocks projected load below the policy minimum", () => {
    const decision = resolveSelfEnrollmentEligibility(buildEligibilityContext());

    assert.equal(decision.isEligible, false);
    assert.deepEqual(decision.blockingReasonCodes, ["projected_credit_load_below_minimum_enrollment"]);
    assert.equal(decision.minimumEnrollmentCreditHours, 12);
    assert.equal(decision.loadSummary.belowMinimumEnrollment, true);
    assert.equal(decision.loadSummary.minimumEnrollmentCreditHours, 12);
});

test("resolveSelfEnrollmentEligibility blocks projected load above the allowed maximum", () => {
    const decision = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            policy: {
                minimumEnrollmentCreditHours: 3,
                defaultMaxCreditHours: 6,
                overloadMaxCreditHours: 9,
            },
            currentActiveSemesterSections: [
                {
                    _id: "section-current-1",
                    subjectId: "subject-current-1",
                },
            ],
            currentActiveSemesterSubjects: [
                {
                    _id: "subject-current-1",
                    creditHours: 6,
                },
            ],
        })
    );

    assert.equal(decision.isEligible, false);
    assert.deepEqual(decision.blockingReasonCodes, ["projected_credit_load_exceeds_max"]);
    assert.equal(decision.currentCreditHours, 6);
    assert.equal(decision.maxAllowedCreditHours, 6);
    assert.equal(decision.loadSummary.exceedsAllowedMax, true);
    assert.equal(decision.loadSummary.maxAllowedCreditHours, 6);
});

test("resolveSelfEnrollmentEligibility blocks a full section", () => {
    const decision = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            policy: { minimumEnrollmentCreditHours: 3 },
            currentSectionSeatCount: 30,
        })
    );

    assert.equal(decision.isEligible, false);
    assert.deepEqual(decision.blockingReasonCodes, ["section_full"]);
    assert.equal(decision.capacitySummary.remainingSeatCount, 0);
    assert.equal(decision.sectionCapacity.isFull, true);
    assert.deepEqual(
        decision.blockingReasons.map((item) => item.code),
        ["section_full"]
    );
});

test("resolveSelfEnrollmentEligibility can defer minimum-enrollment blocking to final submission", () => {
    const decision = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            enforceMinimumEnrollment: false,
        })
    );

    assert.equal(decision.isEligible, true);
    assert.deepEqual(decision.blockingReasonCodes, []);
    assert.ok(
        decision.warnings.some((item) => item.code === "projected_credit_load_below_minimum_enrollment")
    );
    assert.equal(decision.loadSummary.minimumEnrollmentCheckDeferredToSubmission, true);
});

test("resolveSelfEnrollmentSubmissionEligibility blocks combined projected load below minimum and keeps near-graduation exception deferred", () => {
    const decision = resolveSelfEnrollmentSubmissionEligibility({
        studentMembership: buildEligibilityContext().studentMembership,
        activeSemester: buildEligibilityContext().activeSemester,
        policy: buildPolicy(),
        academicOutcomeSummary: buildEligibilityContext().academicOutcomeSummary,
        currentActiveSemesterSections: [],
        currentActiveSemesterSubjects: [],
        selections: [buildSubmissionSelection()],
    });

    assert.equal(decision.isEligible, false);
    assert.deepEqual(decision.blockingReasonCodes, ["projected_credit_load_below_minimum_enrollment"]);
    assert.equal(decision.loadSummary.selectedCreditHours, 3);
    assert.equal(decision.loadSummary.projectedCreditHours, 3);
    assert.equal(decision.loadSummary.nearGraduationExceptionDeferred, true);
    assert.equal(decision.loadSummary.graduationRequirementDataAvailable, false);
    assert.ok(decision.warnings.some((item) => item.code === "near_graduation_exception_deferred"));
});

test("resolveSelfEnrollmentSubmissionEligibility blocks combined projected load above the allowed maximum", () => {
    const decision = resolveSelfEnrollmentSubmissionEligibility({
        studentMembership: buildEligibilityContext().studentMembership,
        activeSemester: buildEligibilityContext().activeSemester,
        policy: buildPolicy({
            minimumEnrollmentCreditHours: 3,
            defaultMaxCreditHours: 6,
            overloadMaxCreditHours: 9,
        }),
        academicOutcomeSummary: buildEligibilityContext({
            academicOutcomeSummary: {
                summary: {
                    cumulativeGpa: 2.5,
                },
            },
        }).academicOutcomeSummary,
        currentActiveSemesterSections: [
            {
                _id: "section-current-1",
                subjectId: "subject-current-1",
            },
        ],
        currentActiveSemesterSubjects: [
            {
                _id: "subject-current-1",
                creditHours: 3,
            },
        ],
        selections: [
            buildSubmissionSelection({
                targetSection: { _id: "section-submission-1", subjectId: "subject-submission-1" },
                targetSubject: { _id: "subject-submission-1", creditHours: 3 },
            }),
            buildSubmissionSelection({
                targetSection: { _id: "section-submission-2", subjectId: "subject-submission-2", code: "B" },
                targetSubject: { _id: "subject-submission-2", code: "CS202", name: "Algorithms", creditHours: 3 },
            }),
        ],
    });

    assert.equal(decision.isEligible, false);
    assert.deepEqual(decision.blockingReasonCodes, ["projected_credit_load_exceeds_max"]);
    assert.equal(decision.loadSummary.currentCreditHours, 3);
    assert.equal(decision.loadSummary.selectedCreditHours, 6);
    assert.equal(decision.loadSummary.projectedCreditHours, 9);
});

test("resolveSelfEnrollmentSubmissionEligibility blocks duplicate subjects in the submitted selection", () => {
    const decision = resolveSelfEnrollmentSubmissionEligibility({
        studentMembership: buildEligibilityContext().studentMembership,
        activeSemester: buildEligibilityContext().activeSemester,
        policy: buildPolicy({
            minimumEnrollmentCreditHours: 3,
        }),
        academicOutcomeSummary: buildEligibilityContext({
            academicOutcomeSummary: {
                summary: {
                    cumulativeGpa: 2.5,
                },
            },
        }).academicOutcomeSummary,
        currentActiveSemesterSections: [],
        currentActiveSemesterSubjects: [],
        selections: [
            buildSubmissionSelection({
                targetSection: { _id: "section-submission-1", subjectId: "subject-submission-1", code: "A" },
                targetSubject: { _id: "subject-submission-1", code: "CS201" },
            }),
            buildSubmissionSelection({
                targetSection: { _id: "section-submission-2", subjectId: "subject-submission-1", code: "B" },
                targetSubject: { _id: "subject-submission-1", code: "CS201" },
            }),
        ],
    });

    assert.equal(decision.isEligible, false);
    assert.deepEqual(decision.blockingReasonCodes, ["duplicate_subject_in_submission"]);
    assert.equal(decision.duplicateSubjectSummary.hasDuplicateSubjects, true);
    assert.equal(decision.duplicateSubjectSummary.duplicateSubjects[0].sectionIds.length, 2);
});

test("resolveSelfEnrollmentSubmissionEligibility keeps same-subject final-pass blocks from the shared outcome rules", () => {
    const decision = resolveSelfEnrollmentSubmissionEligibility({
        studentMembership: buildEligibilityContext().studentMembership,
        activeSemester: buildEligibilityContext().activeSemester,
        policy: buildPolicy({
            minimumEnrollmentCreditHours: 3,
        }),
        academicOutcomeSummary: {
            outcomes: [
                {
                    subjectId: "subject-submission-1",
                    outcomeStatus: "passed_final",
                },
            ],
            summary: {
                cumulativeGpa: 2.5,
            },
        },
        currentActiveSemesterSections: [],
        currentActiveSemesterSubjects: [],
        selections: [buildSubmissionSelection()],
    });

    assert.equal(decision.isEligible, false);
    assert.ok(decision.blockingReasonCodes.includes("same_subject_already_passed_final"));
    assert.equal(decision.sectionDecisions[0].eligibility.sameSubjectSummary.bestOutcomeStatus, "passed_final");
});
