const mongoose = require("mongoose");
const Membership = require("../models/Membership");
const { ROLE_PERMISSIONS } = require("../auth/permissions");
const { ensureSchoolInstitution } = require("./classLevelService");
const schoolFinalOutcomeService = require("./schoolFinalOutcomeService");
const schoolReportCardService = require("./schoolReportCardService");

const SCHOOL_ACADEMIC_PROFILE_READ_PERMISSION = "class.manage";
const ACTIVE_MEMBERSHIP_STATUS = Membership.schema.path("status").defaultValue;
const ACADEMIC_PROFILE_ACCESS_MODES = {
    self: "self",
    staff: "staff",
};

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

function validateRequiredObjectId(value, fieldName) {
    const normalized = normalizeId(value);
    if (!normalized) {
        throw createError(400, `${fieldName} is required`);
    }

    if (!isValidObjectId(normalized)) {
        throw createError(400, `${fieldName} is invalid`);
    }

    return normalized;
}

function hasRolePermission(role, permission) {
    return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

function validateAccessMode(accessMode) {
    if (!Object.values(ACADEMIC_PROFILE_ACCESS_MODES).includes(accessMode)) {
        throw createError(400, "accessMode is invalid");
    }

    return accessMode;
}

function ensureAcademicProfileAccess({
    institutionId,
    studentMembershipId,
    actorUserId,
    actorMembership,
    accessMode = ACADEMIC_PROFILE_ACCESS_MODES.staff,
}) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    const actorInstitutionId = normalizeId(actorMembership.institutionId);
    if (!actorInstitutionId || actorInstitutionId !== normalizeId(institutionId)) {
        throw createError(403, "Institution access denied");
    }

    const normalizedAccessMode = validateAccessMode(accessMode);
    if (normalizedAccessMode === ACADEMIC_PROFILE_ACCESS_MODES.self) {
        if (actorMembership.role !== "student") {
            throw createError(403, "Only students can view their own academic profile");
        }

        if (actorMembership.status !== undefined && actorMembership.status !== ACTIVE_MEMBERSHIP_STATUS) {
            throw createError(403, "Only active students can view their own academic profile");
        }

        if (normalizeId(actorMembership._id) !== normalizeId(studentMembershipId)) {
            throw createError(403, "Students can only view their own academic profile");
        }

        return;
    }

    if (!hasRolePermission(actorMembership.role, SCHOOL_ACADEMIC_PROFILE_READ_PERMISSION)) {
        throw createError(403, "Permission denied");
    }
}

async function ensureTargetStudentMembership({ institutionId, studentMembershipId }) {
    const membership = await Membership.findOne({
        _id: studentMembershipId,
        institutionId,
    })
        .select("_id institutionId role status")
        .lean();

    if (!membership) {
        throw createError(400, "studentMembershipId is invalid");
    }

    if (membership.role !== "student") {
        throw createError(400, "studentMembershipId must reference a student membership");
    }

    if (membership.status !== ACTIVE_MEMBERSHIP_STATUS) {
        throw createError(400, "Student member must be active");
    }

    return membership;
}

function buildStudentProfileSummary(student = {}) {
    return {
        studentMembershipId: normalizeId(student.membershipId || student.studentMembershipId),
        name: student.fullName || student.name || null,
        email: student.email || null,
    };
}

function buildSummaryFromYearlyReportCard(reportCard) {
    const promotionDecision = reportCard?.promotionDecision || {};

    return {
        yearlyAveragePercentage: reportCard?.yearlyAveragePercentage ?? null,
        failedSubjectCount: reportCard?.failedSubjectCount ?? 0,
        criticalFailedSubjects: reportCard?.criticalFailedSubjects || [],
        decision: promotionDecision.decision || null,
        allowedToPromote: promotionDecision.allowedToPromote === true,
        reasonCodes: promotionDecision.reasonCodes || [],
        reasons: promotionDecision.reasons || [],
        complete: reportCard?.complete === true,
        hasMissingResults: reportCard?.hasMissingResults === true,
    };
}

