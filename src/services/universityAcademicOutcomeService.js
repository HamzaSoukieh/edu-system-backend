const mongoose = require("mongoose");
const Assessment = require("../models/Assessment");
const AssessmentResult = require("../models/AssessmentResult");
const Enrollment = require("../models/Enrollment");
const Section = require("../models/Section");
const Subject = require("../models/Subject");
const {
    POLICY_EPSILON,
    resolveAcademicPolicyForSemester,
} = require("./universityAcademicPolicyService");

const FINALIZED_SECTION_WEIGHT_TOTAL = 100;
const CLOSED_SECTION_STATUS = "closed";
const PUBLISHED_ASSESSMENT_STATUS = "published";
const ACADEMIC_OUTCOME_STATUS_PRIORITY = {
    failed: 1,
    passed_improvable: 2,
    passed_final: 3,
};

function createError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeId(value) {
    if (!value) {
        return null;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed || null;
    }

    if (typeof value.toString === "function") {
        const asString = value.toString().trim();
        return asString || null;
    }

    return null;
}

function isValidObjectId(value) {
    const normalized = normalizeId(value);
    return Boolean(normalized) && mongoose.Types.ObjectId.isValid(normalized);
}

function calculateWeightedContribution({ score, maxScore, weight }) {
    if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || !Number.isFinite(weight)) {
        return 0;
    }

    return (score / maxScore) * weight;
}

function normalizeComputedNumber(value, { digits = 12 } = {}) {
    if (!Number.isFinite(value)) {
        return value;
    }

    const roundedValue = Number(value.toFixed(digits));
    const nearestInteger = Math.round(roundedValue);
    if (Math.abs(roundedValue - nearestInteger) <= POLICY_EPSILON) {
        return nearestInteger;
    }

    return Math.abs(roundedValue) <= POLICY_EPSILON ? 0 : roundedValue;
}

function isFinalizedWeightTotal(weightTotal) {
    return Math.abs(weightTotal - FINALIZED_SECTION_WEIGHT_TOTAL) <= POLICY_EPSILON;
}

function buildExclusion({
    reasonCode,
    message,
    enrollmentId = null,
    sectionId = null,
    semesterId = null,
    subjectId = null,
    assessmentId = null,
    studentMembershipId = null,
}) {
    return {
        reasonCode,
        message,
        ...(normalizeId(enrollmentId) ? { enrollmentId: normalizeId(enrollmentId) } : {}),
        ...(normalizeId(sectionId) ? { sectionId: normalizeId(sectionId) } : {}),
        ...(normalizeId(semesterId) ? { semesterId: normalizeId(semesterId) } : {}),
        ...(normalizeId(subjectId) ? { subjectId: normalizeId(subjectId) } : {}),
        ...(normalizeId(assessmentId) ? { assessmentId: normalizeId(assessmentId) } : {}),
        ...(normalizeId(studentMembershipId) ? { studentMembershipId: normalizeId(studentMembershipId) } : {}),
    };
}

