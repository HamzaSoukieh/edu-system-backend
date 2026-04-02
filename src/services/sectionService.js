const mongoose = require("mongoose");
const Department = require("../models/Department");
const Institution = require("../models/Institution");
const Membership = require("../models/Membership");
const SchoolClass = require("../models/SchoolClass");
const Section = require("../models/Section");
const Semester = require("../models/Semester");
const Subject = require("../models/Subject");
const { backfillSchoolSectionEnrollments } = require("./enrollmentService");

const SECTION_STATUSES = ["draft", "active", "closed", "cancelled"];
const SCHEDULE_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SECTION_SCHEDULE_SESSION_TYPES = ["lecture", "lab"];
const TEACHING_MEMBER_ROLES = ["instructor"];
const ROOM_RESERVED_SECTION_STATUSES = ["draft", "active"];
const DELETABLE_SECTION_STATUSES = ["draft", "cancelled"];
const SECTION_SELECT_FIELDS =
    "_id institutionId semesterId subjectId schoolClassId code title instructorMemberId capacity schedule status createdByUserId createdAt updatedAt";

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

function normalizeUpperString(value) {
    return normalizeString(value).toUpperCase();
}

function normalizeLowerString(value) {
    return normalizeString(value).toLowerCase();
}

function isValidObjectId(value) {
    return Boolean(value) && mongoose.Types.ObjectId.isValid(value);
}

function isDuplicateKeyError(error) {
    return Boolean(error) && error.name === "MongoServerError" && error.code === 11000;
}

function normalizeRequiredCode(rawValue) {
    const code = normalizeUpperString(rawValue);
    if (!code) {
        throw createError(400, "code is required");
    }

    return code;
}

function normalizeNullableString(rawValue, fieldName, { allowUndefined = false } = {}) {
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

function normalizeNullableObjectId(rawValue, fieldName, { allowUndefined = false } = {}) {
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

    if (!isValidObjectId(value)) {
        throw createError(400, `Invalid ${fieldName}`);
    }

    return value;
}

function normalizeNullablePositiveInteger(rawValue, fieldName, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : null;
    }

    if (rawValue === null) {
        return null;
    }

    if (!Number.isInteger(rawValue) || rawValue < 1) {
        throw createError(400, `${fieldName} must be an integer greater than or equal to 1`);
    }

    return rawValue;
}

function validateSectionStatus(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : "draft";
    }

    const status = normalizeLowerString(rawValue);
    if (!SECTION_STATUSES.includes(status)) {
        throw createError(400, "status must be draft, active, closed, or cancelled");
    }

    return status;
}

function validateScheduleSessionType(rawValue, fieldName, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : null;
    }

    if (rawValue === null) {
        return null;
    }

    const sessionType = normalizeLowerString(rawValue);
    if (!SECTION_SCHEDULE_SESSION_TYPES.includes(sessionType)) {
        throw createError(400, `${fieldName} must be lecture or lab`);
    }

    return sessionType;
}

function statusReservesRoom(rawValue) {
    return ROOM_RESERVED_SECTION_STATUSES.includes(normalizeLowerString(rawValue));
}

function normalizeRoomForConflict(rawValue) {
    return normalizeLowerString(rawValue);
}

function parseTimeToMinutes(rawValue, fieldName, { silent = false } = {}) {
    const value = normalizeString(rawValue);
    const match = value.match(/^(\d{1,2}):(\d{2})$/);

    if (!match) {
        if (silent) {
            return null;
        }

        throw createError(400, `${fieldName} must be in HH:mm format`);
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
        if (silent) {
            return null;
        }

        throw createError(400, `${fieldName} must be in HH:mm format`);
    }

    return hours * 60 + minutes;
}

