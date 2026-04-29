const {
    SCHOOL_ACADEMIC_POLICY_PROMOTION_DECISIONS,
} = require("./schoolAcademicPolicyService");

const SCHOOL_PROMOTION_REASON_CODES = {
    MISSING_REQUIRED_RESULTS: "MISSING_REQUIRED_RESULTS",
    CRITICAL_SUBJECT_FAILED: "CRITICAL_SUBJECT_FAILED",
    FAILED_SUBJECT_COUNT_LIMIT_REACHED: "FAILED_SUBJECT_COUNT_LIMIT_REACHED",
    YEAR_AVERAGE_BELOW_MINIMUM: "YEAR_AVERAGE_BELOW_MINIMUM",
};

const PROMOTING_DECISIONS = ["promoted", "conditional_promotion"];

function createError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

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

function isValidPromotionDecision(value) {
    return SCHOOL_ACADEMIC_POLICY_PROMOTION_DECISIONS.includes(value);
}

function createReasonItem(code, details = {}) {
    return {
        code,
        ...details,
    };
}

function ensurePolicy(policy) {
    if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
        throw createError(400, "policy is required");
    }

    if (!policy.promotionRules || typeof policy.promotionRules !== "object") {
        throw createError(400, "policy.promotionRules is required");
    }

    if (!isValidPromotionDecision(policy.promotionRules.passDecision)) {
        throw createError(400, "policy.promotionRules.passDecision is invalid");
    }

    if (!isValidPromotionDecision(policy.promotionRules.failDecision)) {
        throw createError(400, "policy.promotionRules.failDecision is invalid");
    }

    const yearPassMinPercentage = Number(policy.gradingRules?.yearPassMinPercentage);
    if (!Number.isFinite(yearPassMinPercentage)) {
        throw createError(400, "policy.gradingRules.yearPassMinPercentage is required");
    }
}

function ensureStudentYearOutcome(studentYearOutcome) {
    if (!studentYearOutcome || typeof studentYearOutcome !== "object" || Array.isArray(studentYearOutcome)) {
        throw createError(400, "studentYearOutcome is required");
    }
}

function resolveManualReviewOrFailDecision(policy) {
    if (policy.promotionRules.allowManualReview !== false) {
        return "manual_review";
    }

    return policy.promotionRules.failDecision;
}

function resolveConfiguredFailActionDecision({ failAction, policy }) {
    if (failAction && failAction !== "warning" && isValidPromotionDecision(failAction)) {
        return failAction;
    }

    return policy.promotionRules.failDecision;
}

function isAllowedToPromote(decision) {
    return PROMOTING_DECISIONS.includes(decision);
}

function getCriticalSubjectRuleBySubjectId(policy) {
    const rules = Array.isArray(policy.failureRules?.criticalSubjectRules)
        ? policy.failureRules.criticalSubjectRules
        : [];

    return new Map(
        rules
            .map((rule) => [normalizeId(rule?.subjectId), rule])
            .filter(([subjectId]) => Boolean(subjectId))
    );
}

function getFailedSubjectOutcomes(studentYearOutcome) {
    return Array.isArray(studentYearOutcome.subjects)
        ? studentYearOutcome.subjects.filter((subjectOutcome) =>
              Boolean(subjectOutcome?.failedBasedOnAvailableResults || subjectOutcome?.failed)
          )
        : [];
}

function resolveEffectiveFailedSubjectCount({ studentYearOutcome, policy }) {
    const failedSubjects = getFailedSubjectOutcomes(studentYearOutcome);
    if (policy.failureRules?.countCriticalSubjectsInFailedSubjectTotal !== false) {
        return Number.isInteger(studentYearOutcome.failedSubjectCount)
            ? studentYearOutcome.failedSubjectCount
            : failedSubjects.length;
    }

    const criticalSubjectRuleBySubjectId = getCriticalSubjectRuleBySubjectId(policy);
    return failedSubjects.filter(
        (subjectOutcome) => !criticalSubjectRuleBySubjectId.has(normalizeId(subjectOutcome.subjectId))
    ).length;
}

function buildDecision({ decision, reasons, warnings, allowedToPromote = isAllowedToPromote(decision) }) {
    return {
        decision,
        allowedToPromote,
        reasonCodes: reasons.map((reason) => reason.code),
        reasons,
        warnings,
    };
}

