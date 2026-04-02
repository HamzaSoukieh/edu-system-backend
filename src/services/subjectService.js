const mongoose = require("mongoose");
const ClassLevel = require("../models/ClassLevel");
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

function normalizeInstitutionType(value) {
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
        departmentId: subject.departmentId ? subject.departmentId.toString() : null,
        classLevelId: subject.classLevelId ? subject.classLevelId.toString() : null,
        name: subject.name,
        code: subject.code,
        creditHours: subject.creditHours,
        status: subject.status,
        createdByUserId: subject.createdByUserId?.toString() || null,
        createdAt: subject.createdAt,
        updatedAt: subject.updatedAt,
    };
}

function resolveSubjectScopeConfig(institutionType) {
    if (normalizeInstitutionType(institutionType) === "school") {
        return {
            type: "school",
            createParamName: "classLevelId",
            scopeField: "classLevelId",
            scopeLabel: "Class level",
            scopeModel: ClassLevel,
        };
    }

    return {
        type: "university",
        createParamName: "departmentId",
        scopeField: "departmentId",
        scopeLabel: "Department",
        scopeModel: Department,
    };
}

async function loadInstitution(institutionId) {
    const institution = await Institution.findOne({
        _id: institutionId,
    })
        .select("_id type")
        .lean();

    if (!institution) {
        throw createError(404, "Institution not found");
    }

    return institution;
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

function validateCreateCreditHours(rawValue, institutionType) {
    const normalizedInstitutionType = normalizeInstitutionType(institutionType);
    if (normalizedInstitutionType === "school") {
        if (rawValue !== undefined && rawValue !== null) {
            throw createError(400, "creditHours is not supported for school subjects");
        }

        return null;
    }

    if (rawValue === undefined || rawValue === null) {
        throw createError(400, "creditHours is required");
    }

    return validateCreditHours(rawValue);
}

function validateUpdateCreditHours(rawValue, institutionType) {
    const normalizedInstitutionType = normalizeInstitutionType(institutionType);
    if (normalizedInstitutionType === "school") {
        if (rawValue !== null) {
            throw createError(400, "creditHours is not supported for school subjects");
        }

        return null;
    }

    if (rawValue === null) {
        throw createError(400, "creditHours is required");
    }

    return validateCreditHours(rawValue);
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

function validateCreateSubjectInput(payload, institutionType) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const { name, nameNormalized } = validateName(payload.name);
    const code = validateCode(payload.code);
    const creditHours = validateCreateCreditHours(payload.creditHours, institutionType);
    const status = validateStatus(payload.status);

    return {
        name,
        nameNormalized,
        code,
        creditHours,
        status,
    };
}

function validateUpdateSubjectInput(payload, institutionType) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const scopeConfig = resolveSubjectScopeConfig(institutionType);
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
        updates.creditHours = validateUpdateCreditHours(payload.creditHours, institutionType);
    }

    if (payload.status !== undefined) {
        updates.status = validateStatus(payload.status);
    }

    if (scopeConfig.scopeField === "departmentId") {
        if (payload.classLevelId !== undefined) {
            throw createError(400, "classLevelId is not supported for university subjects");
        }

        if (payload.departmentId !== undefined) {
            if (!payload.departmentId || !isValidObjectId(payload.departmentId)) {
                throw createError(400, "Invalid department id");
            }

            updates.departmentId = payload.departmentId;
            updates.classLevelId = null;
        }
    } else {
        if (payload.departmentId !== undefined) {
            throw createError(400, "departmentId is not supported for school subjects");
        }

        if (payload.classLevelId !== undefined) {
            if (!payload.classLevelId || !isValidObjectId(payload.classLevelId)) {
                throw createError(400, "Invalid class level id");
            }

            updates.classLevelId = payload.classLevelId;
            updates.departmentId = null;
        }
    }

    if (!Object.keys(updates).length) {
        throw createError(400, "No valid fields to update");
    }

    return updates;
}

async function loadAndValidateScopeRecord({
    institutionId,
    institutionType,
    scopeId,
    action,
}) {
    const scopeConfig = resolveSubjectScopeConfig(institutionType);
    const scopeLabelLower = scopeConfig.scopeLabel.toLowerCase();

    if (!scopeId || !isValidObjectId(scopeId)) {
        throw createError(400, `Invalid ${scopeLabelLower} id`);
    }

    const scopeRecord = await scopeConfig.scopeModel.findOne({
        _id: scopeId,
        institutionId,
    })
        .select("_id status")
        .lean();

    if (!scopeRecord) {
        throw createError(404, `${scopeConfig.scopeLabel} not found`);
    }

    if (action === "write" && scopeRecord.status !== "active") {
        throw createError(400, `${scopeConfig.scopeLabel} is not active`);
    }

    return scopeRecord;
}

