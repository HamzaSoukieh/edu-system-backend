const ACADEMIC_STANDING_GPA_BAND_STATUSES = [
    "good_standing",
    "academic_warning",
    "probation",
    "suspension",
];
const ACADEMIC_STANDING_SYSTEM_STATUSES = ["no_standing_yet", "review_required"];
const DEFAULT_GPA_SCALE_MAX = 4;
const POLICY_EPSILON = 1e-9;

const DEFAULT_ACADEMIC_STANDING_BANDS = Object.freeze([
    Object.freeze({
        standing: "good_standing",
        minCumulativeGpa: 2,
        allowedToContinue: true,
        requiresAdvisorReview: false,
    }),
    Object.freeze({
        standing: "academic_warning",
        minCumulativeGpa: 1.7,
        maxCumulativeGpaExclusive: 2,
        allowedToContinue: true,
        requiresAdvisorReview: false,
    }),
    Object.freeze({
        standing: "probation",
        minCumulativeGpa: 1,
        maxCumulativeGpaExclusive: 1.7,
        allowedToContinue: true,
        requiresAdvisorReview: true,
    }),
    Object.freeze({
        standing: "suspension",
        maxCumulativeGpaExclusive: 1,
        allowedToContinue: false,
        requiresAdvisorReview: true,
    }),
]);

const DEFAULT_ACADEMIC_STANDING_RULES = Object.freeze({
    enabled: true,
    bands: DEFAULT_ACADEMIC_STANDING_BANDS,
    requireManualReviewIfIncompleteProfile: true,
    noOutcomeStanding: "no_standing_yet",
    allowManualReview: true,
});

const REVIEW_BLOCKING_EXCLUSION_CODES = new Set([
    "assessment_not_published",
    "invalid_assessment_configuration",
    "incomplete_assessment_weight_total",
    "missing_academic_policy",
    "invalid_credit_hours",
    "missing_assessment_result",
]);

const REASON_CODE_BY_STANDING = {
    good_standing: "cumulative_gpa_in_good_standing_range",
    academic_warning: "cumulative_gpa_in_academic_warning_range",
    probation: "cumulative_gpa_in_probation_range",
    suspension: "cumulative_gpa_in_suspension_range",
};

function cloneBand(band) {
    const normalized = {
        standing: band.standing,
        allowedToContinue: band.allowedToContinue,
        requiresAdvisorReview: band.requiresAdvisorReview,
    };

    if (band.minCumulativeGpa !== undefined) {
        normalized.minCumulativeGpa = band.minCumulativeGpa;
    }

    if (band.maxCumulativeGpaExclusive !== undefined) {
        normalized.maxCumulativeGpaExclusive = band.maxCumulativeGpaExclusive;
    }

    return normalized;
}

function cloneAcademicStandingRules(rules = DEFAULT_ACADEMIC_STANDING_RULES) {
    return {
        enabled: rules.enabled !== false,
        bands: Array.isArray(rules.bands)
            ? sortStandingBandsAscending(rules.bands.map(cloneBand), DEFAULT_GPA_SCALE_MAX)
            : sortStandingBandsAscending(DEFAULT_ACADEMIC_STANDING_BANDS.map(cloneBand), DEFAULT_GPA_SCALE_MAX),
        requireManualReviewIfIncompleteProfile:
            rules.requireManualReviewIfIncompleteProfile !== false,
        noOutcomeStanding: rules.noOutcomeStanding || "no_standing_yet",
        allowManualReview: rules.allowManualReview !== false,
    };
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

function normalizeBoundedNumber(value, fieldName, { min = 0, max = DEFAULT_GPA_SCALE_MAX } = {}) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < min || normalized > max) {
        throw new Error(`${fieldName} must be a number between ${min} and ${max}`);
    }

    return normalized;
}

function getBandLowerBound(band) {
    return band.minCumulativeGpa ?? 0;
}

function getBandUpperBound(band, gpaScaleMax) {
    return band.maxCumulativeGpaExclusive ?? gpaScaleMax;
}

function sortStandingBandsAscending(bands, gpaScaleMax) {
    return [...bands].sort((left, right) => {
        const lowerDifference = getBandLowerBound(left) - getBandLowerBound(right);
        if (Math.abs(lowerDifference) > POLICY_EPSILON) {
            return lowerDifference;
        }

        return getBandUpperBound(left, gpaScaleMax) - getBandUpperBound(right, gpaScaleMax);
    });
}

