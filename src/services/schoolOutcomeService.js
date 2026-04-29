const mongoose = require("mongoose");
const Assessment = require("../models/Assessment");
const AssessmentResult = require("../models/AssessmentResult");
const Enrollment = require("../models/Enrollment");
const Section = require("../models/Section");
const Semester = require("../models/Semester");
const Subject = require("../models/Subject");

const PUBLISHED_ASSESSMENT_STATUS = "published";
const ACTIVE_ENROLLMENT_STATUS = "enrolled";
const ACTIVE_SUBJECT_STATUS = "active";
const SCHOOL_POLICY_EPSILON = 1e-9;
const ASSESSMENT_SELECT_FIELDS = "_id institutionId sectionId maxScore weight status";
const ENROLLMENT_SELECT_FIELDS = "_id institutionId sectionId studentMemberId status";
const ASSESSMENT_RESULT_SELECT_FIELDS =
    "_id institutionId sectionId assessmentId enrollmentId studentMemberId score";

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

function isValidObjectId(value) {
    const normalized = normalizeId(value);
    return Boolean(normalized) && mongoose.Types.ObjectId.isValid(normalized);
}

function validateObjectId(value, fieldName) {
    const normalized = normalizeId(value);
    if (!normalized || !isValidObjectId(normalized)) {
        throw createError(400, `${fieldName} is invalid`);
    }

    return normalized;
}

function includesNormalizedId(values = [], value) {
    const normalizedValue = normalizeId(value);
    return values.map(normalizeId).includes(normalizedValue);
}

function normalizeComputedNumber(value, { digits = 12 } = {}) {
    if (!Number.isFinite(value)) {
        return value;
    }

    const roundedValue = Number(value.toFixed(digits));
    const nearestInteger = Math.round(roundedValue);
    if (Math.abs(roundedValue - nearestInteger) <= SCHOOL_POLICY_EPSILON) {
        return nearestInteger;
    }

    return Math.abs(roundedValue) <= SCHOOL_POLICY_EPSILON ? 0 : roundedValue;
}

function calculatePercentage({ earnedWeightedScore, applicableWeightTotal }) {
    if (!Number.isFinite(earnedWeightedScore) || !Number.isFinite(applicableWeightTotal) || applicableWeightTotal <= 0) {
        return null;
    }

    return normalizeComputedNumber((earnedWeightedScore / applicableWeightTotal) * 100);
}

function calculateWeightedContribution({ score, maxScore, weight }) {
    if (
        !Number.isFinite(score) ||
        !Number.isFinite(maxScore) ||
        maxScore <= 0 ||
        !Number.isFinite(weight) ||
        weight <= 0
    ) {
        return 0;
    }

    return (score / maxScore) * weight;
}

function calculateWeightedAverage(weightedItems = []) {
    const usableItems = weightedItems.filter(
        (item) => Number.isFinite(item?.value) && Number.isFinite(item?.weight) && item.weight > 0
    );
    const totalWeight = usableItems.reduce((sum, item) => sum + item.weight, 0);
    if (!totalWeight) {
        return null;
    }

    const weightedTotal = usableItems.reduce((sum, item) => sum + item.value * item.weight, 0);
    return normalizeComputedNumber(weightedTotal / totalWeight);
}

function calculateAverage(values = []) {
    const usableValues = values.filter((value) => Number.isFinite(value));
    if (!usableValues.length) {
        return null;
    }

    const total = usableValues.reduce((sum, value) => sum + value, 0);
    return normalizeComputedNumber(total / usableValues.length);
}

function buildMissingResultWarning({ code, subjectId, semesterId, sectionId = null, assessmentId = null, message }) {
    return {
        code,
        subjectId: normalizeId(subjectId),
        semesterId: normalizeId(semesterId),
        sectionId: normalizeId(sectionId),
        assessmentId: normalizeId(assessmentId),
        message,
    };
}

function buildCompletionState(missingResults = []) {
    const hasMissingResults = missingResults.length > 0;
    return {
        hasMissingResults,
        complete: !hasMissingResults,
    };
}

function buildAvailablePassFail({ percentage, threshold }) {
    const passedBasedOnAvailableResults =
        percentage !== null && percentage >= threshold - SCHOOL_POLICY_EPSILON;

    return {
        passedBasedOnAvailableResults,
        failedBasedOnAvailableResults: percentage !== null && !passedBasedOnAvailableResults,
    };
}

