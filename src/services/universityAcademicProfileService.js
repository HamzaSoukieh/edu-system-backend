const mongoose = require("mongoose");
const Institution = require("../models/Institution");
const Membership = require("../models/Membership");
const MemberProfile = require("../models/MemberProfile");
const User = require("../models/User");
const Section = require("../models/Section");
const Semester = require("../models/Semester");
const Subject = require("../models/Subject");
const { ROLE_PERMISSIONS } = require("../auth/permissions");
const universityAcademicOutcomeService = require("./universityAcademicOutcomeService");

const UNIVERSITY_ACADEMIC_PROFILE_READ_PERMISSION = "section.manage";
const ACTIVE_MEMBERSHIP_STATUS = Membership.schema.path("status").defaultValue;
const PASSING_OUTCOME_STATUSES = ["passed_improvable", "passed_final"];
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

    if (!hasRolePermission(actorMembership.role, UNIVERSITY_ACADEMIC_PROFILE_READ_PERMISSION)) {
        throw createError(403, "Permission denied");
    }
}

async function ensureUniversityInstitution(institutionId) {
    const institution = await Institution.findOne({ _id: institutionId }).select("_id type").lean();
    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (institution.type !== "university") {
        throw createError(409, "Academic profile is only supported for university institutions");
    }

    return institution;
}