function validateAcademicStandingBand(rawBand, index, gpaScaleMax) {
    if (!rawBand || typeof rawBand !== "object" || Array.isArray(rawBand)) {
        throw new Error(`academicStandingRules.bands[${index}] must be an object`);
    }

    const band = {
        standing: normalizeEnum(
            rawBand.standing,
            `academicStandingRules.bands[${index}].standing`,
            ACADEMIC_STANDING_GPA_BAND_STATUSES
        ),
        allowedToContinue: normalizeBoolean(
            rawBand.allowedToContinue,
            `academicStandingRules.bands[${index}].allowedToContinue`
        ),
        requiresAdvisorReview: normalizeBoolean(
            rawBand.requiresAdvisorReview,
            `academicStandingRules.bands[${index}].requiresAdvisorReview`
        ),
    };

    if (
        rawBand.minCumulativeGpa === undefined &&
        rawBand.maxCumulativeGpaExclusive === undefined
    ) {
        throw new Error(`academicStandingRules.bands[${index}] must have at least one GPA bound`);
    }

    if (rawBand.minCumulativeGpa !== undefined) {
        band.minCumulativeGpa = normalizeBoundedNumber(
            rawBand.minCumulativeGpa,
            `academicStandingRules.bands[${index}].minCumulativeGpa`,
            { max: gpaScaleMax }
        );
    }

    if (rawBand.maxCumulativeGpaExclusive !== undefined) {
        band.maxCumulativeGpaExclusive = normalizeBoundedNumber(
            rawBand.maxCumulativeGpaExclusive,
            `academicStandingRules.bands[${index}].maxCumulativeGpaExclusive`,
            { max: gpaScaleMax }
        );
    }

    const lowerBound = getBandLowerBound(band);
    const upperBound = getBandUpperBound(band, gpaScaleMax);
    if (upperBound <= lowerBound + POLICY_EPSILON) {
        throw new Error(
            `academicStandingRules.bands[${index}].maxCumulativeGpaExclusive must be greater than minCumulativeGpa`
        );
    }

    return band;
}

function validateAcademicStandingBands(rawBands, { gpaScaleMax = DEFAULT_GPA_SCALE_MAX } = {}) {
    if (!Array.isArray(rawBands) || !rawBands.length) {
        throw new Error("academicStandingRules.bands must be a non-empty array");
    }

    const bands = rawBands.map((band, index) =>
        validateAcademicStandingBand(band, index, gpaScaleMax)
    );
    if (!bands.some((band) => band.standing === "good_standing")) {
        throw new Error("academicStandingRules.bands must include a good_standing band");
    }

    const sortedBands = sortStandingBandsAscending(bands, gpaScaleMax);
    if (Math.abs(getBandLowerBound(sortedBands[0]) - 0) > POLICY_EPSILON) {
        throw new Error("academicStandingRules.bands must start at GPA 0");
    }

    const lastBand = sortedBands[sortedBands.length - 1];
    if (Math.abs(getBandUpperBound(lastBand, gpaScaleMax) - gpaScaleMax) > POLICY_EPSILON) {
        throw new Error(`academicStandingRules.bands must end at GPA ${gpaScaleMax}`);
    }

    for (let index = 1; index < sortedBands.length; index += 1) {
        const previousBand = sortedBands[index - 1];
        const currentBand = sortedBands[index];
        const previousUpper = getBandUpperBound(previousBand, gpaScaleMax);
        const currentLower = getBandLowerBound(currentBand);

        if (currentLower < previousUpper - POLICY_EPSILON) {
            throw new Error("academicStandingRules.bands must be non-overlapping");
        }

        if (Math.abs(currentLower - previousUpper) > POLICY_EPSILON) {
            throw new Error(
                `academicStandingRules.bands must fully cover GPA 0 to ${gpaScaleMax} without gaps`
            );
        }
    }

    return sortedBands;
}

function validateAcademicStandingRulesInput(
    rawValue,
    {
        allowUndefined = false,
        useDefaults = true,
        requireCompleteWhenEnabled = true,
        gpaScaleMax = DEFAULT_GPA_SCALE_MAX,
    } = {}
) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : cloneAcademicStandingRules();
    }

    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        throw new Error("academicStandingRules must be an object");
    }

    const rules = useDefaults ? cloneAcademicStandingRules() : {};

    if (rawValue.enabled !== undefined) {
        rules.enabled = normalizeBoolean(rawValue.enabled, "academicStandingRules.enabled");
    }

    if (rawValue.bands !== undefined) {
        rules.bands = validateAcademicStandingBands(rawValue.bands, { gpaScaleMax });
    }

    if (rawValue.requireManualReviewIfIncompleteProfile !== undefined) {
        rules.requireManualReviewIfIncompleteProfile = normalizeBoolean(
            rawValue.requireManualReviewIfIncompleteProfile,
            "academicStandingRules.requireManualReviewIfIncompleteProfile"
        );
    }

    if (rawValue.noOutcomeStanding !== undefined) {
        rules.noOutcomeStanding = normalizeEnum(
            rawValue.noOutcomeStanding,
            "academicStandingRules.noOutcomeStanding",
            ["no_standing_yet"]
        );
    }

    if (rawValue.allowManualReview !== undefined) {
        rules.allowManualReview = normalizeBoolean(
            rawValue.allowManualReview,
            "academicStandingRules.allowManualReview"
        );
    }

    const enabled = rules.enabled !== false;
    if (enabled && requireCompleteWhenEnabled && !Array.isArray(rules.bands)) {
        throw new Error("academicStandingRules.bands must be a non-empty array when enabled");
    }

    return rules;
}