function validatePublishedAssessmentConfiguration({ assessment, subjectId, semesterId }) {
    const maxScore = Number(assessment?.maxScore);
    const weight = Number(assessment?.weight);
    const invalidFields = [];

    if (!Number.isFinite(maxScore) || maxScore <= 0) {
        invalidFields.push("maxScore");
    }

    if (!Number.isFinite(weight) || weight <= 0) {
        invalidFields.push("weight");
    }

    if (invalidFields.length) {
        return {
            valid: false,
            maxScore: null,
            weight: null,
            warning: buildMissingResultWarning({
                code: "invalid_assessment_configuration",
                subjectId,
                semesterId,
                sectionId: assessment?.sectionId,
                assessmentId: assessment?._id,
                message: `Published assessment has invalid ${invalidFields.join(" and ")} configuration.`,
            }),
        };
    }

    return {
        valid: true,
        maxScore,
        weight,
        warning: null,
    };
}

function normalizePolicySemesterWeights(policy) {
    const semesterWeights = policy?.aggregationRules?.semesterWeights;
    if (!Array.isArray(semesterWeights) || !semesterWeights.length) {
        throw createError(400, "policy.aggregationRules.semesterWeights must be a non-empty array");
    }

    return semesterWeights.map((semesterWeight, index) => {
        const semesterId = validateObjectId(
            semesterWeight?.semesterId,
            `policy.aggregationRules.semesterWeights[${index}].semesterId`
        );
        const weight = Number(semesterWeight?.weight);
        if (!Number.isFinite(weight) || weight <= 0) {
            throw createError(400, `policy.aggregationRules.semesterWeights[${index}].weight must be a positive number`);
        }

        return {
            semesterId,
            weight,
        };
    });
}

function getSubjectPassMinPercentage(policy) {
    const subjectPassMinPercentage = Number(policy?.gradingRules?.subjectPassMinPercentage);
    if (!Number.isFinite(subjectPassMinPercentage)) {
        throw createError(400, "policy.gradingRules.subjectPassMinPercentage is required");
    }

    return subjectPassMinPercentage;
}

function getYearPassMinPercentage(policy) {
    const yearPassMinPercentage = Number(policy?.gradingRules?.yearPassMinPercentage);
    if (!Number.isFinite(yearPassMinPercentage)) {
        throw createError(400, "policy.gradingRules.yearPassMinPercentage is required");
    }

    return yearPassMinPercentage;
}

function isCriticalSubject({ subjectId, policy }) {
    const normalizedSubjectId = normalizeId(subjectId);
    return (policy?.failureRules?.criticalSubjectRules || []).some(
        (rule) => normalizeId(rule?.subjectId) === normalizedSubjectId
    );
}

function resolveCriticalSubjectRule({ subjectId, policy }) {
    const normalizedSubjectId = normalizeId(subjectId);
    return (
        (policy?.failureRules?.criticalSubjectRules || []).find(
            (rule) => normalizeId(rule?.subjectId) === normalizedSubjectId
        ) || null
    );
}

async function ensureSemesterExists({ institutionId, semesterId }) {
    const semester = await Semester.findOne({
        _id: semesterId,
        institutionId,
    })
        .select("_id")
        .lean();

    if (!semester) {
        throw createError(404, "Semester not found");
    }

    return semester;
}

async function loadSchoolSubject({ institutionId, subjectId, classLevelId = null }) {
    const query = {
        _id: subjectId,
        institutionId,
    };

    if (classLevelId) {
        query.classLevelId = classLevelId;
    }

    const subject = await Subject.findOne(query)
        .select("_id institutionId classLevelId departmentId name code status")
        .lean();

    if (!subject) {
        throw createError(404, "Subject not found");
    }

    if (subject.departmentId || !subject.classLevelId) {
        throw createError(400, "School outcome aggregation requires school subjects");
    }

    return subject;
}