function resolveSchoolPromotionDecision({ studentYearOutcome, policy }) {
    ensureStudentYearOutcome(studentYearOutcome);
    ensurePolicy(policy);

    const reasons = [];
    const warnings = [];
    const missingResults = Array.isArray(studentYearOutcome.missingResults)
        ? studentYearOutcome.missingResults
        : [];
    const hasMissingResults =
        studentYearOutcome.hasMissingResults === true ||
        studentYearOutcome.complete === false ||
        missingResults.length > 0 ||
        !Number.isFinite(Number(studentYearOutcome.yearlyAveragePercentage));

    if (hasMissingResults) {
        reasons.push(
            createReasonItem(SCHOOL_PROMOTION_REASON_CODES.MISSING_REQUIRED_RESULTS, {
                missingResultCount: missingResults.length,
                complete: studentYearOutcome.complete === true,
            })
        );
        warnings.push(
            createReasonItem(SCHOOL_PROMOTION_REASON_CODES.MISSING_REQUIRED_RESULTS, {
                message: "Promotion decision requires manual review because required result data is incomplete.",
            })
        );

        return buildDecision({
            decision: resolveManualReviewOrFailDecision(policy),
            reasons,
            warnings,
        });
    }

    const criticalFailedSubjects = Array.isArray(studentYearOutcome.criticalFailedSubjects)
        ? studentYearOutcome.criticalFailedSubjects
        : [];
    if (policy.failureRules?.failIfAnyCriticalSubjectFailed === true && criticalFailedSubjects.length) {
        const primaryCriticalFailure = criticalFailedSubjects[0];
        const decision = resolveConfiguredFailActionDecision({
            failAction: primaryCriticalFailure.failAction,
            policy,
        });

        reasons.push(
            createReasonItem(SCHOOL_PROMOTION_REASON_CODES.CRITICAL_SUBJECT_FAILED, {
                criticalFailedSubjectCount: criticalFailedSubjects.length,
                criticalFailedSubjects: criticalFailedSubjects.map((subject) => ({
                    subjectId: normalizeId(subject.subjectId),
                    yearlyPercentage: subject.yearlyPercentage ?? null,
                    failAction: subject.failAction || null,
                })),
            })
        );

        if (primaryCriticalFailure.failAction === "warning") {
            warnings.push(
                createReasonItem(SCHOOL_PROMOTION_REASON_CODES.CRITICAL_SUBJECT_FAILED, {
                    message:
                        "Critical subject failAction is warning, but failIfAnyCriticalSubjectFailed is enabled; failDecision was used.",
                })
            );
        }

        return buildDecision({
            decision,
            reasons,
            warnings,
        });
    }

    const failedSubjectThreshold = policy.failureRules?.failIfFailedSubjectCountAtLeast;
    const effectiveFailedSubjectCount = resolveEffectiveFailedSubjectCount({
        studentYearOutcome,
        policy,
    });
    if (
        Number.isInteger(failedSubjectThreshold) &&
        failedSubjectThreshold > 0 &&
        effectiveFailedSubjectCount >= failedSubjectThreshold
    ) {
        reasons.push(
            createReasonItem(SCHOOL_PROMOTION_REASON_CODES.FAILED_SUBJECT_COUNT_LIMIT_REACHED, {
                failedSubjectCount: effectiveFailedSubjectCount,
                failIfFailedSubjectCountAtLeast: failedSubjectThreshold,
            })
        );

        return buildDecision({
            decision: policy.promotionRules.failDecision,
            reasons,
            warnings,
        });
    }

    const yearlyAveragePercentage = Number(studentYearOutcome.yearlyAveragePercentage);
    const yearPassMinPercentage = Number(policy.gradingRules.yearPassMinPercentage);
    if (yearlyAveragePercentage < yearPassMinPercentage) {
        reasons.push(
            createReasonItem(SCHOOL_PROMOTION_REASON_CODES.YEAR_AVERAGE_BELOW_MINIMUM, {
                yearlyAveragePercentage,
                yearPassMinPercentage,
            })
        );

        return buildDecision({
            decision: policy.promotionRules.failDecision,
            reasons,
            warnings,
        });
    }

    return buildDecision({
        decision: policy.promotionRules.passDecision,
        reasons,
        warnings,
    });
}

module.exports = {
    SCHOOL_PROMOTION_REASON_CODES,
    resolveSchoolPromotionDecision,
};
