const REPEAT_POLICY_GPA_CALCULATION_METHODS = [
    "all_attempts",
    "latest_attempt_only",
    "best_attempt_only",
    "replace_failed_with_passed",
];
const REPEAT_POLICY_EARNED_CREDITS_METHODS = [
    "count_once_per_subject",
    "count_each_passed_attempt",
];
const REPEAT_POLICY_PREREQUISITE_METHODS = [
    "best_passed_attempt",
    "latest_attempt",
];

const DEFAULT_REPEAT_POLICY = Object.freeze({
    enabled: true,
    gpaCalculationMethod: "best_attempt_only",
    earnedCreditsMethod: "count_once_per_subject",
    prerequisiteMethod: "best_passed_attempt",
    allowGradeImprovementRepeats: true,
    blockRepeatAfterFinalPass: true,
});

const LEGACY_REPEAT_POLICY = Object.freeze({
    enabled: false,
    gpaCalculationMethod: "all_attempts",
    earnedCreditsMethod: "count_each_passed_attempt",
    prerequisiteMethod: "best_passed_attempt",
    allowGradeImprovementRepeats: true,
    blockRepeatAfterFinalPass: true,
});

const REPEAT_POLICY_GPA_EXCLUSION_MESSAGES = {
    repeat_policy_latest_attempt_only:
        "This repeated attempt is excluded from official GPA because the active repeat policy counts only the latest finalized attempt for the subject.",
    repeat_policy_best_attempt_only:
        "This repeated attempt is excluded from official GPA because the active repeat policy counts only the best finalized attempt for the subject.",
    replaced_by_later_passed_attempt:
        "This failed repeated attempt is excluded from official GPA because a later passed attempt exists for the same subject.",
};

function normalizeId(value) {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed || null;
    }

    if (typeof value.toString === "function") {
        const normalized = value.toString().trim();
        return normalized || null;
    }

    return null;
}

function normalizeBoolean(value, fieldName) {
    if (typeof value !== "boolean") {
        throw new Error(`${fieldName} must be boolean`);
    }

    return value;
}

function normalizeEnum(value, fieldName, allowedValues) {
    if (typeof value !== "string" || !allowedValues.includes(value)) {
        throw new Error(`${fieldName} must be one of: ${allowedValues.join(", ")}`);
    }

    return value;
}

function validateRepeatPolicyInput(rawValue, { allowUndefined = false, useDefaults = true } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : { ...DEFAULT_REPEAT_POLICY };
    }

    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        throw new Error("repeatPolicy must be an object");
    }

    const repeatPolicy = useDefaults ? { ...DEFAULT_REPEAT_POLICY } : {};

    if (rawValue.enabled !== undefined) {
        repeatPolicy.enabled = normalizeBoolean(rawValue.enabled, "repeatPolicy.enabled");
    }

    if (rawValue.gpaCalculationMethod !== undefined) {
        repeatPolicy.gpaCalculationMethod = normalizeEnum(
            rawValue.gpaCalculationMethod,
            "repeatPolicy.gpaCalculationMethod",
            REPEAT_POLICY_GPA_CALCULATION_METHODS
        );
    }

    if (rawValue.earnedCreditsMethod !== undefined) {
        repeatPolicy.earnedCreditsMethod = normalizeEnum(
            rawValue.earnedCreditsMethod,
            "repeatPolicy.earnedCreditsMethod",
            REPEAT_POLICY_EARNED_CREDITS_METHODS
        );
    }

    if (rawValue.prerequisiteMethod !== undefined) {
        repeatPolicy.prerequisiteMethod = normalizeEnum(
            rawValue.prerequisiteMethod,
            "repeatPolicy.prerequisiteMethod",
            REPEAT_POLICY_PREREQUISITE_METHODS
        );
    }

    if (rawValue.allowGradeImprovementRepeats !== undefined) {
        repeatPolicy.allowGradeImprovementRepeats = normalizeBoolean(
            rawValue.allowGradeImprovementRepeats,
            "repeatPolicy.allowGradeImprovementRepeats"
        );
    }

    if (rawValue.blockRepeatAfterFinalPass !== undefined) {
        repeatPolicy.blockRepeatAfterFinalPass = normalizeBoolean(
            rawValue.blockRepeatAfterFinalPass,
            "repeatPolicy.blockRepeatAfterFinalPass"
        );
    }

    return repeatPolicy;
}