function resolveAcademicStandingRules(policy = {}) {
    const rawRules = policy?.academicStandingRules;
    if (!rawRules) {
        return cloneAcademicStandingRules();
    }

    try {
        return validateAcademicStandingRulesInput(
            {
                ...cloneAcademicStandingRules(),
                ...rawRules,
                bands: rawRules.bands || cloneAcademicStandingRules().bands,
            },
            { allowUndefined: false, useDefaults: true }
        );
    } catch (_error) {
        return cloneAcademicStandingRules();
    }
}

function hasReviewBlockingProfileIssue(excluded = []) {
    return (Array.isArray(excluded) ? excluded : []).some((item) =>
        REVIEW_BLOCKING_EXCLUSION_CODES.has(item?.reasonCode || item?.code)
    );
}

function buildSystemStanding({
    standing,
    reasonCodes,
    allowedToContinue = null,
    requiresAdvisorReview = false,
    warnings = [],
    appliedBand = null,
    enabled = true,
}) {
    return {
        enabled,
        standing,
        allowedToContinue,
        requiresAdvisorReview,
        reasonCodes,
        warnings,
        appliedBand,
        calculationMode: "live",
        source: "academic_profile",
    };
}

function doesBandMatchGpa(band, cumulativeGpa, gpaScaleMax = DEFAULT_GPA_SCALE_MAX) {
    const hasOpenUpperBound = band.maxCumulativeGpaExclusive === undefined;
    const upperBound = getBandUpperBound(band, gpaScaleMax);
    const reachesScaleMax = Math.abs(upperBound - gpaScaleMax) <= POLICY_EPSILON;
    return (
        cumulativeGpa >= getBandLowerBound(band) - POLICY_EPSILON &&
        (cumulativeGpa < upperBound - POLICY_EPSILON ||
            ((hasOpenUpperBound || reachesScaleMax) && cumulativeGpa <= gpaScaleMax + POLICY_EPSILON))
    );
}

function resolveAcademicStanding({
    academicStandingRules,
    summary = {},
    outcomes = [],
    excluded = [],
    warnings = [],
} = {}) {
    const rules = resolveAcademicStandingRules({ academicStandingRules });

    if (rules.enabled === false) {
        return buildSystemStanding({
            enabled: false,
            standing: null,
            reasonCodes: ["standing_rules_disabled"],
        });
    }

    const cumulativeGpa = summary?.cumulativeGpa;
    if (!Array.isArray(outcomes) || !outcomes.length || !Number.isFinite(cumulativeGpa)) {
        return buildSystemStanding({
            standing: rules.noOutcomeStanding,
            reasonCodes: ["no_finalized_academic_outcomes"],
        });
    }

    if (
        rules.requireManualReviewIfIncompleteProfile === true &&
        hasReviewBlockingProfileIssue(excluded)
    ) {
        return buildSystemStanding({
            standing: "review_required",
            requiresAdvisorReview: true,
            reasonCodes: ["incomplete_academic_profile_requires_review"],
            warnings: (Array.isArray(warnings) ? warnings : []).filter(Boolean),
        });
    }

    const matchedBand = rules.bands.find((band) => doesBandMatchGpa(band, cumulativeGpa));
    if (!matchedBand) {
        return buildSystemStanding({
            standing: "review_required",
            requiresAdvisorReview: true,
            reasonCodes: ["no_matching_academic_standing_band"],
            warnings: [
                {
                    code: "no_matching_academic_standing_band",
                    message:
                        "No configured academic standing band matched the student's cumulative GPA.",
                },
            ],
        });
    }

    return buildSystemStanding({
        standing: matchedBand.standing,
        allowedToContinue: matchedBand.allowedToContinue,
        requiresAdvisorReview: matchedBand.requiresAdvisorReview,
        reasonCodes: [REASON_CODE_BY_STANDING[matchedBand.standing]],
        appliedBand: cloneBand(matchedBand),
    });
}

module.exports = {
    ACADEMIC_STANDING_GPA_BAND_STATUSES,
    ACADEMIC_STANDING_SYSTEM_STATUSES,
    DEFAULT_ACADEMIC_STANDING_RULES,
    DEFAULT_ACADEMIC_STANDING_BANDS,
    cloneAcademicStandingRules,
    resolveAcademicStanding,
    resolveAcademicStandingRules,
    validateAcademicStandingRulesInput,
};
