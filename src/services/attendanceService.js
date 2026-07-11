const crypto = require("crypto");
const mongoose = require("mongoose");
const AttendanceRecord = require("../models/AttendanceRecord");
const Enrollment = require("../models/Enrollment");
const Institution = require("../models/Institution");
const MemberProfile = require("../models/MemberProfile");
const Membership = require("../models/Membership");
const Section = require("../models/Section");
const SectionSession = require("../models/SectionSession");
const Subject = require("../models/Subject");
const User = require("../models/User");
const { ensureCanChangeSectionSessionStatus } = require("./sectionSessionService");

const { ATTENDANCE_STATUSES } = require("../constants/attendanceConstants");
const ROSTER_FILTERS = ["all", "attended", "not_attended", "present", "absent", "late", "excused", "pending"];
const ACTIVE_ENROLLMENT_STATUS = "enrolled";
const MAX_NOTE_LENGTH = 500;
const QR_TOKEN_EXPIRY_SECONDS = 20;
const QR_PRESENT_GRACE_MINUTES = 10;
const ATTENDED_STATUSES = new Set(["present", "late"]);
const NOT_ATTENDED_STATUSES = new Set(["absent", "excused", "pending"]);
const ATTENDANCE_RECORD_SELECT_FIELDS =
    "_id institutionId sectionId sectionSessionId enrollmentId studentMemberId attendanceStatus source checkedInAt note recordedByUserId createdAt updatedAt";
const SECTION_SESSION_ATTENDANCE_SELECT_FIELDS =
    "_id institutionId sectionId sessionDate startTime endTime status attendanceState attendanceOpenedAt attendanceClosedAt attendanceOpenedByUserId currentQrTokenHash currentQrTokenExpiresAt";
const ATTENDANCE_HISTORY_SESSION_SELECT_FIELDS = "_id institutionId sectionId sessionDate startTime endTime";
const ATTENDANCE_HISTORY_SECTION_SELECT_FIELDS = "_id institutionId subjectId code title";
const ATTENDANCE_HISTORY_SUBJECT_SELECT_FIELDS = "_id institutionId code name";
const DEFAULT_ATTENDANCE_POLICY_SUMMARY = Object.freeze({
    warnAfterAbsences: 3,
    dropAfterAbsences: 5,
    lateToAbsenceRatio: 3,
    excusedCountsAsAbsence: false,
});

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

function parseTimeValue(rawValue, fieldName) {
    const value = normalizeString(rawValue);
    const match = value.match(/^(\d{1,2}):(\d{2})$/);

    if (!match) {
        throw createError(500, `${fieldName} is invalid`);
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
        throw createError(500, `${fieldName} is invalid`);
    }

    return {
        normalized: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
        minutes: hours * 60 + minutes,
    };
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

function validateAttendanceStatus(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : null;
    }

    const attendanceStatus = normalizeLowerString(rawValue);
    if (!ATTENDANCE_STATUSES.includes(attendanceStatus)) {
        throw createError(400, "attendanceStatus must be present, absent, late, or excused");
    }

    return attendanceStatus;
}

function validateAttendanceRosterFilter(rawValue) {
    if (rawValue === undefined) {
        return "all";
    }

    const filter = normalizeLowerString(rawValue);
    if (!ROSTER_FILTERS.includes(filter)) {
        throw createError(400, "filter is invalid");
    }

    return filter;
}

function validateAttendanceRosterQuery(query = {}) {
    return {
        filter: validateAttendanceRosterFilter(query.filter),
    };
}

function validateAttendanceHistoryStatusFilter(rawValue) {
    const value = normalizeLowerString(rawValue);
    if (!value) {
        return "";
    }

    if (!ATTENDANCE_STATUSES.includes(value)) {
        throw createError(400, "status must be present, absent, late, or excused");
    }

    return value;
}

function validateAttendanceHistoryQuery(query = {}) {
    const sectionId = normalizeId(query.sectionId);
    if (sectionId && !isValidObjectId(sectionId)) {
        throw createError(400, "sectionId is invalid");
    }

    const fromDateValue = normalizeString(query.fromDate);
    const toDateValue = normalizeString(query.toDate);

    const fromDate = fromDateValue ? parseDateOnly(fromDateValue, "fromDate") : undefined;
    const toDate = toDateValue ? parseDateOnly(toDateValue, "toDate") : undefined;
    if (fromDate && toDate && toDate.getTime() < fromDate.getTime()) {
        throw createError(400, "toDate must be on or after fromDate");
    }

    return {
        sectionId,
        fromDate,
        toDate,
        status: validateAttendanceHistoryStatusFilter(query.status),
    };
}

function validateAttendanceAnalyticsQuery(query = {}) {
    const fromDateValue = normalizeString(query.fromDate);
    const toDateValue = normalizeString(query.toDate);

    const fromDate = fromDateValue ? parseDateOnly(fromDateValue, "fromDate") : undefined;
    const toDate = toDateValue ? parseDateOnly(toDateValue, "toDate") : undefined;
    if (fromDate && toDate && toDate.getTime() < fromDate.getTime()) {
        throw createError(400, "toDate must be on or after fromDate");
    }

    return {
        fromDate,
        toDate,
    };
}

function validateAttendanceCheckInInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const token = normalizeString(payload.token);
    if (!token) {
        throw createError(400, "token is required");
    }

    return {
        token,
    };
}

