const mongoose = require("mongoose");
const Enrollment = require("../models/Enrollment");
const Institution = require("../models/Institution");
const Membership = require("../models/Membership");
const Section = require("../models/Section");
const ClassStudentAssignment = require("../models/ClassStudentAssignment");

const ENROLLMENT_STATUSES = ["enrolled", "dropped"];
const ENROLLABLE_SECTION_STATUSES = ["draft", "active"];
const STUDENT_MEMBER_ROLES = ["student"];
const ENROLLMENT_SELECT_FIELDS =
    "_id sectionId studentMemberId status enrolledAt createdByUserId createdAt updatedAt";

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

function isValidObjectId(value) {
    return Boolean(value) && mongoose.Types.ObjectId.isValid(value);
}

function isDuplicateKeyError(error) {
    return Boolean(error) && error.name === "MongoServerError" && error.code === 11000;
}

function validateEnrollmentStatus(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : "enrolled";
    }

    const status = normalizeLowerString(rawValue);
    if (!ENROLLMENT_STATUSES.includes(status)) {
        throw createError(400, "status must be enrolled or dropped");
    }

    return status;
}

function validateCreateEnrollmentInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    if (!payload.studentMemberId || !isValidObjectId(payload.studentMemberId)) {
        throw createError(400, "Invalid studentMemberId");
    }

    return {
        studentMemberId: payload.studentMemberId,
    };
}

function validateUpdateEnrollmentStatusInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    if (payload.status === undefined) {
        throw createError(400, "status is required");
    }

    return {
        status: validateEnrollmentStatus(payload.status),
    };
}

function toEnrollmentResponse(enrollment) {
    return {
        id: enrollment._id.toString(),
        sectionId: enrollment.sectionId.toString(),
        studentMemberId: enrollment.studentMemberId.toString(),
        status: enrollment.status,
        enrolledAt: enrollment.enrolledAt,
        createdAt: enrollment.createdAt,
        updatedAt: enrollment.updatedAt,
    };
}

function toEnrollmentListItem(enrollment) {
    return {
        id: enrollment._id.toString(),
        sectionId: enrollment.sectionId.toString(),
        studentMemberId: enrollment.studentMemberId.toString(),
        status: enrollment.status,
        enrolledAt: enrollment.enrolledAt,
        updatedAt: enrollment.updatedAt,
    };
}

function ensureSectionAllowsEnrollment(section) {
    if (!ENROLLABLE_SECTION_STATUSES.includes(section.status)) {
        throw createError(409, "Only draft or active sections can accept enrollments");
    }
}

async function loadInstitutionRecord(institutionId) {
    return Institution.findOne({ _id: institutionId }).select("_id type").lean();
}

async function loadSectionRecord({ institutionId, sectionId }) {
    return Section.findOne({
        _id: sectionId,
        institutionId,
    })
        .select("_id institutionId semesterId schoolClassId status capacity")
        .lean();
}

async function ensureStudentMemberCanBeEnrolled({ institutionId, studentMemberId }) {
    const membership = await Membership.findOne({
        _id: studentMemberId,
        institutionId,
    })
        .select("_id role status")
        .lean();

    if (!membership) {
        throw createError(404, "Student member not found");
    }

    if (membership.status !== "active") {
        throw createError(400, "Student member must be active");
    }

    if (!STUDENT_MEMBER_ROLES.includes(membership.role)) {
        throw createError(400, "Student member must have student role");
    }

    return membership;
}

async function countEnrolledSectionSeats({ institutionId, sectionId, excludedEnrollmentId = null }) {
    const enrollmentQuery = {
        institutionId,
        sectionId,
        status: "enrolled",
    };

    if (excludedEnrollmentId) {
        enrollmentQuery._id = { $ne: excludedEnrollmentId };
    }

    return Enrollment.countDocuments(enrollmentQuery);
}

async function ensureSectionHasCapacity({ institutionId, sectionId, capacity, excludedEnrollmentId = null }) {
    if (!Number.isInteger(capacity) || capacity < 1) {
        return;
    }

    const enrolledCount = await countEnrolledSectionSeats({
        institutionId,
        sectionId,
        excludedEnrollmentId,
    });
    if (enrolledCount >= capacity) {
        throw createError(409, "Section capacity is full");
    }
}

function mapDuplicateEnrollmentError(error) {
    if (!isDuplicateKeyError(error)) {
        return null;
    }

    if (
        error.keyPattern &&
        error.keyPattern.institutionId &&
        error.keyPattern.sectionId &&
        error.keyPattern.studentMemberId
    ) {
        return createError(409, "Enrollment already exists for this student in this section");
    }

    return createError(409, "Enrollment already exists");
}

