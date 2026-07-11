const mongoose = require("mongoose");
const Enrollment = require("../models/Enrollment");
const Institution = require("../models/Institution");
const Membership = require("../models/Membership");
const ResponsibilityAssignment = require("../models/ResponsibilityAssignment");
const Section = require("../models/Section");
const SectionSession = require("../models/SectionSession");
const Semester = require("../models/Semester");
const Subject = require("../models/Subject");
const User = require("../models/User");
const emailQueue = require("../queues/emailQueue");
const { EMAIL_JOB_TYPES } = require("../queues/emailQueueNames");
const {
    hasResponsibilityPermissionWithinScope,
    isResponsibilityAssignmentActiveNow,
} = require("../auth/scopedResponsibilities");

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_KEYS = DAY_LABELS.map((day) => day.toLowerCase());
const { SECTION_SESSION_STATUSES, SECTION_SESSION_TYPES, ATTENDANCE_STATES } = require("../constants/sectionConstants");
const SESSION_CREATABLE_SECTION_STATUSES = ["draft", "active"];
const ENROLLMENT_ACTIVE_STATUS = "enrolled";
const MEMBER_ACTIVE_STATUS = "active";
const MAX_STATUS_NOTE_LENGTH = 500;
const SECTION_SESSION_SELECT_FIELDS =
    "_id institutionId sectionId sessionType sessionDate startTime endTime room status statusNote statusChangedAt statusChangedByUserId attendanceState attendanceOpenedAt attendanceClosedAt attendanceOpenedByUserId createdByUserId createdAt updatedAt";

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

function isDuplicateKeyError(error) {
    return Boolean(error) && error.name === "MongoServerError" && error.code === 11000;
}

function parsePositiveInteger(rawValue, fallback, min, max) {
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed)) {
        return fallback;
    }

    if (parsed < min) {
        return fallback;
    }

    if (max !== undefined && parsed > max) {
        return max;
    }

    return parsed;
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

function parseTimeValue(rawValue, fieldName) {
    const value = normalizeString(rawValue);
    if (!value) {
        throw createError(400, `${fieldName} is required`);
    }

    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
        throw createError(400, `${fieldName} must be in HH:mm format`);
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
        throw createError(400, `${fieldName} must be in HH:mm format`);
    }

    return {
        normalized: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
        minutes: hours * 60 + minutes,
    };
}

function normalizeNullableString(rawValue, { allowUndefined = false } = {}) {
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

function validateSectionSessionType(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        if (allowUndefined) {
            return undefined;
        }
        // The schema requires sessionType; returning null here used to surface
        // as an unhandled Mongoose ValidationError (masked 500) on create.
        throw createError(400, "sessionType is required (lecture or lab)");
    }

    const sessionType = normalizeLowerString(rawValue);
    if (!SECTION_SESSION_TYPES.includes(sessionType)) {
        throw createError(400, "sessionType must be lecture or lab");
    }

    return sessionType;
}

function validateSectionSessionStatus(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : "scheduled";
    }

    const status = normalizeLowerString(rawValue);
    if (!SECTION_SESSION_STATUSES.includes(status)) {
        throw createError(400, "status must be scheduled, completed, or cancelled");
    }

    return status;
}

function ensureTimeRange(startTime, endTime) {
    const start = parseTimeValue(startTime, "startTime");
    const end = parseTimeValue(endTime, "endTime");

    if (start.minutes >= end.minutes) {
        throw createError(400, "startTime must be before endTime");
    }

    return {
        startTime: start.normalized,
        endTime: end.normalized,
    };
}

function validateCreateSectionSessionInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const timeRange = ensureTimeRange(payload.startTime, payload.endTime);

    return {
        sessionType: validateSectionSessionType(payload.sessionType),
        sessionDate: parseDateOnly(payload.sessionDate, "sessionDate"),
        startTime: timeRange.startTime,
        endTime: timeRange.endTime,
        room: normalizeNullableString(payload.room),
        status: validateSectionSessionStatus(payload.status),
    };
}

