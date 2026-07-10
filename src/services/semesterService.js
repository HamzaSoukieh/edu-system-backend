const mongoose = require("mongoose");
const Semester = require("../models/Semester");
const { validateAcademicYearReference } = require("./academicYearService");

const DAY_MS = 24 * 60 * 60 * 1000;
const TEACHING_DAY_LABELS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];
const TEACHING_DAY_LOOKUP = {
    sunday: "Sunday",
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
};
const TEACHING_DAY_INDEX = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
};
const SEMESTER_LINKED_COLLECTIONS = [
    {
        collectionName: "sections",
        buildFilter: ({ institutionObjectId, semesterObjectId }) => ({
            institutionId: institutionObjectId,
            semesterId: semesterObjectId,
        }),
    },
];
const SEMESTER_SELECT_FIELDS =
    "_id institutionId academicYearId name startDate endDate teachingDays calendarOverrides examDates weekCount status createdByUserId createdAt updatedAt";
const SEMESTER_LIST_SELECT_FIELDS =
    "_id academicYearId name startDate endDate teachingDays calendarOverrides examDates weekCount status createdAt updatedAt";

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

function normalizeId(value) {
    if (value === undefined || value === null) {
        return null;
    }

    return value.toString().trim();
}

function isDuplicateKeyError(error) {
    return Boolean(error) && error.name === "MongoServerError" && error.code === 11000;
}

function isValidObjectId(value) {
    const normalizedValue = normalizeId(value);
    return Boolean(normalizedValue) && mongoose.Types.ObjectId.isValid(normalizedValue);
}

function formatDateOnly(value) {
    return value.toISOString().slice(0, 10);
}

function addDays(value, days) {
    return new Date(value.getTime() + days * DAY_MS);
}

function calculateWeekCount(startDate, endDate) {
    const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1;
    return Math.ceil(totalDays / 7);
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

function normalizeReason(rawValue) {
    if (rawValue === undefined || rawValue === null) {
        return null;
    }

    const reason = normalizeString(rawValue);
    if (!reason) {
        return null;
    }

    if (reason.length > 200) {
        throw createError(400, "calendarOverride reason must be at most 200 characters");
    }

    return reason;
}

function validateSemesterName(rawValue) {
    const name = normalizeString(rawValue);

    if (!name) {
        throw createError(400, "Semester name is required");
    }

    if (name.length > 120) {
        throw createError(400, "Semester name must be at most 120 characters");
    }

    return name;
}

function isDateWithinRange(date, startDate, endDate) {
    return date.getTime() >= startDate.getTime() && date.getTime() <= endDate.getTime();
}

function resolveWeekNumber(startDate, date) {
    const dayOffset = Math.floor((date.getTime() - startDate.getTime()) / DAY_MS);
    return Math.floor(dayOffset / 7) + 1;
}

function validateCalendarOverride(rawValue, { startDate, endDate }) {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        throw createError(400, "calendarOverride must be an object");
    }

    const date = parseDateOnly(rawValue.date, "calendarOverride date");
    if (!isDateWithinRange(date, startDate, endDate)) {
        throw createError(400, "calendarOverride date must be within the semester range");
    }

    const type = normalizeString(rawValue.type).toLowerCase();
    if (type !== "off") {
        throw createError(400, "calendarOverride type must be off");
    }

    return {
        date,
        type,
        reason: normalizeReason(rawValue.reason),
    };
}

function validateCalendarOverrides(rawValue, { startDate, endDate }) {
    if (!Array.isArray(rawValue)) {
        throw createError(400, "calendarOverrides must be an array");
    }

    const calendarOverrides = rawValue.map((entry) =>
        validateCalendarOverride(entry, {
            startDate,
            endDate,
        })
    );
    const seenDates = new Set();

    for (const entry of calendarOverrides) {
        const dateKey = formatDateOnly(entry.date);
        if (seenDates.has(dateKey)) {
            throw createError(400, "calendarOverrides must not contain duplicate dates");
        }

        seenDates.add(dateKey);
    }

    return calendarOverrides.sort((left, right) => left.date.getTime() - right.date.getTime());
}