async function resolvePublishedAssessmentResultsForStudentSubjectSemester({
    institutionId,
    studentMembershipId,
    subjectId,
    semesterId,
}) {
    const sections = await Section.find({
        institutionId,
        subjectId,
        semesterId,
    })
        .select("_id institutionId semesterId subjectId schoolClassId status")
        .lean();

    if (!sections.length) {
        return {
            sections: [],
            publishedAssessments: [],
            assessmentResults: [],
            missingResults: [
                buildMissingResultWarning({
                    code: "no_subject_section",
                    subjectId,
                    semesterId,
                    message: "No section was found for this subject and semester.",
                }),
            ],
        };
    }

    const sectionIds = sections.map((section) => section._id);
    const enrollments = await Enrollment.find({
        institutionId,
        studentMemberId: studentMembershipId,
        status: ACTIVE_ENROLLMENT_STATUS,
        sectionId: { $in: sectionIds },
    })
        .select(ENROLLMENT_SELECT_FIELDS)
        .lean();

    if (!enrollments.length) {
        return {
            sections: [],
            enrollments: [],
            publishedAssessments: [],
            assessmentResults: [],
            missingResults: [
                buildMissingResultWarning({
                    code: "no_enrolled_subject_section",
                    subjectId,
                    semesterId,
                    message: "No active enrolled section was found for this student, subject, and semester.",
                }),
            ],
        };
    }

    const enrolledSectionIds = enrollments.map((enrollment) => enrollment.sectionId);
    const enrollmentIds = enrollments.map((enrollment) => enrollment._id);
    const enrolledSections = sections.filter((section) => includesNormalizedId(enrolledSectionIds, section._id));
    const publishedAssessments = await Assessment.find({
        institutionId,
        sectionId: { $in: enrolledSectionIds },
        status: PUBLISHED_ASSESSMENT_STATUS,
    })
        .select(ASSESSMENT_SELECT_FIELDS)
        .sort({ assessmentDate: 1, createdAt: 1, _id: 1 })
        .lean();

    if (!publishedAssessments.length) {
        return {
            sections: enrolledSections,
            enrollments,
            publishedAssessments: [],
            assessmentResults: [],
            missingResults: [
                buildMissingResultWarning({
                    code: "no_published_assessments",
                    subjectId,
                    semesterId,
                    message: "No published assessments were found for this subject and semester.",
                }),
            ],
        };
    }

    const assessmentIds = publishedAssessments.map((assessment) => assessment._id);
    const assessmentResults = await AssessmentResult.find({
        institutionId,
        studentMemberId: studentMembershipId,
        enrollmentId: { $in: enrollmentIds },
        sectionId: { $in: enrolledSectionIds },
        assessmentId: { $in: assessmentIds },
    })
        .select(ASSESSMENT_RESULT_SELECT_FIELDS)
        .lean();

    return {
        sections: enrolledSections,
        enrollments,
        publishedAssessments,
        assessmentResults,
        missingResults: [],
    };
}

function buildSemesterOutcomeFromPublishedResults({
    studentMembershipId,
    subjectId,
    semesterId,
    sections,
    enrollments = [],
    publishedAssessments,
    assessmentResults,
}) {
    const resultsByAssessmentId = new Map(
        assessmentResults.map((result) => [normalizeId(result.assessmentId), result])
    );
    const missingResults = [];
    let applicableWeightTotal = 0;
    let publishedWeightTotal = 0;
    let earnedWeightedScore = 0;

    for (const assessment of publishedAssessments) {
        const assessmentId = normalizeId(assessment._id);
        const result = resultsByAssessmentId.get(assessmentId) || null;
        const assessmentConfig = validatePublishedAssessmentConfiguration({
            assessment,
            subjectId,
            semesterId,
        });

        if (!assessmentConfig.valid) {
            missingResults.push(assessmentConfig.warning);
            continue;
        }

        publishedWeightTotal += assessmentConfig.weight;

        if (!result || !Number.isFinite(result.score)) {
            missingResults.push(
                buildMissingResultWarning({
                    code: "missing_assessment_result",
                    subjectId,
                    semesterId,
                    sectionId: assessment.sectionId,
                    assessmentId,
                    message: "A published assessment is missing a recorded score for this student.",
                })
            );
            continue;
        }

        applicableWeightTotal += assessmentConfig.weight;
        earnedWeightedScore += calculateWeightedContribution({
            score: result.score,
            maxScore: assessmentConfig.maxScore,
            weight: assessmentConfig.weight,
        });
    }

    const percentage = calculatePercentage({
        earnedWeightedScore,
        applicableWeightTotal,
    });

    return {
        percentage,
        missingResults,
        source: {
            studentMembershipId: normalizeId(studentMembershipId),
            sectionIds: sections.map((section) => normalizeId(section._id)),
            enrollmentIds: enrollments.map((enrollment) => normalizeId(enrollment._id)),
            assessmentIds: publishedAssessments.map((assessment) => normalizeId(assessment._id)),
            publishedAssessmentCount: publishedAssessments.length,
            resultCount: assessmentResults.length,
            applicableWeightTotal: normalizeComputedNumber(applicableWeightTotal),
            publishedWeightTotal: normalizeComputedNumber(publishedWeightTotal),
            earnedWeightedScore: normalizeComputedNumber(earnedWeightedScore),
        },
    };
}