function validateGenerateSectionSessionsInput(payload) {
    if (payload === undefined || payload === null) {
        return {
            fromDate: undefined,
            toDate: undefined,
        };
    }

    if (typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const invalidFields = Object.keys(payload).filter((key) => !["fromDate", "toDate"].includes(key));
    if (invalidFields.length) {
        throw createError(400, "Only fromDate and toDate can be provided");
    }

    const fromDate = payload.fromDate !== undefined ? parseDateOnly(payload.fromDate, "fromDate") : undefined;
    const toDate = payload.toDate !== undefined ? parseDateOnly(payload.toDate, "toDate") : undefined;

    if (fromDate && toDate && toDate.getTime() < fromDate.getTime()) {
        throw createError(400, "toDate must be on or after fromDate");
    }

    return {
        fromDate,
        toDate,
    };
}

function validateSectionSessionStatusFilter(rawValue) {
    const value = normalizeLowerString(rawValue);
    if (!value) {
        return "";
    }

    if (!SECTION_SESSION_STATUSES.includes(value)) {
        throw createError(400, "status must be scheduled, completed, or cancelled");
    }

    return value;
}

function validateAttendanceStateFilter(rawValue) {
    const value = normalizeLowerString(rawValue);
    if (!value) {
        return "";
    }

    if (!ATTENDANCE_STATES.includes(value)) {
        throw createError(400, "attendanceState must be not_started, open, or closed");
    }

    return value;
}

function validateListSectionSessionsInput(query = {}) {
    const fromDateValue = normalizeString(query.fromDate);
    const toDateValue = normalizeString(query.toDate);

    const fromDate = fromDateValue ? parseDateOnly(fromDateValue, "fromDate") : undefined;
    const toDate = toDateValue ? parseDateOnly(toDateValue, "toDate") : undefined;
    if (fromDate && toDate && toDate.getTime() < fromDate.getTime()) {
        throw createError(400, "toDate must be on or after fromDate");
    }

    return {
        page: parsePositiveInteger(query.page, 1, 1),
        limit: parsePositiveInteger(query.limit, 20, 1, 100),
        fromDate,
        toDate,
        status: validateSectionSessionStatusFilter(query.status),
        attendanceState: validateAttendanceStateFilter(query.attendanceState),
    };
}

function validateUpdateSectionSessionInput(payload, existingSectionSession = null) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    if (payload.institutionId !== undefined) {
        throw createError(400, "institutionId cannot be updated");
    }

    if (payload.sectionId !== undefined) {
        throw createError(400, "sectionId cannot be updated");
    }

    if (payload.createdByUserId !== undefined) {
        throw createError(400, "createdByUserId cannot be updated");
    }

    if (payload.statusNote !== undefined || payload.statusChangedAt !== undefined || payload.statusChangedByUserId !== undefined) {
        throw createError(400, "Status metadata can only be updated through the status endpoint");
    }

    if (
        payload.attendanceState !== undefined ||
        payload.attendanceOpenedAt !== undefined ||
        payload.attendanceClosedAt !== undefined ||
        payload.attendanceOpenedByUserId !== undefined ||
        payload.currentQrTokenHash !== undefined ||
        payload.currentQrTokenExpiresAt !== undefined
    ) {
        throw createError(400, "Attendance fields can only be updated through attendance endpoints");
    }

    const updates = {};

    if (payload.sessionType !== undefined) {
        updates.sessionType = validateSectionSessionType(payload.sessionType, { allowUndefined: true });
    }

    if (payload.sessionDate !== undefined) {
        updates.sessionDate = parseDateOnly(payload.sessionDate, "sessionDate");
    }

    if (payload.startTime !== undefined) {
        updates.startTime = parseTimeValue(payload.startTime, "startTime").normalized;
    }

    if (payload.endTime !== undefined) {
        updates.endTime = parseTimeValue(payload.endTime, "endTime").normalized;
    }

    if (payload.room !== undefined) {
        updates.room = normalizeNullableString(payload.room, { allowUndefined: true });
    }

    if (payload.status !== undefined) {
        throw createError(400, "status can only be updated through the status endpoint");
    }

    if (!Object.keys(updates).length) {
        throw createError(400, "No valid fields to update");
    }

    const nextStartTime =
        updates.startTime !== undefined ? updates.startTime : existingSectionSession?.startTime;
    const nextEndTime = updates.endTime !== undefined ? updates.endTime : existingSectionSession?.endTime;

    if (nextStartTime && nextEndTime) {
        const timeRange = ensureTimeRange(nextStartTime, nextEndTime);
        if (updates.startTime !== undefined) {
            updates.startTime = timeRange.startTime;
        }
        if (updates.endTime !== undefined) {
            updates.endTime = timeRange.endTime;
        }
    }

    return updates;
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
        name: subject.name,
        code: subject.code,
    };
}