async function loadTargetStudentMembership({ institutionId, studentMembershipId }) {
    const membership = await Membership.findOne({
        _id: studentMembershipId,
        institutionId,
    })
        .select("_id institutionId userId role status")
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

async function loadStudentProfile({ institutionId, studentMembership }) {
    const [profile, user] = await Promise.all([
        MemberProfile.findOne({
            institutionId,
            membershipId: studentMembership._id,
        })
            .select("_id fullName")
            .lean(),
        User.findOne({ _id: studentMembership.userId })
            .select("_id email")
            .lean(),
    ]);

    return {
        studentMembershipId: normalizeId(studentMembership._id),
        name: profile?.fullName || null,
        email: user?.email || null,
    };
}

function buildEmptySummary() {
    return {
        cumulativeGpa: null,
        totalEarnedCreditHours: 0,
        totalAttemptedCreditHours: 0,
        totalPassedSubjects: 0,
        totalFailedSubjects: 0,
    };
}

function buildSubjectStatusTotals({ outcomes = [], subjectOutcomeSummaries = [] }) {
    if (Array.isArray(subjectOutcomeSummaries) && subjectOutcomeSummaries.length) {
        return {
            totalPassedSubjects: subjectOutcomeSummaries.filter((subjectSummary) =>
                PASSING_OUTCOME_STATUSES.includes(subjectSummary.bestOutcomeStatus)
            ).length,
            totalFailedSubjects: subjectOutcomeSummaries.filter(
                (subjectSummary) => subjectSummary.bestOutcomeStatus === "failed"
            ).length,
        };
    }

    return {
        totalPassedSubjects: outcomes.filter((outcome) =>
            PASSING_OUTCOME_STATUSES.includes(outcome.outcomeStatus)
        ).length,
        totalFailedSubjects: outcomes.filter((outcome) => outcome.outcomeStatus === "failed").length,
    };
}

function buildProfileSummary({ outcomes = [], summary = {}, subjectOutcomeSummaries = [] }) {
    const subjectStatusTotals = buildSubjectStatusTotals({
        outcomes,
        subjectOutcomeSummaries,
    });

    return {
        cumulativeGpa: summary.cumulativeGpa ?? null,
        totalEarnedCreditHours: summary.earnedCreditHours ?? 0,
        totalAttemptedCreditHours: summary.attemptedCreditHours ?? 0,
        ...subjectStatusTotals,
    };
}

async function loadOutcomeDecorations({ institutionId, outcomes }) {
    const sectionIds = [...new Set(outcomes.map((outcome) => normalizeId(outcome.sectionId)).filter(Boolean))];
    const subjectIdsFromOutcomes = outcomes.map((outcome) => normalizeId(outcome.subjectId)).filter(Boolean);
    const semesterIdsFromOutcomes = outcomes.map((outcome) => normalizeId(outcome.semesterId)).filter(Boolean);

    const sections = sectionIds.length
        ? await Section.find({
              institutionId,
              _id: { $in: sectionIds },
          })
              .select("_id institutionId semesterId subjectId code title")
              .lean()
        : [];
    const sectionById = new Map(sections.map((section) => [normalizeId(section._id), section]));
    const subjectIds = [
        ...new Set([
            ...subjectIdsFromOutcomes,
            ...sections.map((section) => normalizeId(section.subjectId)).filter(Boolean),
        ]),
    ];
    const semesterIds = [
        ...new Set([
            ...semesterIdsFromOutcomes,
            ...sections.map((section) => normalizeId(section.semesterId)).filter(Boolean),
        ]),
    ];

    const [subjects, semesters] = await Promise.all([
        subjectIds.length
            ? Subject.find({
                  institutionId,
                  _id: { $in: subjectIds },
              })
                  .select("_id institutionId code name creditHours")
                  .lean()
            : Promise.resolve([]),
        semesterIds.length
            ? Semester.find({
                  institutionId,
                  _id: { $in: semesterIds },
              })
                  .select("_id institutionId name startDate endDate status")
                  .lean()
            : Promise.resolve([]),
    ]);

    return {
        sectionById,
        subjectById: new Map(subjects.map((subject) => [normalizeId(subject._id), subject])),
        semesterById: new Map(semesters.map((semester) => [normalizeId(semester._id), semester])),
    };
}

function buildSubjectAttempt(outcome, { sectionById, subjectById, semesterById }) {
    const section = sectionById.get(normalizeId(outcome.sectionId)) || null;
    const subject = subjectById.get(normalizeId(outcome.subjectId)) || null;
    const semester = semesterById.get(normalizeId(outcome.semesterId)) || null;

    return {
        enrollmentId: normalizeId(outcome.enrollmentId),
        sectionId: normalizeId(outcome.sectionId),
        semesterId: normalizeId(outcome.semesterId),
        subjectId: normalizeId(outcome.subjectId),
        subjectCode: subject?.code || null,
        subjectName: subject?.name || null,
        sectionCode: section?.code || null,
        sectionTitle: section?.title || null,
        semesterName: semester?.name || null,
        outcomeStatus: outcome.outcomeStatus || null,
        percentage: outcome.percentage ?? null,
        attemptedCreditHours: outcome.attemptedCreditHours ?? 0,
        earnedCreditHours: outcome.earnedCreditHours ?? 0,
        gradePoint: outcome.gradePoint ?? null,
        qualityPoints: outcome.qualityPoints ?? 0,
    };
}

function compareSubjectAttempts(left, right, semesterById) {
    const leftSemester = semesterById.get(normalizeId(left.semesterId)) || null;
    const rightSemester = semesterById.get(normalizeId(right.semesterId)) || null;
    const leftStart = leftSemester?.startDate ? new Date(leftSemester.startDate).getTime() : 0;
    const rightStart = rightSemester?.startDate ? new Date(rightSemester.startDate).getTime() : 0;

    if (leftStart !== rightStart) {
        return leftStart - rightStart;
    }

    return [
        (left.subjectCode || "").localeCompare(right.subjectCode || ""),
        (left.sectionCode || "").localeCompare(right.sectionCode || ""),
        (left.enrollmentId || "").localeCompare(right.enrollmentId || ""),
    ].find((comparison) => comparison !== 0) || 0;
}

function buildSemesterSummaries({ outcomes, subjectAttempts, semesterById }) {
    const attemptsByEnrollmentId = new Map(
        subjectAttempts.map((attempt) => [normalizeId(attempt.enrollmentId), attempt])
    );
    const outcomesBySemesterId = new Map();

    for (const outcome of outcomes) {
        const semesterId = normalizeId(outcome.semesterId);
        if (!semesterId) {
            continue;
        }

        if (!outcomesBySemesterId.has(semesterId)) {
            outcomesBySemesterId.set(semesterId, []);
        }

        outcomesBySemesterId.get(semesterId).push(outcome);
    }

    return [...outcomesBySemesterId.entries()]
        .map(([semesterId, semesterOutcomes]) => {
            const semester = semesterById.get(semesterId) || null;
            const summary = universityAcademicOutcomeService.buildOutcomeSummary(semesterOutcomes);
            const subjects = semesterOutcomes
                .map((outcome) => attemptsByEnrollmentId.get(normalizeId(outcome.enrollmentId)) || null)
                .filter(Boolean)
                .sort((left, right) => compareSubjectAttempts(left, right, semesterById));

            return {
                semesterId,
                name: semester?.name || null,
                gpa: summary.cumulativeGpa,
                earnedCreditHours: summary.earnedCreditHours,
                attemptedCreditHours: summary.attemptedCreditHours,
                subjects,
            };
        })
        .sort((left, right) => {
            const leftSemester = semesterById.get(left.semesterId) || null;
            const rightSemester = semesterById.get(right.semesterId) || null;
            const leftStart = leftSemester?.startDate ? new Date(leftSemester.startDate).getTime() : 0;
            const rightStart = rightSemester?.startDate ? new Date(rightSemester.startDate).getTime() : 0;
            if (leftStart !== rightStart) {
                return leftStart - rightStart;
            }

            return left.semesterId.localeCompare(right.semesterId);
        });
}

function buildSubjectOutcomeSummaries(outcomeResult = {}) {
    if (Array.isArray(outcomeResult.subjectOutcomeSummaries)) {
        return outcomeResult.subjectOutcomeSummaries;
    }

    return universityAcademicOutcomeService.buildSubjectOutcomeSummaries(outcomeResult.outcomes || []);
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
        "semesterId",
        "subjectId",
        "sectionId",
        "assessmentId",
        "enrollmentId",
        "studentMembershipId",
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
            explanation.semesterId,
            explanation.subjectId,
            explanation.sectionId,
            explanation.assessmentId,
            explanation.enrollmentId,
            explanation.studentMembershipId,
        ].join("|");
        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

function buildExcludedExplanations(outcomeResult = {}) {
    return Array.isArray(outcomeResult.excluded)
        ? uniqueExplanations(outcomeResult.excluded.map(normalizeExplanation).filter(Boolean))
        : [];
}

async function buildUniversityAcademicProfile({
    institutionId,
    studentMembershipId,
    actorUserId,
    actorMembership,
    semesterId = null,
    accessMode = ACADEMIC_PROFILE_ACCESS_MODES.staff,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedStudentMembershipId = validateObjectId(studentMembershipId, "studentMembershipId");
    const normalizedSemesterId = semesterId ? validateObjectId(semesterId, "semesterId") : null;

    ensureAcademicProfileAccess({
        institutionId: normalizedInstitutionId,
        studentMembershipId: normalizedStudentMembershipId,
        actorUserId,
        actorMembership,
        accessMode,
    });
    await ensureUniversityInstitution(normalizedInstitutionId);
    const studentMembership = await loadTargetStudentMembership({
        institutionId: normalizedInstitutionId,
        studentMembershipId: normalizedStudentMembershipId,
    });

    const [student, outcomeResult] = await Promise.all([
        loadStudentProfile({
            institutionId: normalizedInstitutionId,
            studentMembership,
        }),
        universityAcademicOutcomeService.listStudentAcademicOutcomes({
            institutionId: normalizedInstitutionId,
            studentMemberId: normalizedStudentMembershipId,
        }),
    ]);

    const outcomes = outcomeResult.outcomes || [];
    const warnings = Array.isArray(outcomeResult.warnings) ? [...outcomeResult.warnings] : [];
    const excluded = buildExcludedExplanations(outcomeResult);
    if (!outcomes.length) {
        warnings.push({
            code: "no_finalized_academic_outcomes",
            message: "No finalized academic outcomes are available for this student yet.",
        });
    }

    if (normalizedSemesterId) {
        warnings.push({
            code: "semester_filter_not_applied",
            message:
                "semesterId filtering is not supported by the university academic outcome service yet; returning the full profile.",
            semesterId: normalizedSemesterId,
        });
    }

    const decorations = await loadOutcomeDecorations({
        institutionId: normalizedInstitutionId,
        outcomes,
    });
    const subjectAttempts = outcomes
        .map((outcome) => buildSubjectAttempt(outcome, decorations))
        .sort((left, right) => compareSubjectAttempts(left, right, decorations.semesterById));

    return {
        institutionType: "university",
        student,
        summary: outcomes.length ? buildProfileSummary(outcomeResult) : buildEmptySummary(),
        semesters: buildSemesterSummaries({
            outcomes,
            subjectAttempts,
            semesterById: decorations.semesterById,
        }),
        subjectAttempts,
        subjectOutcomeSummaries: buildSubjectOutcomeSummaries(outcomeResult),
        warnings,
        excluded,
    };
}

module.exports = {
    ACADEMIC_PROFILE_ACCESS_MODES,
    buildUniversityAcademicProfile,
};