function upsertCalendarOverride(calendarOverrides, calendarOverride) {
    const targetDate = formatDateOnly(calendarOverride.date);
    const nextCalendarOverrides = calendarOverrides.filter(
        (entry) => formatDateOnly(parseDateOnly(entry.date, "calendarOverride date")) !== targetDate
    );

    nextCalendarOverrides.push(calendarOverride);

    return nextCalendarOverrides.sort(
        (left, right) =>
            parseDateOnly(left.date, "calendarOverride date").getTime() -
            parseDateOnly(right.date, "calendarOverride date").getTime()
    );
}

function removeCalendarOverride(calendarOverrides, removeDate) {
    const targetDate = formatDateOnly(removeDate);
    return calendarOverrides.filter(
        (entry) => formatDateOnly(parseDateOnly(entry.date, "calendarOverride date")) !== targetDate
    );
}

function normalizeHolidayRangesInput(payload) {
    if (payload.holidayRange === undefined) {
        return payload.holidayRanges;
    }

    if (payload.holidayRanges !== undefined) {
        throw createError(400, "Use holidayRanges or holidayRange, not both");
    }

    return [payload.holidayRange];
}

function buildHolidayRangeOverrides(rawValue, { semesterStartDate, semesterEndDate, teachingDays }) {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        throw createError(400, "holidayRange must be an object");
    }

    const startDate = parseDateOnly(rawValue.startDate, "holidayRange startDate");
    const endDate = parseDateOnly(rawValue.endDate, "holidayRange endDate");
    if (endDate.getTime() < startDate.getTime()) {
        throw createError(400, "holidayRange endDate must be on or after holidayRange startDate");
    }

    if (!isDateWithinRange(startDate, semesterStartDate, semesterEndDate)) {
        throw createError(400, "holidayRange startDate must be within the semester range");
    }

    if (!isDateWithinRange(endDate, semesterStartDate, semesterEndDate)) {
        throw createError(400, "holidayRange endDate must be within the semester range");
    }

    const reason = normalizeReason(rawValue.reason);
    const calendarOverrides = [];

    for (
        let cursor = new Date(startDate.getTime());
        cursor.getTime() <= endDate.getTime();
        cursor = addDays(cursor, 1)
    ) {
        const dayName = TEACHING_DAY_LABELS[cursor.getUTCDay()];
        if (!teachingDays.includes(dayName)) {
            continue;
        }

        calendarOverrides.push({
            date: new Date(cursor.getTime()),
            type: "off",
            reason,
        });
    }

    if (!calendarOverrides.length) {
        throw createError(400, "holidayRange must include at least one teaching day");
    }

    return calendarOverrides;
}

function validateHolidayRanges(rawValue, { semesterStartDate, semesterEndDate, teachingDays }) {
    if (rawValue === undefined) {
        return [];
    }

    if (!Array.isArray(rawValue)) {
        throw createError(400, "holidayRanges must be an array");
    }

    const calendarOverrides = [];
    for (const holidayRange of rawValue) {
        calendarOverrides.push(
            ...buildHolidayRangeOverrides(holidayRange, {
                semesterStartDate,
                semesterEndDate,
                teachingDays,
            })
        );
    }

    return calendarOverrides;
}

function mergeCalendarOverrides(baseCalendarOverrides, additionalCalendarOverrides) {
    let mergedCalendarOverrides = Array.isArray(baseCalendarOverrides) ? baseCalendarOverrides.slice() : [];

    for (const calendarOverride of additionalCalendarOverrides) {
        mergedCalendarOverrides = upsertCalendarOverride(mergedCalendarOverrides, calendarOverride);
    }

    return mergedCalendarOverrides;
}

function normalizeExamType(rawValue) {
    const type = normalizeString(rawValue).toLowerCase();

    if (!["midterm", "final"].includes(type)) {
        throw createError(400, "examDate type must be midterm or final");
    }

    return type;
}

function defaultExamReason(type) {
    if (type === "midterm") {
        return "Midterm Exams";
    }

    return "Final Exams";
}

function normalizeExamReason(rawValue, type) {
    if (rawValue === undefined || rawValue === null) {
        return defaultExamReason(type);
    }

    const reason = normalizeString(rawValue);
    if (!reason) {
        return defaultExamReason(type);
    }

    if (reason.length > 200) {
        throw createError(400, "examDate reason must be at most 200 characters");
    }

    return reason;
}

function validateExamDate(rawValue, { startDate, endDate }) {
    const date = parseDateOnly(rawValue, "examDate date");
    if (!isDateWithinRange(date, startDate, endDate)) {
        throw createError(400, "examDate date must be within the semester range");
    }

    return date;
}