function toSectionSessionResponse(sectionSession, { section = null, subject = null } = {}) {
    const response = {
        id: sectionSession._id.toString(),
        sectionId: sectionSession.sectionId.toString(),
        sessionType: sectionSession.sessionType,
        sessionDate: formatDateOnly(new Date(sectionSession.sessionDate)),
        startTime: sectionSession.startTime,
        endTime: sectionSession.endTime,
        room: sectionSession.room || null,
        status: sectionSession.status,
        statusNote: sectionSession.statusNote || null,
        statusChangedAt: sectionSession.statusChangedAt || null,
        statusChangedByUserId: sectionSession.statusChangedByUserId?.toString() || null,
        attendanceState: sectionSession.attendanceState || "not_started",
        attendanceOpenedAt: sectionSession.attendanceOpenedAt || null,
        attendanceClosedAt: sectionSession.attendanceClosedAt || null,
        attendanceOpenedByUserId: sectionSession.attendanceOpenedByUserId?.toString() || null,
        createdByUserId: sectionSession.createdByUserId?.toString() || null,
        createdAt: sectionSession.createdAt,
        updatedAt: sectionSession.updatedAt,
    };

    const sectionSummary = buildSectionSummary(section);
    if (sectionSummary) {
        response.section = sectionSummary;
    }

    const subjectSummary = buildSubjectSummary(subject);
    if (subjectSummary) {
        response.subject = subjectSummary;
    }

    return response;
}

function toSectionSessionListItem(sectionSession) {
    return {
        id: sectionSession._id.toString(),
        sessionType: sectionSession.sessionType,
        sessionDate: formatDateOnly(new Date(sectionSession.sessionDate)),
        startTime: sectionSession.startTime,
        endTime: sectionSession.endTime,
        room: sectionSession.room || null,
        status: sectionSession.status,
        attendanceState: sectionSession.attendanceState || "not_started",
    };
}

function ensureSectionAllowsSessionCreation(section) {
    if (!SESSION_CREATABLE_SECTION_STATUSES.includes(section.status)) {
        throw createError(409, "Only draft or active sections can have sessions");
    }
}

function validateSessionDateAgainstSemester(sessionDate, semester) {
    if (sessionDate.getTime() < semester.startDate.getTime() || sessionDate.getTime() > semester.endDate.getTime()) {
        throw createError(400, "sessionDate must be within the semester range");
    }

    const sessionDayName = DAY_LABELS[sessionDate.getUTCDay()];
    const teachingDays = Array.isArray(semester.teachingDays) ? semester.teachingDays : [];
    if (!teachingDays.includes(sessionDayName)) {
        throw createError(
            400,
            `sessionDate day "${sessionDayName}" is not allowed by the semester teachingDays: ${teachingDays.join(", ")}`
        );
    }
}

function validateScheduleAgainstSemester(schedule, semester) {
    const allowedDays = Array.isArray(semester.teachingDays)
        ? semester.teachingDays.map((day) => normalizeLowerString(day)).filter(Boolean)
        : [];
    const allowedDaySet = new Set(allowedDays);

    for (let index = 0; index < schedule.length; index += 1) {
        const entry = schedule[index];
        const scheduleDay = normalizeLowerString(entry.day);
        if (!allowedDaySet.has(scheduleDay)) {
            throw createError(
                400,
                `schedule[${index}].day "${scheduleDay}" is not allowed by the semester teachingDays: ${allowedDays.join(
                    ", "
                )}`
            );
        }
    }
}

function resolveGenerationDateRange({ semester, fromDate, toDate }) {
    const rangeStart = fromDate ? new Date(fromDate.getTime()) : new Date(semester.startDate.getTime());
    const rangeEnd = toDate ? new Date(toDate.getTime()) : new Date(semester.endDate.getTime());

    if (rangeStart.getTime() < semester.startDate.getTime() || rangeStart.getTime() > semester.endDate.getTime()) {
        throw createError(400, "fromDate must be within the semester range");
    }

    if (rangeEnd.getTime() < semester.startDate.getTime() || rangeEnd.getTime() > semester.endDate.getTime()) {
        throw createError(400, "toDate must be within the semester range");
    }

    if (rangeEnd.getTime() < rangeStart.getTime()) {
        throw createError(400, "toDate must be on or after fromDate");
    }

    return {
        fromDate: rangeStart,
        toDate: rangeEnd,
    };
}

function buildBlockedSessionDateSet(semester) {
    const blockedDateSet = new Set();

    for (const calendarOverride of semester.calendarOverrides || []) {
        if (calendarOverride?.type === "off") {
            blockedDateSet.add(formatDateOnly(new Date(calendarOverride.date)));
        }
    }

    for (const examDate of semester.examDates || []) {
        blockedDateSet.add(formatDateOnly(new Date(examDate.date)));
    }

    return blockedDateSet;
}