function buildRoomScheduleEntries(schedule, { silentInvalidTimes = false } = {}) {
    const entries = [];

    for (let index = 0; index < schedule.length; index += 1) {
        const entry = schedule[index];
        const room = normalizeRoomForConflict(entry.room);
        if (!room) {
            continue;
        }

        const day = normalizeLowerString(entry.day);
        if (!SCHEDULE_DAYS.includes(day)) {
            if (silentInvalidTimes) {
                continue;
            }

            throw createError(
                400,
                `schedule[${index}].day must be one of ${SCHEDULE_DAYS.join(", ")}`
            );
        }

        const startMinutes = parseTimeToMinutes(entry.startTime, `schedule[${index}].startTime`, {
            silent: silentInvalidTimes,
        });
        const endMinutes = parseTimeToMinutes(entry.endTime, `schedule[${index}].endTime`, {
            silent: silentInvalidTimes,
        });

        if (startMinutes === null || endMinutes === null) {
            continue;
        }

        if (startMinutes >= endMinutes) {
            if (silentInvalidTimes) {
                continue;
            }

            throw createError(400, `schedule[${index}].startTime must be before schedule[${index}].endTime`);
        }

        entries.push({
            sessionType: validateScheduleSessionType(entry.sessionType, `schedule[${index}].sessionType`, {
                allowUndefined: true,
            }),
            day,
            room,
            roomLabel: normalizeString(entry.room),
            startTime: normalizeString(entry.startTime),
            endTime: normalizeString(entry.endTime),
            startMinutes,
            endMinutes,
        });
    }

    return entries;
}

function timeRangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
    return leftStart < rightEnd && rightStart < leftEnd;
}

function validateScheduleEntry(rawValue, index) {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        throw createError(400, `schedule[${index}] must be an object`);
    }

    const day = normalizeLowerString(rawValue.day);
    if (!SCHEDULE_DAYS.includes(day)) {
        throw createError(
            400,
            `schedule[${index}].day must be one of ${SCHEDULE_DAYS.join(", ")}`
        );
    }

    const startTime = normalizeString(rawValue.startTime);
    if (!startTime) {
        throw createError(400, `schedule[${index}].startTime is required`);
    }

    const endTime = normalizeString(rawValue.endTime);
    if (!endTime) {
        throw createError(400, `schedule[${index}].endTime is required`);
    }

    return {
        sessionType: validateScheduleSessionType(rawValue.sessionType, `schedule[${index}].sessionType`, {
            allowUndefined: true,
        }),
        day,
        startTime,
        endTime,
        room: normalizeNullableString(rawValue.room, `schedule[${index}].room`),
    };
}

function validateSchedule(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : [];
    }

    if (!Array.isArray(rawValue)) {
        throw createError(400, "schedule must be an array");
    }

    return rawValue.map((entry, index) => validateScheduleEntry(entry, index));
}

function validateCreateSectionInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    if (!payload.semesterId || !isValidObjectId(payload.semesterId)) {
        throw createError(400, "Invalid semester id");
    }

    if (!payload.subjectId || !isValidObjectId(payload.subjectId)) {
        throw createError(400, "Invalid subject id");
    }

    return {
        semesterId: payload.semesterId,
        subjectId: payload.subjectId,
        schoolClassId: normalizeNullableObjectId(payload.schoolClassId, "schoolClassId"),
        code: normalizeRequiredCode(payload.code),
        title: normalizeNullableString(payload.title, "title"),
        instructorMemberId: normalizeNullableObjectId(payload.instructorMemberId, "instructorMemberId"),
        capacity: normalizeNullablePositiveInteger(payload.capacity, "capacity"),
        schedule: validateSchedule(payload.schedule),
        status: validateSectionStatus(payload.status),
    };
}

function validateUpdateSectionInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    if (payload.semesterId !== undefined) {
        throw createError(400, "semesterId cannot be updated");
    }

    if (payload.subjectId !== undefined) {
        throw createError(400, "subjectId cannot be updated");
    }

    if (payload.schoolClassId !== undefined) {
        throw createError(400, "schoolClassId cannot be updated");
    }

    const updates = {};

    if (payload.code !== undefined) {
        updates.code = normalizeRequiredCode(payload.code);
    }

    if (payload.title !== undefined) {
        updates.title = normalizeNullableString(payload.title, "title", { allowUndefined: true });
    }

    if (payload.instructorMemberId !== undefined) {
        updates.instructorMemberId = normalizeNullableObjectId(
            payload.instructorMemberId,
            "instructorMemberId",
            { allowUndefined: true }
        );
    }

    if (payload.capacity !== undefined) {
        updates.capacity = normalizeNullablePositiveInteger(payload.capacity, "capacity", {
            allowUndefined: true,
        });
    }

    if (payload.schedule !== undefined) {
        updates.schedule = validateSchedule(payload.schedule, { allowUndefined: true });
    }

    if (payload.status !== undefined) {
        updates.status = validateSectionStatus(payload.status, { allowUndefined: true });
    }

    if (!Object.keys(updates).length) {
        throw createError(400, "No valid fields to update");
    }

    return updates;
}