function validateExamDateEntry(rawValue, { startDate, endDate }) {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        throw createError(400, "examDate must be an object");
    }

    const type = normalizeExamType(rawValue.type);

    return {
        date: validateExamDate(rawValue.date, { startDate, endDate }),
        type,
        reason: normalizeExamReason(rawValue.reason, type),
    };
}

function validateExamDates(rawValue, { startDate, endDate }) {
    if (!Array.isArray(rawValue)) {
        throw createError(400, "examDates must be an array");
    }

    const examDates = rawValue.map((entry) =>
        validateExamDateEntry(entry, {
            startDate,
            endDate,
        })
    );
    const seenDates = new Set();

    for (const entry of examDates) {
        const dateKey = formatDateOnly(entry.date);
        if (seenDates.has(dateKey)) {
            throw createError(400, "examDates must not contain duplicate dates");
        }

        seenDates.add(dateKey);
    }

    return examDates.sort((left, right) => left.date.getTime() - right.date.getTime());
}

function upsertExamDate(examDates, examDate) {
    const targetDate = formatDateOnly(examDate.date);
    const nextExamDates = examDates.filter(
        (entry) => formatDateOnly(parseDateOnly(entry.date, "examDate date")) !== targetDate
    );

    nextExamDates.push(examDate);

    return nextExamDates.sort(
        (left, right) =>
            parseDateOnly(left.date, "examDate date").getTime() - parseDateOnly(right.date, "examDate date").getTime()
    );
}

function normalizeExamRangesInput(payload) {
    if (payload.examRange === undefined) {
        return payload.examRanges;
    }

    if (payload.examRanges !== undefined) {
        throw createError(400, "Use examRanges or examRange, not both");
    }

    return [payload.examRange];
}

function buildExamRangeDates(rawValue, { semesterStartDate, semesterEndDate }) {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        throw createError(400, "examRange must be an object");
    }

    const startDate = parseDateOnly(rawValue.startDate, "examRange startDate");
    const endDate = parseDateOnly(rawValue.endDate, "examRange endDate");
    if (endDate.getTime() < startDate.getTime()) {
        throw createError(400, "examRange endDate must be on or after examRange startDate");
    }

    if (!isDateWithinRange(startDate, semesterStartDate, semesterEndDate)) {
        throw createError(400, "examRange startDate must be within the semester range");
    }

    if (!isDateWithinRange(endDate, semesterStartDate, semesterEndDate)) {
        throw createError(400, "examRange endDate must be within the semester range");
    }

    const type = normalizeExamType(rawValue.type);
    const reason = normalizeExamReason(rawValue.reason, type);
    const examDates = [];

    for (
        let cursor = new Date(startDate.getTime());
        cursor.getTime() <= endDate.getTime();
        cursor = addDays(cursor, 1)
    ) {
        examDates.push({
            date: new Date(cursor.getTime()),
            type,
            reason,
        });
    }

    return examDates;
}

function validateExamRanges(rawValue, { semesterStartDate, semesterEndDate }) {
    if (rawValue === undefined) {
        return [];
    }

    if (!Array.isArray(rawValue)) {
        throw createError(400, "examRanges must be an array");
    }

    const examDates = [];
    for (const examRange of rawValue) {
        examDates.push(
            ...buildExamRangeDates(examRange, {
                semesterStartDate,
                semesterEndDate,
            })
        );
    }

    const seenDates = new Set();
    for (const entry of examDates) {
        const dateKey = formatDateOnly(entry.date);
        if (seenDates.has(dateKey)) {
            throw createError(400, "examRanges must not contain duplicate dates");
        }

        seenDates.add(dateKey);
    }

    return examDates.sort((left, right) => left.date.getTime() - right.date.getTime());
}

function mergeExamDates(baseExamDates, additionalExamDates) {
    let mergedExamDates = Array.isArray(baseExamDates) ? baseExamDates.slice() : [];

    for (const examDate of additionalExamDates) {
        mergedExamDates = upsertExamDate(mergedExamDates, examDate);
    }

    return mergedExamDates;
}

function validateExamDatesAgainstOffDates({ examDates, calendarOverrides }) {
    const offDates = new Set(
        (calendarOverrides || [])
            .filter((entry) => entry.type === "off")
            .map((entry) => formatDateOnly(parseDateOnly(entry.date, "calendarOverride date")))
    );

    for (const examDate of examDates || []) {
        const dateKey = formatDateOnly(parseDateOnly(examDate.date, "examDate date"));
        if (offDates.has(dateKey)) {
            throw createError(400, "Exam date cannot be scheduled on an off day");
        }
    }
}