function buildScheduleEntriesForGeneration(schedule) {
    if (!Array.isArray(schedule) || !schedule.length) {
        throw createError(409, "Section schedule is empty");
    }

    return schedule.map((entry, index) => {
        const sessionType = validateSectionSessionType(entry.sessionType, {
            allowUndefined: true,
        });
        if (!sessionType) {
            throw createError(409, `schedule[${index}].sessionType is required before generating section sessions`);
        }

        const timeRange = ensureTimeRange(entry.startTime, entry.endTime);

        return {
            sessionType,
            day: normalizeLowerString(entry.day),
            startTime: timeRange.startTime,
            endTime: timeRange.endTime,
            room: normalizeNullableString(entry.room),
        };
    });
}

function buildSectionSessionGenerationCandidates({
    institutionId,
    sectionId,
    createdByUserId,
    scheduleEntries,
    fromDate,
    toDate,
    blockedDateSet,
}) {
    const candidatesByKey = new Map();

    for (
        let cursor = new Date(fromDate.getTime());
        cursor.getTime() <= toDate.getTime();
        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    ) {
        const sessionDateKey = formatDateOnly(cursor);
        if (blockedDateSet.has(sessionDateKey)) {
            continue;
        }

        const dayKey = DAY_KEYS[cursor.getUTCDay()];
        for (const scheduleEntry of scheduleEntries) {
            if (scheduleEntry.day !== dayKey) {
                continue;
            }

            const candidateKey = `${sessionDateKey}|${scheduleEntry.startTime}|${scheduleEntry.sessionType}`;
            if (candidatesByKey.has(candidateKey)) {
                throw createError(
                    409,
                    "Section schedule contains duplicate recurring entries for the same session date, time, and type"
                );
            }

            candidatesByKey.set(candidateKey, {
                institutionId,
                sectionId,
                sessionType: scheduleEntry.sessionType,
                sessionDate: new Date(cursor.getTime()),
                startTime: scheduleEntry.startTime,
                endTime: scheduleEntry.endTime,
                room: scheduleEntry.room,
                status: "scheduled",
                createdByUserId,
            });
        }
    }

    return [...candidatesByKey.values()];
}

function buildSectionSessionGenerationMessage({ generatedCount, skippedCount }) {
    const generatedLabel = generatedCount === 1 ? "section session" : "section sessions";
    const skippedLabel = skippedCount === 1 ? "session" : "sessions";

    if (generatedCount > 0 && skippedCount > 0) {
        return `Generated ${generatedCount} ${generatedLabel}. Skipped ${skippedCount} existing ${skippedLabel}.`;
    }

    if (generatedCount > 0) {
        return `Generated ${generatedCount} ${generatedLabel}.`;
    }

    if (skippedCount > 0) {
        return `No new section sessions were generated. All ${skippedCount} matching ${skippedLabel} already exist.`;
    }

    return "No section sessions matched the requested date range.";
}

function mapDuplicateSectionSessionError(error) {
    if (!isDuplicateKeyError(error)) {
        return null;
    }

    if (
        error.keyPattern &&
        error.keyPattern.institutionId &&
        error.keyPattern.sectionId &&
        error.keyPattern.sessionDate &&
        error.keyPattern.startTime &&
        error.keyPattern.sessionType
    ) {
        return createError(409, "Section session already exists for this date, time, and session type");
    }

    return createError(409, "Section session already exists");
}

async function loadSectionRecord({ institutionId, sectionId }) {
    return Section.findOne({
        _id: sectionId,
        institutionId,
    })
        .select("_id institutionId semesterId subjectId code title instructorMemberId status")
        .lean();
}

async function loadSectionForSessionGeneration({ institutionId, sectionId }) {
    return Section.findOne({
        _id: sectionId,
        institutionId,
    })
        .select("_id institutionId semesterId subjectId code title instructorMemberId status schedule")
        .lean();
}

async function loadSectionSemester({ institutionId, semesterId }) {
    return Semester.findOne({
        _id: semesterId,
        institutionId,
    })
        .select("_id startDate endDate teachingDays calendarOverrides examDates")
        .lean();
}

async function loadSubjectRecord({ institutionId, subjectId }) {
    return Subject.findOne({
        _id: subjectId,
        institutionId,
    })
        .select("_id departmentId classLevelId name code")
        .lean();
}

function validateUpdateSectionSessionStatusInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const invalidFields = Object.keys(payload).filter((key) => !["status", "note"].includes(key));
    if (invalidFields.length) {
        throw createError(400, "Only status and note can be updated");
    }

    if (payload.status === undefined) {
        throw createError(400, "status is required");
    }

    return {
        status: validateSectionSessionStatus(payload.status, { allowUndefined: true }),
        note: normalizeBoundedNullableString(payload.note, "note", MAX_STATUS_NOTE_LENGTH),
    };
}

