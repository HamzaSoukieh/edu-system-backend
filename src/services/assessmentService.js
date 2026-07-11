const mongoose = require("mongoose");
const { withTransaction } = require("../utils/withTransaction");
const Assessment = require("../models/Assessment");
const AssessmentResult = require("../models/AssessmentResult");
const Enrollment = require("../models/Enrollment");
const MemberProfile = require("../models/MemberProfile");
const Membership = require("../models/Membership");
const SchoolClass = require("../models/SchoolClass");
const Section = require("../models/Section");
const SectionSession = require("../models/SectionSession");
const Subject = require("../models/Subject");
const User = require("../models/User");
const emailQueue = require("../queues/emailQueue");
const { EMAIL_JOB_TYPES } = require("../queues/emailQueueNames");
const { ensureCanChangeSectionSessionStatus } = require("./sectionSessionService");

const { ASSESSMENT_TYPES, ASSESSMENT_STATUSES } = require("../constants/assessmentConstants");
const ASSESSMENT_LIST_STATUSES = [...ASSESSMENT_STATUSES, "all"];
const STUDENT_VISIBLE_ASSESSMENT_STATUSES = ["announced", "published"];
const ACTIVE_ENROLLMENT_STATUS = "enrolled";
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_NOTE_LENGTH = 500;
const WEIGHT_EPSILON = 1e-9;
const ASSESSMENT_SELECT_FIELDS =
    "_id institutionId sectionId sectionSessionId title description type assessmentDate maxScore weight status publishedAt publishedByUserId createdByUserId createdAt updatedAt";
const ASSESSMENT_RESULT_SELECT_FIELDS =
    "_id institutionId sectionId assessmentId enrollmentId studentMemberId score note recordedByUserId createdAt updatedAt";
const SECTION_SESSION_SUMMARY_SELECT_FIELDS = "_id sectionId sessionType sessionDate startTime endTime status";

function createError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeString(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim();
}

function normalizeLowerString(value) {
    return normalizeString(value).toLowerCase();
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
    return Boolean(value) && mongoose.Types.ObjectId.isValid(value);
}

function formatDateOnly(value) {
    return value.toISOString().slice(0, 10);
}

function parseDateOnly(rawValue, fieldName) {
    if (rawValue instanceof Date) {
        if (Number.isNaN(rawValue.getTime())) {
            throw createError(400, `${fieldName} must be a valid date`);
        }

        return new Date(`${formatDateOnly(rawValue)}T00:00:00.000Z`);
    }

    const value = normalizeString(rawValue);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw createError(400, `${fieldName} must be in YYYY-MM-DD format`);
    }

    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || formatDateOnly(parsed) !== value) {
        throw createError(400, `${fieldName} must be a valid date`);
    }

    return parsed;
}

function normalizeRequiredString(rawValue, fieldName, maxLength) {
    const value = normalizeString(rawValue);
    if (!value) {
        throw createError(400, `${fieldName} is required`);
    }

    if (value.length > maxLength) {
        throw createError(400, `${fieldName} must be at most ${maxLength} characters`);
    }

    return value;
}

function normalizeBoundedNullableString(rawValue, fieldName, maxLength, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : null;
    }

    if (rawValue === null) {
        return null;
    }

    const value = normalizeString(rawValue);
    if (!value) {
        return null;
    }

    if (value.length > maxLength) {
        throw createError(400, `${fieldName} must be at most ${maxLength} characters`);
    }

    return value;
}

function normalizeNullableObjectId(rawValue, fieldName, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : null;
    }

    if (rawValue === null) {
        return null;
    }

    const value = normalizeId(rawValue);
    if (!value || !isValidObjectId(value)) {
        throw createError(400, `${fieldName} is invalid`);
    }

    return value;
}

function normalizeOptionalDateOnly(rawValue, fieldName, { allowNull = false } = {}) {
    if (rawValue === undefined) {
        return undefined;
    }

    if (rawValue === null) {
        if (!allowNull) {
            throw createError(400, `${fieldName} must be a valid date`);
        }

        return null;
    }

    return parseDateOnly(rawValue, fieldName);
}

function validateAssessmentType(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        if (allowUndefined) {
            return undefined;
        }
        // The schema requires type; returning null here used to surface as an
        // unhandled Mongoose ValidationError (masked 500) on create.
        throw createError(400, `type is required (${ASSESSMENT_TYPES.join(", ")})`);
    }

    const value = normalizeLowerString(rawValue);
    if (!ASSESSMENT_TYPES.includes(value)) {
        throw createError(
            400,
            "type must be quiz, assignment, midterm, final, project, practical, oral, or other"
        );
    }

    return value;
}

function validateAssessmentStatus(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : null;
    }

    const value = normalizeLowerString(rawValue);
    if (!ASSESSMENT_STATUSES.includes(value)) {
        throw createError(400, "status must be draft, announced, published, or archived");
    }

    return value;
}

function validateAssessmentListStatus(rawValue) {
    if (rawValue === undefined) {
        return "all";
    }

    const value = normalizeLowerString(rawValue);
    if (!ASSESSMENT_LIST_STATUSES.includes(value)) {
        throw createError(400, "status must be draft, announced, published, archived, or all");
    }

    return value;
}

function validatePositiveNumber(rawValue, fieldName, { allowUndefined = false, max = null } = {}) {
    if (rawValue === undefined) {
        if (allowUndefined) {
            return undefined;
        }

        throw createError(400, `${fieldName} is required`);
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value) || value <= 0) {
        throw createError(400, `${fieldName} must be a positive number`);
    }

    if (max !== null && value > max) {
        throw createError(400, `${fieldName} must be at most ${max}`);
    }

    return value;
}

function validateNullableScore(rawValue, maxScore, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : null;
    }

    if (rawValue === null) {
        return null;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
        throw createError(400, "score must be numeric");
    }

    if (value < 0) {
        throw createError(400, "score must be at least 0");
    }

    if (value > maxScore) {
        throw createError(400, "score must not exceed maxScore");
    }

    return value;
}

function validateCreateAssessmentInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const input = {
        title: normalizeRequiredString(payload.title, "title", MAX_TITLE_LENGTH),
        description: normalizeBoundedNullableString(payload.description, "description", MAX_DESCRIPTION_LENGTH),
        type: validateAssessmentType(payload.type),
        assessmentDate: normalizeOptionalDateOnly(payload.assessmentDate, "assessmentDate"),
        sectionSessionId: normalizeNullableObjectId(payload.sectionSessionId, "sectionSessionId", {
            allowUndefined: true,
        }),
        maxScore: validatePositiveNumber(payload.maxScore, "maxScore"),
        weight: validatePositiveNumber(payload.weight, "weight", { max: 100 }),
    };

    if (input.assessmentDate === undefined && !input.sectionSessionId) {
        throw createError(400, "assessmentDate is required when sectionSessionId is not provided");
    }

    return input;
}

function validateUpdateAssessmentInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const allowedFields = ["title", "description", "type", "assessmentDate", "sectionSessionId", "maxScore", "weight"];
    const invalidFields = Object.keys(payload).filter((key) => !allowedFields.includes(key));
    if (invalidFields.length) {
        throw createError(400, `Cannot update: ${invalidFields.join(", ")}`);
    }

    if (!Object.keys(payload).length) {
        throw createError(400, "At least one field must be provided");
    }

    const updates = {};

    if (payload.title !== undefined) {
        updates.title = normalizeRequiredString(payload.title, "title", MAX_TITLE_LENGTH);
    }

    if (payload.description !== undefined) {
        updates.description = normalizeBoundedNullableString(payload.description, "description", MAX_DESCRIPTION_LENGTH, {
            allowUndefined: true,
        });
    }

    if (payload.type !== undefined) {
        updates.type = validateAssessmentType(payload.type, { allowUndefined: true });
    }

    if (payload.assessmentDate !== undefined) {
        updates.assessmentDate = normalizeOptionalDateOnly(payload.assessmentDate, "assessmentDate", {
            allowNull: true,
        });
    }

    if (payload.sectionSessionId !== undefined) {
        updates.sectionSessionId = normalizeNullableObjectId(payload.sectionSessionId, "sectionSessionId", {
            allowUndefined: true,
        });
    }

    if (payload.maxScore !== undefined) {
        updates.maxScore = validatePositiveNumber(payload.maxScore, "maxScore", { allowUndefined: true });
    }

    if (payload.weight !== undefined) {
        updates.weight = validatePositiveNumber(payload.weight, "weight", { allowUndefined: true, max: 100 });
    }

    return updates;
}

function validateAssessmentStatusUpdateInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const invalidFields = Object.keys(payload).filter((key) => key !== "status");
    if (invalidFields.length) {
        throw createError(400, "Only status can be updated");
    }

    if (payload.status === undefined) {
        throw createError(400, "status is required");
    }

    return {
        status: validateAssessmentStatus(payload.status),
    };
}

function validateListAssessmentsQuery(query = {}) {
    return {
        status: validateAssessmentListStatus(query.status),
    };
}

function validateListMyResultsQuery(query = {}) {
    const sectionId = normalizeId(query.sectionId);
    const semesterId = normalizeId(query.semesterId);

    if (sectionId && !isValidObjectId(sectionId)) {
        throw createError(400, "sectionId is invalid");
    }

    if (semesterId && !isValidObjectId(semesterId)) {
        throw createError(400, "semesterId is invalid");
    }

    return {
        sectionId: sectionId || null,
        semesterId: semesterId || null,
    };
}

function validateAssessmentResultsInput(payload, assessment) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    if (!Array.isArray(payload.entries) || !payload.entries.length) {
        throw createError(400, "entries must be a non-empty array");
    }

    const seenEnrollmentIds = new Set();
    const entries = payload.entries.map((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw createError(400, `entries[${index}] must be an object`);
        }

        const enrollmentId = normalizeId(entry.enrollmentId);
        if (!enrollmentId || !isValidObjectId(enrollmentId)) {
            throw createError(400, `entries[${index}].enrollmentId is invalid`);
        }

        if (seenEnrollmentIds.has(enrollmentId)) {
            throw createError(400, "entries must not contain duplicate enrollmentId values");
        }
        seenEnrollmentIds.add(enrollmentId);

        const score = validateNullableScore(entry.score, assessment.maxScore, { allowUndefined: true });
        const note = normalizeBoundedNullableString(entry.note, `entries[${index}].note`, MAX_NOTE_LENGTH, {
            allowUndefined: true,
        });

        if (score === undefined && note === undefined) {
            throw createError(400, `entries[${index}] must include score and/or note`);
        }

        return {
            enrollmentId,
            score,
            note,
        };
    });

    return { entries };
}

function buildSectionSummary(section) {
    if (!section) {
        return null;
    }

    return {
        id: section._id.toString(),
        code: section.code,
        title: section.title || null,
    };
}

function buildSubjectSummary(subject) {
    if (!subject) {
        return null;
    }

    return {
        id: subject._id.toString(),
        code: subject.code,
        name: subject.name,
    };
}

function buildStudentSummary({ profile, user }) {
    return {
        fullName: profile?.fullName || null,
        email: user?.email || null,
    };
}

function buildSectionSessionSummary(sectionSession) {
    if (!sectionSession) {
        return null;
    }

    return {
        id: sectionSession._id.toString(),
        sessionType: sectionSession.sessionType,
        sessionDate: formatDateOnly(new Date(sectionSession.sessionDate)),
        startTime: sectionSession.startTime,
        endTime: sectionSession.endTime,
        status: sectionSession.status,
    };
}

function toAssessmentResponse(assessment, { sectionSession = null } = {}) {
    const response = {
        id: assessment._id.toString(),
        institutionId: assessment.institutionId.toString(),
        sectionId: assessment.sectionId.toString(),
        sectionSessionId: assessment.sectionSessionId ? assessment.sectionSessionId.toString() : null,
        title: assessment.title,
        description: assessment.description || null,
        type: assessment.type,
        assessmentDate: formatDateOnly(new Date(assessment.assessmentDate)),
        maxScore: assessment.maxScore,
        weight: assessment.weight,
        status: assessment.status,
        publishedAt: assessment.publishedAt || null,
        publishedByUserId: assessment.publishedByUserId?.toString() || null,
        createdByUserId: assessment.createdByUserId?.toString() || null,
        createdAt: assessment.createdAt,
        updatedAt: assessment.updatedAt,
    };

    const sectionSessionSummary = buildSectionSessionSummary(sectionSession);
    if (sectionSessionSummary) {
        response.sectionSession = sectionSessionSummary;
    }

    return response;
}

function toAssessmentListItem(assessment) {
    return {
        id: assessment._id.toString(),
        sectionSessionId: assessment.sectionSessionId ? assessment.sectionSessionId.toString() : null,
        title: assessment.title,
        type: assessment.type,
        assessmentDate: formatDateOnly(new Date(assessment.assessmentDate)),
        maxScore: assessment.maxScore,
        weight: assessment.weight,
        status: assessment.status,
        publishedAt: assessment.publishedAt || null,
        updatedAt: assessment.updatedAt,
    };
}

