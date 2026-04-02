const mongoose = require("mongoose");
const ClassStudentAssignment = require("../models/ClassStudentAssignment");
const Membership = require("../models/Membership");
const Semester = require("../models/Semester");
const SchoolClass = require("../models/SchoolClass");
const { ensureSchoolInstitution } = require("./classLevelService");
const { syncSchoolSectionEnrollmentsForAssignment } = require("./enrollmentService");

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

function toClassStudentAssignmentResponse(assignment) {
    return {
        id: assignment._id.toString(),
        institutionId: assignment.institutionId.toString(),
        semesterId: assignment.semesterId.toString(),
        classId: assignment.classId.toString(),
        studentMemberId: assignment.studentMemberId.toString(),
        status: assignment.status,
        createdByUserId: assignment.createdByUserId?.toString() || null,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
    };
}

async function loadSchoolClass({ institutionId, classId }) {
    const schoolClass = await SchoolClass.findOne({
        _id: classId,
        institutionId,
    })
        .select("_id institutionId classLevelId status")
        .lean();

    if (!schoolClass) {
        throw createError(404, "Class not found");
    }

    return schoolClass;
}

async function ensureSemester({ institutionId, semesterId }) {
    const semester = await Semester.findOne({
        _id: semesterId,
        institutionId,
    })
        .select("_id")
        .lean();

    if (!semester) {
        throw createError(404, "Semester not found");
    }
}

async function ensureStudentMember({ institutionId, studentMemberId }) {
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

    if (membership.role !== "student") {
        throw createError(400, "Student member must have student role");
    }
}

function validateCreateInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    if (!payload.semesterId || !isValidObjectId(payload.semesterId)) {
        throw createError(400, "Invalid semesterId");
    }

    if (!payload.studentMemberId || !isValidObjectId(payload.studentMemberId)) {
        throw createError(400, "Invalid studentMemberId");
    }

    return {
        semesterId: payload.semesterId,
        studentMemberId: payload.studentMemberId,
    };
}

function validateListInput(query = {}) {
    if (!query.semesterId || !isValidObjectId(query.semesterId)) {
        throw createError(400, "Invalid semesterId");
    }

    const status = normalizeLowerString(query.status);
    if (status && !["assigned", "removed", "all"].includes(status)) {
        throw createError(400, "status must be assigned, removed, or all");
    }

    return {
        semesterId: query.semesterId,
        status: status || "assigned",
    };
}

function validateStatusUpdateInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const status = normalizeLowerString(payload.status);
    if (!["assigned", "removed"].includes(status)) {
        throw createError(400, "status must be assigned or removed");
    }

    return { status };
}

async function createClassStudentAssignment({ institutionId, classId, createdByUserId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!classId || !isValidObjectId(classId)) {
        throw createError(400, "Invalid class id");
    }

    if (!createdByUserId || !isValidObjectId(createdByUserId)) {
        throw createError(401, "Unauthorized");
    }

    await ensureSchoolInstitution(institutionId);

    const input = validateCreateInput(payload);
    const schoolClass = await loadSchoolClass({ institutionId, classId });
    if (schoolClass.status !== "active") {
        throw createError(400, "Class must be active");
    }

    await Promise.all([
        ensureSemester({ institutionId, semesterId: input.semesterId }),
        ensureStudentMember({ institutionId, studentMemberId: input.studentMemberId }),
    ]);

    let assignment = await ClassStudentAssignment.findOne({
        institutionId,
        semesterId: input.semesterId,
        studentMemberId: input.studentMemberId,
    })
        .select("_id institutionId semesterId classId studentMemberId status createdByUserId createdAt updatedAt")
        .lean();

    if (assignment) {
        if (assignment.status === "assigned") {
            if (assignment.classId.toString() === classId) {
                throw createError(409, "Student is already assigned to this class in this semester");
            }

            throw createError(409, "Student is already assigned to another class in this semester");
        }

        assignment = await ClassStudentAssignment.findOneAndUpdate(
            { _id: assignment._id, institutionId },
            {
                $set: {
                    classId,
                    status: "assigned",
                },
            },
            { returnDocument: "after", runValidators: true }
        )
            .select("_id institutionId semesterId classId studentMemberId status createdByUserId createdAt updatedAt")
            .lean();
    } else {
        assignment = await ClassStudentAssignment.create({
            institutionId,
            semesterId: input.semesterId,
            classId,
            studentMemberId: input.studentMemberId,
            status: "assigned",
            createdByUserId,
        });
    }

    await syncSchoolSectionEnrollmentsForAssignment({
        institutionId,
        semesterId: assignment.semesterId,
        schoolClassId: assignment.classId,
        studentMemberId: assignment.studentMemberId,
        nextStatus: "assigned",
        createdByUserId,
    });

    return {
        assignment: toClassStudentAssignmentResponse(assignment),
    };
}