async function hasActiveResponsibilityPermissionForScope({
    institutionId,
    actorUserId,
    responsibilityTypes = ["coordinator"],
    scopeType,
    scopeId,
    permission,
}) {
    const normalizedScopeId = normalizeId(scopeId);
    if (!normalizedScopeId) {
        return false;
    }

    const assignments = await ResponsibilityAssignment.find({
        institutionId,
        userId: actorUserId,
        responsibilityType: { $in: responsibilityTypes },
        scopeType,
        scopeId: normalizedScopeId,
        isActive: true,
    })
        .select("_id responsibilityType scopeType scopeId isActive startAt endAt")
        .lean();

    const now = new Date();
    return assignments.some((assignment) => {
        if (!isResponsibilityAssignmentActiveNow(assignment, now)) {
            return false;
        }

        return hasResponsibilityPermissionWithinScope({
            assignment,
            permission,
            scopeType,
            scopeId: normalizedScopeId,
            now,
        });
    });
}

async function ensureCanChangeSectionSessionStatus({
    institutionId,
    actorUserId,
    actorMembership,
    section,
    subject,
    schoolClass = null,
    requiredResponsibilityPermission = "sectionSession.manage_scope",
}) {
    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (actorMembership.role === "admin") {
        return;
    }

    const actorMembershipId = normalizeId(actorMembership._id);
    const sectionInstructorMemberId = normalizeId(section.instructorMemberId);
    if (sectionInstructorMemberId && actorMembershipId === sectionInstructorMemberId) {
        return;
    }

    const sectionId = normalizeId(section?._id);
    const hasSectionOversight = await hasActiveResponsibilityPermissionForScope({
        institutionId,
        actorUserId,
        scopeType: "section",
        scopeId: sectionId,
        permission: requiredResponsibilityPermission,
    });
    if (hasSectionOversight) {
        return;
    }

    const classId = normalizeId(schoolClass?._id || section?.schoolClassId);
    const hasClassOversight = await hasActiveResponsibilityPermissionForScope({
        institutionId,
        actorUserId,
        scopeType: "class",
        scopeId: classId,
        permission: requiredResponsibilityPermission,
    });
    if (hasClassOversight) {
        return;
    }

    const departmentId = normalizeId(subject?.departmentId);
    if (departmentId) {
        const hasDepartmentOversight = await hasActiveResponsibilityPermissionForScope({
            institutionId,
            scopeType: "department",
            scopeId: departmentId,
            actorUserId,
            permission: requiredResponsibilityPermission,
        });

        if (hasDepartmentOversight) {
            return;
        }
    }

    const classLevelId = normalizeId(schoolClass?.classLevelId || subject?.classLevelId);
    if (classLevelId) {
        const hasClassLevelOversight = await hasActiveResponsibilityPermissionForScope({
            institutionId,
            scopeType: "classLevel",
            scopeId: classLevelId,
            actorUserId,
            permission: requiredResponsibilityPermission,
        });

        if (hasClassLevelOversight) {
            return;
        }
    }

    throw createError(403, "Permission denied");
}

async function ensureCanManageSectionSession({
    institutionId,
    actorUserId,
    actorMembership,
    section,
    subject: preloadedSubject = null,
    requiredResponsibilityPermission = "sectionSession.manage_scope",
}) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (normalizeId(actorMembership.institutionId) !== normalizeId(institutionId)) {
        throw createError(403, "Institution access denied");
    }

    if (actorMembership.status && actorMembership.status !== MEMBER_ACTIVE_STATUS) {
        throw createError(403, "Institution access denied");
    }

    const subject =
        preloadedSubject ||
        (await loadSubjectRecord({
            institutionId,
            subjectId: section.subjectId,
        }));
    if (!subject) {
        throw createError(404, "Subject not found");
    }

    await ensureCanChangeSectionSessionStatus({
        institutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        requiredResponsibilityPermission,
    });

    return {
        subject,
    };
}