function toAssessmentResultResponse({ assessmentResult, profile, user }) {
    return {
        id: assessmentResult._id.toString(),
        assessmentId: assessmentResult.assessmentId.toString(),
        enrollmentId: assessmentResult.enrollmentId.toString(),
        studentMemberId: assessmentResult.studentMemberId.toString(),
        score: assessmentResult.score ?? null,
        note: assessmentResult.note || null,
        recordedByUserId: assessmentResult.recordedByUserId?.toString() || null,
        createdAt: assessmentResult.createdAt,
        updatedAt: assessmentResult.updatedAt,
        student: buildStudentSummary({
            profile,
            user,
        }),
    };
}

function buildMyAssessmentItem({ assessment, assessmentResult, sectionSession = null }) {
    const item = {
        id: assessment._id.toString(),
        sectionSessionId: assessment.sectionSessionId ? assessment.sectionSessionId.toString() : null,
        title: assessment.title,
        type: assessment.type,
        assessmentDate: formatDateOnly(new Date(assessment.assessmentDate)),
        maxScore: assessment.maxScore,
        weight: assessment.weight,
        score: assessmentResult.score ?? null,
        note: assessmentResult.note || null,
        updatedAt: assessmentResult.updatedAt,
    };

    const sectionSessionSummary = buildSectionSessionSummary(sectionSession);
    if (sectionSessionSummary) {
        item.sectionSession = sectionSessionSummary;
    }

    return item;
}

function buildMyAssessmentVisibilityItem({ assessment, section, subject, sectionSession = null }) {
    const item = {
        id: assessment._id.toString(),
        sectionId: assessment.sectionId.toString(),
        section: buildSectionSummary(section),
        subject: buildSubjectSummary(subject),
        title: assessment.title,
        description: assessment.description || null,
        type: assessment.type,
        assessmentDate: formatDateOnly(new Date(assessment.assessmentDate)),
        status: assessment.status,
    };

    const sectionSessionSummary = buildSectionSessionSummary(sectionSession);
    if (sectionSessionSummary) {
        item.sectionSession = sectionSessionSummary;
    }

    return item;
}

async function loadSectionRecord({ institutionId, sectionId }) {
    return Section.findOne({
        _id: sectionId,
        institutionId,
    })
        .select("_id institutionId semesterId subjectId schoolClassId code title instructorMemberId status")
        .lean();
}

async function loadSubjectRecord({ institutionId, subjectId }) {
    return Subject.findOne({
        _id: subjectId,
        institutionId,
    })
        .select("_id departmentId classLevelId code name")
        .lean();
}

async function loadSchoolClassRecord({ institutionId, schoolClassId }) {
    if (!schoolClassId) {
        return null;
    }

    return SchoolClass.findOne({
        _id: schoolClassId,
        institutionId,
    })
        .select("_id classLevelId name code")
        .lean();
}

async function loadSectionSessionRecord({ institutionId, sectionId, sectionSessionId }) {
    return SectionSession.findOne({
        _id: sectionSessionId,
        institutionId,
        sectionId,
    })
        .select(SECTION_SESSION_SUMMARY_SELECT_FIELDS)
        .lean();
}

async function loadAssessmentRecord({ institutionId, sectionId, assessmentId }) {
    return Assessment.findOne({
        _id: assessmentId,
        institutionId,
        sectionId,
    })
        .select(ASSESSMENT_SELECT_FIELDS)
        .lean();
}

async function loadSectionAssessmentContext({ institutionId, sectionId }) {
    const section = await loadSectionRecord({ institutionId, sectionId });
    if (!section) {
        throw createError(404, "Section not found");
    }

    const [subject, schoolClass] = await Promise.all([
        loadSubjectRecord({
            institutionId,
            subjectId: section.subjectId,
        }),
        loadSchoolClassRecord({
            institutionId,
            schoolClassId: section.schoolClassId,
        }),
    ]);

    if (!subject) {
        throw createError(404, "Subject not found");
    }

    if (section.schoolClassId && !schoolClass) {
        throw createError(404, "Class not found");
    }

    return {
        section,
        subject,
        schoolClass,
    };
}

async function loadSectionSessionForAssessment({ institutionId, sectionId, sectionSessionId }) {
    if (!sectionSessionId) {
        return null;
    }

    const sectionSession = await loadSectionSessionRecord({
        institutionId,
        sectionId,
        sectionSessionId,
    });

    if (!sectionSession) {
        throw createError(404, "Section session not found");
    }

    return sectionSession;
}

async function loadOptionalAssessmentSectionSession({ institutionId, sectionId, sectionSessionId }) {
    if (!sectionSessionId) {
        return null;
    }

    return loadSectionSessionRecord({
        institutionId,
        sectionId,
        sectionSessionId,
    });
}

function ensureAssessmentIsNotArchived(assessment) {
    if (assessment.status === "archived") {
        throw createError(409, "Archived assessments are read-only");
    }
}

function ensureAssessmentIsDraft(assessment) {
    if (assessment.status !== "draft") {
        throw createError(409, "Only draft assessments can be updated");
    }
}

function ensureNextAssessmentLinkingState({ nextAssessmentDate, nextSectionSessionId }) {
    if (!nextAssessmentDate && !nextSectionSessionId) {
        throw createError(400, "assessmentDate is required when sectionSessionId is not provided");
    }
}

function calculateWeightedContribution({ score, maxScore, weight }) {
    if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || !Number.isFinite(weight)) {
        return 0;
    }

    return (score / maxScore) * weight;
}

function isFinalizedWeightTotal(weightTotal) {
    return Math.abs(weightTotal - 100) <= WEIGHT_EPSILON;
}

async function loadStudentMaps({ institutionId, studentMemberIds }) {
    if (!studentMemberIds.length) {
        return {
            membershipById: new Map(),
            profileByMembershipId: new Map(),
            userById: new Map(),
        };
    }

    const [memberships, profiles] = await Promise.all([
        Membership.find({
            _id: { $in: studentMemberIds },
            institutionId,
        })
            .select("_id userId")
            .lean(),
        MemberProfile.find({
            membershipId: { $in: studentMemberIds },
            institutionId,
        })
            .select("_id membershipId fullName")
            .lean(),
    ]);

    const membershipById = new Map(memberships.map((membership) => [membership._id.toString(), membership]));
    const profileByMembershipId = new Map(
        profiles.map((profile) => [profile.membershipId.toString(), profile])
    );

    const userIds = [...new Set(memberships.map((membership) => normalizeId(membership.userId)).filter(Boolean))];
    const users = userIds.length
        ? await User.find({
              _id: { $in: userIds },
          })
              .select("_id email")
              .lean()
        : [];
    const userById = new Map(users.map((user) => [user._id.toString(), user]));

    return {
        membershipById,
        profileByMembershipId,
        userById,
    };
}

