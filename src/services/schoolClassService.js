const mongoose = require("mongoose");
const ClassLevel = require("../models/ClassLevel");
const SchoolClass = require("../models/SchoolClass");
const { ensureSchoolInstitution } = require("./classLevelService");

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

function toSchoolClassResponse(schoolClass) {
    return {
        id: schoolClass._id.toString(),
        institutionId: schoolClass.institutionId.toString(),
        classLevelId: schoolClass.classLevelId.toString(),
        name: schoolClass.name,
        code: schoolClass.code,
        status: schoolClass.status,
        createdByUserId: schoolClass.createdByUserId?.toString() || null,
        createdAt: schoolClass.createdAt,
        updatedAt: schoolClass.updatedAt,
    };
}

async function loadActiveClassLevel({ institutionId, classLevelId }) {
    const classLevel = await ClassLevel.findOne({
        _id: classLevelId,
        institutionId,
    })
        .select("_id status")
        .lean();

    if (!classLevel) {
        throw createError(404, "Class level not found");
    }

    if (classLevel.status !== "active") {
        throw createError(400, "Class level must be active");
    }

    return classLevel;
}

async function getSchoolClassRecord({ institutionId, classId }) {
    const schoolClass = await SchoolClass.findOne({
        _id: classId,
        institutionId,
    })
        .select("_id institutionId classLevelId name code status createdByUserId createdAt updatedAt")
        .lean();

    if (!schoolClass) {
        throw createError(404, "Class not found");
    }

    return schoolClass;
}

function validateName(rawValue) {
    const name = normalizeString(rawValue);
    const nameNormalized = normalizeName(rawValue);

    if (!name) {
        throw createError(400, "Class name is required");
    }

    if (name.length > 120) {
        throw createError(400, "Class name must be at most 120 characters");
    }

    return { name, nameNormalized };
}

function validateCode(rawValue) {
    const code = normalizeCode(rawValue);
    if (!code) {
        throw createError(400, "Class code is required");
    }

    if (!/^[A-Z0-9_-]{2,20}$/.test(code)) {
        throw createError(400, "Class code must be 2-20 chars using A-Z, 0-9, _ or -");
    }

    return code;
}

function validateStatus(rawValue) {
    const status = normalizeString(rawValue).toLowerCase();
    if (!["active", "archived"].includes(status)) {
        throw createError(400, "Class status must be active or archived");
    }

    return status;
}

function validateCreateSchoolClassInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    if (!payload.classLevelId || !isValidObjectId(payload.classLevelId)) {
        throw createError(400, "Invalid classLevelId");
    }

    const { name, nameNormalized } = validateName(payload.name);
    const code = validateCode(payload.code);

    return {
        classLevelId: payload.classLevelId,
        name,
        nameNormalized,
        code,
    };
}

function validateUpdateSchoolClassInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    if (payload.classLevelId !== undefined) {
        throw createError(400, "classLevelId cannot be updated");
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

    if (payload.status !== undefined) {
        updates.status = validateStatus(payload.status);
    }

    if (!Object.keys(updates).length) {
        throw createError(400, "No valid fields to update");
    }

    return updates;
}

function validateListInput({ status, classLevelId }) {
    const normalizedStatus = normalizeString(status).toLowerCase();
    if (normalizedStatus && !["active", "archived", "all"].includes(normalizedStatus)) {
        throw createError(400, "status must be active, archived, or all");
    }

    if (classLevelId !== undefined && (!classLevelId || !isValidObjectId(classLevelId))) {
        throw createError(400, "Invalid classLevelId");
    }

    return {
        status: normalizedStatus || "active",
        classLevelId: classLevelId || null,
    };
}