function validateManualAttendanceEntry(rawEntry, index) {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
        throw createError(400, `entries[${index}] must be an object`);
    }

    if (!rawEntry.enrollmentId || !isValidObjectId(rawEntry.enrollmentId)) {
        throw createError(400, `entries[${index}].enrollmentId is invalid`);
    }

    return {
        enrollmentId: rawEntry.enrollmentId,
        attendanceStatus: validateAttendanceStatus(rawEntry.attendanceStatus),
        note: normalizeBoundedNullableString(rawEntry.note, `entries[${index}].note`, MAX_NOTE_LENGTH),
    };
}

function validateManualAttendanceUpsertInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    if (!Array.isArray(payload.entries) || payload.entries.length === 0) {
        throw createError(400, "entries must be a non-empty array");
    }

    const entries = payload.entries.map((entry, index) => validateManualAttendanceEntry(entry, index));
    const enrollmentIds = entries.map((entry) => normalizeId(entry.enrollmentId));
    if (new Set(enrollmentIds).size !== enrollmentIds.length) {
        throw createError(400, "entries must not contain duplicate enrollmentId values");
    }

    return { entries };
}

function toAttendanceRecordResponse(attendanceRecord) {
    return {
        id: attendanceRecord._id.toString(),
        sectionId: attendanceRecord.sectionId.toString(),
        sectionSessionId: attendanceRecord.sectionSessionId.toString(),
        enrollmentId: attendanceRecord.enrollmentId.toString(),
        studentMemberId: attendanceRecord.studentMemberId.toString(),
        attendanceStatus: attendanceRecord.attendanceStatus,
        source: attendanceRecord.source,
        checkedInAt: attendanceRecord.checkedInAt,
        note: attendanceRecord.note || null,
        recordedByUserId: attendanceRecord.recordedByUserId?.toString() || null,
        createdAt: attendanceRecord.createdAt,
        updatedAt: attendanceRecord.updatedAt,
    };
}

function toSectionSessionAttendanceStateResponse(sectionSession) {
    return {
        id: sectionSession._id.toString(),
        sectionId: sectionSession.sectionId.toString(),
        sessionDate: formatDateOnly(new Date(sectionSession.sessionDate)),
        startTime: sectionSession.startTime,
        endTime: sectionSession.endTime,
        status: sectionSession.status,
        attendanceState: sectionSession.attendanceState,
        attendanceOpenedAt: sectionSession.attendanceOpenedAt || null,
        attendanceClosedAt: sectionSession.attendanceClosedAt || null,
        attendanceOpenedByUserId: sectionSession.attendanceOpenedByUserId?.toString() || null,
    };
}

