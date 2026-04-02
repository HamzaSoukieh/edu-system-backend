const mongoose = require("mongoose");
const Department = require("../models/Department");
const Institution = require("../models/Institution");
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

function isDuplicateKeyError(error) {
    return Boolean(error) && error.name === "MongoServerError" && error.code === 11000;
}

function isValidObjectId(value) {
    return Boolean(value) && mongoose.Types.ObjectId.isValid(value);
}

async function ensureUniversityInstitution(institutionId) {
    const institution = await Institution.findOne({ _id: institutionId }).select("_id type").lean();
    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (institution.type !== "university") {
        throw createError(409, "Departments are only available for university institutions");
    }

    return institution;
}

function toDepartmentResponse(department) {
    return {
        id: department._id.toString(),
        institutionId: department.institutionId.toString(),
        name: department.name,
        code: department.code,
        description: department.description,
        status: department.status,
        createdByUserId: department.createdByUserId?.toString() || null,
        createdAt: department.createdAt,
        updatedAt: department.updatedAt,
    };
}

function validateDepartmentName(rawValue) {
    const name = normalizeString(rawValue);
    const nameNormalized = normalizeName(rawValue);

    if (!name) {
        throw createError(400, "Department name is required");
    }

    if (name.length > 120) {
        throw createError(400, "Department name must be at most 120 characters");
    }

    return { name, nameNormalized };
}

function validateDepartmentCode(rawValue) {
    const code = normalizeCode(rawValue);

    if (!code) {
        throw createError(400, "Department code is required");
    }

    if (!/^[A-Z0-9_-]{2,20}$/.test(code)) {
        throw createError(400, "Department code must be 2-20 chars using A-Z, 0-9, _ or -");
    }

    return code;
}

function validateDepartmentDescription(rawValue) {
    if (rawValue === undefined || rawValue === null) {
        return null;
    }

    const description = normalizeString(rawValue) || null;
    if (description && description.length > 500) {
        throw createError(400, "Department description must be at most 500 characters");
    }

    return description;
}

function validateCreateDepartmentInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const { name, nameNormalized } = validateDepartmentName(payload.name);
    const code = validateDepartmentCode(payload.code);
    const description = validateDepartmentDescription(payload.description);

    return { name, nameNormalized, code, description };
}

function validateUpdateDepartmentInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const updates = {};

    if (payload.name !== undefined) {
        const { name, nameNormalized } = validateDepartmentName(payload.name);
        updates.name = name;
        updates.nameNormalized = nameNormalized;
    }

    if (payload.code !== undefined) {
        updates.code = validateDepartmentCode(payload.code);
    }

    if (payload.description !== undefined) {
        updates.description = validateDepartmentDescription(payload.description);
    }

    if (payload.status !== undefined) {
        const status = normalizeString(payload.status).toLowerCase();
        if (!["active", "archived"].includes(status)) {
            throw createError(400, "Department status must be active or archived");
        }
        updates.status = status;
    }

    if (!Object.keys(updates).length) {
        throw createError(400, "No valid fields to update");
    }

    return updates;
}

async function deleteDepartmentDependencies({ institutionId, departmentId }) {
    const subjectDeleteResult = await Subject.deleteMany({
        institutionId,
        departmentId,
    });

    return {
        deletedSubjects: subjectDeleteResult.deletedCount || 0,
    };
}

async function listDepartments({ institutionId, status }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    await ensureUniversityInstitution(institutionId);

    const query = { institutionId };
    const normalizedStatus = normalizeString(status).toLowerCase();
    if (!normalizedStatus) {
        query.status = "active";
    } else if (normalizedStatus === "active" || normalizedStatus === "archived") {
        query.status = normalizedStatus;
    } else if (normalizedStatus !== "all") {
        throw createError(400, "status must be active, archived, or all");
    }

    const departments = await Department.find(query)
        .select("_id institutionId name code description status createdByUserId createdAt updatedAt")
        .sort({ name: 1 })
        .lean();

    return {
        total: departments.length,
        departments: departments.map(toDepartmentResponse),
    };
}

async function getDepartmentById({ institutionId, departmentId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!departmentId || !isValidObjectId(departmentId)) {
        throw createError(400, "Invalid department id");
    }

    await ensureUniversityInstitution(institutionId);

    const department = await Department.findOne({
        _id: departmentId,
        institutionId,
    })
        .select("_id institutionId name code description status createdByUserId createdAt updatedAt")
        .lean();

    if (!department) {
        throw createError(404, "Department not found");
    }

    return {
        department: toDepartmentResponse(department),
    };
}