function sortStudentItems(left, right) {
    const leftName = normalizeLowerString(left.student.fullName || left.student.email || "");
    const rightName = normalizeLowerString(right.student.fullName || right.student.email || "");
    const nameOrder = leftName.localeCompare(rightName);
    if (nameOrder !== 0) {
        return nameOrder;
    }

    return left.studentMemberId.localeCompare(right.studentMemberId);
}

async function enqueueAssessmentStudentJobs({
    institutionId,
    sectionId,
    section,
    subject,
    assessment,
    notificationType,
}) {
    const enrollments = await Enrollment.find({
        institutionId,
        sectionId,
        status: ACTIVE_ENROLLMENT_STATUS,
    })
        .select("studentMemberId")
        .lean();

    if (!enrollments.length) {
        return;
    }

    const studentMemberIds = [...new Set(enrollments.map((enrollment) => normalizeId(enrollment.studentMemberId)).filter(Boolean))];
    if (!studentMemberIds.length) {
        return;
    }

    const memberships = await Membership.find({
        _id: { $in: studentMemberIds },
        institutionId,
        role: "student",
        status: "active",
    })
        .select("_id")
        .lean();

    if (!memberships.length) {
        return;
    }

    let entityIdByMembershipId = new Map();
    if (notificationType === "published") {
        const results = await AssessmentResult.find({
            institutionId,
            assessmentId: assessment._id,
            studentMemberId: { $in: memberships.map((membership) => membership._id) },
        }).select("_id studentMemberId").lean();
        entityIdByMembershipId = new Map(results.map((result) => [
            normalizeId(result.studentMemberId),
            result._id,
        ]));
    }

    const enqueueResults = await Promise.all(memberships.map((membership) => {
        const entityId = notificationType === "announced"
            ? assessment._id
            : entityIdByMembershipId.get(normalizeId(membership._id));
        if (!entityId) return null;
        return emailQueue.enqueueEmailJob({
            institutionId,
            entityId,
            recipientMembershipId: membership._id,
            emailType: notificationType === "announced"
                ? EMAIL_JOB_TYPES.ASSESSMENT_ANNOUNCEMENT
                : EMAIL_JOB_TYPES.ASSESSMENT_RESULT,
        });
    }));
    const notQueued = enqueueResults.filter((result) => result && !result.queued);
    if (notQueued.length) {
        console.warn("Some assessment email jobs were not queued", {
            institutionId: normalizeId(institutionId),
            entityId: normalizeId(assessment?._id),
            notificationType,
            count: notQueued.length,
            reasons: [...new Set(notQueued.map((result) => result?.reason || "unknown"))],
        });
        // TODO/verify: add a MongoDB outbox for durable non-critical email delivery after writes.
    }
}

async function notifyAssessmentStudents(input) {
    try {
        await enqueueAssessmentStudentJobs(input);
    } catch (error) {
        console.error("Failed to prepare assessment email jobs", {
            institutionId: normalizeId(input.institutionId),
            entityId: normalizeId(input.assessment?._id),
            notificationType: input.notificationType,
            error: error?.message || error,
        });
    }
}

async function ensureStaffCanManageSectionAssessments({
    institutionId,
    actorUserId,
    actorMembership,
    section,
    subject,
    schoolClass,
}) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (actorMembership.role === "student") {
        throw createError(403, "Students cannot access assessment management");
    }

    await ensureCanChangeSectionSessionStatus({
        institutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });
}