function toExamDateResponse(examDate, { startDate, teachingDays }) {
    const date = parseDateOnly(examDate.date, "examDate date");
    const dayName = TEACHING_DAY_LABELS[date.getUTCDay()];

    return {
        date: formatDateOnly(date),
        type: examDate.type,
        reason: examDate.reason || defaultExamReason(examDate.type),
        dayName,
        weekNumber: resolveWeekNumber(startDate, date),
        affectsTeachingDay: teachingDays.includes(dayName),
    };
}

function buildExamDateResponses({ startDate, teachingDays, examDates }) {
    return (examDates || [])
        .slice()
        .sort(
            (left, right) =>
                parseDateOnly(left.date, "examDate date").getTime() - parseDateOnly(right.date, "examDate date").getTime()
        )
        .map((entry) =>
            toExamDateResponse(entry, {
                startDate,
                teachingDays,
            })
        );
}

function validateTeachingDays(rawValue) {
    if (!Array.isArray(rawValue) || !rawValue.length) {
        throw createError(400, "teachingDays must be a non-empty array");
    }

    const normalizedDays = rawValue.map((entry) => {
        const key = normalizeString(entry).toLowerCase();
        const normalizedDay = TEACHING_DAY_LOOKUP[key];

        if (!normalizedDay) {
            throw createError(400, `teachingDays must only contain ${TEACHING_DAY_LABELS.join(", ")}`);
        }

        return normalizedDay;
    });

    if (new Set(normalizedDays).size !== normalizedDays.length) {
        throw createError(400, "teachingDays must not contain duplicates");
    }

    return normalizedDays;
}

function validateSemesterStatus(rawValue) {
    if (rawValue === undefined) {
        return "active";
    }

    const status = normalizeString(rawValue).toLowerCase();
    if (!["active", "archived"].includes(status)) {
        throw createError(400, "Semester status must be active or archived");
    }

    return status;
}

function validateOptionalAcademicYearId(rawValue) {
    if (rawValue === undefined) {
        return undefined;
    }

    if (rawValue === null) {
        return null;
    }

    const academicYearId = normalizeId(rawValue);
    if (!academicYearId) {
        return null;
    }

    if (!isValidObjectId(academicYearId)) {
        throw createError(400, "academicYearId is invalid");
    }

    return academicYearId;
}

function toCalendarOverrideResponse(calendarOverride, { startDate, teachingDays }) {
    const date = parseDateOnly(calendarOverride.date, "calendarOverride date");
    const dayName = TEACHING_DAY_LABELS[date.getUTCDay()];

    return {
        date: formatDateOnly(date),
        type: calendarOverride.type,
        reason: calendarOverride.reason || null,
        dayName,
        weekNumber: resolveWeekNumber(startDate, date),
        affectsTeachingDay: teachingDays.includes(dayName),
    };
}

function buildCalendarOverrideResponses({ startDate, teachingDays, calendarOverrides }) {
    return (calendarOverrides || [])
        .slice()
        .sort(
            (left, right) =>
                parseDateOnly(left.date, "calendarOverride date").getTime() -
                parseDateOnly(right.date, "calendarOverride date").getTime()
        )
        .map((entry) =>
            toCalendarOverrideResponse(entry, {
                startDate,
                teachingDays,
            })
        );
}

