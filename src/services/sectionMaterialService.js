const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Enrollment = require("../models/Enrollment");
const SchoolClass = require("../models/SchoolClass");
const Section = require("../models/Section");
const SectionMaterial = require("../models/SectionMaterial");
const SectionSession = require("../models/SectionSession");
const Subject = require("../models/Subject");
const { ensureCanChangeSectionSessionStatus } = require("./sectionSessionService");

const MATERIAL_TYPES = ["lecture_pdf", "note_pdf", "resource_pdf"];
const SOURCE_TYPES = ["file"];
const MATERIAL_STATUSES = ["draft", "published", "archived"];
const MATERIAL_LIST_STATUSES = [...MATERIAL_STATUSES, "all"];
const ALLOWED_FILE_MIME_TYPE = "application/pdf";
const ALLOWED_FILE_EXTENSION = ".pdf";
const ACTIVE_ENROLLMENT_STATUS = "enrolled";
const ACTIVE_MEMBERSHIP_STATUS = "active";
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const PRIVATE_SECTION_MATERIAL_DIR = path.resolve(__dirname, "..", "..", "storage", "section-materials");
const SECTION_MATERIAL_SELECT_FIELDS =
    "_id institutionId sectionId sectionSessionId title titleNormalized description materialType sourceType fileKey originalFilename mimeType sizeBytes status uploadedByUserId publishedAt archivedAt createdAt updatedAt";

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

function normalizeTitle(value) {
    return normalizeLowerString(value).replace(/\s+/g, " ");
}

function escapeRegex(value) {
    return normalizeString(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    const normalized = normalizeId(value);
    return Boolean(normalized) && mongoose.Types.ObjectId.isValid(normalized);
}

function validateObjectId(value, fieldName) {
    const normalized = normalizeId(value);
    if (!normalized || !isValidObjectId(normalized)) {
        throw createError(400, `${fieldName} is invalid`);
    }

    return normalized;
}

function normalizeRequiredString(rawValue, fieldName, maxLength) {
    const value = normalizeString(rawValue);
    if (!value) {
        throw createError(400, `${fieldName} is required`);
    }

    if (value.length > maxLength) {
        throw createError(400, `${fieldName} must be at most ${maxLength} characters`);
    }

    return value;
}

function normalizeBoundedString(rawValue, fieldName, maxLength, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : "";
    }

    if (rawValue === null) {
        return "";
    }

    const value = normalizeString(rawValue);
    if (value.length > maxLength) {
        throw createError(400, `${fieldName} must be at most ${maxLength} characters`);
    }

    return value;
}

function normalizeNullableObjectId(rawValue, fieldName, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : null;
    }

    if (rawValue === null || rawValue === "") {
        return null;
    }

    const normalized = normalizeId(rawValue);
    if (!normalized || !isValidObjectId(normalized)) {
        throw createError(400, `${fieldName} is invalid`);
    }

    return normalized;
}

function validateMaterialType(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : "lecture_pdf";
    }

    const value = normalizeLowerString(rawValue);
    if (!MATERIAL_TYPES.includes(value)) {
        throw createError(400, "materialType must be lecture_pdf, note_pdf, or resource_pdf");
    }

    return value;
}

function validateSourceType(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : "file";
    }

    const value = normalizeLowerString(rawValue);
    if (!SOURCE_TYPES.includes(value)) {
        throw createError(400, "sourceType must be file");
    }

    return value;
}

function validateMaterialStatus(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : "draft";
    }

    const value = normalizeLowerString(rawValue);
    if (!MATERIAL_STATUSES.includes(value)) {
        throw createError(400, "status must be draft, published, or archived");
    }

    return value;
}

function validateMaterialListStatus(rawValue) {
    if (rawValue === undefined) {
        return "all";
    }

    const value = normalizeLowerString(rawValue);
    if (!MATERIAL_LIST_STATUSES.includes(value)) {
        throw createError(400, "status must be draft, published, archived, or all");
    }

    return value;
}

function parsePositiveInteger(rawValue, fieldName, defaultValue) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
        return defaultValue;
    }

    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 1) {
        throw createError(400, `${fieldName} must be a positive integer`);
    }

    return value;
}