async function syncSchoolSectionEnrollmentsForAssignment({
    institutionId,
    semesterId,
    schoolClassId,
    studentMemberId,
    nextStatus,
    createdByUserId,
}) {
    const matchingSections = await Section.find({
        institutionId,
        semesterId,
        schoolClassId,
        status: { $in: ENROLLABLE_SECTION_STATUSES },
    })
        .select("_id capacity")
        .lean();

    if (!matchingSections.length) {
        return;
    }

    const sectionIds = matchingSections.map((section) => section._id);

    if (nextStatus === "removed") {
        await Enrollment.updateMany(
            {
                institutionId,
                sectionId: { $in: sectionIds },
                studentMemberId,
                status: "enrolled",
            },
            { $set: { status: "dropped" } }
        );
        return;
    }

    const existingEnrollments = await Enrollment.find({
        institutionId,
        sectionId: { $in: sectionIds },
        studentMemberId,
    })
        .select("_id sectionId status")
        .lean();

    const existingEnrollmentBySectionId = new Map(
        existingEnrollments.map((enrollment) => [enrollment.sectionId.toString(), enrollment])
    );

    const operations = [];
    for (const section of matchingSections) {
        const existingEnrollment = existingEnrollmentBySectionId.get(section._id.toString()) || null;
        if (existingEnrollment?.status === "enrolled") {
            continue;
        }

        try {
            await ensureSectionHasCapacity({
                institutionId,
                sectionId: section._id,
                capacity: section.capacity,
                excludedEnrollmentId: existingEnrollment?._id || null,
            });
        } catch (error) {
            if (error?.statusCode === 409 && error.message === "Section capacity is full") {
                continue;
            }

            throw error;
        }

        operations.push({
            updateOne: {
                filter: {
                    institutionId,
                    sectionId: section._id,
                    studentMemberId,
                },
                update: {
                    $set: {
                        status: "enrolled",
                    },
                    $setOnInsert: {
                        institutionId,
                        sectionId: section._id,
                        studentMemberId,
                        enrolledAt: new Date(),
                        createdByUserId,
                    },
                },
                upsert: true,
            },
        });
    }

    if (operations.length) {
        await Enrollment.bulkWrite(operations, { ordered: true });
    }
}

async function backfillSchoolSectionEnrollments({ institutionId, section, createdByUserId }) {
    if (!section?.schoolClassId || !ENROLLABLE_SECTION_STATUSES.includes(section.status)) {
        return;
    }

    const assignments = await ClassStudentAssignment.find({
        institutionId,
        classId: section.schoolClassId,
        semesterId: section.semesterId,
        status: "assigned",
    })
        .select("studentMemberId createdAt")
        .sort({ createdAt: 1, _id: 1 })
        .lean();

    if (!assignments.length) {
        return;
    }

    const studentMemberIds = assignments.map((assignment) => assignment.studentMemberId);
    const existingEnrollments = await Enrollment.find({
        institutionId,
        sectionId: section._id,
        studentMemberId: { $in: studentMemberIds },
    })
        .select("_id studentMemberId status")
        .lean();

    const existingEnrollmentByStudentMemberId = new Map(
        existingEnrollments.map((enrollment) => [enrollment.studentMemberId.toString(), enrollment])
    );

    let remainingSeats = null;
    if (Number.isInteger(section.capacity) && section.capacity >= 1) {
        const enrolledCount = await countEnrolledSectionSeats({
            institutionId,
            sectionId: section._id,
        });
        remainingSeats = Math.max(section.capacity - enrolledCount, 0);
    }

    const operations = [];
    for (const assignment of assignments) {
        const existingEnrollment =
            existingEnrollmentByStudentMemberId.get(assignment.studentMemberId.toString()) || null;

        if (existingEnrollment?.status === "enrolled") {
            continue;
        }

        if (remainingSeats !== null) {
            if (remainingSeats < 1) {
                break;
            }

            remainingSeats -= 1;
        }

        operations.push({
            updateOne: {
                filter: {
                    institutionId,
                    sectionId: section._id,
                    studentMemberId: assignment.studentMemberId,
                },
                update: {
                    $set: {
                        status: "enrolled",
                    },
                    $setOnInsert: {
                        institutionId,
                        sectionId: section._id,
                        studentMemberId: assignment.studentMemberId,
                        enrolledAt: new Date(),
                        createdByUserId,
                    },
                },
                upsert: true,
            },
        });
    }

    if (operations.length) {
        await Enrollment.bulkWrite(operations, { ordered: true });
    }
}