async function listClassStudentAssignments({ institutionId, classId, query = {} }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!classId || !isValidObjectId(classId)) {
        throw createError(400, "Invalid class id");
    }

    await ensureSchoolInstitution(institutionId);
    await loadSchoolClass({ institutionId, classId });

    const input = validateListInput(query);
    await ensureSemester({ institutionId, semesterId: input.semesterId });

    const assignmentQuery = {
        institutionId,
        classId,
        semesterId: input.semesterId,
    };
    if (input.status !== "all") {
        assignmentQuery.status = input.status;
    }

    const assignments = await ClassStudentAssignment.find(assignmentQuery)
        .select("_id institutionId semesterId classId studentMemberId status createdByUserId createdAt updatedAt")
        .sort({ createdAt: -1, _id: -1 })
        .lean();

    return {
        assignments: assignments.map(toClassStudentAssignmentResponse),
    };
}

async function getClassStudentAssignmentById({ institutionId, classId, assignmentId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!classId || !isValidObjectId(classId)) {
        throw createError(400, "Invalid class id");
    }

    if (!assignmentId || !isValidObjectId(assignmentId)) {
        throw createError(400, "Invalid assignment id");
    }

    await ensureSchoolInstitution(institutionId);
    await loadSchoolClass({ institutionId, classId });

    const assignment = await ClassStudentAssignment.findOne({
        _id: assignmentId,
        institutionId,
        classId,
    })
        .select("_id institutionId semesterId classId studentMemberId status createdByUserId createdAt updatedAt")
        .lean();

    if (!assignment) {
        throw createError(404, "Class assignment not found");
    }

    return {
        assignment: toClassStudentAssignmentResponse(assignment),
    };
}

async function updateClassStudentAssignmentStatus({ institutionId, classId, assignmentId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!classId || !isValidObjectId(classId)) {
        throw createError(400, "Invalid class id");
    }

    if (!assignmentId || !isValidObjectId(assignmentId)) {
        throw createError(400, "Invalid assignment id");
    }

    await ensureSchoolInstitution(institutionId);

    const input = validateStatusUpdateInput(payload);
    const assignment = await ClassStudentAssignment.findOne({
        _id: assignmentId,
        institutionId,
        classId,
    })
        .select("_id institutionId semesterId classId studentMemberId status createdByUserId createdAt updatedAt")
        .lean();

    if (!assignment) {
        throw createError(404, "Class assignment not found");
    }

    if (assignment.status === input.status) {
        return {
            assignment: toClassStudentAssignmentResponse(assignment),
        };
    }

    if (input.status === "assigned") {
        const schoolClass = await loadSchoolClass({ institutionId, classId });
        if (schoolClass.status !== "active") {
            throw createError(400, "Class must be active");
        }

        await Promise.all([
            ensureSemester({ institutionId, semesterId: assignment.semesterId }),
            ensureStudentMember({ institutionId, studentMemberId: assignment.studentMemberId }),
        ]);
    }

    const updatedAssignment = await ClassStudentAssignment.findOneAndUpdate(
        {
            _id: assignmentId,
            institutionId,
            classId,
        },
        { $set: { status: input.status } },
        { returnDocument: "after", runValidators: true }
    )
        .select("_id institutionId semesterId classId studentMemberId status createdByUserId createdAt updatedAt")
        .lean();

    await syncSchoolSectionEnrollmentsForAssignment({
        institutionId,
        semesterId: updatedAssignment.semesterId,
        schoolClassId: updatedAssignment.classId,
        studentMemberId: updatedAssignment.studentMemberId,
        nextStatus: updatedAssignment.status,
        createdByUserId: updatedAssignment.createdByUserId,
    });

    return {
        assignment: toClassStudentAssignmentResponse(updatedAssignment),
    };
}

module.exports = {
    createClassStudentAssignment,
    listClassStudentAssignments,
    getClassStudentAssignmentById,
    updateClassStudentAssignmentStatus,
};