function validatePagination(query = {}) {
    const page = parsePositiveInteger(query.page, "page", DEFAULT_PAGE);
    const requestedLimit = parsePositiveInteger(query.limit, "limit", DEFAULT_LIMIT);
    const limit = Math.min(requestedLimit, MAX_LIMIT);

    return {
        page,
        limit,
        skip: (page - 1) * limit,
    };
}

function validateUploadedFile(file) {
    if (!file) {
        throw createError(400, "Material file is required (field: materialFile)");
    }

    const fileSize = Number(file.size);
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
        throw createError(400, "Material file must not be empty");
    }

    if (file.mimetype !== ALLOWED_FILE_MIME_TYPE) {
        throw createError(400, "Only PDF files are allowed");
    }

    const originalExtension = path.extname(file.originalname || "").toLowerCase();
    if (originalExtension !== ALLOWED_FILE_EXTENSION) {
        throw createError(400, "Only PDF files are allowed");
    }

    try {
        resolvePrivateMaterialFilePath(file.filename);
    } catch (_error) {
        throw createError(400, "Invalid material file");
    }

    return {
        fileKey: file.filename,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: fileSize,
    };
}

function validateCreateSectionMaterialInput(payload, file) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const title = normalizeRequiredString(payload.title, "title", MAX_TITLE_LENGTH);
    const status = validateMaterialStatus(payload.status);
    if (status === "archived") {
        throw createError(400, "Materials cannot be created as archived");
    }

    return {
        sectionSessionId: normalizeNullableObjectId(payload.sectionSessionId, "sectionSessionId"),
        title,
        titleNormalized: normalizeTitle(title),
        description: normalizeBoundedString(payload.description, "description", MAX_DESCRIPTION_LENGTH),
        materialType: validateMaterialType(payload.materialType),
        sourceType: validateSourceType(payload.sourceType),
        status,
        file: validateUploadedFile(file),
    };
}

function validateUpdateSectionMaterialInput(payload, file) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        payload = {};
    }

    const updates = {};
    if (payload.sectionSessionId !== undefined) {
        updates.sectionSessionId = normalizeNullableObjectId(payload.sectionSessionId, "sectionSessionId", {
            allowUndefined: true,
        });
    }
    if (payload.title !== undefined) {
        const title = normalizeRequiredString(payload.title, "title", MAX_TITLE_LENGTH);
        updates.title = title;
        updates.titleNormalized = normalizeTitle(title);
    }
    if (payload.description !== undefined) {
        updates.description = normalizeBoundedString(payload.description, "description", MAX_DESCRIPTION_LENGTH, {
            allowUndefined: true,
        });
    }
    if (payload.materialType !== undefined) {
        updates.materialType = validateMaterialType(payload.materialType, { allowUndefined: true });
    }
    if (payload.sourceType !== undefined) {
        updates.sourceType = validateSourceType(payload.sourceType, { allowUndefined: true });
    }
    if (file) {
        Object.assign(updates, validateUploadedFile(file));
    }

    if (!Object.keys(updates).length) {
        throw createError(400, "No valid material fields provided");
    }

    return updates;
}

function validateSectionMaterialStatusUpdateInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const invalidFields = Object.keys(payload).filter((key) => key !== "status");
    if (invalidFields.length) {
        throw createError(400, "Only status can be updated");
    }

    if (payload.status === undefined) {
        throw createError(400, "status is required");
    }

    return {
        status: validateMaterialStatus(payload.status, { allowUndefined: true }),
    };
}

function validateStaffListQuery(query = {}) {
    const pagination = validatePagination(query);

    return {
        status: validateMaterialListStatus(query.status),
        materialType:
            query.materialType === undefined
                ? undefined
                : validateMaterialType(query.materialType, { allowUndefined: true }),
        sectionSessionId: normalizeNullableObjectId(query.sectionSessionId, "sectionSessionId", {
            allowUndefined: true,
        }),
        search: normalizeString(query.search),
        ...pagination,
    };
}

function validateStudentListQuery(query = {}) {
    const pagination = validatePagination(query);

    return {
        sectionId: normalizeNullableObjectId(query.sectionId, "sectionId", { allowUndefined: true }),
        materialType:
            query.materialType === undefined
                ? undefined
                : validateMaterialType(query.materialType, { allowUndefined: true }),
        search: normalizeString(query.search),
        ...pagination,
    };
}