function resolveRepeatPolicy(policy = {}) {
    const rawRepeatPolicy = policy?.repeatPolicy;
    if (!rawRepeatPolicy) {
        return { ...DEFAULT_REPEAT_POLICY };
    }

    const mergedPolicy = {
        ...DEFAULT_REPEAT_POLICY,
        ...rawRepeatPolicy,
    };

    if (rawRepeatPolicy.enabled === false) {
        return { ...LEGACY_REPEAT_POLICY };
    }

    return {
        enabled: mergedPolicy.enabled !== false,
        gpaCalculationMethod: REPEAT_POLICY_GPA_CALCULATION_METHODS.includes(
            mergedPolicy.gpaCalculationMethod
        )
            ? mergedPolicy.gpaCalculationMethod
            : DEFAULT_REPEAT_POLICY.gpaCalculationMethod,
        earnedCreditsMethod: REPEAT_POLICY_EARNED_CREDITS_METHODS.includes(
            mergedPolicy.earnedCreditsMethod
        )
            ? mergedPolicy.earnedCreditsMethod
            : DEFAULT_REPEAT_POLICY.earnedCreditsMethod,
        prerequisiteMethod: REPEAT_POLICY_PREREQUISITE_METHODS.includes(
            mergedPolicy.prerequisiteMethod
        )
            ? mergedPolicy.prerequisiteMethod
            : DEFAULT_REPEAT_POLICY.prerequisiteMethod,
        allowGradeImprovementRepeats:
            typeof mergedPolicy.allowGradeImprovementRepeats === "boolean"
                ? mergedPolicy.allowGradeImprovementRepeats
                : DEFAULT_REPEAT_POLICY.allowGradeImprovementRepeats,
        blockRepeatAfterFinalPass:
            typeof mergedPolicy.blockRepeatAfterFinalPass === "boolean"
                ? mergedPolicy.blockRepeatAfterFinalPass
                : DEFAULT_REPEAT_POLICY.blockRepeatAfterFinalPass,
    };
}

function isPassingOutcome(outcome) {
    return ["passed_improvable", "passed_final"].includes(outcome?.outcomeStatus);
}

function isSameAttempt(left, right) {
    if (!left || !right) {
        return false;
    }

    const leftEnrollmentId = normalizeId(left.enrollmentId);
    const rightEnrollmentId = normalizeId(right.enrollmentId);
    if (leftEnrollmentId && rightEnrollmentId) {
        return leftEnrollmentId === rightEnrollmentId;
    }

    const leftSectionId = normalizeId(left.sectionId);
    const rightSectionId = normalizeId(right.sectionId);
    if (leftSectionId && rightSectionId) {
        return leftSectionId === rightSectionId;
    }

    return false;
}

function resolveAttemptTime(outcome, semesterById = new Map()) {
    const semester = semesterById.get(normalizeId(outcome?.semesterId)) || null;
    const semesterStart = semester?.startDate ? new Date(semester.startDate).getTime() : 0;
    const finalizedAt = outcome?.finalizedAt ? new Date(outcome.finalizedAt).getTime() : 0;
    const completedAt = outcome?.completedAt ? new Date(outcome.completedAt).getTime() : 0;
    const createdAt = outcome?.createdAt ? new Date(outcome.createdAt).getTime() : 0;

    return {
        semesterStart: Number.isFinite(semesterStart) ? semesterStart : 0,
        finalizedAt: Number.isFinite(finalizedAt) ? finalizedAt : 0,
        completedAt: Number.isFinite(completedAt) ? completedAt : 0,
        createdAt: Number.isFinite(createdAt) ? createdAt : 0,
        id: normalizeId(outcome?._id) || normalizeId(outcome?.enrollmentId) || normalizeId(outcome?.sectionId) || "",
    };
}