function buildSemesterWeeks({ startDate, endDate, teachingDays, calendarOverrides, examDates }) {
    const weekCount = calculateWeekCount(startDate, endDate);
    const teachingDayIndexes = new Set(teachingDays.map((day) => TEACHING_DAY_INDEX[day]));
    const offDayLookup = new Map(
        (calendarOverrides || [])
            .filter((entry) => entry.type === "off")
            .map((entry) => [formatDateOnly(parseDateOnly(entry.date, "calendarOverride date")), entry])
    );
    const examDateLookup = new Map(
        (examDates || []).map((entry) => [formatDateOnly(parseDateOnly(entry.date, "examDate date")), entry])
    );
    const weeks = [];

    for (let index = 0; index < weekCount; index += 1) {
        const weekStart = addDays(startDate, index * 7);
        const rawWeekEnd = addDays(weekStart, 6);
        const weekEnd = rawWeekEnd.getTime() > endDate.getTime() ? new Date(endDate.getTime()) : rawWeekEnd;
        const teachingDates = [];
        const offDates = [];
        const weekExamDates = [];

        for (
            let cursor = new Date(weekStart.getTime());
            cursor.getTime() <= weekEnd.getTime();
            cursor = addDays(cursor, 1)
        ) {
            const dateKey = formatDateOnly(cursor);
            const offDay = offDayLookup.get(dateKey);

            if (offDay) {
                offDates.push(offDay);
            }

            const examDate = examDateLookup.get(dateKey);
            if (examDate) {
                weekExamDates.push(examDate);
            }

            if (teachingDayIndexes.has(cursor.getUTCDay()) && !offDay && !examDate) {
                teachingDates.push(formatDateOnly(cursor));
            }
        }

        weeks.push({
            weekNumber: index + 1,
            startDate: formatDateOnly(weekStart),
            endDate: formatDateOnly(weekEnd),
            teachingDates,
            offDates,
            examDates: weekExamDates,
            teachingDayCount: teachingDates.length,
            offDayCount: offDates.length,
        });
    }

    return weeks;
}

function toSemesterResponse(semester, { includeWeeks = false } = {}) {
    const calendarOverrides = buildCalendarOverrideResponses({
        startDate: semester.startDate,
        teachingDays: semester.teachingDays,
        calendarOverrides: semester.calendarOverrides,
    });
    const examDates = buildExamDateResponses({
        startDate: semester.startDate,
        teachingDays: semester.teachingDays,
        examDates: semester.examDates,
    });
    const response = {
        id: semester._id.toString(),
        institutionId: semester.institutionId.toString(),
        academicYearId: semester.academicYearId?.toString() || null,
        name: semester.name || null,
        startDate: formatDateOnly(semester.startDate),
        endDate: formatDateOnly(semester.endDate),
        teachingDays: semester.teachingDays,
        teachingDaysPerWeek: semester.teachingDays.length,
        weekCount: semester.weekCount,
        status: semester.status,
        createdByUserId: semester.createdByUserId?.toString() || null,
        createdAt: semester.createdAt,
        updatedAt: semester.updatedAt,
    };

    if (includeWeeks) {
        response.weeks = buildSemesterWeeks({
            startDate: semester.startDate,
            endDate: semester.endDate,
            teachingDays: semester.teachingDays,
            calendarOverrides,
            examDates,
        });
    } else {
        response.calendarOverrides = calendarOverrides;
        response.examDates = examDates;
    }

    return response;
}

function toSemesterListItemResponse(semester) {
    const teachingDays = Array.isArray(semester.teachingDays) ? semester.teachingDays : [];
    const calendarOverrides = Array.isArray(semester.calendarOverrides) ? semester.calendarOverrides : [];
    const examDates = Array.isArray(semester.examDates) ? semester.examDates : [];

    return {
        id: semester._id.toString(),
        academicYearId: semester.academicYearId?.toString() || null,
        name: semester.name || null,
        startDate: formatDateOnly(semester.startDate),
        endDate: formatDateOnly(semester.endDate),
        teachingDays,
        teachingDaysPerWeek: teachingDays.length,
        calendarOverrideCount: calendarOverrides.length,
        examDateCount: examDates.length,
        weekCount: semester.weekCount,
        status: semester.status,
        createdAt: semester.createdAt,
        updatedAt: semester.updatedAt,
    };
}

function validateCreateSemesterInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const startDate = parseDateOnly(payload.startDate, "startDate");
    const endDate = parseDateOnly(payload.endDate, "endDate");
    if (endDate.getTime() < startDate.getTime()) {
        throw createError(400, "endDate must be on or after startDate");
    }

    const name = validateSemesterName(payload.name);
    const teachingDays = validateTeachingDays(payload.teachingDays);
    const status = validateSemesterStatus(payload.status);
    const rawCalendarOverrides =
        payload.calendarOverrides === undefined
            ? []
            : validateCalendarOverrides(payload.calendarOverrides, {
                  startDate,
                  endDate,
              });
    const holidayRanges = normalizeHolidayRangesInput(payload);
    const holidayRangeOverrides = validateHolidayRanges(holidayRanges, {
        semesterStartDate: startDate,
        semesterEndDate: endDate,
        teachingDays,
    });
    const calendarOverrides = mergeCalendarOverrides(holidayRangeOverrides, rawCalendarOverrides);
    const rawExamDates =
        payload.examDates === undefined
            ? []
            : validateExamDates(payload.examDates, {
                  startDate,
                  endDate,
              });
    const examRanges = normalizeExamRangesInput(payload);
    const rangeExamDates = validateExamRanges(examRanges, {
        semesterStartDate: startDate,
        semesterEndDate: endDate,
    });
    const examDates = mergeExamDates(rangeExamDates, rawExamDates);
    validateExamDatesAgainstOffDates({
        examDates,
        calendarOverrides,
    });

    return {
        academicYearId: validateOptionalAcademicYearId(payload.academicYearId) || null,
        name,
        startDate,
        endDate,
        teachingDays,
        calendarOverrides,
        examDates,
        weekCount: calculateWeekCount(startDate, endDate),
        status,
    };
}

function validateUpdateSemesterInput(payload, existingSemester) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    if (
        payload.calendarOverride === undefined &&
        payload.calendarOverrides === undefined &&
        (payload.date !== undefined || payload.type !== undefined || payload.reason !== undefined)
    ) {
        payload.calendarOverride = {
            date: payload.date,
            type: payload.type,
            reason: payload.reason,
        };
    }

    const updates = {};
    const nextTeachingDays =
        payload.teachingDays !== undefined ? validateTeachingDays(payload.teachingDays) : existingSemester.teachingDays;
    const nextStartDate =
        payload.startDate !== undefined
            ? parseDateOnly(payload.startDate, "startDate")
            : new Date(existingSemester.startDate.getTime());
    const nextEndDate =
        payload.endDate !== undefined
            ? parseDateOnly(payload.endDate, "endDate")
            : new Date(existingSemester.endDate.getTime());

    if (nextEndDate.getTime() < nextStartDate.getTime()) {
        throw createError(400, "endDate must be on or after startDate");
    }

    const nextStatus =
        payload.status !== undefined ? validateSemesterStatus(payload.status) : existingSemester.status;

    if (payload.startDate !== undefined) {
        updates.startDate = nextStartDate;
    }

    if (payload.name !== undefined) {
        updates.name = validateSemesterName(payload.name);
    }

    if (payload.endDate !== undefined) {
        updates.endDate = nextEndDate;
    }

    if (payload.teachingDays !== undefined) {
        updates.teachingDays = nextTeachingDays;
    }

    if (payload.status !== undefined) {
        updates.status = nextStatus;
    }

    if (payload.academicYearId !== undefined) {
        updates.academicYearId = validateOptionalAcademicYearId(payload.academicYearId);
    }

    const holidayRanges = normalizeHolidayRangesInput(payload);
    const examRanges = normalizeExamRangesInput(payload);

    if (payload.calendarOverrides !== undefined && payload.calendarOverride !== undefined) {
        throw createError(400, "Use calendarOverrides or calendarOverride, not both");
    }

    if (payload.calendarOverrides !== undefined && payload.removeCalendarOverrideDate !== undefined) {
        throw createError(400, "Use calendarOverrides or removeCalendarOverrideDate, not both");
    }

    if (payload.calendarOverrides !== undefined && holidayRanges !== undefined) {
        throw createError(400, "Use calendarOverrides or holidayRanges, not both");
    }

    if (payload.examDates !== undefined && examRanges !== undefined) {
        throw createError(400, "Use examDates or examRanges, not both");
    }

    let nextCalendarOverrides = Array.isArray(existingSemester.calendarOverrides)
        ? existingSemester.calendarOverrides.slice()
        : [];
    let calendarOverridesChanged = false;

    if (payload.calendarOverrides !== undefined) {
        nextCalendarOverrides = validateCalendarOverrides(payload.calendarOverrides, {
            startDate: nextStartDate,
            endDate: nextEndDate,
        });
        calendarOverridesChanged = true;
    } else {
        if (holidayRanges !== undefined) {
            const holidayRangeOverrides = validateHolidayRanges(holidayRanges, {
                semesterStartDate: nextStartDate,
                semesterEndDate: nextEndDate,
                teachingDays: nextTeachingDays,
            });

            nextCalendarOverrides = mergeCalendarOverrides([], holidayRangeOverrides);
            calendarOverridesChanged = true;
        }

        if (payload.calendarOverride !== undefined) {
            const calendarOverride = validateCalendarOverride(payload.calendarOverride, {
                startDate: nextStartDate,
                endDate: nextEndDate,
            });

            nextCalendarOverrides = upsertCalendarOverride(nextCalendarOverrides, calendarOverride);
            calendarOverridesChanged = true;
        }

        if (payload.removeCalendarOverrideDate !== undefined) {
            const removeDate = parseDateOnly(payload.removeCalendarOverrideDate, "removeCalendarOverrideDate");
            nextCalendarOverrides = removeCalendarOverride(nextCalendarOverrides, removeDate);
            calendarOverridesChanged = true;
        }

        if (
            calendarOverridesChanged ||
            payload.startDate !== undefined ||
            payload.endDate !== undefined
        ) {
            nextCalendarOverrides = validateCalendarOverrides(nextCalendarOverrides, {
                startDate: nextStartDate,
                endDate: nextEndDate,
            });
            calendarOverridesChanged = true;
        }
    }

    if (calendarOverridesChanged) {
        updates.calendarOverrides = nextCalendarOverrides;
    }

    let nextExamDates = Array.isArray(existingSemester.examDates) ? existingSemester.examDates.slice() : [];
    let examDatesChanged = false;

    if (payload.examDates !== undefined) {
        nextExamDates = validateExamDates(payload.examDates, {
            startDate: nextStartDate,
            endDate: nextEndDate,
        });
        examDatesChanged = true;
    } else if (examRanges !== undefined) {
        const rangeExamDates = validateExamRanges(examRanges, {
            semesterStartDate: nextStartDate,
            semesterEndDate: nextEndDate,
        });

        nextExamDates = mergeExamDates([], rangeExamDates);
        examDatesChanged = true;
    }

    if (examDatesChanged || payload.startDate !== undefined || payload.endDate !== undefined) {
        nextExamDates = validateExamDates(nextExamDates, {
            startDate: nextStartDate,
            endDate: nextEndDate,
        });
    }

    if (
        examDatesChanged ||
        calendarOverridesChanged ||
        payload.startDate !== undefined ||
        payload.endDate !== undefined
    ) {
        validateExamDatesAgainstOffDates({
            examDates: nextExamDates,
            calendarOverrides: nextCalendarOverrides,
        });
    }

    if (examDatesChanged) {
        updates.examDates = nextExamDates;
    }

    if (payload.startDate !== undefined || payload.endDate !== undefined) {
        updates.weekCount = calculateWeekCount(nextStartDate, nextEndDate);
    }

    if (!Object.keys(updates).length) {
        throw createError(400, "No valid fields to update");
    }

    return {
        updates,
        nextState: {
            status: nextStatus,
        },
    };
}

