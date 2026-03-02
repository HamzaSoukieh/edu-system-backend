const mongoose = require("mongoose");
const Department = require("../models/Department");
const Subject = require("../models/Subject");

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

function normalizeCode(value) {
    return normalizeString(value).toUpperCase();
}

function normalizeName(value) {
    return normalizeString(value).toLowerCase();
}

function isValidObjectId(value) {
    return Boolean(value) && mongoose.Types.ObjectId.isValid(value);
}

function isDuplicateKeyError(error) {
    return Boolean(error) && error.name === "MongoServerError" && error.code === 11000;
}

function toSubjectResponse(subject) {
    return {
        id: subject._id.toString(),
        institutionId: subject.institutionId.toString(),
        departmentId: subject.departmentId.toString(),
        name: subject.name,
        code: subject.code,
        creditHours: subject.creditHours,
        status: subject.status,
        createdByUserId: subject.createdByUserId?.toString() || null,
        createdAt: subject.createdAt,
        updatedAt: subject.updatedAt,
    };
}

function validateName(rawValue) {
    const name = normalizeString(rawValue);
    const nameNormalized = normalizeName(rawValue);

    if (!name) {
        throw createError(400, "Subject name is required");
    }

    if (name.length > 120) {
        throw createError(400, "Subject name must be at most 120 characters");
    }

    return { name, nameNormalized };
}

function validateCode(rawValue) {
    const code = normalizeCode(rawValue);

    if (!code) {
        throw createError(400, "Subject code is required");
    }

    if (!/^[A-Z0-9_-]{2,20}$/.test(code)) {
        throw createError(400, "Subject code must be 2-20 chars using A-Z, 0-9, _ or -");
    }

    return code;
}

function validateCreditHours(rawValue) {
    if (!Number.isInteger(rawValue) || rawValue <= 0) {
        throw createError(400, "creditHours must be a positive integer");
    }

    return rawValue;
}

function validateStatus(rawValue) {
    if (rawValue === undefined) {
        return "active";
    }

    const status = normalizeString(rawValue).toLowerCase();
    if (!["active", "archived"].includes(status)) {
        throw createError(400, "Subject status must be active or archived");
    }

    return status;
}

function validateCreateSubjectInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const { name, nameNormalized } = validateName(payload.name);
    const code = validateCode(payload.code);
    const creditHours = validateCreditHours(payload.creditHours);
    const status = validateStatus(payload.status);

    return {
        name,
        nameNormalized,
        code,
        creditHours,
        status,
    };
}

function validateUpdateSubjectInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const updates = {};

    if (payload.name !== undefined) {
        const { name, nameNormalized } = validateName(payload.name);
        updates.name = name;
        updates.nameNormalized = nameNormalized;
    }

    if (payload.code !== undefined) {
        updates.code = validateCode(payload.code);
    }

    if (payload.creditHours !== undefined) {
        updates.creditHours = validateCreditHours(payload.creditHours);
    }

    if (payload.status !== undefined) {
        updates.status = validateStatus(payload.status);
    }

    if (payload.departmentId !== undefined) {
        if (!payload.departmentId || !isValidObjectId(payload.departmentId)) {
            throw createError(400, "Invalid department id");
        }

        updates.departmentId = payload.departmentId;
    }

    if (!Object.keys(updates).length) {
        throw createError(400, "No valid fields to update");
    }

    return updates;
}

async function listSubjects({ institutionId, departmentId, active }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    const query = { institutionId };

    if (departmentId !== undefined) {
        if (!departmentId || !isValidObjectId(departmentId)) {
            throw createError(400, "Invalid department id");
        }

        const department = await Department.findOne({
            _id: departmentId,
            institutionId,
        })
            .select("_id")
            .lean();

        if (!department) {
            throw createError(404, "Department not found");
        }

        query.departmentId = departmentId;
    }

    if (active === undefined || active === "true") {
        query.status = "active";
    } else if (active === "false") {
        query.status = "archived";
    } else {
        throw createError(400, "active must be true or false");
    }

    const subjects = await Subject.find(query)
        .select("_id institutionId departmentId name code creditHours status createdByUserId createdAt updatedAt")
        .sort({ name: 1 })
        .lean();

    return {
        total: subjects.length,
        subjects: subjects.map(toSubjectResponse),
    };
}

async function getSubjectById({ institutionId, subjectId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!subjectId || !isValidObjectId(subjectId)) {
        throw createError(400, "Invalid subject id");
    }

    const subject = await Subject.findOne({
        _id: subjectId,
        institutionId,
    })
        .select("_id institutionId departmentId name code creditHours status createdByUserId createdAt updatedAt")
        .lean();

    if (!subject) {
        throw createError(404, "Subject not found");
    }

    return {
        subject: toSubjectResponse(subject),
    };
}

