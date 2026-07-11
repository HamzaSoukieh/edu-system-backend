const mongoose = require("mongoose");
const Department = require("../models/Department");
const Institution = require("../models/Institution");
const Membership = require("../models/Membership");
const SchoolClass = require("../models/SchoolClass");
const Section = require("../models/Section");
const Semester = require("../models/Semester");
const Subject = require("../models/Subject");
const SectionSession = require("../models/SectionSession");
const SectionMaterial = require("../models/SectionMaterial");
const Assessment = require("../models/Assessment");
const Homework = require("../models/Homework");
const Enrollment = require("../models/Enrollment");
const { ROLE_PERMISSIONS } = require("../auth/permissions");
const { resolveScopedResponsibilities } = require("../auth/scopedResponsibilities");
const { backfillSchoolSectionEnrollments } = require("./enrollmentService");

const { SECTION_STATUSES, SECTION_SCHEDULE_SESSION_TYPES } = require("../constants/sectionConstants");
const { SCHEDULE_DAYS } = require("../constants/scheduleConstants");
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

function hasRolePermission(role, permission) {
    return (ROLE_PERMISSIONS[role] || []).includes(permission);
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
    // IM-9: include the schedule array (+ a convenience `room` from the first
    // entry) so the frontend list view can show room/schedule without a detail
    // fetch. `scheduleCount` is retained for backward compatibility.
    const schedule = Array.isArray(section.schedule)
        ? section.schedule.map((entry) => ({
              sessionType: entry.sessionType || null,
              day: normalizeLowerString(entry.day),
              startTime: entry.startTime,
              endTime: entry.endTime,
              room: entry.room || null,
          }))
        : [];

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
        schedule,
        room: schedule.find((entry) => entry.room)?.room || null,
        scheduleCount: schedule.length,
        updatedAt: section.updatedAt,
    };
}