function validateOptionalFilterObjectId(rawValue, fieldName) {
    if (rawValue === undefined) {
        return null;
    }

    const value = normalizeString(rawValue);
    if (!value || !isValidObjectId(value)) {
        throw createError(400, `Invalid ${fieldName}`);
    }

    return value;
}

function validateListSectionsInput(query = {}) {
    return {
        semesterId: validateOptionalFilterObjectId(query.semesterId, "semesterId"),
        subjectId: validateOptionalFilterObjectId(query.subjectId, "subjectId"),
        instructorMemberId: validateOptionalFilterObjectId(query.instructorMemberId, "instructorMemberId"),
        departmentId: validateOptionalFilterObjectId(query.departmentId, "departmentId"),
        schoolClassId: validateOptionalFilterObjectId(query.schoolClassId, "schoolClassId"),
        status: validateSectionStatus(query.status, { allowUndefined: true }),
    };
}

function toSectionResponse(section) {
    return {
        id: section._id.toString(),
        institutionId: section.institutionId.toString(),
        semesterId: section.semesterId.toString(),
        subjectId: section.subjectId.toString(),
        schoolClassId: section.schoolClassId ? section.schoolClassId.toString() : null,
        code: section.code,
        title: section.title || null,
        instructorMemberId: section.instructorMemberId ? section.instructorMemberId.toString() : null,
        capacity: section.capacity ?? null,
        schedule: Array.isArray(section.schedule)
            ? section.schedule.map((entry) => ({
                  sessionType: entry.sessionType || null,
                  day: normalizeLowerString(entry.day),
                  startTime: entry.startTime,
                  endTime: entry.endTime,
                  room: entry.room || null,
              }))
            : [],
        status: section.status,
        createdByUserId: section.createdByUserId?.toString() || null,
        createdAt: section.createdAt,
        updatedAt: section.updatedAt,
    };
}

function toSectionListItem(section) {
    return {
        id: section._id.toString(),
        semesterId: section.semesterId.toString(),
        subjectId: section.subjectId.toString(),
        schoolClassId: section.schoolClassId ? section.schoolClassId.toString() : null,
        code: section.code,
        title: section.title || null,
        instructorMemberId: section.instructorMemberId ? section.instructorMemberId.toString() : null,
        capacity: section.capacity ?? null,
        status: section.status,
        scheduleCount: Array.isArray(section.schedule) ? section.schedule.length : 0,
        updatedAt: section.updatedAt,
    };
}

function validateScheduleAgainstSemesterTeachingDays(schedule, semester) {
    const allowedDays = Array.isArray(semester.teachingDays)
        ? semester.teachingDays.map((day) => normalizeLowerString(day)).filter(Boolean)
        : [];
    const allowedDaySet = new Set(allowedDays);

    for (let index = 0; index < schedule.length; index += 1) {
        const entry = schedule[index];
        if (!allowedDaySet.has(entry.day)) {
            throw createError(
                400,
                `schedule[${index}].day "${entry.day}" is not allowed by the semester teachingDays: ${allowedDays.join(
                    ", "
                )}`
            );
        }
    }
}