async function createSubject({ institutionId, departmentId, createdByUserId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!departmentId || !isValidObjectId(departmentId)) {
        throw createError(400, "Invalid department id");
    }

    if (!createdByUserId || !isValidObjectId(createdByUserId)) {
        throw createError(401, "Unauthorized");
    }

    const department = await Department.findOne({
        _id: departmentId,
        institutionId,
    })
        .select("_id status")
        .lean();

    if (!department) {
        throw createError(404, "Department not found");
    }

    if (department.status !== "active") {
        throw createError(400, "Department is not active");
    }

    const { name, nameNormalized, code, creditHours, status } = validateCreateSubjectInput(payload);

    const [codeMatch, nameMatch] = await Promise.all([
        Subject.findOne({ institutionId, code }).select("_id").lean(),
        Subject.findOne({ departmentId, nameNormalized }).select("_id").lean(),
    ]);

    if (codeMatch) {
        throw createError(409, "Subject code already exists in this institution");
    }

    if (nameMatch) {
        throw createError(409, "Subject name already exists in this department");
    }

    let subject;
    try {
        subject = await Subject.create({
            institutionId,
            departmentId,
            name,
            nameNormalized,
            code,
            creditHours,
            status,
            createdByUserId,
        });
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            if (error.keyPattern && error.keyPattern.code) {
                throw createError(409, "Subject code already exists in this institution");
            }

            if (error.keyPattern && error.keyPattern.nameNormalized) {
                throw createError(409, "Subject name already exists in this department");
            }

            throw createError(409, "Subject already exists");
        }

        throw error;
    }

    return {
        subject: toSubjectResponse(subject),
    };
}

async function updateSubject({ institutionId, subjectId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!subjectId || !isValidObjectId(subjectId)) {
        throw createError(400, "Invalid subject id");
    }

    const existingSubject = await Subject.findOne({
        _id: subjectId,
        institutionId,
    })
        .select("_id departmentId nameNormalized")
        .lean();

    if (!existingSubject) {
        throw createError(404, "Subject not found");
    }

    const updates = validateUpdateSubjectInput(payload);
    const targetDepartmentId = updates.departmentId || existingSubject.departmentId.toString();

    if (updates.departmentId) {
        const department = await Department.findOne({
            _id: updates.departmentId,
            institutionId,
        })
            .select("_id status")
            .lean();

        if (!department) {
            throw createError(404, "Department not found");
        }

        if (department.status !== "active") {
            throw createError(400, "Department is not active");
        }
    }

    if (updates.code) {
        const codeMatch = await Subject.findOne({
            institutionId,
            code: updates.code,
            _id: { $ne: subjectId },
        })
            .select("_id")
            .lean();

        if (codeMatch) {
            throw createError(409, "Subject code already exists in this institution");
        }
    }

    if (updates.nameNormalized || updates.departmentId) {
        const targetNameNormalized = updates.nameNormalized || null;

        if (targetNameNormalized) {
            const nameMatch = await Subject.findOne({
                departmentId: targetDepartmentId,
                nameNormalized: targetNameNormalized,
                _id: { $ne: subjectId },
            })
                .select("_id")
                .lean();

            if (nameMatch) {
                throw createError(409, "Subject name already exists in this department");
            }
        } else if (updates.departmentId) {
            const nameMatch = await Subject.findOne({
                departmentId: targetDepartmentId,
                nameNormalized: existingSubject.nameNormalized,
                _id: { $ne: subjectId },
            })
                .select("_id")
                .lean();

            if (nameMatch) {
                throw createError(409, "Subject name already exists in this department");
            }
        }
    }

    let subject;
    try {
        subject = await Subject.findOneAndUpdate(
            {
                _id: subjectId,
                institutionId,
            },
            { $set: updates },
            { returnDocument: "after", runValidators: true }
        )
            .select("_id institutionId departmentId name code creditHours status createdByUserId createdAt updatedAt")
            .lean();
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            if (error.keyPattern && error.keyPattern.code) {
                throw createError(409, "Subject code already exists in this institution");
            }

            if (error.keyPattern && error.keyPattern.nameNormalized) {
                throw createError(409, "Subject name already exists in this department");
            }

            throw createError(409, "Subject already exists");
        }

        throw error;
    }

    if (!subject) {
        throw createError(404, "Subject not found");
    }

    return {
        subject: toSubjectResponse(subject),
    };
}

async function deleteSubject({ institutionId, subjectId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!subjectId || !isValidObjectId(subjectId)) {
        throw createError(400, "Invalid subject id");
    }

    const subject = await Subject.findOne({
        _id: subjectId,
        institutionId,
    })
        .select("_id status")
        .lean();

    if (!subject) {
        throw createError(404, "Subject not found");
    }

    if (subject.status !== "archived") {
        throw createError(400, "Archive subject before deleting");
    }

    await Subject.deleteOne({
        _id: subjectId,
        institutionId,
    });

    return {
        message: "Subject deleted successfully",
    };
}

module.exports = {
    listSubjects,
    getSubjectById,
    createSubject,
    updateSubject,
    deleteSubject,
};