async function ensureSingleActiveSemester({ institutionId, excludeSemesterId }) {
    const query = {
        institutionId,
        status: "active",
    };

    if (excludeSemesterId) {
        query._id = { $ne: excludeSemesterId };
    }

    const activeSemester = await Semester.findOne(query)
        .select("_id")
        .lean();

    if (activeSemester) {
        throw createError(409, "Another active semester already exists for this institution");
    }
}

async function createSemester({ institutionId, createdByUserId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!createdByUserId || !isValidObjectId(createdByUserId)) {
        throw createError(401, "Unauthorized");
    }

    const { academicYearId, name, startDate, endDate, teachingDays, calendarOverrides, examDates, weekCount, status } =
        validateCreateSemesterInput(payload);

    if (academicYearId) {
        await validateAcademicYearReference({
            institutionId,
            academicYearId,
        });
    }

    if (status === "active") {
        await ensureSingleActiveSemester({
            institutionId,
        });
    }

    let semester;
    try {
        semester = await Semester.create({
            institutionId,
            academicYearId,
            name,
            startDate,
            endDate,
            teachingDays,
            calendarOverrides,
            examDates,
            weekCount,
            status,
            createdByUserId,
        });
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            throw createError(409, "Another active semester already exists for this institution");
        }

        throw error;
    }

    return {
        semester: toSemesterResponse(semester, { includeWeeks: true }),
    };
}

