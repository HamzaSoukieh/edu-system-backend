const mongoose = require("mongoose");
const AcademicYear = require("../models/AcademicYear");
const Institution = require("../models/Institution");

const ACADEMIC_YEAR_STATUSES = ["draft", "active", "archived"];
const ACADEMIC_YEAR_SELECT_FIELDS =
    "_id institutionId name nameNormalized startDate endDate status createdByUserId archivedAt createdAt updatedAt";
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

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

function normalizeId(value) {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed || null;
    }

    if (typeof value.toString === "function") {
        const normalized = value.toString().trim();
        return normalized || null;
    }

    return null;
}

function isValidObjectId(value) {
    const normalized = normalizeId(value);
    return Boolean(normalized) && mongoose.Types.ObjectId.isValid(normalized);
}

function isDuplicateKeyError(error) {
    return Boolean(error) && error.name === "MongoServerError" && error.code === 11000;
}

function validateInstitutionId(institutionId) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }
}

function validateActorUserId(actorUserId) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }
}

function validateAcademicYearId(academicYearId) {
    if (!academicYearId || !isValidObjectId(academicYearId)) {
        throw createError(400, "Invalid academicYearId");
    }
}

function formatDateOnly(value) {
    return value.toISOString().slice(0, 10);
}

function parseDateOnly(rawValue, fieldName) {
    if (rawValue instanceof Date) {
        if (Number.isNaN(rawValue.getTime())) {
            throw createError(400, `${fieldName} must be a valid date`);
        }

        return new Date(`${formatDateOnly(rawValue)}T00:00:00.000Z`);
    }

    const value = normalizeString(rawValue);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw createError(400, `${fieldName} must be in YYYY-MM-DD format`);
    }

    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || formatDateOnly(parsed) !== value) {
        throw createError(400, `${fieldName} must be a valid date`);
    }

    return parsed;
}

function validateAcademicYearName(rawValue) {
    const name = normalizeString(rawValue);
    if (!name) {
        throw createError(400, "name is required");
    }

    if (name.length > 120) {
        throw createError(400, "name must be at most 120 characters");
    }

    return {
        name,
        nameNormalized: name.toLowerCase(),
    };
}

function validateAcademicYearStatus(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : "draft";
    }

    const status = normalizeLowerString(rawValue);
    if (!ACADEMIC_YEAR_STATUSES.includes(status)) {
        throw createError(400, "status must be draft, active, or archived");
    }

    return status;
}

function validateDateRange({ startDate, endDate }) {
    if (endDate.getTime() <= startDate.getTime()) {
        throw createError(400, "endDate must be after startDate");
    }
}

function validateCreateAcademicYearInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const { name, nameNormalized } = validateAcademicYearName(payload.name);
    const startDate = parseDateOnly(payload.startDate, "startDate");
    const endDate = parseDateOnly(payload.endDate, "endDate");
    validateDateRange({ startDate, endDate });

    return {
        name,
        nameNormalized,
        startDate,
        endDate,
        status: validateAcademicYearStatus(payload.status),
    };
}

function validateUpdateAcademicYearInput(payload, existingAcademicYear) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const allowedFields = ["name", "startDate", "endDate", "status"];
    const invalidFields = Object.keys(payload).filter((field) => !allowedFields.includes(field));
    if (invalidFields.length) {
        throw createError(400, `Cannot update: ${invalidFields.join(", ")}`);
    }

    const updates = {};
    const nextStartDate =
        payload.startDate !== undefined
            ? parseDateOnly(payload.startDate, "startDate")
            : new Date(existingAcademicYear.startDate);
    const nextEndDate =
        payload.endDate !== undefined
            ? parseDateOnly(payload.endDate, "endDate")
            : new Date(existingAcademicYear.endDate);

    validateDateRange({ startDate: nextStartDate, endDate: nextEndDate });

    if (payload.name !== undefined) {
        const { name, nameNormalized } = validateAcademicYearName(payload.name);
        updates.name = name;
        updates.nameNormalized = nameNormalized;
    }

    if (payload.startDate !== undefined) {
        updates.startDate = nextStartDate;
    }

    if (payload.endDate !== undefined) {
        updates.endDate = nextEndDate;
    }

    if (payload.status !== undefined) {
        updates.status = validateAcademicYearStatus(payload.status, { allowUndefined: true });
        if (updates.status !== "archived") {
            updates.archivedAt = null;
        } else if (existingAcademicYear.status !== "archived") {
            updates.archivedAt = new Date();
        }
    }

    if (!Object.keys(updates).length) {
        throw createError(400, "No valid fields to update");
    }

    return updates;
}