async function createAssessment({ institutionId, sectionId, actorUserId, actorMembership, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    const { section, subject, schoolClass } = await loadSectionAssessmentContext({
        institutionId,
        sectionId,
    });

    await ensureStaffCanManageSectionAssessments({
        institutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const input = validateCreateAssessmentInput(payload);
    const sectionSession = await loadSectionSessionForAssessment({
        institutionId,
        sectionId,
        sectionSessionId: input.sectionSessionId,
    });

    const assessmentDate =
        input.assessmentDate !== undefined ? input.assessmentDate : new Date(sectionSession.sessionDate);

    const enrollments = await Enrollment.find({
        institutionId,
        sectionId,
        status: ACTIVE_ENROLLMENT_STATUS,
    })
        .select("_id studentMemberId")
        .sort({ enrolledAt: 1, _id: 1 })
        .lean();

    if (!enrollments.length) {
        throw createError(409, "Assessments require at least one active enrolled student");
    }

    // DB-1: create the Assessment and seed one AssessmentResult per enrolled
    // student atomically, so a failure mid-seed can't leave an assessment with a
    // partial roster (or the reverse). Falls back to non-transactional on a
    // standalone Mongo (see withTransaction).
    const assessment = await withTransaction(async (session) => {
        const options = session ? { session } : {};
        const [createdAssessment] = await Assessment.create(
            [
                {
                    institutionId,
                    sectionId,
                    sectionSessionId: input.sectionSessionId || null,
                    title: input.title,
                    description: input.description,
                    type: input.type,
                    assessmentDate,
                    maxScore: input.maxScore,
                    weight: input.weight,
                    status: "draft",
                    createdByUserId: actorUserId,
                },
            ],
            options
        );

        await AssessmentResult.insertMany(
            enrollments.map((enrollment) => ({
                institutionId,
                sectionId,
                assessmentId: createdAssessment._id,
                enrollmentId: enrollment._id,
                studentMemberId: enrollment.studentMemberId,
                score: null,
                note: null,
                recordedByUserId: null,
            })),
            { ordered: true, ...options }
        );

        return createdAssessment;
    });

    return {
        assessment: toAssessmentResponse(assessment, {
            sectionSession,
        }),
    };
}

async function listAssessments({ institutionId, sectionId, actorUserId, actorMembership, query = {} }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    const { section, subject, schoolClass } = await loadSectionAssessmentContext({
        institutionId,
        sectionId,
    });

    await ensureStaffCanManageSectionAssessments({
        institutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const input = validateListAssessmentsQuery(query);
    const assessmentQuery = {
        institutionId,
        sectionId,
    };

    if (input.status !== "all") {
        assessmentQuery.status = input.status;
    }

    const assessments = await Assessment.find(assessmentQuery)
        .select(ASSESSMENT_SELECT_FIELDS)
        .sort({ assessmentDate: -1, createdAt: -1, _id: -1 })
        .lean();

    return {
        assessments: assessments.map(toAssessmentListItem),
    };
}

async function getAssessmentById({ institutionId, sectionId, assessmentId, actorUserId, actorMembership }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    if (!assessmentId || !isValidObjectId(assessmentId)) {
        throw createError(400, "Invalid assessment id");
    }

    const { section, subject, schoolClass } = await loadSectionAssessmentContext({
        institutionId,
        sectionId,
    });

    await ensureStaffCanManageSectionAssessments({
        institutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const assessment = await loadAssessmentRecord({
        institutionId,
        sectionId,
        assessmentId,
    });

    if (!assessment) {
        throw createError(404, "Assessment not found");
    }

    const sectionSession = await loadOptionalAssessmentSectionSession({
        institutionId,
        sectionId,
        sectionSessionId: assessment.sectionSessionId,
    });

    return {
        assessment: toAssessmentResponse(assessment, {
            sectionSession,
        }),
    };
}

async function updateAssessment({
    institutionId,
    sectionId,
    assessmentId,
    actorUserId,
    actorMembership,
    payload,
}) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    if (!assessmentId || !isValidObjectId(assessmentId)) {
        throw createError(400, "Invalid assessment id");
    }

    const { section, subject, schoolClass } = await loadSectionAssessmentContext({
        institutionId,
        sectionId,
    });

    await ensureStaffCanManageSectionAssessments({
        institutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const assessment = await loadAssessmentRecord({
        institutionId,
        sectionId,
        assessmentId,
    });

    if (!assessment) {
        throw createError(404, "Assessment not found");
    }

    ensureAssessmentIsNotArchived(assessment);
    ensureAssessmentIsDraft(assessment);

    const updates = validateUpdateAssessmentInput(payload);
    const nextSectionSessionId =
        updates.sectionSessionId !== undefined
            ? updates.sectionSessionId
            : assessment.sectionSessionId
              ? assessment.sectionSessionId.toString()
              : null;
    const sectionSession = await loadSectionSessionForAssessment({
        institutionId,
        sectionId,
        sectionSessionId: nextSectionSessionId,
    });

    const shouldDefaultDateFromSession =
        updates.assessmentDate === undefined && updates.sectionSessionId !== undefined && Boolean(sectionSession);
    const nextAssessmentDate =
        updates.assessmentDate !== undefined
            ? updates.assessmentDate || (sectionSession ? new Date(sectionSession.sessionDate) : null)
            : shouldDefaultDateFromSession
              ? new Date(sectionSession.sessionDate)
            : assessment.assessmentDate
              ? new Date(assessment.assessmentDate)
              : null;
    ensureNextAssessmentLinkingState({
        nextAssessmentDate,
        nextSectionSessionId,
    });

    const safeUpdates = {};
    if (updates.title !== undefined) {
        safeUpdates.title = updates.title;
    }
    if (updates.description !== undefined) {
        safeUpdates.description = updates.description;
    }
    if (updates.type !== undefined) {
        safeUpdates.type = updates.type;
    }
    if (updates.assessmentDate !== undefined) {
        safeUpdates.assessmentDate = nextAssessmentDate;
    }
    if (updates.sectionSessionId !== undefined) {
        safeUpdates.sectionSessionId = updates.sectionSessionId;
        if (updates.assessmentDate === undefined && sectionSession) {
            safeUpdates.assessmentDate = nextAssessmentDate;
        }
    }
    if (updates.maxScore !== undefined) {
        safeUpdates.maxScore = updates.maxScore;
    }
    if (updates.weight !== undefined) {
        safeUpdates.weight = updates.weight;
    }

    const updatedAssessment = await Assessment.findOneAndUpdate(
        {
            _id: assessmentId,
            institutionId,
            sectionId,
        },
        { $set: safeUpdates },
        { returnDocument: "after", runValidators: true }
    )
        .select(ASSESSMENT_SELECT_FIELDS)
        .lean();

    if (!updatedAssessment) {
        throw createError(404, "Assessment not found");
    }

    return {
        assessment: toAssessmentResponse(updatedAssessment, {
            sectionSession,
        }),
    };
}

async function updateAssessmentStatus({
    institutionId,
    sectionId,
    assessmentId,
    actorUserId,
    actorMembership,
    payload,
}) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    if (!assessmentId || !isValidObjectId(assessmentId)) {
        throw createError(400, "Invalid assessment id");
    }

    const { section, subject, schoolClass } = await loadSectionAssessmentContext({
        institutionId,
        sectionId,
    });

    await ensureStaffCanManageSectionAssessments({
        institutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const assessment = await loadAssessmentRecord({
        institutionId,
        sectionId,
        assessmentId,
    });

    if (!assessment) {
        throw createError(404, "Assessment not found");
    }

    ensureAssessmentIsNotArchived(assessment);

    const input = validateAssessmentStatusUpdateInput(payload);
    const currentStatus = assessment.status;

    if (input.status === "announced") {
        if (currentStatus !== "draft") {
            throw createError(409, "Only draft assessments can be announced");
        }

        const updatedAssessment = await Assessment.findOneAndUpdate(
            {
                _id: assessmentId,
                institutionId,
                sectionId,
            },
            {
                $set: {
                    status: "announced",
                },
            },
            { returnDocument: "after", runValidators: true }
        )
            .select(ASSESSMENT_SELECT_FIELDS)
            .lean();

        await notifyAssessmentStudents({
            institutionId,
            sectionId,
            section,
            subject,
            assessment: updatedAssessment,
            notificationType: "announced",
        });

        return {
            assessment: toAssessmentResponse(updatedAssessment, {
                sectionSession: await loadOptionalAssessmentSectionSession({
                    institutionId,
                    sectionId,
                    sectionSessionId: updatedAssessment.sectionSessionId,
                }),
            }),
        };
    }

    if (input.status === "published") {
        if (!["draft", "announced"].includes(currentStatus)) {
            throw createError(409, "Only draft or announced assessments can be published");
        }

        const [assessmentResults, publishedAssessments] = await Promise.all([
            AssessmentResult.find({
                institutionId,
                sectionId,
                assessmentId,
            })
                .select("_id score")
                .lean(),
            Assessment.find({
                institutionId,
                sectionId,
                status: "published",
                _id: { $ne: assessmentId },
            })
                .select("_id weight")
                .lean(),
        ]);

        if (!assessmentResults.length) {
            throw createError(409, "Assessment results are missing for this assessment");
        }

        const hasUngradedResults = assessmentResults.some((assessmentResult) => assessmentResult.score === null);
        if (hasUngradedResults) {
            throw createError(409, "All assessment results must have scores before publishing");
        }

        const publishedWeightTotal = publishedAssessments.reduce(
            (sum, publishedAssessment) => sum + publishedAssessment.weight,
            0
        );
        if (publishedWeightTotal + assessment.weight > 100 + WEIGHT_EPSILON) {
            throw createError(409, "Published section assessment weight cannot exceed 100");
        }

        const updatedAssessment = await Assessment.findOneAndUpdate(
            {
                _id: assessmentId,
                institutionId,
                sectionId,
            },
            {
                $set: {
                    status: "published",
                    publishedAt: new Date(),
                    publishedByUserId: actorUserId,
                },
            },
            { returnDocument: "after", runValidators: true }
        )
            .select(ASSESSMENT_SELECT_FIELDS)
            .lean();

        await notifyAssessmentStudents({
            institutionId,
            sectionId,
            section,
            subject,
            assessment: updatedAssessment,
            notificationType: "published",
        });

        return {
            assessment: toAssessmentResponse(updatedAssessment, {
                sectionSession: await loadOptionalAssessmentSectionSession({
                    institutionId,
                    sectionId,
                    sectionSessionId: updatedAssessment.sectionSessionId,
                }),
            }),
        };
    }

    if (input.status !== "archived") {
        throw createError(409, "Unsupported assessment status transition");
    }

    if (!["draft", "announced", "published"].includes(currentStatus)) {
        throw createError(409, "Only draft, announced, or published assessments can be archived");
    }

    const updatedAssessment = await Assessment.findOneAndUpdate(
        {
            _id: assessmentId,
            institutionId,
            sectionId,
        },
        {
            $set: {
                status: "archived",
            },
        },
        { returnDocument: "after", runValidators: true }
    )
        .select(ASSESSMENT_SELECT_FIELDS)
        .lean();

    return {
        assessment: toAssessmentResponse(updatedAssessment, {
            sectionSession: await loadOptionalAssessmentSectionSession({
                institutionId,
                sectionId,
                sectionSessionId: updatedAssessment.sectionSessionId,
            }),
        }),
    };
}

async function upsertAssessmentResults({
    institutionId,
    sectionId,
    assessmentId,
    actorUserId,
    actorMembership,
    payload,
}) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    if (!assessmentId || !isValidObjectId(assessmentId)) {
        throw createError(400, "Invalid assessment id");
    }

    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    const { section, subject, schoolClass } = await loadSectionAssessmentContext({
        institutionId,
        sectionId,
    });

    await ensureStaffCanManageSectionAssessments({
        institutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const assessment = await loadAssessmentRecord({
        institutionId,
        sectionId,
        assessmentId,
    });

    if (!assessment) {
        throw createError(404, "Assessment not found");
    }

    ensureAssessmentIsNotArchived(assessment);

    const input = validateAssessmentResultsInput(payload, assessment);
    if (assessment.status === "published") {
        const hasNullPublishedScoreUpdate = input.entries.some((entry) => entry.score === null);
        if (hasNullPublishedScoreUpdate) {
            throw createError(400, "Published assessment results must keep a score");
        }
    }

    const enrollmentIds = input.entries.map((entry) => entry.enrollmentId);
    const existingResults = await AssessmentResult.find({
        institutionId,
        sectionId,
        assessmentId,
        enrollmentId: { $in: enrollmentIds },
    })
        .select(ASSESSMENT_RESULT_SELECT_FIELDS)
        .lean();

    if (existingResults.length !== enrollmentIds.length) {
        throw createError(404, "One or more assessment results were not found");
    }

    const existingResultByEnrollmentId = new Map(
        existingResults.map((assessmentResult) => [assessmentResult.enrollmentId.toString(), assessmentResult])
    );

    const operations = input.entries.map((entry) => {
        const existingResult = existingResultByEnrollmentId.get(entry.enrollmentId);
        const nextScore = entry.score !== undefined ? entry.score : existingResult.score;
        const nextNote = entry.note !== undefined ? entry.note : existingResult.note;

        return {
            updateOne: {
                filter: {
                    institutionId,
                    sectionId,
                    assessmentId,
                    enrollmentId: existingResult.enrollmentId,
                },
                update: {
                    $set: {
                        studentMemberId: existingResult.studentMemberId,
                        score: nextScore,
                        note: nextNote,
                        recordedByUserId: actorUserId,
                    },
                    $setOnInsert: {
                        institutionId,
                        sectionId,
                        assessmentId,
                        enrollmentId: existingResult.enrollmentId,
                    },
                },
                upsert: true,
            },
        };
    });

    if (operations.length) {
        await AssessmentResult.bulkWrite(operations, { ordered: true });
    }

    const updatedResults = await AssessmentResult.find({
        institutionId,
        sectionId,
        assessmentId,
        enrollmentId: { $in: enrollmentIds },
    })
        .select(ASSESSMENT_RESULT_SELECT_FIELDS)
        .lean();
    const updatedResultByEnrollmentId = new Map(
        updatedResults.map((assessmentResult) => [assessmentResult.enrollmentId.toString(), assessmentResult])
    );

    const studentMemberIds = [
        ...new Set(updatedResults.map((assessmentResult) => assessmentResult.studentMemberId.toString())),
    ];
    const { membershipById, profileByMembershipId, userById } = await loadStudentMaps({
        institutionId,
        studentMemberIds,
    });

    return {
        assessmentResults: input.entries.map((entry) => {
            const assessmentResult = updatedResultByEnrollmentId.get(entry.enrollmentId);
            const membership = membershipById.get(assessmentResult.studentMemberId.toString()) || null;
            const profile = profileByMembershipId.get(assessmentResult.studentMemberId.toString()) || null;
            const user = membership?.userId ? userById.get(membership.userId.toString()) || null : null;

            return toAssessmentResultResponse({
                assessmentResult,
                profile,
                user,
            });
        }),
    };
}

async function listAssessmentResults({
    institutionId,
    sectionId,
    assessmentId,
    actorUserId,
    actorMembership,
}) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    if (!assessmentId || !isValidObjectId(assessmentId)) {
        throw createError(400, "Invalid assessment id");
    }

    const { section, subject, schoolClass } = await loadSectionAssessmentContext({
        institutionId,
        sectionId,
    });

    await ensureStaffCanManageSectionAssessments({
        institutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const assessment = await loadAssessmentRecord({
        institutionId,
        sectionId,
        assessmentId,
    });

    if (!assessment) {
        throw createError(404, "Assessment not found");
    }

    const assessmentResults = await AssessmentResult.find({
        institutionId,
        sectionId,
        assessmentId,
    })
        .select(ASSESSMENT_RESULT_SELECT_FIELDS)
        .lean();

    const studentMemberIds = [
        ...new Set(assessmentResults.map((assessmentResult) => assessmentResult.studentMemberId.toString())),
    ];
    const { membershipById, profileByMembershipId, userById } = await loadStudentMaps({
        institutionId,
        studentMemberIds,
    });

    const results = assessmentResults
        .map((assessmentResult) => {
            const membership = membershipById.get(assessmentResult.studentMemberId.toString()) || null;
            const profile = profileByMembershipId.get(assessmentResult.studentMemberId.toString()) || null;
            const user = membership?.userId ? userById.get(membership.userId.toString()) || null : null;

            return toAssessmentResultResponse({
                assessmentResult,
                profile,
                user,
            });
        })
        .sort(sortStudentItems);

    return {
        assessment: toAssessmentResponse(assessment, {
            sectionSession: await loadOptionalAssessmentSectionSession({
                institutionId,
                sectionId,
                sectionSessionId: assessment.sectionSessionId,
            }),
        }),
        assessmentResults: results,
    };
}

async function getSectionResults({ institutionId, sectionId, actorUserId, actorMembership }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    const { section, subject, schoolClass } = await loadSectionAssessmentContext({
        institutionId,
        sectionId,
    });

    await ensureStaffCanManageSectionAssessments({
        institutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const publishedAssessments = await Assessment.find({
        institutionId,
        sectionId,
        status: "published",
    })
        .select(ASSESSMENT_SELECT_FIELDS)
        .sort({ assessmentDate: 1, createdAt: 1, _id: 1 })
        .lean();

    const publishedWeightTotal = publishedAssessments.reduce((sum, assessment) => sum + assessment.weight, 0);

    if (!publishedAssessments.length) {
        return {
            sectionResults: {
                section: buildSectionSummary(section),
                subject: buildSubjectSummary(subject),
                summary: {
                    publishedAssessmentCount: 0,
                    publishedWeightTotal,
                    isFinalized: isFinalizedWeightTotal(publishedWeightTotal),
                },
                perStudent: [],
            },
        };
    }

    const assessmentById = new Map(
        publishedAssessments.map((assessment) => [assessment._id.toString(), assessment])
    );
    const assessmentIds = publishedAssessments.map((assessment) => assessment._id);
    const assessmentResults = await AssessmentResult.find({
        institutionId,
        sectionId,
        assessmentId: { $in: assessmentIds },
    })
        .select(ASSESSMENT_RESULT_SELECT_FIELDS)
        .lean();

    const studentMetricsById = new Map();
    for (const assessmentResult of assessmentResults) {
        const assessment = assessmentById.get(assessmentResult.assessmentId.toString());
        if (!assessment || assessmentResult.score === null) {
            continue;
        }

        const studentMemberId = assessmentResult.studentMemberId.toString();
        if (!studentMetricsById.has(studentMemberId)) {
            studentMetricsById.set(studentMemberId, {
                applicableWeightTotal: 0,
                earnedWeightedScore: 0,
            });
        }

        const metrics = studentMetricsById.get(studentMemberId);
        metrics.applicableWeightTotal += assessment.weight;
        metrics.earnedWeightedScore += calculateWeightedContribution({
            score: assessmentResult.score,
            maxScore: assessment.maxScore,
            weight: assessment.weight,
        });
    }

    const studentMemberIds = [...studentMetricsById.keys()];
    const { membershipById, profileByMembershipId, userById } = await loadStudentMaps({
        institutionId,
        studentMemberIds,
    });

    const perStudent = [...studentMetricsById.entries()]
        .map(([studentMemberId, metrics]) => {
            const membership = membershipById.get(studentMemberId) || null;
            const profile = profileByMembershipId.get(studentMemberId) || null;
            const user = membership?.userId ? userById.get(membership.userId.toString()) || null : null;
            const percentage = metrics.applicableWeightTotal
                ? (metrics.earnedWeightedScore / metrics.applicableWeightTotal) * 100
                : 0;

            return {
                studentMemberId,
                student: buildStudentSummary({
                    profile,
                    user,
                }),
                applicableWeightTotal: metrics.applicableWeightTotal,
                earnedWeightedScore: metrics.earnedWeightedScore,
                percentage,
            };
        })
        .sort(sortStudentItems);

    return {
        sectionResults: {
            section: buildSectionSummary(section),
            subject: buildSubjectSummary(subject),
            summary: {
                publishedAssessmentCount: publishedAssessments.length,
                publishedWeightTotal,
                isFinalized: isFinalizedWeightTotal(publishedWeightTotal),
            },
            perStudent,
        },
    };
}

async function listMyResults({ institutionId, actorUserId, actorMembership, query = {} }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (actorMembership.role !== "student") {
        throw createError(403, "Only students can view their own results");
    }

    const input = validateListMyResultsQuery(query);
    const sectionQuery = {
        institutionId,
    };

    if (input.sectionId) {
        sectionQuery._id = input.sectionId;
    }

    if (input.semesterId) {
        sectionQuery.semesterId = input.semesterId;
    }

    const sections = await Section.find(sectionQuery)
        .select("_id semesterId subjectId code title")
        .lean();

    if (!sections.length) {
        return {
            myResults: [],
        };
    }

    const sectionIds = sections.map((section) => section._id);
    const sectionById = new Map(sections.map((section) => [section._id.toString(), section]));
    const subjectIds = [...new Set(sections.map((section) => normalizeId(section.subjectId)).filter(Boolean))];
    const [subjects, publishedAssessments] = await Promise.all([
        subjectIds.length
            ? Subject.find({
                  _id: { $in: subjectIds },
                  institutionId,
              })
                  .select("_id code name")
                  .lean()
            : [],
        Assessment.find({
            institutionId,
            sectionId: { $in: sectionIds },
            status: "published",
        })
            .select(ASSESSMENT_SELECT_FIELDS)
            .sort({ assessmentDate: 1, createdAt: 1, _id: 1 })
            .lean(),
    ]);

    if (!publishedAssessments.length) {
        return {
            myResults: [],
        };
    }

    const subjectById = new Map(subjects.map((subject) => [subject._id.toString(), subject]));
    const assessmentIds = publishedAssessments.map((assessment) => assessment._id);
    const assessmentById = new Map(
        publishedAssessments.map((assessment) => [assessment._id.toString(), assessment])
    );
    const sectionSessionIds = [
        ...new Set(publishedAssessments.map((assessment) => normalizeId(assessment.sectionSessionId)).filter(Boolean)),
    ];
    const [assessmentResults, sectionSessions] = await Promise.all([
        AssessmentResult.find({
            institutionId,
            studentMemberId: actorMembership._id,
            sectionId: { $in: sectionIds },
            assessmentId: { $in: assessmentIds },
        })
            .select(ASSESSMENT_RESULT_SELECT_FIELDS)
            .lean(),
        sectionSessionIds.length
            ? SectionSession.find({
                  _id: { $in: sectionSessionIds },
                  institutionId,
              })
                  .select(SECTION_SESSION_SUMMARY_SELECT_FIELDS)
                  .lean()
            : [],
    ]);

    if (!assessmentResults.length) {
        return {
            myResults: [],
        };
    }

    const sectionSessionById = new Map(
        sectionSessions.map((sectionSession) => [sectionSession._id.toString(), sectionSession])
    );
    const groupedResults = new Map();

    for (const assessmentResult of assessmentResults) {
        const sectionKey = assessmentResult.sectionId.toString();
        const section = sectionById.get(sectionKey);
        const assessment = assessmentById.get(assessmentResult.assessmentId.toString());
        if (!section || !assessment) {
            continue;
        }

        if (!groupedResults.has(sectionKey)) {
            const subject = section.subjectId ? subjectById.get(section.subjectId.toString()) || null : null;
            groupedResults.set(sectionKey, {
                section: buildSectionSummary(section),
                subject: buildSubjectSummary(subject),
                semesterId: section.semesterId.toString(),
                summary: {
                    publishedAssessmentCount: 0,
                    publishedWeightTotal: 0,
                    isFinalized: false,
                    applicableWeightTotal: 0,
                    earnedWeightedScore: 0,
                    percentage: 0,
                },
                assessments: [],
            });
        }

        const group = groupedResults.get(sectionKey);
        group.summary.publishedAssessmentCount += 1;
        group.summary.publishedWeightTotal += assessment.weight;
        if (assessmentResult.score !== null) {
            group.summary.applicableWeightTotal += assessment.weight;
            group.summary.earnedWeightedScore += calculateWeightedContribution({
                score: assessmentResult.score,
                maxScore: assessment.maxScore,
                weight: assessment.weight,
            });
        }

        group.assessments.push(
            buildMyAssessmentItem({
                assessment,
                assessmentResult,
                sectionSession: assessment.sectionSessionId
                    ? sectionSessionById.get(assessment.sectionSessionId.toString()) || null
                    : null,
            })
        );
    }

    const myResults = [...groupedResults.values()]
        .map((group) => {
            group.summary.isFinalized = isFinalizedWeightTotal(group.summary.publishedWeightTotal);
            group.summary.percentage = group.summary.applicableWeightTotal
                ? (group.summary.earnedWeightedScore / group.summary.applicableWeightTotal) * 100
                : 0;
            group.assessments.sort((left, right) => {
                const dateOrder = left.assessmentDate.localeCompare(right.assessmentDate);
                if (dateOrder !== 0) {
                    return dateOrder;
                }

                return left.id.localeCompare(right.id);
            });

            return group;
        })
        .sort((left, right) => {
            const leftKey = normalizeLowerString(left.section.title || left.section.code || "");
            const rightKey = normalizeLowerString(right.section.title || right.section.code || "");
            const keyOrder = leftKey.localeCompare(rightKey);
            if (keyOrder !== 0) {
                return keyOrder;
            }

            return left.section.id.localeCompare(right.section.id);
        });

    return {
        myResults,
    };
}

async function listMyAssessments({ institutionId, actorUserId, actorMembership }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (actorMembership.role !== "student") {
        throw createError(403, "Only students can view their own assessments");
    }

    const enrollments = await Enrollment.find({
        institutionId,
        studentMemberId: actorMembership._id,
        status: ACTIVE_ENROLLMENT_STATUS,
    })
        .select("_id sectionId")
        .lean();

    if (!enrollments.length) {
        return {
            myAssessments: [],
        };
    }

    const sectionIds = [...new Set(enrollments.map((enrollment) => enrollment.sectionId.toString()))];
    const sections = await Section.find({
        institutionId,
        _id: { $in: sectionIds },
    })
        .select("_id subjectId code title")
        .lean();

    if (!sections.length) {
        return {
            myAssessments: [],
        };
    }

    const sectionById = new Map(sections.map((section) => [section._id.toString(), section]));
    const scopedSectionIds = sections.map((section) => section._id);
    const subjectIds = [...new Set(sections.map((section) => normalizeId(section.subjectId)).filter(Boolean))];
    const [subjects, assessments] = await Promise.all([
        subjectIds.length
            ? Subject.find({
                  _id: { $in: subjectIds },
                  institutionId,
              })
                  .select("_id code name")
                  .lean()
            : [],
        Assessment.find({
            institutionId,
            sectionId: { $in: scopedSectionIds },
            status: { $in: STUDENT_VISIBLE_ASSESSMENT_STATUSES },
        })
            .select(ASSESSMENT_SELECT_FIELDS)
            .sort({ assessmentDate: 1, createdAt: 1, _id: 1 })
            .lean(),
    ]);

    if (!assessments.length) {
        return {
            myAssessments: [],
        };
    }

    const subjectById = new Map(subjects.map((subject) => [subject._id.toString(), subject]));
    const sectionSessionIds = [
        ...new Set(assessments.map((assessment) => normalizeId(assessment.sectionSessionId)).filter(Boolean)),
    ];
    const sectionSessions = sectionSessionIds.length
        ? await SectionSession.find({
              _id: { $in: sectionSessionIds },
              institutionId,
          })
              .select(SECTION_SESSION_SUMMARY_SELECT_FIELDS)
              .lean()
        : [];
    const sectionSessionById = new Map(
        sectionSessions.map((sectionSession) => [sectionSession._id.toString(), sectionSession])
    );

    const myAssessments = assessments
        .map((assessment) => {
            const section = sectionById.get(assessment.sectionId.toString()) || null;
            if (!section) {
                return null;
            }

            const subject = section.subjectId ? subjectById.get(section.subjectId.toString()) || null : null;

            return buildMyAssessmentVisibilityItem({
                assessment,
                section,
                subject,
                sectionSession: assessment.sectionSessionId
                    ? sectionSessionById.get(assessment.sectionSessionId.toString()) || null
                    : null,
            });
        })
        .filter(Boolean)
        .sort((left, right) => {
            const dateOrder = left.assessmentDate.localeCompare(right.assessmentDate);
            if (dateOrder !== 0) {
                return dateOrder;
            }

            const titleOrder = normalizeLowerString(left.title).localeCompare(normalizeLowerString(right.title));
            if (titleOrder !== 0) {
                return titleOrder;
            }

            return left.id.localeCompare(right.id);
        });

    return {
        myAssessments,
    };
}

module.exports = {
    validateCreateAssessmentInput,
    createAssessment,
    listAssessments,
    getAssessmentById,
    updateAssessment,
    updateAssessmentStatus,
    upsertAssessmentResults,
    listAssessmentResults,
    getSectionResults,
    listMyAssessments,
    listMyResults,
};
