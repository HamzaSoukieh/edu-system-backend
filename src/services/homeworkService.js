const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Assessment = require("../models/Assessment");
const Enrollment = require("../models/Enrollment");
const Homework = require("../models/Homework");
const HomeworkSubmission = require("../models/HomeworkSubmission");
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

const { HOMEWORK_TYPES, HOMEWORK_STATUSES, HOMEWORK_SUBMISSION_STATUSES, HOMEWORK_SUBMISSION_MODES } = require("../constants/homeworkConstants");
const HOMEWORK_LIST_STATUSES = [...HOMEWORK_STATUSES, "all"];
const STUDENT_VISIBLE_HOMEWORK_STATUSES = ["assigned", "closed"];
const ACTIVE_ENROLLMENT_STATUS = "enrolled";
const MAX_TITLE_LENGTH = 120;
const MAX_INSTRUCTIONS_LENGTH = 5000;
const MAX_NOTE_LENGTH = 500;
const MAX_FEEDBACK_LENGTH = 1000;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const PRIVATE_HOMEWORK_SUBMISSION_DIR = path.resolve(
    __dirname,
    "..",
    "..",
    "storage",
    "homework-submissions"
);
const HOMEWORK_SELECT_FIELDS =
    "_id institutionId sectionId sectionSessionId assessmentId title titleNormalized instructions type dueAt submissionMode allowLate status createdByUserId archivedAt createdAt updatedAt";
const HOMEWORK_SUBMISSION_SELECT_FIELDS =
    "_id institutionId homeworkId sectionId enrollmentId studentMemberId submissionMethod fileKey originalFilename mimeType sizeBytes submittedAt status studentNote instructorFeedback markedByUserId createdAt updatedAt";

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

function normalizeEmail(value) {
    return normalizeLowerString(value);
}

function isUsableEmail(value) {
    const email = normalizeEmail(value);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeTitle(value) {
    return normalizeLowerString(value).replace(/\s+/g, " ");
}

function escapeRegex(value) {
    return normalizeString(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function validateObjectId(value, fieldName) {
    const normalized = normalizeId(value);
    if (!normalized || !isValidObjectId(normalized)) {
        throw createError(400, `${fieldName} is invalid`);
    }

    return normalized;
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

function normalizeBoundedString(rawValue, fieldName, maxLength, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : "";
    }

    if (rawValue === null) {
        return "";
    }

    const value = normalizeString(rawValue);
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

    const normalized = normalizeId(rawValue);
    if (!normalized || !isValidObjectId(normalized)) {
        throw createError(400, `${fieldName} is invalid`);
    }

    return normalized;
}

function normalizeBoolean(rawValue, fieldName, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : false;
    }

    if (typeof rawValue !== "boolean") {
        throw createError(400, `${fieldName} must be a boolean`);
    }

    return rawValue;
}

function normalizeOptionalDate(rawValue, fieldName, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : null;
    }

    if (rawValue === null || rawValue === "") {
        return null;
    }

    const parsed = rawValue instanceof Date ? new Date(rawValue) : new Date(normalizeString(rawValue));
    if (Number.isNaN(parsed.getTime())) {
        throw createError(400, `${fieldName} must be a valid date`);
    }

    return parsed;
}

function validateHomeworkType(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : "homework";
    }

    const value = normalizeLowerString(rawValue);
    if (!HOMEWORK_TYPES.includes(value)) {
        throw createError(400, "type must be homework or project");
    }

    return value;
}

function validateSubmissionMode(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : "offline";
    }

    const value = normalizeLowerString(rawValue);
    if (!HOMEWORK_SUBMISSION_MODES.includes(value)) {
        throw createError(400, "submissionMode must be none, offline, or online_upload");
    }

    return value;
}

function validateHomeworkStatus(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : "draft";
    }

    const value = normalizeLowerString(rawValue);
    if (!HOMEWORK_STATUSES.includes(value)) {
        throw createError(400, "status must be draft, assigned, closed, or archived");
    }

    return value;
}

function validateHomeworkListStatus(rawValue, { student = false } = {}) {
    if (rawValue === undefined) {
        return student ? "all" : "all";
    }

    const value = normalizeLowerString(rawValue);
    if (!HOMEWORK_LIST_STATUSES.includes(value)) {
        throw createError(400, "status must be draft, assigned, closed, archived, or all");
    }

    if (student && !["all", ...STUDENT_VISIBLE_HOMEWORK_STATUSES].includes(value)) {
        throw createError(400, "status must be assigned, closed, or all");
    }

    return value;
}

function validateSubmissionStatus(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        if (allowUndefined) {
            return undefined;
        }

        throw createError(400, "status is required");
    }

    const value = normalizeLowerString(rawValue);
    if (!HOMEWORK_SUBMISSION_STATUSES.includes(value)) {
        throw createError(400, "status must be submitted, late, missing, or returned");
    }

    return value;
}

function parsePositiveInteger(rawValue, fieldName, defaultValue) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
        return defaultValue;
    }

    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 1) {
        throw createError(400, `${fieldName} must be a positive integer`);
    }

    return value;
}

function validatePagination(query = {}) {
    const page = parsePositiveInteger(query.page, "page", DEFAULT_PAGE);
    const requestedLimit = parsePositiveInteger(query.limit, "limit", DEFAULT_LIMIT);
    const limit = Math.min(requestedLimit, MAX_LIMIT);

    return {
        page,
        limit,
        skip: (page - 1) * limit,
    };
}

function validateCreateHomeworkInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const title = normalizeRequiredString(payload.title, "title", MAX_TITLE_LENGTH);
    const status = validateHomeworkStatus(payload.status);

    return {
        sectionSessionId: normalizeNullableObjectId(payload.sectionSessionId, "sectionSessionId"),
        assessmentId: normalizeNullableObjectId(payload.assessmentId, "assessmentId"),
        title,
        titleNormalized: normalizeTitle(title),
        instructions: normalizeBoundedString(payload.instructions, "instructions", MAX_INSTRUCTIONS_LENGTH),
        type: validateHomeworkType(payload.type),
        dueAt: normalizeOptionalDate(payload.dueAt, "dueAt"),
        submissionMode: validateSubmissionMode(payload.submissionMode),
        allowLate: normalizeBoolean(payload.allowLate, "allowLate"),
        status,
        archivedAt: status === "archived" ? new Date() : null,
    };
}

function validateUpdateHomeworkInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const updates = {};
    if (payload.sectionSessionId !== undefined) {
        updates.sectionSessionId = normalizeNullableObjectId(payload.sectionSessionId, "sectionSessionId", {
            allowUndefined: true,
        });
    }
    if (payload.assessmentId !== undefined) {
        updates.assessmentId = normalizeNullableObjectId(payload.assessmentId, "assessmentId", {
            allowUndefined: true,
        });
    }
    if (payload.title !== undefined) {
        const title = normalizeRequiredString(payload.title, "title", MAX_TITLE_LENGTH);
        updates.title = title;
        updates.titleNormalized = normalizeTitle(title);
    }
    if (payload.instructions !== undefined) {
        updates.instructions = normalizeBoundedString(payload.instructions, "instructions", MAX_INSTRUCTIONS_LENGTH, {
            allowUndefined: true,
        });
    }
    if (payload.type !== undefined) {
        updates.type = validateHomeworkType(payload.type, { allowUndefined: true });
    }
    if (payload.dueAt !== undefined) {
        updates.dueAt = normalizeOptionalDate(payload.dueAt, "dueAt", { allowUndefined: true });
    }
    if (payload.submissionMode !== undefined) {
        updates.submissionMode = validateSubmissionMode(payload.submissionMode, { allowUndefined: true });
    }
    if (payload.allowLate !== undefined) {
        updates.allowLate = normalizeBoolean(payload.allowLate, "allowLate", { allowUndefined: true });
    }

    if (!Object.keys(updates).length) {
        throw createError(400, "No valid homework fields provided");
    }

    return updates;
}

function validateHomeworkStatusUpdateInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    if (payload.status === undefined) {
        throw createError(400, "status is required");
    }

    return {
        status: validateHomeworkStatus(payload.status, { allowUndefined: true }),
    };
}

function validateSectionHomeworkListQuery(query = {}) {
    const pagination = validatePagination(query);
    const assessmentId = normalizeNullableObjectId(query.assessmentId, "assessmentId", { allowUndefined: true });

    return {
        status: validateHomeworkListStatus(query.status),
        type: query.type === undefined ? undefined : validateHomeworkType(query.type, { allowUndefined: true }),
        submissionMode:
            query.submissionMode === undefined
                ? undefined
                : validateSubmissionMode(query.submissionMode, { allowUndefined: true }),
        assessmentId,
        search: normalizeString(query.search),
        ...pagination,
    };
}

function validateStudentHomeworkListQuery(query = {}) {
    const pagination = validatePagination(query);

    return {
        status: validateHomeworkListStatus(query.status, { student: true }),
        type: query.type === undefined ? undefined : validateHomeworkType(query.type, { allowUndefined: true }),
        dueFrom: normalizeOptionalDate(query.dueFrom, "dueFrom", { allowUndefined: true }),
        dueTo: normalizeOptionalDate(query.dueTo, "dueTo", { allowUndefined: true }),
        ...pagination,
    };
}

function validateManualSubmissionInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const status = validateSubmissionStatus(payload.status);

    return {
        status,
        instructorFeedback: normalizeBoundedString(
            payload.instructorFeedback,
            "instructorFeedback",
            MAX_FEEDBACK_LENGTH
        ),
        submittedAt:
            status === "missing"
                ? null
                : normalizeOptionalDate(payload.submittedAt, "submittedAt") || new Date(),
    };
}

function validateUpdateSubmissionInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const updates = {};
    if (payload.status !== undefined) {
        updates.status = validateSubmissionStatus(payload.status, { allowUndefined: true });
    }
    if (payload.instructorFeedback !== undefined) {
        updates.instructorFeedback = normalizeBoundedString(
            payload.instructorFeedback,
            "instructorFeedback",
            MAX_FEEDBACK_LENGTH,
            { allowUndefined: true }
        );
    }

    if (!Object.keys(updates).length) {
        throw createError(400, "No valid submission fields provided");
    }

    return updates;
}

function validateStudentSubmissionInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        payload = {};
    }

    return {
        studentNote: normalizeBoundedString(payload.studentNote, "studentNote", MAX_NOTE_LENGTH),
    };
}

function toPagination({ page, limit, total }) {
    return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
    };
}