async function createEnrollment({ institutionId, sectionId, createdByUserId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    if (!createdByUserId || !isValidObjectId(createdByUserId)) {
        throw createError(401, "Unauthorized");
    }

    const input = validateCreateEnrollmentInput(payload);

    const [institution, section] = await Promise.all([
        loadInstitutionRecord(institutionId),
        loadSectionRecord({ institutionId, sectionId }),
    ]);

    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (!section) {
        throw createError(404, "Section not found");
    }

    if (institution.type === "school") {
        throw createError(409, "School section enrollments are managed through class roster");
    }

    ensureSectionAllowsEnrollment(section);
    await ensureStudentMemberCanBeEnrolled({
        institutionId,
        studentMemberId: input.studentMemberId,
    });

    const existingEnrollment = await Enrollment.findOne({
        institutionId,
        sectionId,
        studentMemberId: input.studentMemberId,
    })
        .select("_id status")
        .lean();

    if (existingEnrollment) {
        if (existingEnrollment.status === "enrolled") {
            throw createError(409, "Student is already enrolled in this section");
        }

        throw createError(
            409,
            "Enrollment already exists for this student in this section. Use status update to re-enroll"
        );
    }

    await ensureSectionHasCapacity({
        institutionId,
        sectionId,
        capacity: section.capacity,
    });

    let enrollment;
    try {
        enrollment = await Enrollment.create({
            institutionId,
            sectionId,
            studentMemberId: input.studentMemberId,
            status: "enrolled",
            createdByUserId,
        });
    } catch (error) {
        const mappedDuplicateError = mapDuplicateEnrollmentError(error);
        if (mappedDuplicateError) {
            throw mappedDuplicateError;
        }

        throw error;
    }

    return {
        enrollment: toEnrollmentResponse(enrollment),
    };
}

async function listEnrollments({ institutionId, sectionId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    const section = await loadSectionRecord({ institutionId, sectionId });
    if (!section) {
        throw createError(404, "Section not found");
    }

    const enrollments = await Enrollment.find({
        institutionId,
        sectionId,
    })
        .select(ENROLLMENT_SELECT_FIELDS)
        .sort({ enrolledAt: -1, createdAt: -1, _id: -1 })
        .lean();

    return {
        enrollments: enrollments.map(toEnrollmentListItem),
    };
}

async function getEnrollmentById({ institutionId, sectionId, enrollmentId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    if (!enrollmentId || !isValidObjectId(enrollmentId)) {
        throw createError(400, "Invalid enrollment id");
    }

    const enrollment = await Enrollment.findOne({
        _id: enrollmentId,
        institutionId,
        sectionId,
    })
        .select(ENROLLMENT_SELECT_FIELDS)
        .lean();

    if (!enrollment) {
        throw createError(404, "Enrollment not found");
    }

    return {
        enrollment: toEnrollmentResponse(enrollment),
    };
}

async function updateEnrollmentStatus({ institutionId, sectionId, enrollmentId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    if (!enrollmentId || !isValidObjectId(enrollmentId)) {
        throw createError(400, "Invalid enrollment id");
    }

    const [institution, enrollment] = await Promise.all([
        loadInstitutionRecord(institutionId),
        Enrollment.findOne({
            _id: enrollmentId,
            institutionId,
            sectionId,
        })
            .select("_id sectionId studentMemberId status")
            .lean(),
    ]);

    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (!enrollment) {
        throw createError(404, "Enrollment not found");
    }

    if (institution.type === "school") {
        throw createError(409, "School section enrollments are managed through class roster");
    }

    const { status } = validateUpdateEnrollmentStatusInput(payload);

    if (status === "enrolled") {
        const section = await loadSectionRecord({ institutionId, sectionId });
        if (!section) {
            throw createError(404, "Section not found");
        }

        ensureSectionAllowsEnrollment(section);
        await ensureStudentMemberCanBeEnrolled({
            institutionId,
            studentMemberId: enrollment.studentMemberId,
        });
        await ensureSectionHasCapacity({
            institutionId,
            sectionId,
            capacity: section.capacity,
            excludedEnrollmentId: enrollmentId,
        });
    }

    const updatedEnrollment = await Enrollment.findOneAndUpdate(
        {
            _id: enrollmentId,
            institutionId,
            sectionId,
        },
        { $set: { status } },
        { returnDocument: "after", runValidators: true }
    )
        .select(ENROLLMENT_SELECT_FIELDS)
        .lean();

    if (!updatedEnrollment) {
        throw createError(404, "Enrollment not found");
    }

    return {
        enrollment: toEnrollmentResponse(updatedEnrollment),
    };
}

module.exports = {
    validateCreateEnrollmentInput,
    validateUpdateEnrollmentStatusInput,
    toEnrollmentResponse,
    toEnrollmentListItem,
    syncSchoolSectionEnrollmentsForAssignment,
    backfillSchoolSectionEnrollments,
    createEnrollment,
    listEnrollments,
    getEnrollmentById,
    updateEnrollmentStatus,
};