async function calculateSchoolSubjectSemesterOutcome({
    institutionId,
    studentMembershipId,
    subjectId,
    semesterId,
    policy,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedStudentMembershipId = validateObjectId(studentMembershipId, "studentMembershipId");
    const normalizedSubjectId = validateObjectId(subjectId, "subjectId");
    const normalizedSemesterId = validateObjectId(semesterId, "semesterId");
    const subjectPassMinPercentage = getSubjectPassMinPercentage(policy);

    await Promise.all([
        ensureSemesterExists({
            institutionId: normalizedInstitutionId,
            semesterId: normalizedSemesterId,
        }),
        loadSchoolSubject({
            institutionId: normalizedInstitutionId,
            subjectId: normalizedSubjectId,
        }),
    ]);

    const resolved = await resolvePublishedAssessmentResultsForStudentSubjectSemester({
        institutionId: normalizedInstitutionId,
        studentMembershipId: normalizedStudentMembershipId,
        subjectId: normalizedSubjectId,
        semesterId: normalizedSemesterId,
    });
    const computed = buildSemesterOutcomeFromPublishedResults({
        studentMembershipId: normalizedStudentMembershipId,
        subjectId: normalizedSubjectId,
        semesterId: normalizedSemesterId,
        sections: resolved.sections,
        enrollments: resolved.enrollments,
        publishedAssessments: resolved.publishedAssessments,
        assessmentResults: resolved.assessmentResults,
    });
    const missingResults = [...resolved.missingResults, ...computed.missingResults];
    const completionState = buildCompletionState(missingResults);
    const availablePassFail = buildAvailablePassFail({
        percentage: computed.percentage,
        threshold: subjectPassMinPercentage,
    });

    return {
        subjectId: normalizedSubjectId,
        semesterId: normalizedSemesterId,
        percentage: computed.percentage,
        passed: completionState.complete && availablePassFail.passedBasedOnAvailableResults,
        failed: completionState.complete && availablePassFail.failedBasedOnAvailableResults,
        ...availablePassFail,
        ...completionState,
        missingResults,
        source: computed.source,
    };
}

async function calculateSchoolSubjectYearOutcome({
    institutionId,
    studentMembershipId,
    subjectId,
    academicYearId,
    policy,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedStudentMembershipId = validateObjectId(studentMembershipId, "studentMembershipId");
    const normalizedSubjectId = validateObjectId(subjectId, "subjectId");
    const normalizedAcademicYearId = validateObjectId(academicYearId, "academicYearId");
    const subjectPassMinPercentage = getSubjectPassMinPercentage(policy);
    const semesterWeights = normalizePolicySemesterWeights(policy);

    await loadSchoolSubject({
        institutionId: normalizedInstitutionId,
        subjectId: normalizedSubjectId,
    });

    const semesterBreakdown = [];
    const missingResults = [];
    for (const semesterWeight of semesterWeights) {
        const semesterOutcome = await calculateSchoolSubjectSemesterOutcome({
            institutionId: normalizedInstitutionId,
            studentMembershipId: normalizedStudentMembershipId,
            subjectId: normalizedSubjectId,
            semesterId: semesterWeight.semesterId,
            policy,
        });

        semesterBreakdown.push({
            ...semesterOutcome,
            weight: semesterWeight.weight,
        });
        missingResults.push(...semesterOutcome.missingResults);
    }

    const yearlyPercentage = calculateWeightedAverage(
        semesterBreakdown.map((semesterOutcome) => ({
            value: semesterOutcome.percentage,
            weight: semesterOutcome.weight,
        }))
    );
    const completionState = buildCompletionState(missingResults);
    const availablePassFail = buildAvailablePassFail({
        percentage: yearlyPercentage,
        threshold: subjectPassMinPercentage,
    });

    return {
        subjectId: normalizedSubjectId,
        academicYearId: normalizedAcademicYearId,
        yearlyPercentage,
        passed: completionState.complete && availablePassFail.passedBasedOnAvailableResults,
        failed: completionState.complete && availablePassFail.failedBasedOnAvailableResults,
        ...availablePassFail,
        ...completionState,
        semesterBreakdown,
        missingResults,
    };
}

async function resolveSubjectsForStudentAcademicYear({
    institutionId,
    classLevelId,
    studentMembershipId = null,
    semesterIds = [],
}) {
    if (studentMembershipId && Array.isArray(semesterIds) && semesterIds.length) {
        const enrollments = await Enrollment.find({
            institutionId,
            studentMemberId: studentMembershipId,
            status: ACTIVE_ENROLLMENT_STATUS,
        })
            .select(ENROLLMENT_SELECT_FIELDS)
            .lean();

        if (!enrollments.length) {
            return [];
        }

        const sections = await Section.find({
            institutionId,
            _id: { $in: enrollments.map((enrollment) => enrollment.sectionId) },
            semesterId: { $in: semesterIds },
        })
            .select("_id institutionId semesterId subjectId schoolClassId status")
            .lean();

        const subjectIds = [...new Set(sections.map((section) => normalizeId(section.subjectId)).filter(Boolean))];
        if (!subjectIds.length) {
            return [];
        }

        return Subject.find({
            institutionId,
            _id: { $in: subjectIds },
            classLevelId,
            departmentId: null,
            status: ACTIVE_SUBJECT_STATUS,
        })
            .select("_id institutionId classLevelId departmentId name code status")
            .sort({ name: 1, code: 1, _id: 1 })
            .lean();
    }

    // TODO/verify: replace this fallback with a first-class school curriculum/required-subject source.
    const subjects = await Subject.find({
        institutionId,
        classLevelId,
        departmentId: null,
        status: ACTIVE_SUBJECT_STATUS,
    })
        .select("_id institutionId classLevelId departmentId name code status")
        .sort({ name: 1, code: 1, _id: 1 })
        .lean();

    return subjects;
}

async function calculateSchoolStudentYearOutcome({
    institutionId,
    studentMembershipId,
    academicYearId,
    classLevelId,
    policy,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedStudentMembershipId = validateObjectId(studentMembershipId, "studentMembershipId");
    const normalizedAcademicYearId = validateObjectId(academicYearId, "academicYearId");
    const normalizedClassLevelId = validateObjectId(classLevelId, "classLevelId");
    const yearPassMinPercentage = getYearPassMinPercentage(policy);
    const semesterWeights = normalizePolicySemesterWeights(policy);

    const subjects = await resolveSubjectsForStudentAcademicYear({
        institutionId: normalizedInstitutionId,
        classLevelId: normalizedClassLevelId,
        studentMembershipId: normalizedStudentMembershipId,
        semesterIds: semesterWeights.map((semesterWeight) => semesterWeight.semesterId),
    });

    const subjectOutcomes = [];
    const missingResults = [];
    for (const subject of subjects) {
        const subjectOutcome = await calculateSchoolSubjectYearOutcome({
            institutionId: normalizedInstitutionId,
            studentMembershipId: normalizedStudentMembershipId,
            subjectId: subject._id,
            academicYearId: normalizedAcademicYearId,
            policy,
        });

        subjectOutcomes.push(subjectOutcome);
        missingResults.push(...subjectOutcome.missingResults);
    }

    const yearlyAveragePercentage = calculateAverage(
        subjectOutcomes.map((subjectOutcome) => subjectOutcome.yearlyPercentage)
    );
    const completionState = buildCompletionState(missingResults);
    const passedYearAverageBasedOnAvailableResults =
        yearlyAveragePercentage !== null &&
        yearlyAveragePercentage >= yearPassMinPercentage - SCHOOL_POLICY_EPSILON;
    const failedSubjects = subjectOutcomes.filter((subjectOutcome) => subjectOutcome.failedBasedOnAvailableResults);
    const criticalFailedSubjects = failedSubjects
        .filter((subjectOutcome) =>
            isCriticalSubject({
                subjectId: subjectOutcome.subjectId,
                policy,
            })
        )
        .map((subjectOutcome) => {
            const rule = resolveCriticalSubjectRule({
                subjectId: subjectOutcome.subjectId,
                policy,
            });

            return {
                subjectId: subjectOutcome.subjectId,
                yearlyPercentage: subjectOutcome.yearlyPercentage,
                failAction: rule?.failAction || null,
            };
        });

    return {
        studentMembershipId: normalizedStudentMembershipId,
        academicYearId: normalizedAcademicYearId,
        classLevelId: normalizedClassLevelId,
        yearlyAveragePercentage,
        passedYearAverage: completionState.complete && passedYearAverageBasedOnAvailableResults,
        passedYearAverageBasedOnAvailableResults,
        ...completionState,
        subjects: subjectOutcomes,
        failedSubjectCount: failedSubjects.length,
        criticalFailedSubjects,
        missingResults,
    };
}

module.exports = {
    calculatePercentage,
    calculateWeightedAverage,
    resolvePublishedAssessmentResultsForStudentSubjectSemester,
    resolveSubjectsForStudentAcademicYear,
    isCriticalSubject,
    buildMissingResultWarning,
    calculateSchoolSubjectSemesterOutcome,
    calculateSchoolSubjectYearOutcome,
    calculateSchoolStudentYearOutcome,
};