async function createDepartment({ institutionId, createdByUserId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!createdByUserId || !isValidObjectId(createdByUserId)) {
        throw createError(401, "Unauthorized");
    }

    await ensureUniversityInstitution(institutionId);

    const { name, nameNormalized, code, description } = validateCreateDepartmentInput(payload);

    const [codeMatch, nameMatch] = await Promise.all([
        Department.findOne({ institutionId, code }).select("_id").lean(),
        Department.findOne({ institutionId, nameNormalized }).select("_id").lean(),
    ]);

    if (codeMatch) {
        throw createError(409, "Department code already exists in this institution");
    }

    if (nameMatch) {
        throw createError(409, "Department name already exists in this institution");
    }

    let department;
    try {
        department = await Department.create({
            institutionId,
            name,
            nameNormalized,
            code,
            description,
            createdByUserId,
        });
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            if (error.keyPattern && error.keyPattern.code) {
                throw createError(409, "Department code already exists in this institution");
            }

            if (error.keyPattern && error.keyPattern.nameNormalized) {
                throw createError(409, "Department name already exists in this institution");
            }

            throw createError(409, "Department already exists in this institution");
        }

        throw error;
    }

    return {
        department: toDepartmentResponse(department),
    };
}

async function updateDepartment({ institutionId, departmentId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!departmentId || !isValidObjectId(departmentId)) {
        throw createError(400, "Invalid department id");
    }

    await ensureUniversityInstitution(institutionId);

    const updates = validateUpdateDepartmentInput(payload);

    if (updates.code || updates.nameNormalized) {
        const duplicateChecks = [];
        if (updates.code) {
            duplicateChecks.push(
                Department.findOne({
                    institutionId,
                    code: updates.code,
                    _id: { $ne: departmentId },
                })
                    .select("_id")
                    .lean()
            );
        }

        if (updates.nameNormalized) {
            duplicateChecks.push(
                Department.findOne({
                    institutionId,
                    nameNormalized: updates.nameNormalized,
                    _id: { $ne: departmentId },
                })
                    .select("_id")
                    .lean()
            );
        }

        const duplicateResults = await Promise.all(duplicateChecks);
        if (updates.code && duplicateResults[0]) {
            throw createError(409, "Department code already exists in this institution");
        }

        if (updates.nameNormalized) {
            const nameDuplicate = updates.code ? duplicateResults[1] : duplicateResults[0];
            if (nameDuplicate) {
                throw createError(409, "Department name already exists in this institution");
            }
        }
    }

    let department;
    try {
        department = await Department.findOneAndUpdate(
            {
                _id: departmentId,
                institutionId,
            },
            { $set: updates },
            { returnDocument: "after", runValidators: true }
        )
            .select("_id institutionId name code description status createdByUserId createdAt updatedAt")
            .lean();
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            if (error.keyPattern && error.keyPattern.code) {
                throw createError(409, "Department code already exists in this institution");
            }

            if (error.keyPattern && error.keyPattern.nameNormalized) {
                throw createError(409, "Department name already exists in this institution");
            }

            throw createError(409, "Department already exists in this institution");
        }

        throw error;
    }

    if (!department) {
        throw createError(404, "Department not found");
    }

    return {
        department: toDepartmentResponse(department),
    };
}

async function deleteDepartment({ institutionId, departmentId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!departmentId || !isValidObjectId(departmentId)) {
        throw createError(400, "Invalid department id");
    }

    await ensureUniversityInstitution(institutionId);

    const department = await Department.findOne({
        _id: departmentId,
        institutionId,
    })
        .select("_id status")
        .lean();

    if (!department) {
        throw createError(404, "Department not found");
    }

    if (department.status !== "archived") {
        throw createError(400, "Archive department before deleting");
    }

    await deleteDepartmentDependencies({
        institutionId,
        departmentId,
    });

    await Department.deleteOne({
        _id: departmentId,
        institutionId,
    });

    return {
        message: "Department deleted successfully",
    };
}

module.exports = {
    listDepartments,
    getDepartmentById,
    createDepartment,
    updateDepartment,
    deleteDepartment,
};