async function enqueueCancelledSectionSessionStudentJobs({
    institutionId,
    sectionId,
    sectionSession,
    section,
    subject,
}) {
    const enrollments = await Enrollment.find({
        institutionId,
        sectionId,
        status: ENROLLMENT_ACTIVE_STATUS,
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
        status: MEMBER_ACTIVE_STATUS,
    })
        .select("_id")
        .lean();

    if (!memberships.length) {
        return;
    }

    const enqueueResults = await Promise.all(memberships.map((membership) => emailQueue.enqueueEmailJob({
        institutionId,
        entityId: sectionSession._id,
        recipientMembershipId: membership._id,
        emailType: EMAIL_JOB_TYPES.SESSION_CANCELLED,
    })));
    const notQueued = enqueueResults.filter((result) => result && !result.queued);
    if (notQueued.length) {
        console.warn("Some session cancellation email jobs were not queued", {
            institutionId: normalizeId(institutionId),
            entityId: normalizeId(sectionSession?._id),
            count: notQueued.length,
            reasons: [...new Set(notQueued.map((result) => result?.reason || "unknown"))],
        });
        // TODO/verify: add a MongoDB outbox for durable non-critical email delivery after writes.
    }
}

async function notifyCancelledSectionSessionStudents(input) {
    try {
        await enqueueCancelledSectionSessionStudentJobs(input);
    } catch (error) {
        console.error("Failed to prepare session cancellation email jobs", {
            institutionId: normalizeId(input.institutionId),
            entityId: normalizeId(input.sectionSession?._id),
            error: error?.message || error,
        });
    }
}