function compareAttemptsByAcademicOrder(left, right, semesterById = new Map()) {
    const leftTime = resolveAttemptTime(left, semesterById);
    const rightTime = resolveAttemptTime(right, semesterById);

    return (
        leftTime.semesterStart - rightTime.semesterStart ||
        leftTime.finalizedAt - rightTime.finalizedAt ||
        leftTime.completedAt - rightTime.completedAt ||
        leftTime.createdAt - rightTime.createdAt ||
        leftTime.id.localeCompare(rightTime.id)
    );
}

function groupAttemptsBySubject(outcomes = []) {
    const outcomesBySubjectId = new Map();
    for (const outcome of outcomes) {
        const subjectId = normalizeId(outcome?.subjectId);
        if (!subjectId) {
            continue;
        }

        if (!outcomesBySubjectId.has(subjectId)) {
            outcomesBySubjectId.set(subjectId, []);
        }

        outcomesBySubjectId.get(subjectId).push(outcome);
    }

    return outcomesBySubjectId;
}

function applyGpaRepeatPolicy({
    outcomes = [],
    repeatPolicy,
    semesterById = new Map(),
    resolveBestAttempt,
}) {
    const resolvedRepeatPolicy = resolveRepeatPolicy({ repeatPolicy });
    const outcomesBySubjectId = groupAttemptsBySubject(outcomes);
    const includedAttemptKeys = new Set();
    const exclusionByAttemptKey = new Map();

    for (const subjectOutcomes of outcomesBySubjectId.values()) {
        const orderedAttempts = [...subjectOutcomes].sort((left, right) =>
            compareAttemptsByAcademicOrder(left, right, semesterById)
        );

        let includedAttempts = [...orderedAttempts];
        let excludedReasonCode = null;
        if (resolvedRepeatPolicy.gpaCalculationMethod === "latest_attempt_only") {
            includedAttempts = orderedAttempts.length ? [orderedAttempts[orderedAttempts.length - 1]] : [];
            excludedReasonCode = "repeat_policy_latest_attempt_only";
        } else if (resolvedRepeatPolicy.gpaCalculationMethod === "best_attempt_only") {
            const bestAttempt = resolveBestAttempt ? resolveBestAttempt(orderedAttempts) : orderedAttempts[0];
            includedAttempts = bestAttempt ? [bestAttempt] : [];
            excludedReasonCode = "repeat_policy_best_attempt_only";
        } else if (resolvedRepeatPolicy.gpaCalculationMethod === "replace_failed_with_passed") {
            includedAttempts = orderedAttempts.filter((attempt, index) => {
                if (attempt?.outcomeStatus !== "failed") {
                    return true;
                }

                return !orderedAttempts.slice(index + 1).some(isPassingOutcome);
            });
            excludedReasonCode = "replaced_by_later_passed_attempt";
        }

        for (const attempt of includedAttempts) {
            const attemptKey = normalizeId(attempt.enrollmentId) || normalizeId(attempt.sectionId);
            if (attemptKey) {
                includedAttemptKeys.add(attemptKey);
            }
        }

        if (excludedReasonCode) {
            for (const attempt of orderedAttempts) {
                const attemptKey = normalizeId(attempt.enrollmentId) || normalizeId(attempt.sectionId);
                if (attemptKey && !includedAttemptKeys.has(attemptKey)) {
                    exclusionByAttemptKey.set(attemptKey, {
                        reasonCode: excludedReasonCode,
                        message: REPEAT_POLICY_GPA_EXCLUSION_MESSAGES[excludedReasonCode],
                    });
                }
            }
        }
    }

    return outcomes.map((outcome) => {
        const attemptKey = normalizeId(outcome.enrollmentId) || normalizeId(outcome.sectionId);
        const exclusion = attemptKey ? exclusionByAttemptKey.get(attemptKey) || null : null;
        return {
            ...outcome,
            includedInOfficialGpa: !exclusion,
            gpaExcludedReasonCode: exclusion?.reasonCode || null,
            gpaExcludedReason: exclusion?.message || null,
        };
    });
}