function toHomeworkResponse(homework) {
    if (!homework) {
        return null;
    }

    return {
        id: homework._id.toString(),
        institutionId: homework.institutionId.toString(),
        sectionId: homework.sectionId.toString(),
        sectionSessionId: homework.sectionSessionId ? homework.sectionSessionId.toString() : null,
        assessmentId: homework.assessmentId ? homework.assessmentId.toString() : null,
        title: homework.title,
        instructions: homework.instructions || "",
        type: homework.type,
        dueAt: homework.dueAt || null,
        submissionMode: homework.submissionMode,
        allowLate: homework.allowLate === true,
        status: homework.status,
        createdByUserId: homework.createdByUserId ? homework.createdByUserId.toString() : null,
        archivedAt: homework.archivedAt || null,
        createdAt: homework.createdAt,
        updatedAt: homework.updatedAt,
    };
}

function toHomeworkListItem(homework) {
    return toHomeworkResponse(homework);
}

function toSubmissionResponse(submission) {
    if (!submission) {
        return null;
    }

    return {
        id: submission._id.toString(),
        institutionId: submission.institutionId.toString(),
        homeworkId: submission.homeworkId.toString(),
        sectionId: submission.sectionId.toString(),
        enrollmentId: submission.enrollmentId.toString(),
        studentMemberId: submission.studentMemberId.toString(),
        submissionMethod: submission.submissionMethod,
        originalFilename: submission.originalFilename || null,
        mimeType: submission.mimeType || null,
        sizeBytes: submission.sizeBytes === undefined ? null : submission.sizeBytes,
        submittedAt: submission.submittedAt || null,
        status: submission.status,
        studentNote: submission.studentNote || "",
        instructorFeedback: submission.instructorFeedback || "",
        markedByUserId: submission.markedByUserId ? submission.markedByUserId.toString() : null,
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt,
    };
}

function isLateSubmission({ homework, submittedAt }) {
    if (!homework?.dueAt || !submittedAt) {
        return false;
    }

    return new Date(submittedAt).getTime() > new Date(homework.dueAt).getTime();
}

function formatHomeworkDueAt(value) {
    if (!value) {
        return null;
    }

    const dueAt = new Date(value);
    if (Number.isNaN(dueAt.getTime())) {
        return null;
    }

    return dueAt.toISOString();
}

function ensureHomeworkCanBeEdited(homework) {
    if (homework.status === "archived") {
        throw createError(409, "Archived homework is read-only");
    }
}

function ensureHomeworkAllowsStudentSubmission(homework) {
    if (homework.status === "archived") {
        throw createError(409, "Archived homework cannot receive submissions");
    }

    if (homework.status !== "assigned") {
        throw createError(409, "Only assigned homework can receive student submissions");
    }

    if (homework.submissionMode === "none") {
        throw createError(409, "This homework does not accept submissions");
    }

    if (homework.submissionMode === "offline") {
        throw createError(409, "This homework accepts offline submissions only");
    }

    if (homework.submissionMode !== "online_upload") {
        throw createError(409, "This homework does not accept online uploads");
    }
}

function ensureHomeworkAllowsManualSubmission(homework) {
    if (homework.submissionMode === "none") {
        throw createError(409, "This homework does not accept submissions");
    }

    if (homework.submissionMode !== "offline") {
        throw createError(409, "Manual homework submission marking is only allowed for offline homework");
    }
}

function ensureLateSubmissionAllowed(homework, submittedAt) {
    if (isLateSubmission({ homework, submittedAt }) && homework.allowLate !== true) {
        throw createError(409, "Late submissions are not allowed for this homework");
    }
}

function resolveNextHomeworkStatus(currentStatus, nextStatus) {
    const allowedTransitions = {
        draft: ["assigned", "archived"],
        assigned: ["closed", "archived"],
        closed: ["archived"],
        archived: [],
    };

    if (currentStatus === nextStatus) {
        throw createError(409, "Homework is already in this status");
    }

    if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
        throw createError(409, "Unsupported homework status transition");
    }
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