function toPagination({ page, limit, total }) {
    return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
    };
}

function toSectionMaterialResponse(material) {
    if (!material) {
        return null;
    }

    return {
        id: material._id.toString(),
        institutionId: material.institutionId.toString(),
        sectionId: material.sectionId.toString(),
        sectionSessionId: material.sectionSessionId ? material.sectionSessionId.toString() : null,
        title: material.title,
        description: material.description || "",
        materialType: material.materialType,
        sourceType: material.sourceType,
        originalFilename: material.originalFilename || null,
        mimeType: material.mimeType || null,
        sizeBytes: material.sizeBytes === undefined ? null : material.sizeBytes,
        status: material.status,
        uploadedByUserId: material.uploadedByUserId ? material.uploadedByUserId.toString() : null,
        publishedAt: material.publishedAt || null,
        archivedAt: material.archivedAt || null,
        createdAt: material.createdAt,
        updatedAt: material.updatedAt,
    };
}

function toSectionMaterialListItem(material) {
    return toSectionMaterialResponse(material);
}

async function loadSectionRecord({ institutionId, sectionId }) {
    return Section.findOne({
        _id: sectionId,
        institutionId,
    })
        .select("_id institutionId semesterId subjectId schoolClassId code title instructorMemberId status")
        .lean();
}

async function loadSubjectRecord({ institutionId, subjectId }) {
    return Subject.findOne({
        _id: subjectId,
        institutionId,
    })
        .select("_id departmentId classLevelId code name")
        .lean();
}

async function loadSchoolClassRecord({ institutionId, schoolClassId }) {
    if (!schoolClassId) {
        return null;
    }

    return SchoolClass.findOne({
        _id: schoolClassId,
        institutionId,
    })
        .select("_id classLevelId name code")
        .lean();
}

async function loadSectionMaterialContext({ institutionId, sectionId }) {
    const section = await loadSectionRecord({ institutionId, sectionId });
    if (!section) {
        throw createError(404, "Section not found");
    }

    const [subject, schoolClass] = await Promise.all([
        loadSubjectRecord({ institutionId, subjectId: section.subjectId }),
        loadSchoolClassRecord({ institutionId, schoolClassId: section.schoolClassId }),
    ]);

    if (!subject) {
        throw createError(404, "Subject not found");
    }

    if (section.schoolClassId && !schoolClass) {
        throw createError(404, "Class not found");
    }

    return {
        section,
        subject,
        schoolClass,
    };
}

async function loadSectionSessionForMaterial({ institutionId, sectionId, sectionSessionId }) {
    if (!sectionSessionId) {
        return null;
    }

    const sectionSession = await SectionSession.findOne({
        _id: sectionSessionId,
        institutionId,
        sectionId,
    })
        .select("_id institutionId sectionId status")
        .lean();

    if (!sectionSession) {
        throw createError(404, "Section session not found");
    }

    return sectionSession;
}

async function loadSectionMaterialRecord({ institutionId, sectionId, materialId }) {
    return SectionMaterial.findOne({
        _id: materialId,
        institutionId,
        sectionId,
    })
        .select(SECTION_MATERIAL_SELECT_FIELDS)
        .lean();
}

async function ensureStaffCanManageSectionMaterial({
    institutionId,
    actorUserId,
    actorMembership,
    section,
    subject,
    schoolClass,
}) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (normalizeId(actorMembership.institutionId) !== normalizeId(institutionId)) {
        throw createError(403, "Institution access denied");
    }

    if (actorMembership.status && actorMembership.status !== ACTIVE_MEMBERSHIP_STATUS) {
        throw createError(403, "Institution access denied");
    }

    if (actorMembership.role === "student") {
        throw createError(403, "Students cannot manage section materials");
    }

    await ensureCanChangeSectionSessionStatus({
        institutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });
}

function ensureStudentMembership(actorUserId, actorMembership) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (actorMembership.role !== "student") {
        throw createError(403, "Only students can access their own section materials");
    }

    if (actorMembership.status && actorMembership.status !== ACTIVE_MEMBERSHIP_STATUS) {
        throw createError(403, "Institution access denied");
    }
}

