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

module.exports = {
    createSubject,
};