function toSectionScopedReadResponse(section) {
    const response = toSectionResponse(section);
    delete response.createdByUserId;
    return response;
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
    const institution = await Institution.findOne({ _id: institutionId }).select("_id type ownerUserId").lean();
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

function uniqueNormalizedIds(values) {
    return [...new Set(values.map(normalizeId).filter(Boolean))];
}

function resolveActorInstitutionAuthority({ institution, institutionId, actorMembership }) {
    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (normalizeId(actorMembership.institutionId) !== normalizeId(institutionId)) {
        throw createError(403, "Institution access denied");
    }

    if (actorMembership.status && actorMembership.status !== "active") {
        throw createError(403, "Institution access denied");
    }

    const actorUserId = normalizeId(actorMembership.userId);
    const isOwner = actorUserId && normalizeId(institution.ownerUserId) === actorUserId;

    return {
        actorUserId,
        isOwner,
        isAdmin: hasRolePermission(actorMembership.role, "section.manage"),
    };
}

async function resolveScopedSectionAccessConditions({ institution, institutionId, actorUserId }) {
    const assignments = await resolveScopedResponsibilities({
        institutionId,
        userId: actorUserId,
        responsibilityTypes: ["coordinator"],
        scopeTypes: ["department", "classLevel", "class", "section"],
        permission: "section.read_scope",
    });

    if (!assignments.length) {
        return {
            institutionWide: false,
            conditions: [],
        };
    }

    const departmentIds = uniqueNormalizedIds(
        assignments
            .filter((assignment) => assignment.scopeType === "department")
            .map((assignment) => assignment.scopeId)
    );
    const classLevelIds = uniqueNormalizedIds(
        assignments
            .filter((assignment) => assignment.scopeType === "classLevel")
            .map((assignment) => assignment.scopeId)
    );
    const classIds = uniqueNormalizedIds(
        assignments
            .filter((assignment) => assignment.scopeType === "class")
            .map((assignment) => assignment.scopeId)
    );
    const sectionIds = uniqueNormalizedIds(
        assignments
            .filter((assignment) => assignment.scopeType === "section")
            .map((assignment) => assignment.scopeId)
    );

    const conditions = [];
    if (sectionIds.length) {
        conditions.push({ _id: { $in: sectionIds } });
    }

    if (classIds.length) {
        conditions.push({ schoolClassId: { $in: classIds } });
    }

    if (departmentIds.length) {
        const subjects = await Subject.find({
            institutionId,
            departmentId: { $in: departmentIds },
        })
            .select("_id")
            .lean();
        const subjectIds = uniqueNormalizedIds(subjects.map((subject) => subject._id));
        if (subjectIds.length) {
            conditions.push({ subjectId: { $in: subjectIds } });
        }
    }

    if (classLevelIds.length) {
        const [subjects, schoolClasses] = await Promise.all([
            Subject.find({
                institutionId,
                classLevelId: { $in: classLevelIds },
            })
                .select("_id")
                .lean(),
            institution.type === "school"
                ? SchoolClass.find({
                      institutionId,
                      classLevelId: { $in: classLevelIds },
                  })
                      .select("_id")
                      .lean()
                : Promise.resolve([]),
        ]);

        const subjectIds = uniqueNormalizedIds(subjects.map((subject) => subject._id));
        if (subjectIds.length) {
            conditions.push({ subjectId: { $in: subjectIds } });
        }

        const schoolClassIds = uniqueNormalizedIds(schoolClasses.map((schoolClass) => schoolClass._id));
        if (schoolClassIds.length) {
            conditions.push({ schoolClassId: { $in: schoolClassIds } });
        }
    }

    return {
        institutionWide: false,
        conditions,
    };
}

async function resolveListSectionsAccessScope({ institution, institutionId, actorMembership }) {
    const authority = resolveActorInstitutionAuthority({
        institution,
        institutionId,
        actorMembership,
    });

    if (authority.isOwner || authority.isAdmin) {
        return {
            mode: authority.isOwner ? "owner" : "manage",
            institutionWide: true,
            conditions: [],
        };
    }

    if (actorMembership.role === "student") {
        throw createError(403, "Permission denied");
    }

    const conditions = [];
    if (actorMembership.role === "instructor" && hasRolePermission(actorMembership.role, "section.read")) {
        conditions.push({ instructorMemberId: normalizeId(actorMembership._id) });
    }

    const scopedAccess = await resolveScopedSectionAccessConditions({
        institution,
        institutionId,
        actorUserId: authority.actorUserId,
    });

    if (scopedAccess.institutionWide) {
        return {
            mode: "responsibility_scope",
            institutionWide: true,
            conditions: [],
        };
    }

    conditions.push(...scopedAccess.conditions);

    if (!conditions.length) {
        throw createError(403, "Permission denied");
    }

    return {
        mode: "scoped",
        institutionWide: false,
        conditions,
    };
}

async function listSections({ institutionId, query, actorMembership }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    const [institution, filters] = await Promise.all([
        loadInstitutionRecord(institutionId),
        Promise.resolve(validateListSectionsInput(query)),
    ]);

    const accessScope = await resolveListSectionsAccessScope({
        institution,
        institutionId,
        actorMembership,
    });

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

    if (!accessScope.institutionWide) {
        sectionQuery.$or = accessScope.conditions;
    }

    const sections = await Section.find(sectionQuery)
        .select(SECTION_SELECT_FIELDS)
        .sort({ createdAt: -1, _id: -1 })
        .lean();

    return {
        sections: sections.map(toSectionListItem),
    };
}

async function getSectionById({ institutionId, sectionId, actorMembership }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    const institution = await loadInstitutionRecord(institutionId);
    const accessScope = await resolveListSectionsAccessScope({
        institution,
        institutionId,
        actorMembership,
    });

    const accessQuery = {
        _id: sectionId,
        institutionId,
    };
    if (!accessScope.institutionWide) {
        accessQuery.$or = accessScope.conditions;
    }

    const section = await Section.findOne(accessQuery)
        .select(SECTION_SELECT_FIELDS)
        .lean();

    if (!section) {
        throw createError(404, "Section not found");
    }

    const response =
        accessScope.mode === "owner" || accessScope.mode === "manage"
            ? toSectionResponse(section)
            : toSectionScopedReadResponse(section);

    return {
        section: response,
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

    // DB-8: even a draft/cancelled section may already own child records
    // (sessions, materials, assessments, homework, enrollments) that reference
    // it by sectionId. Mongo does no cascade, so deleting would orphan them —
    // block the delete and tell the caller to remove dependents first.
    const dependencyChecks = [
        [SectionSession, "sessions"],
        [SectionMaterial, "materials"],
        [Assessment, "assessments"],
        [Homework, "homework"],
        [Enrollment, "enrollments"],
    ];
    const dependencyResults = await Promise.all(
        dependencyChecks.map(([model]) => model.exists({ institutionId, sectionId }))
    );
    const blocking = dependencyChecks
        .filter((_, index) => dependencyResults[index])
        .map(([, label]) => label);

    if (blocking.length) {
        throw createError(
            409,
            `Cannot delete section: it still has ${blocking.join(", ")}. Remove those first.`
        );
    }

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