async function createSchoolClass({ institutionId, createdByUserId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!createdByUserId || !isValidObjectId(createdByUserId)) {
        throw createError(401, "Unauthorized");
    }

    await ensureSchoolInstitution(institutionId);

    const input = validateCreateSchoolClassInput(payload);
    await loadActiveClassLevel({
        institutionId,
        classLevelId: input.classLevelId,
    });

    const [codeMatch, nameMatch] = await Promise.all([
        SchoolClass.findOne({ institutionId, code: input.code }).select("_id").lean(),
        SchoolClass.findOne({
            institutionId,
            classLevelId: input.classLevelId,
            nameNormalized: input.nameNormalized,
        })
            .select("_id")
            .lean(),
    ]);

    if (codeMatch) {
        throw createError(409, "Class code already exists in this institution");
    }

    if (nameMatch) {
        throw createError(409, "Class name already exists in this class level");
    }

    let schoolClass;
    try {
        schoolClass = await SchoolClass.create({
            institutionId,
            classLevelId: input.classLevelId,
            name: input.name,
            nameNormalized: input.nameNormalized,
            code: input.code,
            createdByUserId,
        });
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            if (error.keyPattern?.code) {
                throw createError(409, "Class code already exists in this institution");
            }

            if (error.keyPattern?.nameNormalized) {
                throw createError(409, "Class name already exists in this class level");
            }

            throw createError(409, "Class already exists");
        }

        throw error;
    }

    return {
        schoolClass: toSchoolClassResponse(schoolClass),
    };
}

async function listSchoolClasses({ institutionId, status, classLevelId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    await ensureSchoolInstitution(institutionId);

    const input = validateListInput({ status, classLevelId });
    if (input.classLevelId) {
        const classLevel = await ClassLevel.findOne({
            _id: input.classLevelId,
            institutionId,
        })
            .select("_id")
            .lean();

        if (!classLevel) {
            throw createError(404, "Class level not found");
        }
    }

    const query = { institutionId };
    if (input.status !== "all") {
        query.status = input.status;
    }

    if (input.classLevelId) {
        query.classLevelId = input.classLevelId;
    }

    const schoolClasses = await SchoolClass.find(query)
        .select("_id institutionId classLevelId name code status createdByUserId createdAt updatedAt")
        .sort({ name: 1 })
        .lean();

    return {
        total: schoolClasses.length,
        schoolClasses: schoolClasses.map(toSchoolClassResponse),
    };
}

async function getSchoolClassById({ institutionId, classId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!classId || !isValidObjectId(classId)) {
        throw createError(400, "Invalid class id");
    }

    await ensureSchoolInstitution(institutionId);

    return {
        schoolClass: toSchoolClassResponse(
            await getSchoolClassRecord({
                institutionId,
                classId,
            })
        ),
    };
}

async function updateSchoolClass({ institutionId, classId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!classId || !isValidObjectId(classId)) {
        throw createError(400, "Invalid class id");
    }

    await ensureSchoolInstitution(institutionId);

    const updates = validateUpdateSchoolClassInput(payload);
    const existingSchoolClass = await getSchoolClassRecord({ institutionId, classId });

    if (updates.code || updates.nameNormalized) {
        const duplicateChecks = [];
        if (updates.code) {
            duplicateChecks.push(
                SchoolClass.findOne({
                    institutionId,
                    code: updates.code,
                    _id: { $ne: classId },
                })
                    .select("_id")
                    .lean()
            );
        }

        if (updates.nameNormalized) {
            duplicateChecks.push(
                SchoolClass.findOne({
                    institutionId,
                    classLevelId: existingSchoolClass.classLevelId,
                    nameNormalized: updates.nameNormalized,
                    _id: { $ne: classId },
                })
                    .select("_id")
                    .lean()
            );
        }

        const duplicateResults = await Promise.all(duplicateChecks);
        if (updates.code && duplicateResults[0]) {
            throw createError(409, "Class code already exists in this institution");
        }

        if (updates.nameNormalized) {
            const nameDuplicate = updates.code ? duplicateResults[1] : duplicateResults[0];
            if (nameDuplicate) {
                throw createError(409, "Class name already exists in this class level");
            }
        }
    }

    let schoolClass;
    try {
        schoolClass = await SchoolClass.findOneAndUpdate(
            {
                _id: classId,
                institutionId,
            },
            { $set: updates },
            { returnDocument: "after", runValidators: true }
        )
            .select("_id institutionId classLevelId name code status createdByUserId createdAt updatedAt")
            .lean();
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            if (error.keyPattern?.code) {
                throw createError(409, "Class code already exists in this institution");
            }

            if (error.keyPattern?.nameNormalized) {
                throw createError(409, "Class name already exists in this class level");
            }

            throw createError(409, "Class already exists");
        }

        throw error;
    }

    if (!schoolClass) {
        throw createError(404, "Class not found");
    }

    return {
        schoolClass: toSchoolClassResponse(schoolClass),
    };
}

module.exports = {
    getSchoolClassRecord,
    loadActiveClassLevel,
    createSchoolClass,
    listSchoolClasses,
    getSchoolClassById,
    updateSchoolClass,
};