async function loadActiveStudentEnrollment({ institutionId, sectionId, studentMemberId }) {
    const enrollment = await Enrollment.findOne({
        institutionId,
        sectionId,
        studentMemberId,
        status: ACTIVE_ENROLLMENT_STATUS,
    })
        .select("_id institutionId sectionId studentMemberId status")
        .lean();

    if (!enrollment) {
        throw createError(404, "Student is not enrolled in this section");
    }

    return enrollment;
}

function ensureArchivedMaterialCanBeEdited(material) {
    if (material.status === "archived") {
        throw createError(409, "Archived section material is read-only");
    }
}

function resolveNextMaterialStatus(currentStatus, nextStatus) {
    const allowedTransitions = {
        draft: ["published", "archived"],
        published: ["archived"],
        archived: [],
    };

    if (currentStatus === nextStatus) {
        throw createError(409, "Section material is already in this status");
    }

    if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
        throw createError(409, "Unsupported section material status transition");
    }
}

function resolvePrivateMaterialFilePath(fileKey) {
    const normalizedFileKey = normalizeString(fileKey);
    if (!normalizedFileKey || normalizedFileKey.includes("/") || normalizedFileKey.includes("\\")) {
        throw createError(404, "Section material file not found");
    }

    const filePath = path.resolve(PRIVATE_SECTION_MATERIAL_DIR, normalizedFileKey);
    if (!filePath.startsWith(`${PRIVATE_SECTION_MATERIAL_DIR}${path.sep}`)) {
        throw createError(404, "Section material file not found");
    }

    return filePath;
}

function removePrivateMaterialFile(fileKey) {
    if (!fileKey) {
        return;
    }

    let filePath;
    try {
        filePath = resolvePrivateMaterialFilePath(fileKey);
    } catch (_error) {
        return;
    }

    fs.promises.unlink(filePath).catch(() => {});
}