async function ensureNoRoomScheduleConflicts({
    institutionId,
    semesterId,
    schedule,
    status,
    excludedSectionId = null,
}) {
    if (!statusReservesRoom(status)) {
        return;
    }

    const requestedEntries = buildRoomScheduleEntries(schedule);
    if (!requestedEntries.length) {
        return;
    }

    const sectionQuery = {
        institutionId,
        semesterId,
        status: { $in: ROOM_RESERVED_SECTION_STATUSES },
    };

    if (excludedSectionId) {
        sectionQuery._id = { $ne: excludedSectionId };
    }

    const candidateSections = await Section.find(sectionQuery)
        .select("_id schedule")
        .lean();

    for (const requestedEntry of requestedEntries) {
        for (const candidateSection of candidateSections) {
            const candidateEntries = buildRoomScheduleEntries(candidateSection.schedule || [], {
                silentInvalidTimes: true,
            });

            for (const candidateEntry of candidateEntries) {
                if (requestedEntry.day !== candidateEntry.day || requestedEntry.room !== candidateEntry.room) {
                    continue;
                }

                if (
                    timeRangesOverlap(
                        requestedEntry.startMinutes,
                        requestedEntry.endMinutes,
                        candidateEntry.startMinutes,
                        candidateEntry.endMinutes
                    )
                ) {
                    throw createError(
                        409,
                        `Room "${candidateEntry.roomLabel || requestedEntry.roomLabel}" is already occupied on ${candidateEntry.day} from ${candidateEntry.startTime} to ${candidateEntry.endTime}`
                    );
                }
            }
        }
    }
}

async function ensureInstructorMembership({ institutionId, instructorMemberId }) {
    if (!instructorMemberId) {
        return;
    }

    const membership = await Membership.findOne({
        _id: instructorMemberId,
        institutionId,
    })
        .select("_id role status")
        .lean();

    if (!membership) {
        throw createError(404, "Instructor member not found");
    }

    if (membership.status !== "active") {
        throw createError(400, "Instructor member must be active");
    }

    if (!TEACHING_MEMBER_ROLES.includes(membership.role)) {
        throw createError(400, "Instructor member must have instructor role");
    }
}

function mapDuplicateSectionError(error) {
    if (!isDuplicateKeyError(error)) {
        return null;
    }

    if (
        error.keyPattern &&
        error.keyPattern.institutionId &&
        error.keyPattern.semesterId &&
        error.keyPattern.subjectId &&
        error.keyPattern.code
    ) {
        return createError(409, "Section code already exists for this subject in this semester");
    }

    return createError(409, "Section already exists");
}

function ensureSectionCanBeDeleted(section) {
    if (!DELETABLE_SECTION_STATUSES.includes(section.status)) {
        throw createError(409, "Only draft or cancelled sections can be deleted");
    }
}

async function loadInstitutionRecord(institutionId) {
    const institution = await Institution.findOne({ _id: institutionId }).select("_id type").lean();
    if (!institution) {
        throw createError(404, "Institution not found");
    }

    return institution;
}

async function loadSchoolClassRecord({ institutionId, schoolClassId }) {
    const schoolClass = await SchoolClass.findOne({
        _id: schoolClassId,
        institutionId,
    })
        .select("_id classLevelId status")
        .lean();

    if (!schoolClass) {
        throw createError(404, "Class not found");
    }

    return schoolClass;
}

async function loadSectionSemester({ institutionId, semesterId }) {
    const semester = await Semester.findOne({
        _id: semesterId,
        institutionId,
    })
        .select("_id institutionId teachingDays")
        .lean();

    if (!semester) {
        throw createError(404, "Semester not found");
    }

    return semester;
}

async function loadSubjectRecord({ institutionId, subjectId }) {
    const subject = await Subject.findOne({
        _id: subjectId,
        institutionId,
    })
        .select("_id institutionId departmentId classLevelId status")
        .lean();

    if (!subject) {
        throw createError(404, "Subject not found");
    }

    return subject;
}

function ensureSubjectAndSchoolClassCompatibility({ subject, schoolClass }) {
    if (subject.status !== "active") {
        throw createError(400, "Subject must be active");
    }

    if (schoolClass.status !== "active") {
        throw createError(400, "Class must be active");
    }

    const subjectClassLevelId = subject.classLevelId ? subject.classLevelId.toString() : null;
    const schoolClassLevelId = schoolClass.classLevelId ? schoolClass.classLevelId.toString() : null;
    if (!subjectClassLevelId || subjectClassLevelId !== schoolClassLevelId) {
        throw createError(400, "Class level does not match the subject class level");
    }
}