async function listSubjects({ institutionId, departmentId, classLevelId, active }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    const institution = await loadInstitution(institutionId);
    const scopeConfig = resolveSubjectScopeConfig(institution.type);
    const query = { institutionId };

    if (scopeConfig.scopeField === "departmentId") {
        if (classLevelId !== undefined) {
            throw createError(400, "classLevelId is not supported for university subjects");
        }

        if (departmentId !== undefined) {
            await loadAndValidateScopeRecord({
                institutionId,
                institutionType: institution.type,
                scopeId: departmentId,
                action: "read",
            });
            query.departmentId = departmentId;
        }
    } else {
        if (departmentId !== undefined) {
            throw createError(400, "departmentId is not supported for school subjects");
        }

        if (classLevelId !== undefined) {
            await loadAndValidateScopeRecord({
                institutionId,
                institutionType: institution.type,
                scopeId: classLevelId,
                action: "read",
            });
            query.classLevelId = classLevelId;
        }
    }

    if (active === undefined || active === "true") {
        query.status = "active";
    } else if (active === "false") {
        query.status = "archived";
    } else {
        throw createError(400, "active must be true or false");
    }

    const subjects = await Subject.find(query)
        .select("_id institutionId departmentId classLevelId name code creditHours status createdByUserId createdAt updatedAt")
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
        .select("_id institutionId departmentId classLevelId name code creditHours status createdByUserId createdAt updatedAt")
        .lean();

    if (!subject) {
        throw createError(404, "Subject not found");
    }

    return {
        subject: toSubjectResponse(subject),
    };
}

async function createSubject({ institutionId, departmentId, classLevelId, createdByUserId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!createdByUserId || !isValidObjectId(createdByUserId)) {
        throw createError(401, "Unauthorized");
    }

    const institution = await loadInstitution(institutionId);
    const scopeConfig = resolveSubjectScopeConfig(institution.type);
    const scopeId = scopeConfig.scopeField === "departmentId" ? departmentId : classLevelId;

    if (scopeConfig.scopeField === "departmentId" && classLevelId !== undefined) {
        throw createError(400, "classLevelId is not supported for university subjects");
    }

    if (scopeConfig.scopeField === "classLevelId" && departmentId !== undefined) {
        throw createError(400, "departmentId is not supported for school subjects");
    }

    await loadAndValidateScopeRecord({
        institutionId,
        institutionType: institution.type,
        scopeId,
        action: "write",
    });

    const { name, nameNormalized, code, creditHours, status } = validateCreateSubjectInput(
        payload,
        institution.type
    );

    const scopeQuery = {
        institutionId,
        [scopeConfig.scopeField]: scopeId,
        nameNormalized,
    };

    const [codeMatch, nameMatch] = await Promise.all([
        Subject.findOne({ institutionId, code }).select("_id").lean(),
        Subject.findOne(scopeQuery).select("_id").lean(),
    ]);

    if (codeMatch) {
        throw createError(409, "Subject code already exists in this institution");
    }

    if (nameMatch) {
        throw createError(409, `Subject name already exists in this ${scopeConfig.scopeLabel.toLowerCase()}`);
    }

    const subjectPayload = {
        institutionId,
        departmentId: null,
        classLevelId: null,
        name,
        nameNormalized,
        code,
        creditHours,
        status,
        createdByUserId,
    };
    subjectPayload[scopeConfig.scopeField] = scopeId;

    let subject;
    try {
        subject = await Subject.create(subjectPayload);
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            if (error.keyPattern?.code) {
                throw createError(409, "Subject code already exists in this institution");
            }

            if (error.keyPattern?.nameNormalized) {
                throw createError(409, `Subject name already exists in this ${scopeConfig.scopeLabel.toLowerCase()}`);
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

    const [existingSubject, institution] = await Promise.all([
        Subject.findOne({
            _id: subjectId,
            institutionId,
        })
            .select("_id departmentId classLevelId nameNormalized")
            .lean(),
        loadInstitution(institutionId),
    ]);

    if (!existingSubject) {
        throw createError(404, "Subject not found");
    }

    const scopeConfig = resolveSubjectScopeConfig(institution.type);
    const updates = validateUpdateSubjectInput(payload, institution.type);

    const existingScopeId =
        scopeConfig.scopeField === "departmentId"
            ? existingSubject.departmentId?.toString() || null
            : existingSubject.classLevelId?.toString() || null;
    const targetScopeId = updates[scopeConfig.scopeField] || existingScopeId;

    if (updates[scopeConfig.scopeField]) {
        await loadAndValidateScopeRecord({
            institutionId,
            institutionType: institution.type,
            scopeId: updates[scopeConfig.scopeField],
            action: "write",
        });
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

    if (updates.nameNormalized || updates[scopeConfig.scopeField]) {
        const targetNameNormalized = updates.nameNormalized || existingSubject.nameNormalized;
        const nameMatch = await Subject.findOne({
            institutionId,
            [scopeConfig.scopeField]: targetScopeId,
            nameNormalized: targetNameNormalized,
            _id: { $ne: subjectId },
        })
            .select("_id")
            .lean();

        if (nameMatch) {
            throw createError(409, `Subject name already exists in this ${scopeConfig.scopeLabel.toLowerCase()}`);
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
            .select("_id institutionId departmentId classLevelId name code creditHours status createdByUserId createdAt updatedAt")
            .lean();
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            if (error.keyPattern?.code) {
                throw createError(409, "Subject code already exists in this institution");
            }

            if (error.keyPattern?.nameNormalized) {
                throw createError(409, `Subject name already exists in this ${scopeConfig.scopeLabel.toLowerCase()}`);
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