function applyEarnedCreditRepeatPolicy({
    outcomes = [],
    repeatPolicy,
    semesterById = new Map(),
    resolveBestAttempt,
}) {
    const resolvedRepeatPolicy = resolveRepeatPolicy({ repeatPolicy });
    if (resolvedRepeatPolicy.earnedCreditsMethod === "count_each_passed_attempt") {
        return outcomes.map((outcome) => ({
            ...outcome,
            officialEarnedCreditHours: outcome.earnedCreditHours,
            earnedCreditsCounted: Number(outcome.earnedCreditHours) > 0,
            earnedCreditExcludedReasonCode: null,
            earnedCreditExcludedReason: null,
        }));
    }

    const countedAttemptKeys = new Set();
    for (const subjectOutcomes of groupAttemptsBySubject(outcomes).values()) {
        const passedAttempts = subjectOutcomes.filter(isPassingOutcome);
        if (!passedAttempts.length) {
            continue;
        }

        const bestPassedAttempt = resolveBestAttempt
            ? resolveBestAttempt(passedAttempts)
            : [...passedAttempts].sort((left, right) => compareAttemptsByAcademicOrder(right, left, semesterById))[0];
        const attemptKey =
            normalizeId(bestPassedAttempt?.enrollmentId) || normalizeId(bestPassedAttempt?.sectionId);
        if (attemptKey) {
            countedAttemptKeys.add(attemptKey);
        }
    }

    return outcomes.map((outcome) => {
        const attemptKey = normalizeId(outcome.enrollmentId) || normalizeId(outcome.sectionId);
        const isPassedAttempt = isPassingOutcome(outcome);
        const earnedCreditsCounted = isPassedAttempt && countedAttemptKeys.has(attemptKey);
        const duplicatePassedAttempt = isPassedAttempt && !earnedCreditsCounted;

        return {
            ...outcome,
            officialEarnedCreditHours: earnedCreditsCounted ? outcome.earnedCreditHours : 0,
            earnedCreditsCounted,
            earnedCreditExcludedReasonCode: duplicatePassedAttempt ? "duplicate_earned_credit_subject" : null,
            earnedCreditExcludedReason: duplicatePassedAttempt
                ? "This repeated passed attempt does not add earned credits because the active repeat policy counts degree credits once per subject."
                : null,
        };
    });
}

function resolvePrerequisiteOutcomeStatus({ outcomes = [], repeatPolicy, semesterById = new Map(), resolveBestAttempt }) {
    const resolvedRepeatPolicy = resolveRepeatPolicy({ repeatPolicy });
    const comparableOutcomes = Array.isArray(outcomes) ? outcomes.filter(Boolean) : [];
    if (!comparableOutcomes.length) {
        return null;
    }

    if (resolvedRepeatPolicy.prerequisiteMethod === "latest_attempt") {
        const latestAttempt = [...comparableOutcomes].sort((left, right) =>
            compareAttemptsByAcademicOrder(right, left, semesterById)
        )[0];
        return latestAttempt?.outcomeStatus || null;
    }

    const passedAttempts = comparableOutcomes.filter(isPassingOutcome);
    if (!passedAttempts.length) {
        return null;
    }

    const bestPassedAttempt = resolveBestAttempt
        ? resolveBestAttempt(passedAttempts)
        : passedAttempts[0];
    return bestPassedAttempt?.outcomeStatus || null;
}

module.exports = {
    DEFAULT_REPEAT_POLICY,
    LEGACY_REPEAT_POLICY,
    REPEAT_POLICY_GPA_CALCULATION_METHODS,
    REPEAT_POLICY_EARNED_CREDITS_METHODS,
    REPEAT_POLICY_PREREQUISITE_METHODS,
    applyEarnedCreditRepeatPolicy,
    applyGpaRepeatPolicy,
    compareAttemptsByAcademicOrder,
    isPassingOutcome,
    resolvePrerequisiteOutcomeStatus,
    resolveRepeatPolicy,
    validateRepeatPolicyInput,
};