async function listSections({ institutionId, query }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    const [institution, filters] = await Promise.all([
        loadInstitutionRecord(institutionId),
        Promise.resolve(validateListSectionsInput(query)),
    ]);

    const sectionQuery = { institutionId };

    if (filters.semesterId) {
        sectionQuery.semesterId = filters.semesterId;
    }

    if (filters.subjectId) {
        sectionQuery.subjectId = filters.subjectId;
    }

    if (filters.instructorMemberId) {
        sectionQuery.instructorMemberId = filters.instructorMemberId;
    }

    if (filters.status) {
        sectionQuery.status = filters.status;
    }

    if (institution.type === "school") {
        if (filters.departmentId) {
            throw createError(400, "departmentId is not supported for school sections");
        }

        if (filters.schoolClassId) {
            await loadSchoolClassRecord({
                institutionId,
                schoolClassId: filters.schoolClassId,
            });
            sectionQuery.schoolClassId = filters.schoolClassId;
        }
    } else {
        if (filters.schoolClassId) {
            throw createError(400, "schoolClassId is not supported for university sections");
        }

        if (filters.departmentId) {
            const department = await Department.findOne({
                _id: filters.departmentId,
                institutionId,
            })
                .select("_id")
                .lean();

            if (!department) {
                throw createError(404, "Department not found");
            }

            const subjects = await Subject.find({
                institutionId,
                departmentId: filters.departmentId,
            })
                .select("_id")
                .lean();

            const subjectIds = subjects.map((subject) => subject._id.toString());
            if (!subjectIds.length) {
                return {
                    sections: [],
                };
            }

            if (filters.subjectId) {
                if (!subjectIds.includes(filters.subjectId)) {
                    return {
                        sections: [],
                    };
                }
            } else {
                sectionQuery.subjectId = { $in: subjectIds };
            }
        }
    }

    const sections = await Section.find(sectionQuery)
        .select(SECTION_SELECT_FIELDS)
        .sort({ createdAt: -1, _id: -1 })
        .lean();

    return {
        sections: sections.map(toSectionListItem),
    };
}