async function createSectionMaterial({
    institutionId,
    sectionId,
    actorUserId,
    actorMembership,
    payload,
    file,
}) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    const validSectionId = validateObjectId(sectionId, "sectionId");
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    const { section, subject, schoolClass } = await loadSectionMaterialContext({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
    });

    await ensureStaffCanManageSectionMaterial({
        institutionId: validInstitutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const input = validateCreateSectionMaterialInput(payload, file);
    await loadSectionSessionForMaterial({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        sectionSessionId: input.sectionSessionId,
    });

    const now = new Date();
    const material = await SectionMaterial.create({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        sectionSessionId: input.sectionSessionId,
        title: input.title,
        titleNormalized: input.titleNormalized,
        description: input.description,
        materialType: input.materialType,
        sourceType: input.sourceType,
        fileKey: input.file.fileKey,
        originalFilename: input.file.originalFilename,
        mimeType: input.file.mimeType,
        sizeBytes: input.file.sizeBytes,
        status: input.status,
        uploadedByUserId: actorUserId,
        publishedAt: input.status === "published" ? now : null,
        archivedAt: null,
    });

    return {
        material: toSectionMaterialResponse(material),
    };
}

async function listSectionMaterialsForStaff({
    institutionId,
    sectionId,
    actorUserId,
    actorMembership,
    query = {},
}) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    const validSectionId = validateObjectId(sectionId, "sectionId");
    const { section, subject, schoolClass } = await loadSectionMaterialContext({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
    });

    await ensureStaffCanManageSectionMaterial({
        institutionId: validInstitutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const input = validateStaffListQuery(query);
    const materialQuery = {
        institutionId: validInstitutionId,
        sectionId: validSectionId,
    };

    if (input.status !== "all") {
        materialQuery.status = input.status;
    }
    if (input.materialType) {
        materialQuery.materialType = input.materialType;
    }
    if (input.sectionSessionId !== undefined) {
        materialQuery.sectionSessionId = input.sectionSessionId;
    }
    if (input.search) {
        materialQuery.titleNormalized = { $regex: escapeRegex(normalizeTitle(input.search)), $options: "i" };
    }

    const [materials, total] = await Promise.all([
        SectionMaterial.find(materialQuery)
            .select(SECTION_MATERIAL_SELECT_FIELDS)
            .sort({ createdAt: -1, _id: -1 })
            .skip(input.skip)
            .limit(input.limit)
            .lean(),
        SectionMaterial.countDocuments(materialQuery),
    ]);

    return {
        materials: materials.map(toSectionMaterialListItem),
        pagination: toPagination({ page: input.page, limit: input.limit, total }),
    };
}

async function getSectionMaterialByIdForStaff({
    institutionId,
    sectionId,
    materialId,
    actorUserId,
    actorMembership,
}) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    const validSectionId = validateObjectId(sectionId, "sectionId");
    const validMaterialId = validateObjectId(materialId, "materialId");
    const { section, subject, schoolClass } = await loadSectionMaterialContext({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
    });

    await ensureStaffCanManageSectionMaterial({
        institutionId: validInstitutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const material = await loadSectionMaterialRecord({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        materialId: validMaterialId,
    });
    if (!material) {
        throw createError(404, "Section material not found");
    }

    return {
        material: toSectionMaterialResponse(material),
    };
}

async function updateSectionMaterial({
    institutionId,
    sectionId,
    materialId,
    actorUserId,
    actorMembership,
    payload,
    file,
}) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    const validSectionId = validateObjectId(sectionId, "sectionId");
    const validMaterialId = validateObjectId(materialId, "materialId");
    const { section, subject, schoolClass } = await loadSectionMaterialContext({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
    });

    await ensureStaffCanManageSectionMaterial({
        institutionId: validInstitutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const material = await loadSectionMaterialRecord({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        materialId: validMaterialId,
    });
    if (!material) {
        throw createError(404, "Section material not found");
    }

    ensureArchivedMaterialCanBeEdited(material);
    const updates = validateUpdateSectionMaterialInput(payload, file);

    if (updates.sectionSessionId !== undefined) {
        await loadSectionSessionForMaterial({
            institutionId: validInstitutionId,
            sectionId: validSectionId,
            sectionSessionId: updates.sectionSessionId,
        });
    }

    const updatedMaterial = await SectionMaterial.findOneAndUpdate(
        {
            _id: validMaterialId,
            institutionId: validInstitutionId,
            sectionId: validSectionId,
        },
        { $set: updates },
        { returnDocument: "after", runValidators: true }
    )
        .select(SECTION_MATERIAL_SELECT_FIELDS)
        .lean();

    if (!updatedMaterial) {
        throw createError(404, "Section material not found");
    }

    if (file && material.fileKey && material.fileKey !== file.filename) {
        removePrivateMaterialFile(material.fileKey);
    }

    return {
        material: toSectionMaterialResponse(updatedMaterial),
    };
}

async function updateSectionMaterialStatus({
    institutionId,
    sectionId,
    materialId,
    actorUserId,
    actorMembership,
    payload,
}) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    const validSectionId = validateObjectId(sectionId, "sectionId");
    const validMaterialId = validateObjectId(materialId, "materialId");
    const { section, subject, schoolClass } = await loadSectionMaterialContext({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
    });

    await ensureStaffCanManageSectionMaterial({
        institutionId: validInstitutionId,
        actorUserId,
        actorMembership,
        section,
        subject,
        schoolClass,
    });

    const material = await loadSectionMaterialRecord({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        materialId: validMaterialId,
    });
    if (!material) {
        throw createError(404, "Section material not found");
    }

    const input = validateSectionMaterialStatusUpdateInput(payload);
    resolveNextMaterialStatus(material.status, input.status);

    const updates = {
        status: input.status,
    };
    if (input.status === "published") {
        updates.publishedAt = material.publishedAt || new Date();
    }
    if (input.status === "archived") {
        updates.archivedAt = new Date();
    }

    const updatedMaterial = await SectionMaterial.findOneAndUpdate(
        {
            _id: validMaterialId,
            institutionId: validInstitutionId,
            sectionId: validSectionId,
        },
        { $set: updates },
        { returnDocument: "after", runValidators: true }
    )
        .select(SECTION_MATERIAL_SELECT_FIELDS)
        .lean();

    if (!updatedMaterial) {
        throw createError(404, "Section material not found");
    }

    return {
        material: toSectionMaterialResponse(updatedMaterial),
    };
}

async function listMySectionMaterials({ institutionId, actorUserId, actorMembership, query = {} }) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    ensureStudentMembership(actorUserId, actorMembership);
    if (normalizeId(actorMembership.institutionId) !== normalizeId(validInstitutionId)) {
        throw createError(403, "Institution access denied");
    }

    const input = validateStudentListQuery(query);
    const enrollmentQuery = {
        institutionId: validInstitutionId,
        studentMemberId: actorMembership._id,
        status: ACTIVE_ENROLLMENT_STATUS,
    };
    if (input.sectionId !== undefined) {
        enrollmentQuery.sectionId = input.sectionId;
    }

    const enrollments = await Enrollment.find(enrollmentQuery)
        .select("_id sectionId")
        .lean();

    if (!enrollments.length) {
        return {
            materials: [],
            pagination: toPagination({ page: input.page, limit: input.limit, total: 0 }),
        };
    }

    const sectionIds = [...new Set(enrollments.map((enrollment) => normalizeId(enrollment.sectionId)).filter(Boolean))];
    const materialQuery = {
        institutionId: validInstitutionId,
        sectionId: { $in: sectionIds },
        status: "published",
    };
    if (input.materialType) {
        materialQuery.materialType = input.materialType;
    }
    if (input.search) {
        materialQuery.titleNormalized = { $regex: escapeRegex(normalizeTitle(input.search)), $options: "i" };
    }

    const [materials, total] = await Promise.all([
        SectionMaterial.find(materialQuery)
            .select(SECTION_MATERIAL_SELECT_FIELDS)
            .sort({ publishedAt: -1, createdAt: -1, _id: -1 })
            .skip(input.skip)
            .limit(input.limit)
            .lean(),
        SectionMaterial.countDocuments(materialQuery),
    ]);

    return {
        materials: materials.map(toSectionMaterialListItem),
        pagination: toPagination({ page: input.page, limit: input.limit, total }),
    };
}

async function ensureStudentCanAccessSectionMaterial({
    institutionId,
    sectionId,
    actorMembership,
    material,
}) {
    if (material.status !== "published") {
        throw createError(404, "Section material not found");
    }

    await loadActiveStudentEnrollment({
        institutionId,
        sectionId,
        studentMemberId: actorMembership._id,
    });
}

async function getSectionMaterialFileAccess({
    institutionId,
    sectionId,
    materialId,
    actorUserId,
    actorMembership,
}) {
    const validInstitutionId = validateObjectId(institutionId, "institutionId");
    const validSectionId = validateObjectId(sectionId, "sectionId");
    const validMaterialId = validateObjectId(materialId, "materialId");

    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (normalizeId(actorMembership.institutionId) !== normalizeId(validInstitutionId)) {
        throw createError(403, "Institution access denied");
    }

    const { section, subject, schoolClass } = await loadSectionMaterialContext({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
    });

    const material = await loadSectionMaterialRecord({
        institutionId: validInstitutionId,
        sectionId: validSectionId,
        materialId: validMaterialId,
    });

    if (!material || !material.fileKey) {
        throw createError(404, "Section material file not found");
    }

    if (actorMembership.role === "student") {
        ensureStudentMembership(actorUserId, actorMembership);
        await ensureStudentCanAccessSectionMaterial({
            institutionId: validInstitutionId,
            sectionId: validSectionId,
            actorMembership,
            material,
        });
    } else {
        await ensureStaffCanManageSectionMaterial({
            institutionId: validInstitutionId,
            actorUserId,
            actorMembership,
            section,
            subject,
            schoolClass,
        });
    }

    const filePath = resolvePrivateMaterialFilePath(material.fileKey);
    try {
        await fs.promises.access(filePath, fs.constants.R_OK);
    } catch (_error) {
        throw createError(404, "Section material file not found");
    }

    return {
        filePath,
        filename: material.originalFilename || "section-material.pdf",
        mimeType: material.mimeType || "application/pdf",
    };
}

module.exports = {
    validateCreateSectionMaterialInput,
    validateUpdateSectionMaterialInput,
    validateSectionMaterialStatusUpdateInput,
    toSectionMaterialResponse,
    createSectionMaterial,
    listSectionMaterialsForStaff,
    getSectionMaterialByIdForStaff,
    updateSectionMaterial,
    updateSectionMaterialStatus,
    listMySectionMaterials,
    getSectionMaterialFileAccess,
    resolvePrivateMaterialFilePath,
    removePrivateMaterialFile,
    ensureStaffCanManageSectionMaterial,
    ensureStudentCanAccessSectionMaterial,
};