async function listSemesters({ institutionId, status }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    const query = { institutionId };
    const normalizedStatus = normalizeString(status).toLowerCase();
    if (normalizedStatus === "active" || normalizedStatus === "archived") {
        query.status = normalizedStatus;
    } else if (normalizedStatus) {
        throw createError(400, "status must be active or archived");
    }

    const semesters = await Semester.find(query)
        .select(SEMESTER_LIST_SELECT_FIELDS)
        .sort({ startDate: -1, createdAt: -1 })
        .lean();

    return {
        total: semesters.length,
        semesters: semesters.map((semester) => toSemesterListItemResponse(semester)),
    };
}

async function getSemesterById({ institutionId, semesterId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!semesterId || !isValidObjectId(semesterId)) {
        throw createError(400, "Invalid semester id");
    }

    const semester = await Semester.findOne({
        _id: semesterId,
        institutionId,
    })
        .select(SEMESTER_SELECT_FIELDS)
        .lean();

    if (!semester) {
        throw createError(404, "Semester not found");
    }

    return {
        semester: toSemesterResponse(semester, { includeWeeks: true }),
    };
}

async function getActiveSemester({ institutionId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    const semester = await Semester.findOne({
        institutionId,
        status: "active",
    })
        .select(SEMESTER_SELECT_FIELDS)
        .sort({ startDate: -1, createdAt: -1 })
        .lean();

    if (!semester) {
        throw createError(404, "Active semester not found");
    }

    return {
        semester: toSemesterResponse(semester, { includeWeeks: true }),
    };
}

async function hasLinkedSemesterData({ institutionId, semesterId }) {
    const institutionObjectId = new mongoose.Types.ObjectId(institutionId);
    const semesterObjectId = new mongoose.Types.ObjectId(semesterId);

    for (const linkedCollection of SEMESTER_LINKED_COLLECTIONS) {
        const linkedDocument = await mongoose.connection.collection(linkedCollection.collectionName).findOne(
            linkedCollection.buildFilter({
                institutionObjectId,
                semesterObjectId,
            }),
            {
                projection: { _id: 1 },
            }
        );

        if (linkedDocument) {
            return true;
        }
    }

    return false;
}

async function updateSemester({ institutionId, semesterId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!semesterId || !isValidObjectId(semesterId)) {
        throw createError(400, "Invalid semester id");
    }

    const existingSemester = await Semester.findOne({
        _id: semesterId,
        institutionId,
    })
        .select(SEMESTER_SELECT_FIELDS)
        .lean();

    if (!existingSemester) {
        throw createError(404, "Semester not found");
    }

    const { updates, nextState } = validateUpdateSemesterInput(payload, existingSemester);

    if (updates.academicYearId) {
        await validateAcademicYearReference({
            institutionId,
            academicYearId: updates.academicYearId,
        });
    }

    if (
        nextState.status === "active" &&
        (payload.status !== undefined || existingSemester.status === "active")
    ) {
        await ensureSingleActiveSemester({
            institutionId,
            excludeSemesterId: semesterId,
        });
    }

    let semester;
    try {
        semester = await Semester.findOneAndUpdate(
            {
                _id: semesterId,
                institutionId,
            },
            { $set: updates },
            { returnDocument: "after", runValidators: true }
        )
            .select(SEMESTER_SELECT_FIELDS)
            .lean();
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            throw createError(409, "Another active semester already exists for this institution");
        }

        throw error;
    }

    if (!semester) {
        throw createError(404, "Semester not found");
    }

    return {
        semester: toSemesterResponse(semester, { includeWeeks: true }),
    };
}

async function deleteSemester({ institutionId, semesterId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!semesterId || !isValidObjectId(semesterId)) {
        throw createError(400, "Invalid semester id");
    }

    const semester = await Semester.findOne({
        _id: semesterId,
        institutionId,
    })
        .select("_id status")
        .lean();

    if (!semester) {
        throw createError(404, "Semester not found");
    }

    // Always block deletion when linked academic data exists — regardless of archived
    // status (DB-7). Archiving hides a semester; it must never license an orphaning delete
    // of its sections / enrollments / sessions.
    const hasLinkedData = await hasLinkedSemesterData({
        institutionId,
        semesterId,
    });

    if (hasLinkedData) {
        throw createError(
            409,
            "Cannot delete a semester that has linked academic data. Archive it instead."
        );
    }

    await Semester.deleteOne({
        _id: semesterId,
        institutionId,
    });

    return {
        message: "Semester deleted successfully",
    };
}

module.exports = {
    createSemester,
    listSemesters,
    getSemesterById,
    getActiveSemester,
    updateSemester,
    deleteSemester,
};