async function loadHomeworkSectionContext({ institutionId, sectionId }) {
    const section = await loadSectionRecord({ institutionId, sectionId });
    if (!section) {
        throw createError(404, "Section not found");
    }

    const [subject, schoolClass] = await Promise.all([
        loadSubjectRecord({ institutionId, subjectId: section.subjectId }),
        loadSchoolClassRecord({ institutionId, schoolClassId: section.schoolClassId }),
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

async function loadHomeworkRecord({ institutionId, sectionId, homeworkId }) {
    return Homework.findOne({
        _id: homeworkId,
        institutionId,
        sectionId,
    })
        .select(HOMEWORK_SELECT_FIELDS)
        .lean();
}

async function loadSectionSessionForHomework({ institutionId, sectionId, sectionSessionId }) {
    if (!sectionSessionId) {
        return null;
    }

    const sectionSession = await SectionSession.findOne({
        _id: sectionSessionId,
        institutionId,
        sectionId,
    })
        .select("_id institutionId sectionId status")
        .lean();

    if (!sectionSession) {
        throw createError(404, "Section session not found");
    }

    return sectionSession;
}

async function loadAssessmentForHomework({ institutionId, sectionId, assessmentId }) {
    if (!assessmentId) {
        return null;
    }

    const assessment = await Assessment.findOne({
        _id: assessmentId,
        institutionId,
        sectionId,
    })
        .select("_id institutionId sectionId status")
        .lean();

    if (!assessment) {
        throw createError(404, "Assessment not found");
    }

    if (assessment.status === "archived") {
        throw createError(409, "Archived assessments cannot be linked to homework");
    }

    return assessment;
}

async function ensureStaffCanManageHomework({
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
        throw createError(403, "Students cannot manage homework");
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

function ensureStudentMembership(actorUserId, actorMembership) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (actorMembership.role !== "student") {
        throw createError(403, "Only students can access their own homework");
    }
}

async function loadActiveStudentEnrollment({ institutionId, sectionId, studentMemberId }) {
    const enrollment = await Enrollment.findOne({
        institutionId,
        sectionId,
        studentMemberId,
        status: ACTIVE_ENROLLMENT_STATUS,
    })
        .select("_id institutionId sectionId studentMemberId status")
        .lean();

    if (!enrollment) {
        throw createError(404, "Student is not enrolled in this section");
    }

    return enrollment;
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

async function notifyAssignedHomeworkStudentsBestEffort({ institutionId, sectionId, section, subject, homework }) {
    try {
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

        const studentMemberIds = [
            ...new Set(enrollments.map((enrollment) => normalizeId(enrollment.studentMemberId)).filter(Boolean)),
        ];
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
        const enqueueResults = await Promise.all(memberships.map((membership) => emailQueue.enqueueEmailJob({
            institutionId,
            entityId: homework._id,
            recipientMembershipId: membership._id,
            emailType: EMAIL_JOB_TYPES.HOMEWORK_ASSIGNED,
        })));
        const notQueued = enqueueResults.filter((result) => result && !result.queued);
        if (notQueued.length) {
            console.warn("Some homework assigned email jobs were not queued", {
                institutionId: normalizeId(institutionId),
                entityId: normalizeId(homework?._id),
                count: notQueued.length,
                reasons: [...new Set(notQueued.map((result) => result?.reason || "unknown"))],
            });
            // TODO/verify: add a MongoDB outbox for durable non-critical email delivery after writes.
        }
    } catch (error) {
        console.error("Failed to prepare homework assigned email jobs", {
            institutionId: normalizeId(institutionId),
            entityId: normalizeId(homework?._id),
            error: error?.message || error,
        });
    }
}

function resolvePrivateFilePath(fileKey) {
    const normalizedFileKey = normalizeString(fileKey);
    if (!normalizedFileKey || normalizedFileKey.includes("/") || normalizedFileKey.includes("\\")) {
        throw createError(404, "Submission file not found");
    }

    const filePath = path.resolve(PRIVATE_HOMEWORK_SUBMISSION_DIR, normalizedFileKey);
    if (!filePath.startsWith(`${PRIVATE_HOMEWORK_SUBMISSION_DIR}${path.sep}`)) {
        throw createError(404, "Submission file not found");
    }

    return filePath;
}

function removePrivateSubmissionFile(fileKey) {
    if (!fileKey) {
        return;
    }

    let filePath;
    try {
        filePath = resolvePrivateFilePath(fileKey);
    } catch (_error) {
        return;
    }

    fs.promises.unlink(filePath).catch(() => {});
}

async function createHomework({ institutionId, sectionId, actorUserId, actorMembership, payload }) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    const validSectionId = validateObjectId(sectionId, "sectionId");
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    const { section, subject, schoolClass } = await loadHomeworkSectionContext({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
    });

    await ensureStaffCanManageHomework({
        institutionId: validInstitutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const input = validateCreateHomeworkInput(payload);
    await Promise.all([
        loadSectionSessionForHomework({
            institutionId: validInstitutionId,
            sectionId: validSectionId,
            sectionSessionId: input.sectionSessionId,
        }),
        loadAssessmentForHomework({
            institutionId: validInstitutionId,
            sectionId: validSectionId,
            assessmentId: input.assessmentId,
        }),
    ]);

    const homework = await Homework.create({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        sectionSessionId: input.sectionSessionId,
        assessmentId: input.assessmentId,
        title: input.title,
        titleNormalized: input.titleNormalized,
        instructions: input.instructions,
        type: input.type,
        dueAt: input.dueAt,
        submissionMode: input.submissionMode,
        allowLate: input.allowLate,
        status: input.status,
        createdByUserId: actorUserId,
        archivedAt: input.archivedAt,
    });

    if (homework.status === "assigned") {
        await notifyAssignedHomeworkStudentsBestEffort({
            institutionId: validInstitutionId,
            sectionId: validSectionId,
            section,
            subject,
            homework,
        });
    }

    return {
        homework: toHomeworkResponse(homework),
    };
}

async function listSectionHomeworks({ institutionId, sectionId, actorUserId, actorMembership, query = {} }) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    const validSectionId = validateObjectId(sectionId, "sectionId");
    const { section, subject, schoolClass } = await loadHomeworkSectionContext({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
    });

    await ensureStaffCanManageHomework({
        institutionId: validInstitutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const input = validateSectionHomeworkListQuery(query);
    const homeworkQuery = {
        institutionId: validInstitutionId,
        sectionId: validSectionId,
    };

    if (input.status !== "all") {
        homeworkQuery.status = input.status;
    }
    if (input.type) {
        homeworkQuery.type = input.type;
    }
    if (input.submissionMode) {
        homeworkQuery.submissionMode = input.submissionMode;
    }
    if (input.assessmentId !== undefined) {
        homeworkQuery.assessmentId = input.assessmentId;
    }
    if (input.search) {
        homeworkQuery.titleNormalized = { $regex: escapeRegex(normalizeTitle(input.search)), $options: "i" };
    }

    const [homeworks, total] = await Promise.all([
        Homework.find(homeworkQuery)
            .select(HOMEWORK_SELECT_FIELDS)
            .sort({ dueAt: 1, createdAt: -1, _id: -1 })
            .skip(input.skip)
            .limit(input.limit)
            .lean(),
        Homework.countDocuments(homeworkQuery),
    ]);

    return {
        homeworks: homeworks.map(toHomeworkListItem),
        pagination: toPagination({
            page: input.page,
            limit: input.limit,
            total,
        }),
    };
}

async function getHomeworkById({ institutionId, sectionId, homeworkId, actorUserId, actorMembership }) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    const validSectionId = validateObjectId(sectionId, "sectionId");
    const validHomeworkId = validateObjectId(homeworkId, "homeworkId");
    const { section, subject, schoolClass } = await loadHomeworkSectionContext({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
    });

    await ensureStaffCanManageHomework({
        institutionId: validInstitutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const homework = await loadHomeworkRecord({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        homeworkId: validHomeworkId,
    });
    if (!homework) {
        throw createError(404, "Homework not found");
    }

    return {
        homework: toHomeworkResponse(homework),
    };
}

async function updateHomework({ institutionId, sectionId, homeworkId, actorUserId, actorMembership, payload }) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    const validSectionId = validateObjectId(sectionId, "sectionId");
    const validHomeworkId = validateObjectId(homeworkId, "homeworkId");
    const { section, subject, schoolClass } = await loadHomeworkSectionContext({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
    });

    await ensureStaffCanManageHomework({
        institutionId: validInstitutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const homework = await loadHomeworkRecord({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        homeworkId: validHomeworkId,
    });
    if (!homework) {
        throw createError(404, "Homework not found");
    }

    ensureHomeworkCanBeEdited(homework);
    const updates = validateUpdateHomeworkInput(payload);

    if (updates.submissionMode !== undefined && updates.submissionMode !== homework.submissionMode) {
        const existingSubmissionCount = await HomeworkSubmission.countDocuments({
            institutionId: validInstitutionId,
            sectionId: validSectionId,
            homeworkId: validHomeworkId,
        });

        if (existingSubmissionCount > 0) {
            throw createError(409, "Cannot change submissionMode after homework submissions exist");
        }
    }

    await Promise.all([
        updates.sectionSessionId !== undefined
            ? loadSectionSessionForHomework({
                  institutionId: validInstitutionId,
                  sectionId: validSectionId,
                  sectionSessionId: updates.sectionSessionId,
              })
            : null,
        updates.assessmentId !== undefined
            ? loadAssessmentForHomework({
                  institutionId: validInstitutionId,
                  sectionId: validSectionId,
                  assessmentId: updates.assessmentId,
              })
            : null,
    ]);

    const updatedHomework = await Homework.findOneAndUpdate(
        {
            _id: validHomeworkId,
            institutionId: validInstitutionId,
            sectionId: validSectionId,
        },
        { $set: updates },
        { returnDocument: "after", runValidators: true }
    )
        .select(HOMEWORK_SELECT_FIELDS)
        .lean();

    if (!updatedHomework) {
        throw createError(404, "Homework not found");
    }

    return {
        homework: toHomeworkResponse(updatedHomework),
    };
}

async function updateHomeworkStatus({
    institutionId,
    sectionId,
    homeworkId,
    actorUserId,
    actorMembership,
    payload,
}) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    const validSectionId = validateObjectId(sectionId, "sectionId");
    const validHomeworkId = validateObjectId(homeworkId, "homeworkId");
    const { section, subject, schoolClass } = await loadHomeworkSectionContext({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
    });

    await ensureStaffCanManageHomework({
        institutionId: validInstitutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const homework = await loadHomeworkRecord({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        homeworkId: validHomeworkId,
    });
    if (!homework) {
        throw createError(404, "Homework not found");
    }

    const input = validateHomeworkStatusUpdateInput(payload);
    resolveNextHomeworkStatus(homework.status, input.status);

    const updates = {
        status: input.status,
    };
    if (input.status === "archived") {
        updates.archivedAt = new Date();
    }

    const updatedHomework = await Homework.findOneAndUpdate(
        {
            _id: validHomeworkId,
            institutionId: validInstitutionId,
            sectionId: validSectionId,
        },
        { $set: updates },
        { returnDocument: "after", runValidators: true }
    )
        .select(HOMEWORK_SELECT_FIELDS)
        .lean();

    if (!updatedHomework) {
        throw createError(404, "Homework not found");
    }

    if (homework.status === "draft" && updatedHomework.status === "assigned") {
        await notifyAssignedHomeworkStudentsBestEffort({
            institutionId: validInstitutionId,
            sectionId: validSectionId,
            section,
            subject,
            homework: updatedHomework,
        });
    }

    return {
        homework: toHomeworkResponse(updatedHomework),
    };
}

async function listStudentHomeworks({ institutionId, actorUserId, actorMembership, query = {} }) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    ensureStudentMembership(actorUserId, actorMembership);

    const input = validateStudentHomeworkListQuery(query);
    const enrollments = await Enrollment.find({
        institutionId: validInstitutionId,
        studentMemberId: actorMembership._id,
        status: ACTIVE_ENROLLMENT_STATUS,
    })
        .select("_id sectionId")
        .lean();

    if (!enrollments.length) {
        return {
            homeworks: [],
            pagination: toPagination({ page: input.page, limit: input.limit, total: 0 }),
        };
    }

    const sectionIds = [...new Set(enrollments.map((enrollment) => normalizeId(enrollment.sectionId)).filter(Boolean))];
    const homeworkQuery = {
        institutionId: validInstitutionId,
        sectionId: { $in: sectionIds },
        status:
            input.status === "all"
                ? { $in: STUDENT_VISIBLE_HOMEWORK_STATUSES }
                : input.status,
    };
    if (input.type) {
        homeworkQuery.type = input.type;
    }
    if (input.dueFrom || input.dueTo) {
        homeworkQuery.dueAt = {};
        if (input.dueFrom) {
            homeworkQuery.dueAt.$gte = input.dueFrom;
        }
        if (input.dueTo) {
            homeworkQuery.dueAt.$lte = input.dueTo;
        }
    }

    const [homeworks, total] = await Promise.all([
        Homework.find(homeworkQuery)
            .select(HOMEWORK_SELECT_FIELDS)
            .sort({ dueAt: 1, createdAt: -1, _id: -1 })
            .skip(input.skip)
            .limit(input.limit)
            .lean(),
        Homework.countDocuments(homeworkQuery),
    ]);

    return {
        homeworks: homeworks.map(toHomeworkListItem),
        pagination: toPagination({ page: input.page, limit: input.limit, total }),
    };
}

async function getMyHomeworkSubmission({
    institutionId,
    sectionId,
    homeworkId,
    actorUserId,
    actorMembership,
}) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    const validSectionId = validateObjectId(sectionId, "sectionId");
    const validHomeworkId = validateObjectId(homeworkId, "homeworkId");
    ensureStudentMembership(actorUserId, actorMembership);

    await loadActiveStudentEnrollment({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        studentMemberId: actorMembership._id,
    });

    const homework = await loadHomeworkRecord({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        homeworkId: validHomeworkId,
    });
    if (!homework || !STUDENT_VISIBLE_HOMEWORK_STATUSES.includes(homework.status)) {
        throw createError(404, "Homework not found");
    }

    const submission = await HomeworkSubmission.findOne({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        homeworkId: validHomeworkId,
        studentMemberId: actorMembership._id,
    })
        .select(HOMEWORK_SUBMISSION_SELECT_FIELDS)
        .lean();

    return {
        homework: toHomeworkResponse(homework),
        submission: toSubmissionResponse(submission),
    };
}

async function submitHomework({
    institutionId,
    sectionId,
    homeworkId,
    actorUserId,
    actorMembership,
    payload,
    file,
}) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    const validSectionId = validateObjectId(sectionId, "sectionId");
    const validHomeworkId = validateObjectId(homeworkId, "homeworkId");
    ensureStudentMembership(actorUserId, actorMembership);

    const [homework, enrollment] = await Promise.all([
        loadHomeworkRecord({
            institutionId: validInstitutionId,
            sectionId: validSectionId,
            homeworkId: validHomeworkId,
        }),
        loadActiveStudentEnrollment({
            institutionId: validInstitutionId,
            sectionId: validSectionId,
            studentMemberId: actorMembership._id,
        }),
    ]);

    if (!homework) {
        throw createError(404, "Homework not found");
    }

    ensureHomeworkAllowsStudentSubmission(homework);
    if (!file) {
        throw createError(400, "Submission file is required (field: submissionFile)");
    }
    const fileSize = Number(file.size);
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
        throw createError(400, "Submission file must not be empty");
    }

    const submittedAt = new Date();
    ensureLateSubmissionAllowed(homework, submittedAt);
    const input = validateStudentSubmissionInput(payload);
    const status = isLateSubmission({ homework, submittedAt }) ? "late" : "submitted";

    const existingSubmission = await HomeworkSubmission.findOne({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        homeworkId: validHomeworkId,
        enrollmentId: enrollment._id,
    })
        .select("_id fileKey")
        .lean();

    const updatedSubmission = await HomeworkSubmission.findOneAndUpdate(
        {
            institutionId: validInstitutionId,
            sectionId: validSectionId,
            homeworkId: validHomeworkId,
            enrollmentId: enrollment._id,
        },
        {
            $set: {
                sectionId: validSectionId,
                studentMemberId: actorMembership._id,
                submissionMethod: "online_upload",
                fileKey: file.filename,
                originalFilename: file.originalname,
                mimeType: file.mimetype,
                sizeBytes: fileSize,
                submittedAt,
                status,
                studentNote: input.studentNote,
                instructorFeedback: "",
                markedByUserId: null,
            },
            $setOnInsert: {
                institutionId: validInstitutionId,
                homeworkId: validHomeworkId,
                enrollmentId: enrollment._id,
            },
        },
        { upsert: true, returnDocument: "after", runValidators: true }
    )
        .select(HOMEWORK_SUBMISSION_SELECT_FIELDS)
        .lean();

    if (existingSubmission?.fileKey && existingSubmission.fileKey !== file.filename) {
        removePrivateSubmissionFile(existingSubmission.fileKey);
    }

    return {
        submission: toSubmissionResponse(updatedSubmission),
    };
}

async function getHomeworkSubmissionsRoster({
    institutionId,
    sectionId,
    homeworkId,
    actorUserId,
    actorMembership,
}) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    const validSectionId = validateObjectId(sectionId, "sectionId");
    const validHomeworkId = validateObjectId(homeworkId, "homeworkId");
    const { section, subject, schoolClass } = await loadHomeworkSectionContext({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
    });

    await ensureStaffCanManageHomework({
        institutionId: validInstitutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const homework = await loadHomeworkRecord({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        homeworkId: validHomeworkId,
    });
    if (!homework) {
        throw createError(404, "Homework not found");
    }

    const enrollments = await Enrollment.find({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        status: ACTIVE_ENROLLMENT_STATUS,
    })
        .select("_id studentMemberId")
        .lean();

    const enrollmentIds = enrollments.map((enrollment) => enrollment._id);
    const studentMemberIds = [...new Set(enrollments.map((enrollment) => normalizeId(enrollment.studentMemberId)).filter(Boolean))];
    const [submissions, studentMaps] = await Promise.all([
        enrollmentIds.length
            ? HomeworkSubmission.find({
                  institutionId: validInstitutionId,
                  homeworkId: validHomeworkId,
                  enrollmentId: { $in: enrollmentIds },
              })
                  .select(HOMEWORK_SUBMISSION_SELECT_FIELDS)
                  .lean()
            : [],
        loadStudentMaps({ institutionId: validInstitutionId, studentMemberIds }),
    ]);

    const submissionByEnrollmentId = new Map(
        submissions.map((submission) => [submission.enrollmentId.toString(), submission])
    );

    const roster = enrollments
        .map((enrollment) => {
            const submission = submissionByEnrollmentId.get(enrollment._id.toString()) || null;
            const studentMemberId = enrollment.studentMemberId.toString();
            const membership = studentMaps.membershipById.get(studentMemberId) || null;
            const profile = studentMaps.profileByMembershipId.get(studentMemberId) || null;
            const user = membership?.userId ? studentMaps.userById.get(membership.userId.toString()) || null : null;
            const status = submission?.status || "missing";
            const submittedAt = submission?.submittedAt || null;

            return {
                enrollmentId: enrollment._id.toString(),
                studentMemberId,
                studentName: profile?.fullName || user?.email || null,
                status,
                submittedAt,
                isLate: status === "late" || isLateSubmission({ homework, submittedAt }),
                submission: toSubmissionResponse(submission),
            };
        })
        .sort((left, right) => {
            const leftName = normalizeLowerString(left.studentName || "");
            const rightName = normalizeLowerString(right.studentName || "");
            const nameOrder = leftName.localeCompare(rightName);
            if (nameOrder !== 0) {
                return nameOrder;
            }

            return left.studentMemberId.localeCompare(right.studentMemberId);
        });

    return {
        homework: toHomeworkResponse(homework),
        submissions: roster,
    };
}

async function markEnrollmentHomeworkSubmission({
    institutionId,
    sectionId,
    homeworkId,
    enrollmentId,
    actorUserId,
    actorMembership,
    payload,
}) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    const validSectionId = validateObjectId(sectionId, "sectionId");
    const validHomeworkId = validateObjectId(homeworkId, "homeworkId");
    const validEnrollmentId = validateObjectId(enrollmentId, "enrollmentId");
    const { section, subject, schoolClass } = await loadHomeworkSectionContext({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
    });

    await ensureStaffCanManageHomework({
        institutionId: validInstitutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const [homework, enrollment] = await Promise.all([
        loadHomeworkRecord({
            institutionId: validInstitutionId,
            sectionId: validSectionId,
            homeworkId: validHomeworkId,
        }),
        Enrollment.findOne({
            _id: validEnrollmentId,
            institutionId: validInstitutionId,
            sectionId: validSectionId,
        })
            .select("_id studentMemberId status")
            .lean(),
    ]);

    if (!homework) {
        throw createError(404, "Homework not found");
    }
    ensureHomeworkCanBeEdited(homework);
    ensureHomeworkAllowsManualSubmission(homework);

    if (!enrollment) {
        throw createError(404, "Enrollment not found");
    }
    if (enrollment.status !== ACTIVE_ENROLLMENT_STATUS) {
        throw createError(409, "Only active enrollments can be marked for homework");
    }

    const input = validateManualSubmissionInput(payload);
    const submission = await HomeworkSubmission.findOneAndUpdate(
        {
            institutionId: validInstitutionId,
            sectionId: validSectionId,
            homeworkId: validHomeworkId,
            enrollmentId: validEnrollmentId,
        },
        {
            $set: {
                sectionId: validSectionId,
                studentMemberId: enrollment.studentMemberId,
                submissionMethod: "offline",
                fileKey: null,
                originalFilename: null,
                mimeType: null,
                sizeBytes: null,
                submittedAt: input.submittedAt,
                status: input.status,
                instructorFeedback: input.instructorFeedback,
                markedByUserId: actorUserId,
            },
            $setOnInsert: {
                institutionId: validInstitutionId,
                homeworkId: validHomeworkId,
                enrollmentId: validEnrollmentId,
            },
        },
        { upsert: true, returnDocument: "after", runValidators: true }
    )
        .select(HOMEWORK_SUBMISSION_SELECT_FIELDS)
        .lean();

    return {
        submission: toSubmissionResponse(submission),
    };
}

async function updateHomeworkSubmission({
    institutionId,
    sectionId,
    homeworkId,
    submissionId,
    actorUserId,
    actorMembership,
    payload,
}) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    const validSectionId = validateObjectId(sectionId, "sectionId");
    const validHomeworkId = validateObjectId(homeworkId, "homeworkId");
    const validSubmissionId = validateObjectId(submissionId, "submissionId");
    const { section, subject, schoolClass } = await loadHomeworkSectionContext({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
    });

    await ensureStaffCanManageHomework({
        institutionId: validInstitutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const homework = await loadHomeworkRecord({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        homeworkId: validHomeworkId,
    });
    if (!homework) {
        throw createError(404, "Homework not found");
    }
    ensureHomeworkCanBeEdited(homework);

    const existingSubmission = await HomeworkSubmission.findOne({
        _id: validSubmissionId,
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        homeworkId: validHomeworkId,
    })
        .select(HOMEWORK_SUBMISSION_SELECT_FIELDS)
        .lean();

    if (!existingSubmission) {
        throw createError(404, "Homework submission not found");
    }

    const updates = validateUpdateSubmissionInput(payload);
    if (updates.status === "missing") {
        updates.submittedAt = null;
        updates.fileKey = null;
        updates.originalFilename = null;
        updates.mimeType = null;
        updates.sizeBytes = null;
    } else if (
        updates.status &&
        ["submitted", "late", "returned"].includes(updates.status) &&
        !existingSubmission.submittedAt
    ) {
        throw createError(409, "Use manual homework submission marking to set submitted status");
    }
    updates.markedByUserId = actorUserId;

    const updatedSubmission = await HomeworkSubmission.findOneAndUpdate(
        {
            _id: validSubmissionId,
            institutionId: validInstitutionId,
            sectionId: validSectionId,
            homeworkId: validHomeworkId,
        },
        { $set: updates },
        { returnDocument: "after", runValidators: true }
    )
        .select(HOMEWORK_SUBMISSION_SELECT_FIELDS)
        .lean();

    if (!updatedSubmission) {
        throw createError(404, "Homework submission not found");
    }

    if (updates.status === "missing" && existingSubmission.fileKey) {
        removePrivateSubmissionFile(existingSubmission.fileKey);
    }

    return {
        submission: toSubmissionResponse(updatedSubmission),
    };
}

async function ensureCanDownloadSubmissionFile({
    institutionId,
    actorUserId,
    actorMembership,
    section,
    subject,
    schoolClass,
    submission,
}) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (
        actorMembership.role === "student" &&
        normalizeId(actorMembership._id) === normalizeId(submission.studentMemberId)
    ) {
        return;
    }

    if (actorMembership.role === "student") {
        throw createError(403, "Students can only download their own homework submissions");
    }

    await ensureStaffCanManageHomework({
        institutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });
}

async function getHomeworkSubmissionFileAccess({
    institutionId,
    sectionId,
    homeworkId,
    submissionId,
    actorUserId,
    actorMembership,
}) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    const validSectionId = validateObjectId(sectionId, "sectionId");
    const validHomeworkId = validateObjectId(homeworkId, "homeworkId");
    const validSubmissionId = validateObjectId(submissionId, "submissionId");
    const { section, subject, schoolClass } = await loadHomeworkSectionContext({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
    });

    const [homework, submission] = await Promise.all([
        loadHomeworkRecord({
            institutionId: validInstitutionId,
            sectionId: validSectionId,
            homeworkId: validHomeworkId,
        }),
        HomeworkSubmission.findOne({
            _id: validSubmissionId,
            institutionId: validInstitutionId,
            sectionId: validSectionId,
            homeworkId: validHomeworkId,
        })
            .select(HOMEWORK_SUBMISSION_SELECT_FIELDS)
            .lean(),
    ]);

    if (!homework) {
        throw createError(404, "Homework not found");
    }

    if (!submission || !submission.fileKey) {
        throw createError(404, "Submission file not found");
    }

    await ensureCanDownloadSubmissionFile({
        institutionId: validInstitutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
        submission,
    });

    const filePath = resolvePrivateFilePath(submission.fileKey);
    try {
        await fs.promises.access(filePath, fs.constants.R_OK);
    } catch (_error) {
        throw createError(404, "Submission file not found");
    }

    return {
        filePath,
        filename: submission.originalFilename || "homework-submission.pdf",
        mimeType: submission.mimeType || "application/pdf",
    };
}

module.exports = {
    validateCreateHomeworkInput,
    validateUpdateHomeworkInput,
    validateHomeworkStatusUpdateInput,
    validateManualSubmissionInput,
    validateUpdateSubmissionInput,
    toHomeworkResponse,
    toSubmissionResponse,
    createHomework,
    listSectionHomeworks,
    getHomeworkById,
    updateHomework,
    updateHomeworkStatus,
    listStudentHomeworks,
    getMyHomeworkSubmission,
    submitHomework,
    getHomeworkSubmissionsRoster,
    markEnrollmentHomeworkSubmission,
    updateHomeworkSubmission,
    getHomeworkSubmissionFileAccess,
};