function buildStudentSummary({ profile, user }) {
    return {
        fullName: profile?.fullName || null,
        email: user?.email || null,
    };
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

function buildAttendanceHistorySessionSummary(sectionSession) {
    if (!sectionSession) {
        return null;
    }

    return {
        id: sectionSession._id.toString(),
        sessionDate: formatDateOnly(new Date(sectionSession.sessionDate)),
        startTime: sectionSession.startTime,
        endTime: sectionSession.endTime,
    };
}

function createAttendanceMetricsAccumulator() {
    return {
        presentCount: 0,
        lateCount: 0,
        absentCount: 0,
        excusedCount: 0,
        totalCount: 0,
    };
}

function appendAttendanceStatusToMetrics(metrics, attendanceStatus) {
    metrics.totalCount += 1;

    if (attendanceStatus === "present") {
        metrics.presentCount += 1;
        return;
    }

    if (attendanceStatus === "late") {
        metrics.lateCount += 1;
        return;
    }

    if (attendanceStatus === "absent") {
        metrics.absentCount += 1;
        return;
    }

    if (attendanceStatus === "excused") {
        metrics.excusedCount += 1;
    }
}

function finalizeAttendanceMetrics(metrics) {
    const attendedCount = metrics.presentCount + metrics.lateCount;

    return {
        presentCount: metrics.presentCount,
        lateCount: metrics.lateCount,
        absentCount: metrics.absentCount,
        excusedCount: metrics.excusedCount,
        attendedCount,
        totalCount: metrics.totalCount,
        attendanceRate: metrics.totalCount ? attendedCount / metrics.totalCount : 0,
    };
}

function normalizeAttendancePolicyThreshold(value, defaultValue) {
    if (Number.isInteger(value) && value >= 0) {
        return value;
    }

    return defaultValue;
}

function normalizeAttendanceLateToAbsenceRatio(value) {
    if (Number.isInteger(value) && value >= 1) {
        return value;
    }

    return DEFAULT_ATTENDANCE_POLICY_SUMMARY.lateToAbsenceRatio;
}

function resolveAttendancePolicySummary(policies = {}) {
    const source = policies && typeof policies === "object" && !Array.isArray(policies) ? policies : {};

    return {
        warnAfterAbsences: normalizeAttendancePolicyThreshold(
            source.warnAfterAbsences,
            DEFAULT_ATTENDANCE_POLICY_SUMMARY.warnAfterAbsences
        ),
        dropAfterAbsences: normalizeAttendancePolicyThreshold(
            source.dropAfterAbsences,
            DEFAULT_ATTENDANCE_POLICY_SUMMARY.dropAfterAbsences
        ),
        lateToAbsenceRatio: normalizeAttendanceLateToAbsenceRatio(source.lateToAbsenceRatio),
        excusedCountsAsAbsence:
            typeof source.excusedCountsAsAbsence === "boolean"
                ? source.excusedCountsAsAbsence
                : DEFAULT_ATTENDANCE_POLICY_SUMMARY.excusedCountsAsAbsence,
    };
}

function buildAttendanceRisk(metrics, attendancePolicySummary) {
    const finalizedMetrics = finalizeAttendanceMetrics(metrics);
    const lateAbsenceEquivalent = Math.floor(
        finalizedMetrics.lateCount / attendancePolicySummary.lateToAbsenceRatio
    );
    const effectiveAbsences =
        finalizedMetrics.absentCount +
        lateAbsenceEquivalent +
        (attendancePolicySummary.excusedCountsAsAbsence ? finalizedMetrics.excusedCount : 0);

    let status = "good";
    if (
        attendancePolicySummary.dropAfterAbsences > 0 &&
        effectiveAbsences >= attendancePolicySummary.dropAfterAbsences
    ) {
        status = "drop_risk";
    } else if (
        attendancePolicySummary.warnAfterAbsences > 0 &&
        effectiveAbsences >= attendancePolicySummary.warnAfterAbsences
    ) {
        status = "warning";
    }

    return {
        status,
        effectiveAbsences,
        warnAfterAbsences: attendancePolicySummary.warnAfterAbsences,
        dropAfterAbsences: attendancePolicySummary.dropAfterAbsences,
        absentCount: finalizedMetrics.absentCount,
        lateCount: finalizedMetrics.lateCount,
        excusedCount: finalizedMetrics.excusedCount,
        lateAbsenceEquivalent,
    };
}

function matchesRosterFilter(attendanceStatus, filter) {
    if (filter === "all") {
        return true;
    }

    if (filter === "attended") {
        return ATTENDED_STATUSES.has(attendanceStatus);
    }

    if (filter === "not_attended") {
        return NOT_ATTENDED_STATUSES.has(attendanceStatus);
    }

    return attendanceStatus === filter;
}

function toAttendanceRosterItem({ enrollment, membership, profile, user, attendanceRecord }) {
    return {
        enrollmentId: enrollment._id.toString(),
        studentMemberId: enrollment.studentMemberId.toString(),
        student: buildStudentSummary({
            profile,
            user,
        }),
        attendanceStatus: attendanceRecord?.attendanceStatus || "pending",
        source: attendanceRecord?.source || null,
        checkedInAt: attendanceRecord?.checkedInAt || null,
        note: attendanceRecord?.note || null,
        updatedAt: attendanceRecord?.updatedAt || null,
    };
}

function toAttendanceHistoryItem({ attendanceRecord, sectionSession, section, subject }) {
    return {
        id: attendanceRecord._id.toString(),
        attendanceStatus: attendanceRecord.attendanceStatus,
        source: attendanceRecord.source,
        checkedInAt: attendanceRecord.checkedInAt || null,
        note: attendanceRecord.note || null,
        session: buildAttendanceHistorySessionSummary(sectionSession),
        section: buildSectionSummary(section),
        subject: buildSubjectSummary(subject),
    };
}

function buildAttendanceHistorySummary(attendanceRecords) {
    const metrics = createAttendanceMetricsAccumulator();
    for (const attendanceRecord of attendanceRecords) {
        appendAttendanceStatusToMetrics(metrics, attendanceRecord.attendanceStatus);
    }

    const summary = finalizeAttendanceMetrics(metrics);
    delete summary.attendanceRate;

    return summary;
}

function buildAttendanceAnalyticsRange(input) {
    return {
        fromDate: input.fromDate ? formatDateOnly(input.fromDate) : null,
        toDate: input.toDate ? formatDateOnly(input.toDate) : null,
    };
}

function toAttendanceAnalyticsStudentItem({ studentMemberId, profile, user, metrics, attendancePolicySummary }) {
    return {
        studentMemberId,
        student: buildStudentSummary({
            profile,
            user,
        }),
        ...finalizeAttendanceMetrics(metrics),
        attendanceRisk: buildAttendanceRisk(metrics, attendancePolicySummary),
    };
}

function toAttendanceAnalyticsSessionItem({ sectionSession, metrics }) {
    return {
        session: buildAttendanceHistorySessionSummary(sectionSession),
        ...finalizeAttendanceMetrics(metrics),
    };
}

function hashQrToken(rawToken) {
    return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function generateQrToken() {
    return crypto.randomBytes(32).toString("hex");
}

function extractDateOnlyParts(rawValue, fieldName) {
    if (rawValue instanceof Date) {
        if (Number.isNaN(rawValue.getTime())) {
            throw createError(500, `${fieldName} is invalid`);
        }

        return {
            year: rawValue.getUTCFullYear(),
            monthIndex: rawValue.getUTCMonth(),
            day: rawValue.getUTCDate(),
        };
    }

    const value = normalizeString(rawValue);
    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
        const year = Number(dateOnlyMatch[1]);
        const monthIndex = Number(dateOnlyMatch[2]) - 1;
        const day = Number(dateOnlyMatch[3]);
        const parsed = new Date(Date.UTC(year, monthIndex, day));

        if (
            Number.isNaN(parsed.getTime()) ||
            parsed.getUTCFullYear() !== year ||
            parsed.getUTCMonth() !== monthIndex ||
            parsed.getUTCDate() !== day
        ) {
            throw createError(500, `${fieldName} is invalid`);
        }

        return { year, monthIndex, day };
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw createError(500, `${fieldName} is invalid`);
    }

    return {
        year: parsed.getUTCFullYear(),
        monthIndex: parsed.getUTCMonth(),
        day: parsed.getUTCDate(),
    };
}

function buildSectionSessionStartDate(sectionSession) {
    const sessionDate = extractDateOnlyParts(sectionSession.sessionDate, "sectionSession.sessionDate");
    const startTime = parseTimeValue(sectionSession.startTime, "sectionSession.startTime");
    // SectionSession stores a date-only value plus local wall-clock time.
    // Rebuild the local datetime explicitly from calendar parts so date-only values
    // do not drift to the previous/next local day when a timezone offset is applied.
    const [hours, minutes] = startTime.normalized.split(":").map(Number);
    return new Date(sessionDate.year, sessionDate.monthIndex, sessionDate.day, hours, minutes, 0, 0);
}

function resolveQrGraceAnchor(sectionSession) {
    const sessionStartAt = buildSectionSessionStartDate(sectionSession);
    const attendanceOpenedAt = sectionSession.attendanceOpenedAt ? new Date(sectionSession.attendanceOpenedAt) : null;

    if (!attendanceOpenedAt || Number.isNaN(attendanceOpenedAt.getTime()) || attendanceOpenedAt <= sessionStartAt) {
        return sessionStartAt;
    }

    return attendanceOpenedAt;
}

function buildLocalDateKey(value) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(
        2,
        "0"
    )}`;
}

function ensureQrAttendanceIsAvailableToday(sectionSession, now) {
    const sessionStartAt = buildSectionSessionStartDate(sectionSession);
    const attendanceDate = resolveQrAttendanceAvailabilityDate(now);
    if (buildLocalDateKey(sessionStartAt) !== buildLocalDateKey(attendanceDate)) {
        throw createError(409, "QR attendance is only available on the scheduled session date");
    }
}

function resolveQrAttendanceAvailabilityDate(now) {
    if (process.env.NODE_ENV === "production") {
        return now;
    }

    const overrideDate = normalizeString(process.env.ATTENDANCE_QR_DATE_OVERRIDE);
    if (!overrideDate) {
        return now;
    }

    try {
        return parseDateOnly(overrideDate, "ATTENDANCE_QR_DATE_OVERRIDE");
    } catch (_error) {
        return now;
    }
}

function resolveQrAttendanceStatus(sectionSession, checkedInAt) {
    const graceAnchor = resolveQrGraceAnchor(sectionSession);
    const lateThreshold = new Date(graceAnchor.getTime() + QR_PRESENT_GRACE_MINUTES * 60 * 1000);
    return checkedInAt <= lateThreshold ? "present" : "late";
}

async function loadSectionRecord({ institutionId, sectionId }) {
    return Section.findOne({
        _id: sectionId,
        institutionId,
    })
        .select("_id institutionId subjectId code title instructorMemberId status")
        .lean();
}

async function loadSectionSessionRecord({ institutionId, sectionId, sectionSessionId }) {
    return SectionSession.findOne({
        _id: sectionSessionId,
        institutionId,
        sectionId,
    })
        .select(SECTION_SESSION_ATTENDANCE_SELECT_FIELDS)
        .lean();
}

async function loadInstitutionAttendancePolicySummary(institutionId) {
    const institution = await Institution.findOne({ _id: institutionId })
        .select("_id policies")
        .lean();

    return resolveAttendancePolicySummary(institution?.policies);
}

function ensureSessionSupportsAttendance(sectionSession) {
    if (sectionSession.status === "cancelled") {
        throw createError(409, "Cancelled sessions cannot manage attendance");
    }
}

function ensureAttendanceIsOpen(sectionSession) {
    if (sectionSession.attendanceState !== "open") {
        throw createError(409, "Attendance is not open for this session");
    }
}

function ensureInstructorCanManageAttendance({ actorUserId, actorMembership, section }) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    const actorMembershipId = normalizeId(actorMembership._id);
    const sectionInstructorMemberId = normalizeId(section.instructorMemberId);

    if (!sectionInstructorMemberId) {
        throw createError(403, "Attendance management is not allowed for sections without an instructor");
    }

    if (actorMembershipId !== sectionInstructorMemberId) {
        throw createError(403, "Only the section instructor can manage attendance for this session");
    }
}

async function loadAttendanceManagementContext({ institutionId, sectionId, sectionSessionId }) {
    const [section, sectionSession] = await Promise.all([
        loadSectionRecord({ institutionId, sectionId }),
        loadSectionSessionRecord({ institutionId, sectionId, sectionSessionId }),
    ]);

    if (!section) {
        throw createError(404, "Section not found");
    }

    if (!sectionSession) {
        throw createError(404, "Section session not found");
    }

    ensureSessionSupportsAttendance(sectionSession);

    return {
        section,
        sectionSession,
    };
}

async function loadStudentEnrollmentForCheckIn({ institutionId, sectionId, studentMemberId }) {
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

async function loadSubjectRecord({ institutionId, subjectId }) {
    return Subject.findOne({
        _id: subjectId,
        institutionId,
    })
        .select("_id departmentId classLevelId name code")
        .lean();
}

async function ensureCanUpsertManualAttendance({
    institutionId,
    actorUserId,
    actorMembership,
    section,
    sectionSession,
}) {
    if (sectionSession.attendanceState === "open") {
        ensureInstructorCanManageAttendance({
            actorUserId,
            actorMembership,
            section,
        });
        return;
    }

    if (sectionSession.attendanceState === "closed") {
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
            requiredResponsibilityPermission: "attendance.manage_scope",
        });
        return;
    }

    throw createError(409, "Attendance has not been opened for this session");
}

async function openSectionSessionAttendance({
    institutionId,
    sectionId,
    sectionSessionId,
    actorUserId,
    actorMembership,
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

    const { section, sectionSession } = await loadAttendanceManagementContext({
        institutionId,
        sectionId,
        sectionSessionId,
    });

    ensureInstructorCanManageAttendance({
        actorUserId,
        actorMembership,
        section,
    });

    if (sectionSession.attendanceState === "open") {
        throw createError(409, "Attendance is already open for this session");
    }

    if (sectionSession.attendanceState === "closed") {
        throw createError(409, "Attendance has already been closed for this session");
    }

    const attendanceOpenedAt = new Date();
    const updatedSectionSession = await SectionSession.findOneAndUpdate(
        {
            _id: sectionSessionId,
            institutionId,
            sectionId,
        },
        {
            $set: {
                attendanceState: "open",
                attendanceOpenedAt,
                attendanceClosedAt: null,
                attendanceOpenedByUserId: actorUserId,
                currentQrTokenHash: null,
                currentQrTokenExpiresAt: null,
            },
        },
        { returnDocument: "after", runValidators: true }
    )
        .select(SECTION_SESSION_ATTENDANCE_SELECT_FIELDS)
        .lean();

    return {
        sectionSession: toSectionSessionAttendanceStateResponse(updatedSectionSession),
    };
}

async function issueSectionSessionQrToken({
    institutionId,
    sectionId,
    sectionSessionId,
    actorUserId,
    actorMembership,
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

    const { section, sectionSession } = await loadAttendanceManagementContext({
        institutionId,
        sectionId,
        sectionSessionId,
    });

    ensureInstructorCanManageAttendance({
        actorUserId,
        actorMembership,
        section,
    });
    ensureAttendanceIsOpen(sectionSession);

    const now = new Date();
    ensureQrAttendanceIsAvailableToday(sectionSession, now);

    const rawToken = generateQrToken();
    const expiresAt = new Date(Date.now() + QR_TOKEN_EXPIRY_SECONDS * 1000);

    await SectionSession.updateOne(
        {
            _id: sectionSessionId,
            institutionId,
            sectionId,
        },
        {
            $set: {
                currentQrTokenHash: hashQrToken(rawToken),
                currentQrTokenExpiresAt: expiresAt,
            },
        }
    );

    return {
        qrToken: {
            token: rawToken,
            expiresAt,
        },
    };
}

async function checkInToSectionSessionAttendance({
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

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (actorMembership.role !== "student") {
        throw createError(403, "Only students can check in with QR attendance");
    }

    const input = validateAttendanceCheckInInput(payload);
    const { sectionSession } = await loadAttendanceManagementContext({
        institutionId,
        sectionId,
        sectionSessionId,
    });

    ensureAttendanceIsOpen(sectionSession);

    const now = new Date();
    ensureQrAttendanceIsAvailableToday(sectionSession, now);

    if (!sectionSession.currentQrTokenHash || !sectionSession.currentQrTokenExpiresAt) {
        throw createError(409, "QR check-in is not available for this session");
    }

    if (now > new Date(sectionSession.currentQrTokenExpiresAt)) {
        throw createError(409, "QR token has expired");
    }

    const submittedTokenHash = hashQrToken(input.token);
    if (submittedTokenHash !== sectionSession.currentQrTokenHash) {
        throw createError(400, "Invalid QR token");
    }

    const enrollment = await loadStudentEnrollmentForCheckIn({
        institutionId,
        sectionId,
        studentMemberId: actorMembership._id,
    });

    const existingAttendanceRecord = await AttendanceRecord.findOne({
        institutionId,
        sectionSessionId,
        enrollmentId: enrollment._id,
    })
        .select("_id")
        .lean();

    if (existingAttendanceRecord) {
        throw createError(409, "Attendance already recorded for this student");
    }

    const attendanceStatus = resolveQrAttendanceStatus(sectionSession, now);

    const attendanceRecord = await AttendanceRecord.create({
        institutionId,
        sectionId,
        sectionSessionId,
        enrollmentId: enrollment._id,
        studentMemberId: enrollment.studentMemberId,
        attendanceStatus,
        source: "qr",
        checkedInAt: now,
        note: null,
        recordedByUserId: actorUserId,
    });

    return {
        attendanceRecord: toAttendanceRecordResponse(attendanceRecord),
    };
}

async function upsertManualSectionSessionAttendance({
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

    const { section, sectionSession } = await loadAttendanceManagementContext({
        institutionId,
        sectionId,
        sectionSessionId,
    });

    await ensureCanUpsertManualAttendance({
        institutionId,
        actorUserId,
        actorMembership,
        section,
        sectionSession,
    });

    const input = validateManualAttendanceUpsertInput(payload);
    const enrollmentIds = input.entries.map((entry) => entry.enrollmentId);

    const enrollments = await Enrollment.find({
        _id: { $in: enrollmentIds },
        institutionId,
        sectionId,
        status: ACTIVE_ENROLLMENT_STATUS,
    })
        .select("_id studentMemberId status")
        .lean();

    if (enrollments.length !== enrollmentIds.length) {
        throw createError(404, "One or more enrollments were not found");
    }

    const enrollmentById = new Map(enrollments.map((enrollment) => [enrollment._id.toString(), enrollment]));
    const now = new Date();
    const operations = input.entries.map((entry) => {
        const enrollment = enrollmentById.get(entry.enrollmentId.toString());
        const checkedInAt = ATTENDED_STATUSES.has(entry.attendanceStatus) ? now : null;

        return {
            updateOne: {
                filter: {
                    institutionId,
                    sectionSessionId,
                    enrollmentId: enrollment._id,
                },
                update: {
                    $set: {
                        institutionId,
                        sectionId,
                        sectionSessionId,
                        enrollmentId: enrollment._id,
                        studentMemberId: enrollment.studentMemberId,
                        attendanceStatus: entry.attendanceStatus,
                        source: "manual",
                        checkedInAt,
                        note: entry.note,
                        recordedByUserId: actorUserId,
                    },
                },
                upsert: true,
            },
        };
    });

    if (operations.length) {
        await AttendanceRecord.bulkWrite(operations, { ordered: true });
    }

    const updatedRecords = await AttendanceRecord.find({
        institutionId,
        sectionSessionId,
        enrollmentId: { $in: enrollmentIds },
    })
        .select(ATTENDANCE_RECORD_SELECT_FIELDS)
        .sort({ _id: 1 })
        .lean();

    return {
        attendanceRecords: updatedRecords.map(toAttendanceRecordResponse),
    };
}

async function listMyAttendanceHistory({ institutionId, actorUserId, actorMembership, query = {} }) {
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
        throw createError(403, "Only students can view their own attendance history");
    }

    const input = validateAttendanceHistoryQuery(query);
    const studentMemberId = normalizeId(actorMembership._id);
    const attendanceFilters = {
        institutionId,
        studentMemberId,
    };

    if (input.sectionId) {
        attendanceFilters.sectionId = input.sectionId;
    }

    if (input.status) {
        attendanceFilters.attendanceStatus = input.status;
    }

    const attendanceRecords = await AttendanceRecord.find(attendanceFilters)
        .select(ATTENDANCE_RECORD_SELECT_FIELDS)
        .sort({ createdAt: -1, _id: -1 })
        .lean();

    if (!attendanceRecords.length) {
        return {
            attendanceHistory: [],
            summary: buildAttendanceHistorySummary([]),
        };
    }

    const sectionSessionIds = [
        ...new Set(attendanceRecords.map((attendanceRecord) => normalizeId(attendanceRecord.sectionSessionId)).filter(Boolean)),
    ];
    const sectionSessionFilters = {
        _id: { $in: sectionSessionIds },
        institutionId,
    };
    if (input.fromDate || input.toDate) {
        sectionSessionFilters.sessionDate = {};
        if (input.fromDate) {
            sectionSessionFilters.sessionDate.$gte = input.fromDate;
        }
        if (input.toDate) {
            sectionSessionFilters.sessionDate.$lte = input.toDate;
        }
    }

    const sectionSessions = await SectionSession.find(sectionSessionFilters)
        .select(ATTENDANCE_HISTORY_SESSION_SELECT_FIELDS)
        .lean();
    const sectionSessionById = new Map(
        sectionSessions.map((sectionSession) => [sectionSession._id.toString(), sectionSession])
    );

    const filteredAttendanceRecords = attendanceRecords.filter((attendanceRecord) =>
        sectionSessionById.has(attendanceRecord.sectionSessionId.toString())
    );

    if (!filteredAttendanceRecords.length) {
        return {
            attendanceHistory: [],
            summary: buildAttendanceHistorySummary([]),
        };
    }

    const sectionIds = [
        ...new Set(sectionSessions.map((sectionSession) => normalizeId(sectionSession.sectionId)).filter(Boolean)),
    ];
    const sections = sectionIds.length
        ? await Section.find({
              _id: { $in: sectionIds },
              institutionId,
          })
              .select(ATTENDANCE_HISTORY_SECTION_SELECT_FIELDS)
              .lean()
        : [];
    const sectionById = new Map(sections.map((section) => [section._id.toString(), section]));

    const subjectIds = [...new Set(sections.map((section) => normalizeId(section.subjectId)).filter(Boolean))];
    const subjects = subjectIds.length
        ? await Subject.find({
              _id: { $in: subjectIds },
              institutionId,
          })
              .select(ATTENDANCE_HISTORY_SUBJECT_SELECT_FIELDS)
              .lean()
        : [];
    const subjectById = new Map(subjects.map((subject) => [subject._id.toString(), subject]));

    const attendanceHistory = filteredAttendanceRecords
        .map((attendanceRecord) => {
            const sectionSession = sectionSessionById.get(attendanceRecord.sectionSessionId.toString()) || null;
            const section = sectionSession ? sectionById.get(sectionSession.sectionId.toString()) || null : null;
            const subject = section?.subjectId ? subjectById.get(section.subjectId.toString()) || null : null;

            return {
                attendanceRecord,
                sectionSession,
                section,
                subject,
            };
        })
        .sort((left, right) => {
            const leftSessionDate = left.sectionSession ? new Date(left.sectionSession.sessionDate).getTime() : 0;
            const rightSessionDate = right.sectionSession ? new Date(right.sectionSession.sessionDate).getTime() : 0;
            if (rightSessionDate !== leftSessionDate) {
                return rightSessionDate - leftSessionDate;
            }

            const leftStartTime = left.sectionSession?.startTime || "";
            const rightStartTime = right.sectionSession?.startTime || "";
            const timeOrder = rightStartTime.localeCompare(leftStartTime);
            if (timeOrder !== 0) {
                return timeOrder;
            }

            return new Date(right.attendanceRecord.createdAt).getTime() - new Date(left.attendanceRecord.createdAt).getTime();
        })
        .map(toAttendanceHistoryItem);

    return {
        attendanceHistory,
        summary: buildAttendanceHistorySummary(filteredAttendanceRecords),
    };
}

async function getSectionAttendanceAnalytics({
    institutionId,
    sectionId,
    actorUserId,
    actorMembership,
    query = {},
}) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (actorMembership.role === "student") {
        throw createError(403, "Students cannot access attendance analytics");
    }

    const input = validateAttendanceAnalyticsQuery(query);
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
        requiredResponsibilityPermission: "attendance.read_scope",
    });

    const attendancePolicySummary = await loadInstitutionAttendancePolicySummary(institutionId);

    const sectionSessionFilters = {
        institutionId,
        sectionId,
        attendanceState: "closed",
        status: { $ne: "cancelled" },
    };
    if (input.fromDate || input.toDate) {
        sectionSessionFilters.sessionDate = {};
        if (input.fromDate) {
            sectionSessionFilters.sessionDate.$gte = input.fromDate;
        }
        if (input.toDate) {
            sectionSessionFilters.sessionDate.$lte = input.toDate;
        }
    }

    const sectionSessions = await SectionSession.find(sectionSessionFilters)
        .select(ATTENDANCE_HISTORY_SESSION_SELECT_FIELDS)
        .sort({ sessionDate: 1, startTime: 1, _id: 1 })
        .lean();

    const totalClosedSessions = sectionSessions.length;
    if (!sectionSessions.length) {
        return {
            attendanceAnalytics: {
                section: buildSectionSummary(section),
                subject: buildSubjectSummary(subject),
                range: buildAttendanceAnalyticsRange(input),
                attendancePolicySummary,
                summary: {
                    totalClosedSessions,
                    ...finalizeAttendanceMetrics(createAttendanceMetricsAccumulator()),
                },
                perStudent: [],
                perSession: [],
            },
        };
    }

    const sectionSessionIds = sectionSessions.map((sectionSession) => sectionSession._id);
    const attendanceRecords = await AttendanceRecord.find({
        institutionId,
        sectionId,
        sectionSessionId: { $in: sectionSessionIds },
    })
        .select(ATTENDANCE_RECORD_SELECT_FIELDS)
        .lean();

    const overallMetrics = createAttendanceMetricsAccumulator();
    const sessionMetricsById = new Map(
        sectionSessions.map((sectionSession) => [sectionSession._id.toString(), createAttendanceMetricsAccumulator()])
    );
    const studentMetricsById = new Map();

    for (const attendanceRecord of attendanceRecords) {
        appendAttendanceStatusToMetrics(overallMetrics, attendanceRecord.attendanceStatus);

        const sectionSessionIdKey = attendanceRecord.sectionSessionId.toString();
        const sessionMetrics = sessionMetricsById.get(sectionSessionIdKey);
        if (sessionMetrics) {
            appendAttendanceStatusToMetrics(sessionMetrics, attendanceRecord.attendanceStatus);
        }

        const studentMemberId = attendanceRecord.studentMemberId.toString();
        if (!studentMetricsById.has(studentMemberId)) {
            studentMetricsById.set(studentMemberId, createAttendanceMetricsAccumulator());
        }

        appendAttendanceStatusToMetrics(studentMetricsById.get(studentMemberId), attendanceRecord.attendanceStatus);
    }

    const studentMemberIds = [...studentMetricsById.keys()];
    const [memberships, profiles] = await Promise.all([
        studentMemberIds.length
            ? Membership.find({
                  _id: { $in: studentMemberIds },
                  institutionId,
              })
                  .select("_id userId")
                  .lean()
            : [],
        studentMemberIds.length
            ? MemberProfile.find({
                  membershipId: { $in: studentMemberIds },
                  institutionId,
              })
                  .select("_id membershipId fullName")
                  .lean()
            : [],
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

    const perStudent = [...studentMetricsById.entries()]
        .map(([studentMemberId, metrics]) => {
            const membership = membershipById.get(studentMemberId) || null;
            const profile = profileByMembershipId.get(studentMemberId) || null;
            const user = membership?.userId ? userById.get(membership.userId.toString()) || null : null;

            return toAttendanceAnalyticsStudentItem({
                studentMemberId,
                profile,
                user,
                metrics,
                attendancePolicySummary,
            });
        })
        .sort((left, right) => {
            const leftName = normalizeLowerString(left.student.fullName || left.student.email || "");
            const rightName = normalizeLowerString(right.student.fullName || right.student.email || "");
            const nameOrder = leftName.localeCompare(rightName);
            if (nameOrder !== 0) {
                return nameOrder;
            }

            return left.studentMemberId.localeCompare(right.studentMemberId);
        });

    const perSession = sectionSessions.map((sectionSession) =>
        toAttendanceAnalyticsSessionItem({
            sectionSession,
            metrics: sessionMetricsById.get(sectionSession._id.toString()) || createAttendanceMetricsAccumulator(),
        })
    );

    return {
        attendanceAnalytics: {
            section: buildSectionSummary(section),
            subject: buildSubjectSummary(subject),
            range: buildAttendanceAnalyticsRange(input),
            attendancePolicySummary,
            summary: {
                totalClosedSessions,
                ...finalizeAttendanceMetrics(overallMetrics),
            },
            perStudent,
            perSession,
        },
    };
}

async function listSectionSessionAttendanceRoster({
    institutionId,
    sectionId,
    sectionSessionId,
    actorUserId,
    actorMembership,
    query,
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

    const { section } = await loadAttendanceManagementContext({
        institutionId,
        sectionId,
        sectionSessionId,
    });

    ensureInstructorCanManageAttendance({
        actorUserId,
        actorMembership,
        section,
    });

    const { filter } = validateAttendanceRosterQuery(query);

    const enrollments = await Enrollment.find({
        institutionId,
        sectionId,
        status: ACTIVE_ENROLLMENT_STATUS,
    })
        .select("_id studentMemberId createdAt")
        .lean();

    if (!enrollments.length) {
        return {
            attendanceRoster: [],
        };
    }

    const studentMemberIds = [...new Set(enrollments.map((enrollment) => normalizeId(enrollment.studentMemberId)).filter(Boolean))];
    const enrollmentIds = enrollments.map((enrollment) => enrollment._id);

    const [attendanceRecords, memberships, profiles] = await Promise.all([
        AttendanceRecord.find({
            institutionId,
            sectionSessionId,
            enrollmentId: { $in: enrollmentIds },
        })
            .select(ATTENDANCE_RECORD_SELECT_FIELDS)
            .lean(),
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

    const attendanceByEnrollmentId = new Map(
        attendanceRecords.map((attendanceRecord) => [attendanceRecord.enrollmentId.toString(), attendanceRecord])
    );

    let attendanceRoster = enrollments.map((enrollment) => {
        const membership = membershipById.get(enrollment.studentMemberId.toString()) || null;
        const profile = profileByMembershipId.get(enrollment.studentMemberId.toString()) || null;
        const user = membership?.userId ? userById.get(membership.userId.toString()) || null : null;
        const attendanceRecord = attendanceByEnrollmentId.get(enrollment._id.toString()) || null;

        return toAttendanceRosterItem({
            enrollment,
            membership,
            profile,
            user,
            attendanceRecord,
        });
    });

    attendanceRoster = attendanceRoster
        .filter((item) => matchesRosterFilter(item.attendanceStatus, filter))
        .sort((left, right) => {
            const leftName = normalizeLowerString(left.student.fullName);
            const rightName = normalizeLowerString(right.student.fullName);
            return leftName.localeCompare(rightName);
        });

    return {
        attendanceRoster,
    };
}

async function closeSectionSessionAttendance({
    institutionId,
    sectionId,
    sectionSessionId,
    actorUserId,
    actorMembership,
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

    const { section, sectionSession } = await loadAttendanceManagementContext({
        institutionId,
        sectionId,
        sectionSessionId,
    });

    ensureInstructorCanManageAttendance({
        actorUserId,
        actorMembership,
        section,
    });
    ensureAttendanceIsOpen(sectionSession);

    const [enrollments, attendanceRecords] = await Promise.all([
        Enrollment.find({
            institutionId,
            sectionId,
            status: ACTIVE_ENROLLMENT_STATUS,
        })
            .select("_id studentMemberId")
            .lean(),
        AttendanceRecord.find({
            institutionId,
            sectionSessionId,
        })
            .select("enrollmentId")
            .lean(),
    ]);

    const existingEnrollmentIds = new Set(
        attendanceRecords.map((attendanceRecord) => attendanceRecord.enrollmentId.toString())
    );

    const absentRecordOperations = enrollments
        .filter((enrollment) => !existingEnrollmentIds.has(enrollment._id.toString()))
        .map((enrollment) => ({
            updateOne: {
                filter: {
                    institutionId,
                    sectionSessionId,
                    enrollmentId: enrollment._id,
                },
                update: {
                    $setOnInsert: {
                        institutionId,
                        sectionId,
                        sectionSessionId,
                        enrollmentId: enrollment._id,
                        studentMemberId: enrollment.studentMemberId,
                        attendanceStatus: "absent",
                        source: "manual",
                        checkedInAt: null,
                        note: null,
                        recordedByUserId: actorUserId,
                    },
                },
                upsert: true,
            },
        }));

    if (absentRecordOperations.length) {
        await AttendanceRecord.bulkWrite(absentRecordOperations, { ordered: true });
    }

    const attendanceClosedAt = new Date();
    const updatedSectionSession = await SectionSession.findOneAndUpdate(
        {
            _id: sectionSessionId,
            institutionId,
            sectionId,
        },
        {
            $set: {
                attendanceState: "closed",
                attendanceClosedAt,
                currentQrTokenHash: null,
                currentQrTokenExpiresAt: null,
            },
        },
        { returnDocument: "after", runValidators: true }
    )
        .select(SECTION_SESSION_ATTENDANCE_SELECT_FIELDS)
        .lean();

    return {
        sectionSession: toSectionSessionAttendanceStateResponse(updatedSectionSession),
    };
}

module.exports = {
    validateAttendanceCheckInInput,
    validateManualAttendanceUpsertInput,
    validateAttendanceRosterQuery,
    resolveAttendancePolicySummary,
    buildAttendanceRisk,
    resolveQrAttendanceAvailabilityDate,
    toAttendanceRecordResponse,
    toAttendanceRosterItem,
    listMyAttendanceHistory,
    getSectionAttendanceAnalytics,
    openSectionSessionAttendance,
    issueSectionSessionQrToken,
    checkInToSectionSessionAttendance,
    upsertManualSectionSessionAttendance,
    listSectionSessionAttendanceRoster,
    closeSectionSessionAttendance,
};