function validateListAcademicYearsQuery(query = {}) {
    const status = normalizeLowerString(query.status);
    if (status && ![...ACADEMIC_YEAR_STATUSES, "all"].includes(status)) {
        throw createError(400, "status must be draft, active, archived, or all");
    }

    const page = query.page === undefined || query.page === "" ? DEFAULT_PAGE : Number(query.page);
    if (!Number.isInteger(page) || page < 1) {
        throw createError(400, "page must be a positive integer");
    }

    const limit = query.limit === undefined || query.limit === "" ? DEFAULT_LIMIT : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        throw createError(400, `limit must be an integer between 1 and ${MAX_LIMIT}`);
    }

    return {
        status: status || "all",
        search: normalizeString(query.search || query.name),
        page,
        limit,
    };
}

function toAcademicYearResponse(academicYear) {
    return {
        id: academicYear._id.toString(),
        institutionId: academicYear.institutionId.toString(),
        name: academicYear.name,
        startDate: formatDateOnly(new Date(academicYear.startDate)),
        endDate: formatDateOnly(new Date(academicYear.endDate)),
        status: academicYear.status,
        createdByUserId: normalizeId(academicYear.createdByUserId),
        archivedAt: academicYear.archivedAt || null,
        createdAt: academicYear.createdAt,
        updatedAt: academicYear.updatedAt,
    };
}

async function ensureInstitutionExists(institutionId) {
    const institution = await Institution.findOne({ _id: institutionId }).select("_id type").lean();
    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (!["school", "university"].includes(institution.type)) {
        throw createError(409, "Academic years are only available for school and university institutions");
    }

    return institution;
}

async function ensureNoDuplicateName({ institutionId, nameNormalized, excludeAcademicYearId = null }) {
    const query = {
        institutionId,
        nameNormalized,
    };

    if (excludeAcademicYearId) {
        query._id = { $ne: excludeAcademicYearId };
    }

    const existingAcademicYear = await AcademicYear.findOne(query).select("_id").lean();
    if (existingAcademicYear) {
        throw createError(409, "Academic year name already exists in this institution");
    }
}

async function ensureSingleActiveAcademicYear({ institutionId, excludeAcademicYearId = null }) {
    const query = {
        institutionId,
        status: "active",
    };

    if (excludeAcademicYearId) {
        query._id = { $ne: excludeAcademicYearId };
    }

    const activeAcademicYear = await AcademicYear.findOne(query).select("_id").lean();
    if (activeAcademicYear) {
        throw createError(409, "Another active academic year already exists for this institution");
    }
}

function translateDuplicateKeyError(error) {
    if (!isDuplicateKeyError(error)) {
        return null;
    }

    if (error.keyPattern?.nameNormalized) {
        return createError(409, "Academic year name already exists in this institution");
    }

    if (error.keyPattern?.status) {
        return createError(409, "Another active academic year already exists for this institution");
    }

    return createError(409, "Academic year already exists in this institution");
}

async function loadAcademicYearRecord({ institutionId, academicYearId }) {
    validateAcademicYearId(academicYearId);

    const academicYear = await AcademicYear.findOne({
        _id: academicYearId,
        institutionId,
    })
        .select(ACADEMIC_YEAR_SELECT_FIELDS)
        .lean();

    if (!academicYear) {
        throw createError(404, "Academic year not found");
    }

    return academicYear;
}

async function validateAcademicYearReference({ institutionId, academicYearId, allowArchived = false }) {
    validateInstitutionId(institutionId);
    validateAcademicYearId(academicYearId);

    const academicYear = await AcademicYear.findOne({
        _id: academicYearId,
        institutionId,
    })
        .select(ACADEMIC_YEAR_SELECT_FIELDS)
        .lean();

    if (!academicYear) {
        throw createError(404, "Academic year not found");
    }

    if (!allowArchived && academicYear.status === "archived") {
        throw createError(400, "Academic year is archived");
    }

    return academicYear;
}

async function createAcademicYear({ institutionId, createdByUserId, payload }) {
    validateInstitutionId(institutionId);
    validateActorUserId(createdByUserId);
    await ensureInstitutionExists(institutionId);

    const input = validateCreateAcademicYearInput(payload);
    await ensureNoDuplicateName({
        institutionId,
        nameNormalized: input.nameNormalized,
    });

    if (input.status === "active") {
        await ensureSingleActiveAcademicYear({ institutionId });
    }

    let academicYear;
    try {
        academicYear = await AcademicYear.create({
            institutionId,
            ...input,
            createdByUserId,
            archivedAt: input.status === "archived" ? new Date() : null,
        });
    } catch (error) {
        const translatedError = translateDuplicateKeyError(error);
        if (translatedError) {
            throw translatedError;
        }

        throw error;
    }

    return {
        academicYear: toAcademicYearResponse(academicYear),
    };
}

