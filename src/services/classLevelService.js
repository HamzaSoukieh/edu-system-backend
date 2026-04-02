const mongoose = require("mongoose");
const ClassLevel = require("../models/ClassLevel");
const Institution = require("../models/Institution");

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

function toClassLevelResponse(classLevel) {
    return {
        id: classLevel._id.toString(),
        institutionId: classLevel.institutionId.toString(),
        name: classLevel.name,
        code: classLevel.code,
        description: classLevel.description,
        status: classLevel.status,
        createdByUserId: classLevel.createdByUserId?.toString() || null,
        createdAt: classLevel.createdAt,
        updatedAt: classLevel.updatedAt,
    };
}

async function ensureSchoolInstitution(institutionId) {
    const institution = await Institution.findOne({ _id: institutionId }).select("_id type").lean();
    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (institution.type !== "school") {
        throw createError(409, "Class levels are only available for school institutions");
    }

    return institution;
}

function validateName(rawValue) {
    const name = normalizeString(rawValue);
    const nameNormalized = normalizeName(rawValue);

    if (!name) {
        throw createError(400, "Class level name is required");
    }

    if (name.length > 120) {
        throw createError(400, "Class level name must be at most 120 characters");
    }

    return { name, nameNormalized };
}

function validateCode(rawValue) {
    const code = normalizeCode(rawValue);
    if (!code) {
        throw createError(400, "Class level code is required");
    }

    if (!/^[A-Z0-9_-]{2,20}$/.test(code)) {
        throw createError(400, "Class level code must be 2-20 chars using A-Z, 0-9, _ or -");
    }

    return code;
}

function validateDescription(rawValue) {
    if (rawValue === undefined || rawValue === null) {
        return null;
    }

    const description = normalizeString(rawValue) || null;
    if (description && description.length > 500) {
        throw createError(400, "Class level description must be at most 500 characters");
    }

    return description;
}

function validateStatus(rawValue) {
    const status = normalizeString(rawValue).toLowerCase();
    if (!["active", "archived"].includes(status)) {
        throw createError(400, "Class level status must be active or archived");
    }

    return status;
}

function validateCreateClassLevelInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const { name, nameNormalized } = validateName(payload.name);
    const code = validateCode(payload.code);
    const description = validateDescription(payload.description);

    return { name, nameNormalized, code, description };
}

function validateUpdateClassLevelInput(payload) {
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

    if (payload.description !== undefined) {
        updates.description = validateDescription(payload.description);
    }

    if (payload.status !== undefined) {
        updates.status = validateStatus(payload.status);
    }

    if (!Object.keys(updates).length) {
        throw createError(400, "No valid fields to update");
    }

    return updates;
}

function validateListStatus(rawValue) {
    const status = normalizeString(rawValue).toLowerCase();
    if (!status) {
        return "active";
    }

    if (!["active", "archived", "all"].includes(status)) {
        throw createError(400, "status must be active, archived, or all");
    }

    return status;
}

async function createClassLevel({ institutionId, createdByUserId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!createdByUserId || !isValidObjectId(createdByUserId)) {
        throw createError(401, "Unauthorized");
    }

    await ensureSchoolInstitution(institutionId);

    const { name, nameNormalized, code, description } = validateCreateClassLevelInput(payload);

    const [codeMatch, nameMatch] = await Promise.all([
        ClassLevel.findOne({ institutionId, code }).select("_id").lean(),
        ClassLevel.findOne({ institutionId, nameNormalized }).select("_id").lean(),
    ]);

    if (codeMatch) {
        throw createError(409, "Class level code already exists in this institution");
    }

    if (nameMatch) {
        throw createError(409, "Class level name already exists in this institution");
    }

    let classLevel;
    try {
        classLevel = await ClassLevel.create({
            institutionId,
            name,
            nameNormalized,
            code,
            description,
            createdByUserId,
        });
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            if (error.keyPattern?.code) {
                throw createError(409, "Class level code already exists in this institution");
            }

            if (error.keyPattern?.nameNormalized) {
                throw createError(409, "Class level name already exists in this institution");
            }

            throw createError(409, "Class level already exists in this institution");
        }

        throw error;
    }

    return {
        classLevel: toClassLevelResponse(classLevel),
    };
}

async function listClassLevels({ institutionId, status }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    await ensureSchoolInstitution(institutionId);

    const normalizedStatus = validateListStatus(status);
    const query = { institutionId };
    if (normalizedStatus !== "all") {
        query.status = normalizedStatus;
    }

    const classLevels = await ClassLevel.find(query)
        .select("_id institutionId name code description status createdByUserId createdAt updatedAt")
        .sort({ name: 1 })
        .lean();

    return {
        total: classLevels.length,
        classLevels: classLevels.map(toClassLevelResponse),
    };
}

async function getClassLevelById({ institutionId, classLevelId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!classLevelId || !isValidObjectId(classLevelId)) {
        throw createError(400, "Invalid class level id");
    }

    await ensureSchoolInstitution(institutionId);

    const classLevel = await ClassLevel.findOne({
        _id: classLevelId,
        institutionId,
    })
        .select("_id institutionId name code description status createdByUserId createdAt updatedAt")
        .lean();

    if (!classLevel) {
        throw createError(404, "Class level not found");
    }

    return {
        classLevel: toClassLevelResponse(classLevel),
    };
}

async function updateClassLevel({ institutionId, classLevelId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!classLevelId || !isValidObjectId(classLevelId)) {
        throw createError(400, "Invalid class level id");
    }

    await ensureSchoolInstitution(institutionId);

    const updates = validateUpdateClassLevelInput(payload);

    if (updates.code || updates.nameNormalized) {
        const duplicateChecks = [];
        if (updates.code) {
            duplicateChecks.push(
                ClassLevel.findOne({
                    institutionId,
                    code: updates.code,
                    _id: { $ne: classLevelId },
                })
                    .select("_id")
                    .lean()
            );
        }

        if (updates.nameNormalized) {
            duplicateChecks.push(
                ClassLevel.findOne({
                    institutionId,
                    nameNormalized: updates.nameNormalized,
                    _id: { $ne: classLevelId },
                })
                    .select("_id")
                    .lean()
            );
        }

        const duplicateResults = await Promise.all(duplicateChecks);
        if (updates.code && duplicateResults[0]) {
            throw createError(409, "Class level code already exists in this institution");
        }

        if (updates.nameNormalized) {
            const nameDuplicate = updates.code ? duplicateResults[1] : duplicateResults[0];
            if (nameDuplicate) {
                throw createError(409, "Class level name already exists in this institution");
            }
        }
    }

    let classLevel;
    try {
        classLevel = await ClassLevel.findOneAndUpdate(
            {
                _id: classLevelId,
                institutionId,
            },
            { $set: updates },
            { returnDocument: "after", runValidators: true }
        )
            .select("_id institutionId name code description status createdByUserId createdAt updatedAt")
            .lean();
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            if (error.keyPattern?.code) {
                throw createError(409, "Class level code already exists in this institution");
            }

            if (error.keyPattern?.nameNormalized) {
                throw createError(409, "Class level name already exists in this institution");
            }

            throw createError(409, "Class level already exists in this institution");
        }

        throw error;
    }

    if (!classLevel) {
        throw createError(404, "Class level not found");
    }

    return {
        classLevel: toClassLevelResponse(classLevel),
    };
}

module.exports = {
    ensureSchoolInstitution,
    createClassLevel,
    listClassLevels,
    getClassLevelById,
    updateClassLevel,
};