async function createSectionSession({ institutionId, sectionId, createdByUserId, actorMembership, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    if (!createdByUserId || !isValidObjectId(createdByUserId)) {
        throw createError(401, "Unauthorized");
    }

    const input = validateCreateSectionSessionInput(payload);

    const [institution, section] = await Promise.all([
        Institution.findOne({ _id: institutionId }).select("_id").lean(),
        loadSectionRecord({ institutionId, sectionId }),
    ]);

    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (!section) {
        throw createError(404, "Section not found");
    }

    await ensureCanManageSectionSession({
        institutionId,
        actorUserId: createdByUserId,
        actorMembership,
        section,
    });

    ensureSectionAllowsSessionCreation(section);

    const semester = await loadSectionSemester({
        institutionId,
        semesterId: section.semesterId,
    });
    if (!semester) {
        throw createError(404, "Semester not found");
    }

    validateSessionDateAgainstSemester(input.sessionDate, semester);

    const duplicateSectionSession = await SectionSession.findOne({
        institutionId,
        sectionId,
        sessionDate: input.sessionDate,
        startTime: input.startTime,
        sessionType: input.sessionType,
    })
        .select("_id")
        .lean();

    if (duplicateSectionSession) {
        throw createError(409, "Section session already exists for this date, time, and session type");
    }

    let sectionSession;
    try {
        sectionSession = await SectionSession.create({
            institutionId,
            sectionId,
            sessionType: input.sessionType,
            sessionDate: input.sessionDate,
            startTime: input.startTime,
            endTime: input.endTime,
            room: input.room,
            status: input.status,
            createdByUserId,
        });
    } catch (error) {
        const mappedDuplicateError = mapDuplicateSectionSessionError(error);
        if (mappedDuplicateError) {
            throw mappedDuplicateError;
        }

        throw error;
    }

    return {
        sectionSession: toSectionSessionResponse(sectionSession),
    };
}

async function generateSectionSessions({ institutionId, sectionId, createdByUserId, actorMembership, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    if (!createdByUserId || !isValidObjectId(createdByUserId)) {
        throw createError(401, "Unauthorized");
    }

    const input = validateGenerateSectionSessionsInput(payload);

    const [institution, section] = await Promise.all([
        Institution.findOne({ _id: institutionId }).select("_id").lean(),
        loadSectionForSessionGeneration({ institutionId, sectionId }),
    ]);

    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (!section) {
        throw createError(404, "Section not found");
    }

    await ensureCanManageSectionSession({
        institutionId,
        actorUserId: createdByUserId,
        actorMembership,
        section,
    });

    ensureSectionAllowsSessionCreation(section);

    const semester = await loadSectionSemester({
        institutionId,
        semesterId: section.semesterId,
    });
    if (!semester) {
        throw createError(404, "Semester not found");
    }

    validateScheduleAgainstSemester(section.schedule || [], semester);

    const scheduleEntries = buildScheduleEntriesForGeneration(section.schedule || []);
    const generationRange = resolveGenerationDateRange({
        semester,
        fromDate: input.fromDate,
        toDate: input.toDate,
    });
    const blockedDateSet = buildBlockedSessionDateSet(semester);
    const candidates = buildSectionSessionGenerationCandidates({
        institutionId,
        sectionId,
        createdByUserId,
        scheduleEntries,
        fromDate: generationRange.fromDate,
        toDate: generationRange.toDate,
        blockedDateSet,
    });

    let generatedCount = 0;
    if (candidates.length) {
        const operations = candidates.map((candidate) => ({
            updateOne: {
                filter: {
                    institutionId,
                    sectionId,
                    sessionDate: candidate.sessionDate,
                    startTime: candidate.startTime,
                    sessionType: candidate.sessionType,
                },
                update: {
                    $setOnInsert: candidate,
                },
                upsert: true,
            },
        }));

        const result = await SectionSession.bulkWrite(operations, { ordered: true });
        generatedCount = result.upsertedCount || 0;
    }

    const skippedCount = candidates.length - generatedCount;

    return {
        message: buildSectionSessionGenerationMessage({
            generatedCount,
            skippedCount,
        }),
        sectionSessionGeneration: {
            fromDate: formatDateOnly(generationRange.fromDate),
            toDate: formatDateOnly(generationRange.toDate),
            generatedCount,
            skippedCount,
        },
    };
}

async function listSectionSessions({ institutionId, sectionId, actorUserId, actorMembership, query = {} }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    const input = validateListSectionSessionsInput(query);

    const section = await loadSectionRecord({ institutionId, sectionId });
    if (!section) {
        throw createError(404, "Section not found");
    }

    await ensureCanManageSectionSession({
        institutionId,
        actorUserId,
        actorMembership,
        section,
        requiredResponsibilityPermission: "sectionSession.read_scope",
    });

    const filters = {
        institutionId,
        sectionId,
    };
    if (input.fromDate || input.toDate) {
        filters.sessionDate = {};
        if (input.fromDate) {
            filters.sessionDate.$gte = input.fromDate;
        }
        if (input.toDate) {
            filters.sessionDate.$lte = input.toDate;
        }
    }
    if (input.status) {
        filters.status = input.status;
    }
    if (input.attendanceState) {
        filters.attendanceState = input.attendanceState;
    }

    const skip = (input.page - 1) * input.limit;
    const [totalItems, sectionSessions] = await Promise.all([
        SectionSession.countDocuments(filters),
        SectionSession.find(filters)
            .select(SECTION_SESSION_SELECT_FIELDS)
            .sort({ sessionDate: -1, startTime: -1, _id: -1 })
            .skip(skip)
            .limit(input.limit)
            .lean(),
    ]);

    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / input.limit);

    return {
        items: sectionSessions.map(toSectionSessionListItem),
        pagination: {
            page: input.page,
            limit: input.limit,
            totalItems,
            totalPages,
        },
    };
}

async function getSectionSessionById({ institutionId, sectionId, sectionSessionId, actorUserId, actorMembership }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    if (!sectionSessionId || !isValidObjectId(sectionSessionId)) {
        throw createError(400, "Invalid section session id");
    }

    const [sectionSession, section] = await Promise.all([
        SectionSession.findOne({
            _id: sectionSessionId,
            institutionId,
            sectionId,
        })
            .select(SECTION_SESSION_SELECT_FIELDS)
            .lean(),
        loadSectionRecord({ institutionId, sectionId }),
    ]);

    if (!sectionSession) {
        throw createError(404, "Section session not found");
    }

    if (!section) {
        throw createError(404, "Section not found");
    }

    const subject = await loadSubjectRecord({
        institutionId,
        subjectId: section.subjectId,
    });
    if (!subject) {
        throw createError(404, "Subject not found");
    }

    await ensureCanManageSectionSession({
        institutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        requiredResponsibilityPermission: "sectionSession.read_scope",
    });

    return {
        sectionSession: toSectionSessionResponse(sectionSession, {
            section,
            subject,
        }),
    };
}

async function updateSectionSession({ institutionId, sectionId, sectionSessionId, actorUserId, actorMembership, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    if (!sectionSessionId || !isValidObjectId(sectionSessionId)) {
        throw createError(400, "Invalid section session id");
    }

    const [institution, section, existingSectionSession] = await Promise.all([
        Institution.findOne({ _id: institutionId }).select("_id").lean(),
        loadSectionRecord({ institutionId, sectionId }),
        SectionSession.findOne({
            _id: sectionSessionId,
            institutionId,
            sectionId,
        })
            .select(SECTION_SESSION_SELECT_FIELDS)
            .lean(),
    ]);

    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (!section) {
        throw createError(404, "Section not found");
    }

    if (!existingSectionSession) {
        throw createError(404, "Section session not found");
    }

    await ensureCanManageSectionSession({
        institutionId,
        actorUserId,
        actorMembership,
        section,
    });

    const updates = validateUpdateSectionSessionInput(payload, existingSectionSession);

    if (updates.sessionDate !== undefined) {
        const semester = await loadSectionSemester({
            institutionId,
            semesterId: section.semesterId,
        });
        if (!semester) {
            throw createError(404, "Semester not found");
        }

        validateSessionDateAgainstSemester(updates.sessionDate, semester);
    }

    const nextSessionType =
        updates.sessionType !== undefined ? updates.sessionType : existingSectionSession.sessionType;
    const nextSessionDate =
        updates.sessionDate !== undefined ? updates.sessionDate : new Date(existingSectionSession.sessionDate);
    const nextStartTime =
        updates.startTime !== undefined ? updates.startTime : existingSectionSession.startTime;

    if (
        updates.sessionType !== undefined ||
        updates.sessionDate !== undefined ||
        updates.startTime !== undefined
    ) {
        const duplicateSectionSession = await SectionSession.findOne({
            institutionId,
            sectionId,
            sessionType: nextSessionType,
            sessionDate: nextSessionDate,
            startTime: nextStartTime,
            _id: { $ne: sectionSessionId },
        })
            .select("_id")
            .lean();

        if (duplicateSectionSession) {
            throw createError(409, "Section session already exists for this date, time, and session type");
        }
    }

    let sectionSession;
    try {
        sectionSession = await SectionSession.findOneAndUpdate(
            {
                _id: sectionSessionId,
                institutionId,
                sectionId,
            },
            { $set: updates },
            { returnDocument: "after", runValidators: true }
        )
            .select(SECTION_SESSION_SELECT_FIELDS)
            .lean();
    } catch (error) {
        const mappedDuplicateError = mapDuplicateSectionSessionError(error);
        if (mappedDuplicateError) {
            throw mappedDuplicateError;
        }

        throw error;
    }

    if (!sectionSession) {
        throw createError(404, "Section session not found");
    }

    return {
        sectionSession: toSectionSessionResponse(sectionSession),
    };
}

async function updateSectionSessionStatus({
    institutionId,
    sectionId,
    sectionSessionId,
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

    if (!sectionSessionId || !isValidObjectId(sectionSessionId)) {
        throw createError(400, "Invalid section session id");
    }

    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    const input = validateUpdateSectionSessionStatusInput(payload);

    const [institution, sectionSession] = await Promise.all([
        Institution.findOne({ _id: institutionId }).select("_id").lean(),
        SectionSession.findOne({
            _id: sectionSessionId,
            institutionId,
            sectionId,
        })
            .select(SECTION_SESSION_SELECT_FIELDS)
            .lean(),
    ]);

    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (!sectionSession) {
        throw createError(404, "Section session not found");
    }

    const section = await loadSectionRecord({ institutionId, sectionId });
    if (!section) {
        throw createError(404, "Section not found");
    }

    const subject = await loadSubjectRecord({
        institutionId,
        subjectId: section.subjectId,
    });
    if (!subject) {
        throw createError(404, "Subject not found");
    }

    await ensureCanChangeSectionSessionStatus({
        institutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
    });

    const nextStatus = input.status;
    const nextStatusNote = input.note;
    const currentStatusNote = sectionSession.statusNote || null;

    if (sectionSession.status === nextStatus && currentStatusNote === nextStatusNote) {
        return {
            sectionSession: toSectionSessionResponse(sectionSession, {
                section,
                subject,
            }),
        };
    }

    const shouldNotifyStudents =
        sectionSession.status !== "cancelled" && nextStatus === "cancelled";

    const statusChangedAt = new Date();
    const updatedSectionSession = await SectionSession.findOneAndUpdate(
        {
            _id: sectionSessionId,
            institutionId,
            sectionId,
        },
        {
            $set: {
                status: nextStatus,
                statusNote: nextStatusNote,
                statusChangedAt,
                statusChangedByUserId: actorUserId,
            },
        },
        { returnDocument: "after", runValidators: true }
    )
        .select(SECTION_SESSION_SELECT_FIELDS)
        .lean();

    if (!updatedSectionSession) {
        throw createError(404, "Section session not found");
    }

    if (shouldNotifyStudents) {
        await notifyCancelledSectionSessionStudents({
            institutionId,
            sectionId,
            sectionSession: updatedSectionSession,
            section,
            subject,
        });
    }

    return {
        sectionSession: toSectionSessionResponse(updatedSectionSession, {
            section,
            subject,
        }),
    };
}

module.exports = {
    validateCreateSectionSessionInput,
    validateGenerateSectionSessionsInput,
    validateUpdateSectionSessionInput,
    validateUpdateSectionSessionStatusInput,
    toSectionSessionResponse,
    toSectionSessionListItem,
    createSectionSession,
    generateSectionSessions,
    listSectionSessions,
    getSectionSessionById,
    updateSectionSession,
    ensureCanChangeSectionSessionStatus,
    updateSectionSessionStatus,
};
