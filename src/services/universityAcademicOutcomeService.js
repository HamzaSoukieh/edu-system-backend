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
        };
    }

    const sections = await Section.find({
        institutionId,
        _id: { $in: enrollments.map((enrollment) => enrollment.sectionId) },
        status: "closed",
    })
        .select("_id institutionId semesterId subjectId code title status")
        .lean();

    if (!sections.length) {
        return {
            outcomes: [],
            summary: buildOutcomeSummary([]),
        };
    }

    const sectionById = new Map(sections.map((section) => [section._id.toString(), section]));
    const subjectIds = [...new Set(sections.map((section) => normalizeId(section.subjectId)).filter(Boolean))];
    const subjects = await Subject.find({
        institutionId,
        _id: { $in: subjectIds },
    })
        .select("_id institutionId code name creditHours")
        .lean();
    const subjectById = new Map(subjects.map((subject) => [subject._id.toString(), subject]));

    const publishedAssessments = await Assessment.find({
        institutionId,
        sectionId: { $in: sections.map((section) => section._id) },
        status: "published",
    })
        .select("_id institutionId sectionId maxScore weight")
        .lean();

    if (!publishedAssessments.length) {
        return {
            outcomes: [],
            summary: buildOutcomeSummary([]),
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
        policyBySemesterId.set(
            semesterId,
            await resolveAcademicPolicyForSemester({
                institutionId,
                semesterId,
            })
        );
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
            continue;
        }

        const sectionAssessments = publishedAssessmentsBySectionId.get(section._id.toString()) || [];
        const enrollmentResults = resultsByEnrollmentId.get(enrollment._id.toString()) || [];
        if (!sectionAssessments.length || enrollmentResults.length !== sectionAssessments.length) {
            continue;
        }

        const finalizedMetrics = resolveFinalizedEnrollmentMetrics({
            sectionAssessments,
            enrollmentResults,
            assessmentById,
        });
        if (!finalizedMetrics) {
            continue;
        }

        const percentage = finalizedMetrics.percentage;
        const policy = policyBySemesterId.get(section.semesterId.toString()) || null;
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