async function listAcademicYears({ institutionId, query = {} }) {
    validateInstitutionId(institutionId);
    await ensureInstitutionExists(institutionId);

    const filters = validateListAcademicYearsQuery(query);
    const mongoQuery = { institutionId };
    if (filters.status !== "all") {
        mongoQuery.status = filters.status;
    }

    if (filters.search) {
        mongoQuery.nameNormalized = { $regex: filters.search.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") };
    }

    const skip = (filters.page - 1) * filters.limit;
    const [total, academicYears] = await Promise.all([
        AcademicYear.countDocuments(mongoQuery),
        AcademicYear.find(mongoQuery)
            .select(ACADEMIC_YEAR_SELECT_FIELDS)
            .sort({ startDate: -1, createdAt: -1 })
            .skip(skip)
            .limit(filters.limit)
            .lean(),
    ]);

    return {
        academicYears: academicYears.map(toAcademicYearResponse),
        pagination: {
            page: filters.page,
            limit: filters.limit,
            total,
            totalPages: Math.ceil(total / filters.limit),
        },
    };
}

async function getAcademicYearById({ institutionId, academicYearId }) {
    validateInstitutionId(institutionId);
    await ensureInstitutionExists(institutionId);

    const academicYear = await loadAcademicYearRecord({ institutionId, academicYearId });

    return {
        academicYear: toAcademicYearResponse(academicYear),
    };
}

async function getActiveAcademicYear({ institutionId }) {
    validateInstitutionId(institutionId);
    await ensureInstitutionExists(institutionId);

    const academicYear = await AcademicYear.findOne({
        institutionId,
        status: "active",
    })
        .select(ACADEMIC_YEAR_SELECT_FIELDS)
        .sort({ startDate: -1, createdAt: -1 })
        .lean();

    if (!academicYear) {
        throw createError(404, "Active academic year not found");
    }

    return {
        academicYear: toAcademicYearResponse(academicYear),
    };
}

async function updateAcademicYear({ institutionId, academicYearId, payload }) {
    validateInstitutionId(institutionId);
    await ensureInstitutionExists(institutionId);

    const existingAcademicYear = await loadAcademicYearRecord({ institutionId, academicYearId });
    if (existingAcademicYear.status === "archived") {
        throw createError(400, "Archived academic years cannot be updated");
    }

    const updates = validateUpdateAcademicYearInput(payload, existingAcademicYear);
    if (updates.nameNormalized) {
        await ensureNoDuplicateName({
            institutionId,
            nameNormalized: updates.nameNormalized,
            excludeAcademicYearId: academicYearId,
        });
    }

    if (updates.status === "active") {
        await ensureSingleActiveAcademicYear({
            institutionId,
            excludeAcademicYearId: academicYearId,
        });
    }

    let academicYear;
    try {
        academicYear = await AcademicYear.findOneAndUpdate(
            {
                _id: academicYearId,
                institutionId,
            },
            { $set: updates },
            { returnDocument: "after", runValidators: true }
        )
            .select(ACADEMIC_YEAR_SELECT_FIELDS)
            .lean();
    } catch (error) {
        const translatedError = translateDuplicateKeyError(error);
        if (translatedError) {
            throw translatedError;
        }

        throw error;
    }

    if (!academicYear) {
        throw createError(404, "Academic year not found");
    }

    return {
        academicYear: toAcademicYearResponse(academicYear),
    };
}

async function archiveAcademicYear({ institutionId, academicYearId }) {
    validateInstitutionId(institutionId);
    await ensureInstitutionExists(institutionId);

    const existingAcademicYear = await loadAcademicYearRecord({ institutionId, academicYearId });
    if (existingAcademicYear.status === "archived") {
        return {
            academicYear: toAcademicYearResponse(existingAcademicYear),
        };
    }

    const academicYear = await AcademicYear.findOneAndUpdate(
        {
            _id: academicYearId,
            institutionId,
        },
        {
            $set: {
                status: "archived",
                archivedAt: new Date(),
            },
        },
        { returnDocument: "after", runValidators: true }
    )
        .select(ACADEMIC_YEAR_SELECT_FIELDS)
        .lean();

    if (!academicYear) {
        throw createError(404, "Academic year not found");
    }

    return {
        academicYear: toAcademicYearResponse(academicYear),
    };
}

async function activateAcademicYear({ institutionId, academicYearId }) {
    return updateAcademicYear({
        institutionId,
        academicYearId,
        payload: {
            status: "active",
        },
    });
}

module.exports = {
    ACADEMIC_YEAR_STATUSES,
    validateCreateAcademicYearInput,
    validateAcademicYearReference,
    createAcademicYear,
    listAcademicYears,
    getAcademicYearById,
    updateAcademicYear,
    archiveAcademicYear,
    getActiveAcademicYear,
    activateAcademicYear,
};