function normalizeExplanation(explanation = {}) {
    const reasonCode = explanation.reasonCode || explanation.code || null;
    if (!reasonCode) {
        return null;
    }

    const normalized = {
        reasonCode,
        message: explanation.message || null,
    };
    [
        "academicYearId",
        "semesterId",
        "subjectId",
        "sectionId",
        "assessmentId",
        "studentMembershipId",
        "enrollmentId",
    ].forEach((fieldName) => {
        const value = normalizeId(explanation[fieldName]);
        if (value) {
            normalized[fieldName] = value;
        }
    });

    return normalized;
}

function uniqueExplanations(explanations = []) {
    const seen = new Set();
    return explanations.filter((explanation) => {
        if (!explanation) {
            return false;
        }

        const key = [
            explanation.reasonCode,
            explanation.academicYearId,
            explanation.semesterId,
            explanation.subjectId,
            explanation.sectionId,
            explanation.assessmentId,
            explanation.studentMembershipId,
            explanation.enrollmentId,
        ].join("|");
        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

function buildSchoolExcludedExplanations({ yearlyReportCard, semesterReportCard, academicYearId }) {
    const explanations = [
        ...(yearlyReportCard?.warnings || []).map(normalizeExplanation),
        ...(semesterReportCard?.warnings || []).map(normalizeExplanation),
    ];

    if (yearlyReportCard && yearlyReportCard.complete !== true) {
        explanations.push(
            normalizeExplanation({
                reasonCode: "incomplete_school_year_outcome",
                message: "The school year outcome has missing or incomplete results.",
                academicYearId,
            })
        );
    }

    if (semesterReportCard && semesterReportCard.complete !== true) {
        explanations.push(
            normalizeExplanation({
                reasonCode: "missing_semester_result",
                message: "The semester report card has missing or incomplete results.",
                semesterId: semesterReportCard.semester?.id,
            })
        );
    }

    return uniqueExplanations(explanations);
}

function sanitizeFinalOutcomeReason(reason = {}) {
    if (!reason || typeof reason !== "object" || Array.isArray(reason)) {
        return reason;
    }

    return ["code", "reasonCode", "message", "reason"].reduce((sanitized, fieldName) => {
        if (reason[fieldName] !== undefined && reason[fieldName] !== null) {
            sanitized[fieldName] = reason[fieldName];
        }

        return sanitized;
    }, {});
}

function sanitizeFinalOutcomeReasons(reasons = []) {
    if (!Array.isArray(reasons)) {
        return [];
    }

    return reasons.map(sanitizeFinalOutcomeReason);
}

function buildFinalOutcomeSummary(finalOutcome) {
    if (!finalOutcome) {
        return null;
    }

    return {
        id: normalizeId(finalOutcome.id || finalOutcome._id),
        status: finalOutcome.status || null,
        outcomeSnapshot: {
            yearlyAveragePercentage: finalOutcome.outcomeSnapshot?.yearlyAveragePercentage ?? null,
            failedSubjectCount: finalOutcome.outcomeSnapshot?.failedSubjectCount ?? 0,
            criticalFailedSubjects: finalOutcome.outcomeSnapshot?.criticalFailedSubjects || [],
            complete: finalOutcome.outcomeSnapshot?.complete === true,
            hasMissingResults: finalOutcome.outcomeSnapshot?.hasMissingResults === true,
            missingResults: finalOutcome.outcomeSnapshot?.missingResults || [],
        },
        calculatedDecision: finalOutcome.calculatedDecision || null,
        calculatedReasonCodes: finalOutcome.calculatedReasonCodes || [],
        calculatedReasons: sanitizeFinalOutcomeReasons(finalOutcome.calculatedReasons),
        calculatedWarnings: sanitizeFinalOutcomeReasons(finalOutcome.calculatedWarnings),
        finalDecision: finalOutcome.finalDecision || null,
        finalReasonCodes: finalOutcome.finalReasonCodes || [],
        finalReasons: sanitizeFinalOutcomeReasons(finalOutcome.finalReasons),
        finalWarnings: sanitizeFinalOutcomeReasons(finalOutcome.finalWarnings),
        override: {
            isOverridden: finalOutcome.override?.isOverridden === true,
            reason: finalOutcome.override?.reason || null,
            overriddenAt: finalOutcome.override?.overriddenAt || null,
        },
        finalizedAt: finalOutcome.finalizedAt || null,
    };
}

async function loadOptionalFinalOutcome({
    institutionId,
    studentMembershipId,
    academicYearId,
    actorUserId,
    actorMembership,
    accessMode,
}) {
    try {
        const result = await schoolFinalOutcomeService.getSchoolFinalOutcomeForStudentYear({
            institutionId,
            studentMembershipId,
            academicYearId,
            actorUserId,
            actorMembership,
            accessMode,
        });

        return buildFinalOutcomeSummary(result.schoolFinalOutcome);
    } catch (error) {
        if (error?.statusCode === 404) {
            return null;
        }

        throw error;
    }
}

async function buildSchoolAcademicProfile({
    institutionId,
    studentMembershipId,
    actorUserId,
    actorMembership,
    academicYearId,
    semesterId = null,
    accessMode = ACADEMIC_PROFILE_ACCESS_MODES.staff,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedStudentMembershipId = validateObjectId(studentMembershipId, "studentMembershipId");
    const normalizedAcademicYearId = validateRequiredObjectId(academicYearId, "academicYearId");
    const normalizedSemesterId = semesterId ? validateObjectId(semesterId, "semesterId") : null;

    ensureAcademicProfileAccess({
        institutionId: normalizedInstitutionId,
        studentMembershipId: normalizedStudentMembershipId,
        actorUserId,
        actorMembership,
        accessMode,
    });
    await ensureSchoolInstitution(normalizedInstitutionId);
    await ensureTargetStudentMembership({
        institutionId: normalizedInstitutionId,
        studentMembershipId: normalizedStudentMembershipId,
    });

    const yearlyResult = await schoolReportCardService.getStudentYearlyReportCard({
        institutionId: normalizedInstitutionId,
        studentMembershipId: normalizedStudentMembershipId,
        academicYearId: normalizedAcademicYearId,
        actorUserId,
        actorMembership,
        accessMode,
    });
    const semesterResult = normalizedSemesterId
        ? await schoolReportCardService.getStudentSemesterReportCard({
              institutionId: normalizedInstitutionId,
              studentMembershipId: normalizedStudentMembershipId,
              semesterId: normalizedSemesterId,
              actorUserId,
              actorMembership,
              accessMode,
          })
        : null;
    const finalOutcome = await loadOptionalFinalOutcome({
        institutionId: normalizedInstitutionId,
        studentMembershipId: normalizedStudentMembershipId,
        academicYearId: normalizedAcademicYearId,
        actorUserId,
        actorMembership,
        accessMode,
    });

    const yearlyReportCard = yearlyResult.reportCard;
    const semesterReportCard = semesterResult?.reportCard || null;
    const warnings = [
        ...(yearlyReportCard?.warnings || []),
        ...(semesterReportCard?.warnings || []),
    ];
    const excluded = buildSchoolExcludedExplanations({
        yearlyReportCard,
        semesterReportCard,
        academicYearId: normalizedAcademicYearId,
    });

    return {
        institutionType: "school",
        student: buildStudentProfileSummary(yearlyReportCard?.student),
        academicYear: {
            id: normalizedAcademicYearId,
        },
        summary: buildSummaryFromYearlyReportCard(yearlyReportCard),
        reportCards: {
            yearly: yearlyReportCard,
            semester: semesterReportCard,
        },
        finalOutcome,
        warnings,
        excluded,
    };
}

module.exports = {
    ACADEMIC_PROFILE_ACCESS_MODES,
    buildSchoolAcademicProfile,
};