async function getSectionById({ institutionId, sectionId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    const section = await Section.findOne({
        _id: sectionId,
        institutionId,
    })
        .select(SECTION_SELECT_FIELDS)
        .lean();

    if (!section) {
        throw createError(404, "Section not found");
    }

    return {
        section: toSectionResponse(section),
    };
}

async function createSection({ institutionId, createdByUserId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!createdByUserId || !isValidObjectId(createdByUserId)) {
        throw createError(401, "Unauthorized");
    }

    const input = validateCreateSectionInput(payload);

    const [institution, semester, subject] = await Promise.all([
        loadInstitutionRecord(institutionId),
        loadSectionSemester({
            institutionId,
            semesterId: input.semesterId,
        }),
        loadSubjectRecord({
            institutionId,
            subjectId: input.subjectId,
        }),
    ]);

    if (institution.type === "school") {
        if (!input.schoolClassId) {
            throw createError(400, "schoolClassId is required for school sections");
        }
    } else if (input.schoolClassId) {
        throw createError(400, "schoolClassId is not supported for university sections");
    }

    let schoolClass = null;
    if (institution.type === "school") {
        schoolClass = await loadSchoolClassRecord({
            institutionId,
            schoolClassId: input.schoolClassId,
        });
        ensureSubjectAndSchoolClassCompatibility({
            subject,
            schoolClass,
        });
    }

    validateScheduleAgainstSemesterTeachingDays(input.schedule, semester);
    await ensureInstructorMembership({
        institutionId,
        instructorMemberId: input.instructorMemberId,
    });
    await ensureNoRoomScheduleConflicts({
        institutionId,
        semesterId: input.semesterId,
        schedule: input.schedule,
        status: input.status,
    });

    const duplicateSection = await Section.findOne({
        institutionId,
        semesterId: input.semesterId,
        subjectId: input.subjectId,
        code: input.code,
    })
        .select("_id")
        .lean();

    if (duplicateSection) {
        throw createError(409, "Section code already exists for this subject in this semester");
    }

    let section;
    try {
        section = await Section.create({
            institutionId,
            semesterId: input.semesterId,
            subjectId: input.subjectId,
            schoolClassId: input.schoolClassId,
            code: input.code,
            title: input.title,
            instructorMemberId: input.instructorMemberId,
            capacity: input.capacity,
            schedule: input.schedule,
            status: input.status,
            createdByUserId,
        });
    } catch (error) {
        const mappedDuplicateError = mapDuplicateSectionError(error);
        if (mappedDuplicateError) {
            throw mappedDuplicateError;
        }

        throw error;
    }

    if (institution.type === "school" && statusReservesRoom(section.status)) {
        await backfillSchoolSectionEnrollments({
            institutionId,
            section,
            createdByUserId,
        });
    }

    return {
        section: toSectionResponse(section),
    };
}

async function updateSection({ institutionId, sectionId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    const [institution, existingSection] = await Promise.all([
        loadInstitutionRecord(institutionId),
        Section.findOne({
            _id: sectionId,
            institutionId,
        })
            .select(SECTION_SELECT_FIELDS)
            .lean(),
    ]);

    if (!existingSection) {
        throw createError(404, "Section not found");
    }

    const updates = validateUpdateSectionInput(payload);

    if (updates.schedule !== undefined) {
        const semester = await loadSectionSemester({
            institutionId,
            semesterId: existingSection.semesterId,
        });
        validateScheduleAgainstSemesterTeachingDays(updates.schedule, semester);
    }

    if (updates.instructorMemberId !== undefined) {
        await ensureInstructorMembership({
            institutionId,
            instructorMemberId: updates.instructorMemberId,
        });
    }

    if (institution.type === "university" && existingSection.schoolClassId) {
        throw createError(409, "University sections cannot use schoolClassId");
    }

    const nextSchedule = updates.schedule !== undefined ? updates.schedule : existingSection.schedule || [];
    const nextStatus = updates.status !== undefined ? updates.status : existingSection.status;
    if ((updates.schedule !== undefined || updates.status !== undefined) && statusReservesRoom(nextStatus)) {
        await ensureNoRoomScheduleConflicts({
            institutionId,
            semesterId: existingSection.semesterId,
            schedule: nextSchedule,
            status: nextStatus,
            excludedSectionId: sectionId,
        });
    }

    if (updates.code && updates.code !== existingSection.code) {
        const duplicateSection = await Section.findOne({
            institutionId,
            semesterId: existingSection.semesterId,
            subjectId: existingSection.subjectId,
            code: updates.code,
            _id: { $ne: sectionId },
        })
            .select("_id")
            .lean();

        if (duplicateSection) {
            throw createError(409, "Section code already exists for this subject in this semester");
        }
    }

    let section;
    try {
        section = await Section.findOneAndUpdate(
            {
                _id: sectionId,
                institutionId,
            },
            { $set: updates },
            { returnDocument: "after", runValidators: true }
        )
            .select(SECTION_SELECT_FIELDS)
            .lean();
    } catch (error) {
        const mappedDuplicateError = mapDuplicateSectionError(error);
        if (mappedDuplicateError) {
            throw mappedDuplicateError;
        }

        throw error;
    }

    if (!section) {
        throw createError(404, "Section not found");
    }

    return {
        section: toSectionResponse(section),
    };
}

async function deleteSection({ institutionId, sectionId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    const [institution, section] = await Promise.all([
        loadInstitutionRecord(institutionId),
        Section.findOne({
            _id: sectionId,
            institutionId,
        })
            .select("_id status")
            .lean(),
    ]);

    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (!section) {
        throw createError(404, "Section not found");
    }

    ensureSectionCanBeDeleted(section);

    await Section.deleteOne({
        _id: sectionId,
        institutionId,
    });

    return {
        message: "Section deleted successfully",
    };
}

module.exports = {
    validateListSectionsInput,
    validateCreateSectionInput,
    validateUpdateSectionInput,
    toSectionResponse,
    toSectionListItem,
    listSections,
    getSectionById,
    createSection,
    updateSection,
    deleteSection,
};