function uniqueExclusions(exclusions = []) {
    const seen = new Set();
    return exclusions.filter((exclusion) => {
        const key = [
            exclusion.reasonCode,
            exclusion.enrollmentId,
            exclusion.sectionId,
            exclusion.semesterId,
            exclusion.subjectId,
            exclusion.assessmentId,
            exclusion.studentMembershipId,
        ].join("|");
        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

function hasInvalidPublishedAssessmentConfiguration(assessment) {
    return (
        !Number.isFinite(assessment?.maxScore) ||
        assessment.maxScore <= 0 ||
        !Number.isFinite(assessment?.weight) ||
        assessment.weight <= 0
    );
}

function collectMissingResultExclusions({
    enrollment,
    section,
    sectionAssessments = [],
    enrollmentResults = [],
}) {
    const resultsByAssessmentId = new Map(
        enrollmentResults.map((result) => [normalizeId(result.assessmentId), result])
    );

    return sectionAssessments
        .filter((assessment) => !hasInvalidPublishedAssessmentConfiguration(assessment))
        .map((assessment) => {
            const assessmentId = normalizeId(assessment._id);
            const result = resultsByAssessmentId.get(assessmentId) || null;
            if (result && Number.isFinite(result.score)) {
                return null;
            }

            return buildExclusion({
                reasonCode: "missing_assessment_result",
                message: "A published assessment is missing a recorded score, so this enrollment is not included in official GPA.",
                enrollmentId: enrollment._id,
                sectionId: section._id,
                semesterId: section.semesterId,
                subjectId: section.subjectId,
                assessmentId,
                studentMembershipId: enrollment.studentMemberId,
            });
        })
        .filter(Boolean);
}

function resolveGradePointFromBands({ percentage, gpaBands }) {
    for (let index = 0; index < gpaBands.length; index += 1) {
        const band = gpaBands[index];
        const isLastBand = index === gpaBands.length - 1;
        if (
            percentage >= band.minPercentage - POLICY_EPSILON &&
            (percentage < band.maxPercentage - POLICY_EPSILON ||
                (isLastBand && percentage <= band.maxPercentage + POLICY_EPSILON))
        ) {
            return band.gradePoint;
        }
    }

    throw createError(409, "Academic policy GPA bands do not cover the computed percentage");
}

function classifyAcademicOutcome({ percentage, outcomeThresholds }) {
    if (percentage <= outcomeThresholds.failedMaxPercentage + POLICY_EPSILON) {
        return "failed";
    }

    if (percentage >= outcomeThresholds.finalPassMinPercentage - POLICY_EPSILON) {
        return "passed_final";
    }

    if (
        percentage >= outcomeThresholds.improvableMinPercentage - POLICY_EPSILON &&
        percentage <= outcomeThresholds.improvableMaxPercentage + POLICY_EPSILON
    ) {
        return "passed_improvable";
    }

    throw createError(409, "Academic policy outcome thresholds do not cover the computed percentage");
}

function buildOutcomeSummary(outcomes) {
    // TODO/verify: cumulative GPA currently counts all finalized attempts until
    // repeat-grade replacement / forgiveness policy is introduced.
    const totals = outcomes.reduce(
        (accumulator, outcome) => {
            accumulator.attemptedCreditHours += outcome.attemptedCreditHours;
            accumulator.earnedCreditHours += outcome.earnedCreditHours;
            accumulator.qualityPoints += outcome.qualityPoints;
            return accumulator;
        },
        {
            attemptedCreditHours: 0,
            earnedCreditHours: 0,
            qualityPoints: 0,
        }
    );

    const attemptedCreditHours = normalizeComputedNumber(totals.attemptedCreditHours);
    const earnedCreditHours = normalizeComputedNumber(totals.earnedCreditHours);
    const qualityPoints = normalizeComputedNumber(totals.qualityPoints);

    return {
        attemptedCreditHours,
        earnedCreditHours,
        qualityPoints,
        cumulativeGpa: attemptedCreditHours
            ? normalizeComputedNumber(qualityPoints / attemptedCreditHours)
            : null,
    };
}

function resolveAcademicOutcomeStatusPriority(outcomeStatus) {
    return ACADEMIC_OUTCOME_STATUS_PRIORITY[outcomeStatus] || 0;
}

function compareAcademicOutcomes(leftOutcome, rightOutcome) {
    const statusPriorityDifference =
        resolveAcademicOutcomeStatusPriority(rightOutcome?.outcomeStatus) -
        resolveAcademicOutcomeStatusPriority(leftOutcome?.outcomeStatus);
    if (statusPriorityDifference !== 0) {
        return statusPriorityDifference;
    }

    const leftPercentage = Number(leftOutcome?.percentage) || 0;
    const rightPercentage = Number(rightOutcome?.percentage) || 0;
    if (rightPercentage !== leftPercentage) {
        return rightPercentage - leftPercentage;
    }

    const leftGradePoint = Number(leftOutcome?.gradePoint) || 0;
    const rightGradePoint = Number(rightOutcome?.gradePoint) || 0;
    if (rightGradePoint !== leftGradePoint) {
        return rightGradePoint - leftGradePoint;
    }

    const leftQualityPoints = Number(leftOutcome?.qualityPoints) || 0;
    const rightQualityPoints = Number(rightOutcome?.qualityPoints) || 0;
    if (rightQualityPoints !== leftQualityPoints) {
        return rightQualityPoints - leftQualityPoints;
    }

    const leftAttemptedCreditHours = Number(leftOutcome?.attemptedCreditHours) || 0;
    const rightAttemptedCreditHours = Number(rightOutcome?.attemptedCreditHours) || 0;
    if (rightAttemptedCreditHours !== leftAttemptedCreditHours) {
        return rightAttemptedCreditHours - leftAttemptedCreditHours;
    }

    const leftSectionId = normalizeId(leftOutcome?.sectionId) || "";
    const rightSectionId = normalizeId(rightOutcome?.sectionId) || "";
    const sectionIdOrder = leftSectionId.localeCompare(rightSectionId);
    if (sectionIdOrder !== 0) {
        return sectionIdOrder;
    }

    const leftEnrollmentId = normalizeId(leftOutcome?.enrollmentId) || "";
    const rightEnrollmentId = normalizeId(rightOutcome?.enrollmentId) || "";
    return leftEnrollmentId.localeCompare(rightEnrollmentId);
}

function resolveBestAcademicOutcome(outcomes = []) {
    const comparableOutcomes = Array.isArray(outcomes)
        ? outcomes.filter((outcome) => resolveAcademicOutcomeStatusPriority(outcome?.outcomeStatus) > 0)
        : [];

    if (!comparableOutcomes.length) {
        return null;
    }

    return [...comparableOutcomes].sort(compareAcademicOutcomes)[0] || null;
}

function resolveBestAcademicOutcomeStatus(outcomes = []) {
    return resolveBestAcademicOutcome(outcomes)?.outcomeStatus || null;
}

function buildSubjectOutcomeSummaries(outcomes = []) {
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

    return [...outcomesBySubjectId.entries()]
        .map(([subjectId, subjectOutcomes]) => {
            const bestOutcome = resolveBestAcademicOutcome(subjectOutcomes);

            return {
                subjectId,
                attemptCount: subjectOutcomes.length,
                bestOutcomeStatus: bestOutcome?.outcomeStatus || null,
                bestOutcomeEnrollmentId: normalizeId(bestOutcome?.enrollmentId),
                bestOutcomeSectionId: normalizeId(bestOutcome?.sectionId),
                hasFailedAttempt: subjectOutcomes.some((outcome) => outcome.outcomeStatus === "failed"),
                hasPassedImprovableAttempt: subjectOutcomes.some(
                    (outcome) => outcome.outcomeStatus === "passed_improvable"
                ),
                hasPassedFinalAttempt: subjectOutcomes.some((outcome) => outcome.outcomeStatus === "passed_final"),
            };
        })
        .sort((left, right) => left.subjectId.localeCompare(right.subjectId));
}

function resolveFinalizedEnrollmentMetrics({
    sectionAssessments = [],
    enrollmentResults = [],
    assessmentById,
}) {
    if (!Array.isArray(sectionAssessments) || !sectionAssessments.length) {
        return null;
    }

    if (!Array.isArray(enrollmentResults) || enrollmentResults.length !== sectionAssessments.length) {
        return null;
    }

    const resultsByAssessmentId = new Map();
    for (const enrollmentResult of enrollmentResults) {
        const assessmentId = normalizeId(enrollmentResult?.assessmentId);
        if (!assessmentId || resultsByAssessmentId.has(assessmentId)) {
            return null;
        }

        resultsByAssessmentId.set(assessmentId, enrollmentResult);
    }

    let applicableWeightTotal = 0;
    let earnedWeightedScore = 0;
    for (const sectionAssessment of sectionAssessments) {
        const assessmentId = normalizeId(sectionAssessment?._id);
        const assessment = assessmentById.get(assessmentId) || null;
        const enrollmentResult = resultsByAssessmentId.get(assessmentId) || null;

        if (!assessment || !enrollmentResult) {
            return null;
        }

        if (!Number.isFinite(assessment.weight) || assessment.weight <= 0) {
            return null;
        }

        if (!Number.isFinite(assessment.maxScore) || assessment.maxScore <= 0) {
            return null;
        }

        if (!Number.isFinite(enrollmentResult.score)) {
            return null;
        }

        applicableWeightTotal += assessment.weight;
        earnedWeightedScore += calculateWeightedContribution({
            score: enrollmentResult.score,
            maxScore: assessment.maxScore,
            weight: assessment.weight,
        });
    }

    if (!isFinalizedWeightTotal(applicableWeightTotal)) {
        return null;
    }

    return {
        applicableWeightTotal: normalizeComputedNumber(applicableWeightTotal),
        earnedWeightedScore: normalizeComputedNumber(earnedWeightedScore),
        percentage: normalizeComputedNumber((earnedWeightedScore / applicableWeightTotal) * 100),
    };
}

async function listStudentAcademicOutcomes({ institutionId, studentMemberId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!studentMemberId || !isValidObjectId(studentMemberId)) {
        throw createError(400, "Invalid student member id");
    }

    const enrollments = await Enrollment.find({
        institutionId,
        studentMemberId,
    })
        .select("_id institutionId sectionId studentMemberId status")
        .lean();

    if (!enrollments.length) {
        return {
            outcomes: [],
            summary: buildOutcomeSummary([]),
            subjectOutcomeSummaries: [],
            excluded: [],
        };
    }

    const sections = await Section.find({
        institutionId,
        _id: { $in: enrollments.map((enrollment) => enrollment.sectionId) },
    })
        .select("_id institutionId semesterId subjectId code title status")
        .lean();
    const sectionById = new Map(sections.map((section) => [section._id.toString(), section]));
    const excluded = [];

    for (const enrollment of enrollments) {
        const section = sectionById.get(normalizeId(enrollment.sectionId)) || null;
        if (!section) {
            continue;
        }

        if (section.status !== CLOSED_SECTION_STATUS) {
            excluded.push(
                buildExclusion({
                    reasonCode: "section_not_closed",
                    message: "This section is not finalized yet, so it is not included in official GPA.",
                    enrollmentId: enrollment._id,
                    sectionId: section._id,
                    semesterId: section.semesterId,
                    subjectId: section.subjectId,
                    studentMembershipId: enrollment.studentMemberId,
                })
            );
        }
    }

    const closedSections = sections.filter((section) => section.status === CLOSED_SECTION_STATUS);

    if (!closedSections.length) {
        return {
            outcomes: [],
            summary: buildOutcomeSummary([]),
            subjectOutcomeSummaries: [],
            excluded: uniqueExclusions(excluded),
        };
    }

    const subjectIds = [...new Set(closedSections.map((section) => normalizeId(section.subjectId)).filter(Boolean))];
    const subjects = await Subject.find({
        institutionId,
        _id: { $in: subjectIds },
    })
        .select("_id institutionId code name creditHours")
        .lean();
    const subjectById = new Map(subjects.map((subject) => [subject._id.toString(), subject]));

    const allSectionAssessments = await Assessment.find({
        institutionId,
        sectionId: { $in: closedSections.map((section) => section._id) },
    })
        .select("_id institutionId sectionId maxScore weight status")
        .lean();
    const publishedAssessments = allSectionAssessments.filter(
        (assessment) => assessment.status === PUBLISHED_ASSESSMENT_STATUS
    );

    const assessmentsBySectionId = new Map();
    for (const assessment of allSectionAssessments) {
        const sectionId = normalizeId(assessment.sectionId);
        if (!assessmentsBySectionId.has(sectionId)) {
            assessmentsBySectionId.set(sectionId, []);
        }

        assessmentsBySectionId.get(sectionId).push(assessment);
    }

    for (const section of closedSections) {
        const sectionAssessments = assessmentsBySectionId.get(normalizeId(section._id)) || [];
        const publishedSectionAssessments = sectionAssessments.filter(
            (assessment) => assessment.status === PUBLISHED_ASSESSMENT_STATUS
        );

        for (const assessment of sectionAssessments) {
            if (assessment.status !== PUBLISHED_ASSESSMENT_STATUS) {
                excluded.push(
                    buildExclusion({
                        reasonCode: "assessment_not_published",
                        message: "This assessment is not published, so it is not included in official GPA.",
                        sectionId: section._id,
                        semesterId: section.semesterId,
                        subjectId: section.subjectId,
                        assessmentId: assessment._id,
                    })
                );
            }
        }

        if (!publishedSectionAssessments.length) {
            excluded.push(
                buildExclusion({
                    reasonCode: "assessment_not_published",
                    message: "No published assessments are available for this section, so it is not included in official GPA.",
                    sectionId: section._id,
                    semesterId: section.semesterId,
                    subjectId: section.subjectId,
                })
            );
            continue;
        }

        for (const assessment of publishedSectionAssessments) {
            if (hasInvalidPublishedAssessmentConfiguration(assessment)) {
                excluded.push(
                    buildExclusion({
                        reasonCode: "invalid_assessment_configuration",
                        message: "A published assessment has invalid grading configuration, so the section is not included in official GPA.",
                        sectionId: section._id,
                        semesterId: section.semesterId,
                        subjectId: section.subjectId,
                        assessmentId: assessment._id,
                    })
                );
            }
        }

        const publishedWeightTotal = publishedSectionAssessments.reduce(
            (sum, assessment) => sum + assessment.weight,
            0
        );
        if (!isFinalizedWeightTotal(publishedWeightTotal)) {
            excluded.push(
                buildExclusion({
                    reasonCode: "incomplete_assessment_weight_total",
                    message: "Published assessments do not total 100%, so this section is not included in official GPA.",
                    sectionId: section._id,
                    semesterId: section.semesterId,
                    subjectId: section.subjectId,
                })
            );
        }
    }

    if (!publishedAssessments.length) {
        return {
            outcomes: [],
            summary: buildOutcomeSummary([]),
            subjectOutcomeSummaries: [],
            excluded: uniqueExclusions(excluded),
        };
    }

    const publishedAssessmentsBySectionId = new Map();
    for (const assessment of publishedAssessments) {
        const sectionId = assessment.sectionId.toString();
        if (!publishedAssessmentsBySectionId.has(sectionId)) {
            publishedAssessmentsBySectionId.set(sectionId, []);
        }

        publishedAssessmentsBySectionId.get(sectionId).push(assessment);
    }

    const finalizedSectionIds = [...publishedAssessmentsBySectionId.entries()]
        .filter(([, sectionAssessments]) => {
            const publishedWeightTotal = sectionAssessments.reduce((sum, assessment) => sum + assessment.weight, 0);
            return isFinalizedWeightTotal(publishedWeightTotal);
        })
        .map(([sectionId]) => sectionId);

    if (!finalizedSectionIds.length) {
        return {
            outcomes: [],
            summary: buildOutcomeSummary([]),
            subjectOutcomeSummaries: [],
            excluded: uniqueExclusions(excluded),
        };
    }

    const finalizedAssessmentIds = publishedAssessments
        .filter((assessment) => finalizedSectionIds.includes(assessment.sectionId.toString()))
        .map((assessment) => assessment._id);
    const assessmentById = new Map(
        publishedAssessments.map((assessment) => [assessment._id.toString(), assessment])
    );
    const assessmentResults = await AssessmentResult.find({
        institutionId,
        studentMemberId,
        assessmentId: { $in: finalizedAssessmentIds },
        enrollmentId: { $in: enrollments.map((enrollment) => enrollment._id) },
    })
        .select("_id institutionId assessmentId enrollmentId sectionId studentMemberId score")
        .lean();

    const policyBySemesterId = new Map();
    const semesterIds = [...new Set(
        finalizedSectionIds
            .map((sectionId) => sectionById.get(sectionId))
            .filter(Boolean)
            .map((section) => section.semesterId.toString())
    )];

    for (const semesterId of semesterIds) {
        try {
            policyBySemesterId.set(
                semesterId,
                await resolveAcademicPolicyForSemester({
                    institutionId,
                    semesterId,
                })
            );
        } catch (error) {
            if (error?.statusCode !== 409 || !String(error.message || "").includes("No academic policy")) {
                throw error;
            }

            finalizedSectionIds
                .map((sectionId) => sectionById.get(sectionId))
                .filter((section) => section && normalizeId(section.semesterId) === semesterId)
                .forEach((section) => {
                    excluded.push(
                        buildExclusion({
                            reasonCode: "missing_academic_policy",
                            message: "No academic policy is configured for this semester, so the section is not included in official GPA.",
                            sectionId: section._id,
                            semesterId: section.semesterId,
                            subjectId: section.subjectId,
                        })
                    );
                });
        }
    }

    const resultsByEnrollmentId = new Map();
    for (const assessmentResult of assessmentResults) {
        const enrollmentId = assessmentResult.enrollmentId.toString();
        if (!resultsByEnrollmentId.has(enrollmentId)) {
            resultsByEnrollmentId.set(enrollmentId, []);
        }

        resultsByEnrollmentId.get(enrollmentId).push(assessmentResult);
    }

    const outcomes = [];
    for (const enrollment of enrollments) {
        const section = sectionById.get(enrollment.sectionId.toString()) || null;
        if (!section || !finalizedSectionIds.includes(section._id.toString())) {
            continue;
        }

        const subject = subjectById.get(section.subjectId.toString()) || null;
        if (!subject || !Number.isInteger(subject.creditHours) || subject.creditHours < 1) {
            excluded.push(
                buildExclusion({
                    reasonCode: "invalid_credit_hours",
                    message: "The subject is missing valid credit hours, so this enrollment is not included in official GPA.",
                    enrollmentId: enrollment._id,
                    sectionId: section._id,
                    semesterId: section.semesterId,
                    subjectId: section.subjectId,
                    studentMembershipId: enrollment.studentMemberId,
                })
            );
            continue;
        }

        const policy = policyBySemesterId.get(section.semesterId.toString()) || null;
        if (!policy) {
            continue;
        }

        const sectionAssessments = publishedAssessmentsBySectionId.get(section._id.toString()) || [];
        const enrollmentResults = resultsByEnrollmentId.get(enrollment._id.toString()) || [];
        if (!sectionAssessments.length || enrollmentResults.length !== sectionAssessments.length) {
            excluded.push(
                ...collectMissingResultExclusions({
                    enrollment,
                    section,
                    sectionAssessments,
                    enrollmentResults,
                })
            );
            continue;
        }

        const finalizedMetrics = resolveFinalizedEnrollmentMetrics({
            sectionAssessments,
            enrollmentResults,
            assessmentById,
        });
        if (!finalizedMetrics) {
            excluded.push(
                ...collectMissingResultExclusions({
                    enrollment,
                    section,
                    sectionAssessments,
                    enrollmentResults,
                })
            );
            continue;
        }

        const percentage = finalizedMetrics.percentage;
        const outcomeStatus = classifyAcademicOutcome({
            percentage,
            outcomeThresholds: policy.outcomeThresholds,
        });
        const gradePoint = resolveGradePointFromBands({
            percentage,
            gpaBands: policy.gpaBands,
        });
        const attemptedCreditHours = subject.creditHours;
        const earnedCreditHours = outcomeStatus === "failed" ? 0 : attemptedCreditHours;
        const qualityPoints = normalizeComputedNumber(gradePoint * attemptedCreditHours);

        outcomes.push({
            enrollmentId: enrollment._id.toString(),
            sectionId: section._id.toString(),
            semesterId: section.semesterId.toString(),
            subjectId: subject._id.toString(),
            outcomeStatus,
            percentage,
            attemptedCreditHours,
            earnedCreditHours,
            gradePoint,
            qualityPoints,
        });
    }

    return {
        outcomes,
        summary: buildOutcomeSummary(outcomes),
        subjectOutcomeSummaries: buildSubjectOutcomeSummaries(outcomes),
        excluded: uniqueExclusions(excluded),
    };
}

module.exports = {
    ACADEMIC_OUTCOME_STATUS_PRIORITY,
    buildOutcomeSummary,
    buildSubjectOutcomeSummaries,
    classifyAcademicOutcome,
    compareAcademicOutcomes,
    isFinalizedWeightTotal,
    resolveBestAcademicOutcome,
    resolveBestAcademicOutcomeStatus,
    resolveFinalizedEnrollmentMetrics,
    resolveGradePointFromBands,
    listStudentAcademicOutcomes,
};
