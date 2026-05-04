const mongoose = require("mongoose");
const Institution = require("../models/Institution");
const Membership = require("../models/Membership");
const schoolAcademicProfileService = require("./schoolAcademicProfileService");
const universityAcademicProfileService = require("./universityAcademicProfileService");

const ACTIVE_MEMBERSHIP_STATUS = Membership.schema.path("status").defaultValue;
const ACADEMIC_PROFILE_ACCESS_MODES = {
    self: "self",
    staff: "staff",
};

function createError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
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

function validateObjectId(value, fieldName) {
    const normalized = normalizeId(value);
    if (!normalized || !isValidObjectId(normalized)) {
        throw createError(400, `${fieldName} is invalid`);
    }

    return normalized;
}

function ensureActorMembershipContext({ institutionId, actorUserId, actorMembership }) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    const actorInstitutionId = normalizeId(actorMembership.institutionId);
    if (!actorInstitutionId || actorInstitutionId !== normalizeId(institutionId)) {
        throw createError(403, "Institution access denied");
    }
}

function ensureSelfProfileActor({ institutionId, actorUserId, actorMembership }) {
    ensureActorMembershipContext({
        institutionId,
        actorUserId,
        actorMembership,
    });

    if (actorMembership.role !== "student") {
        throw createError(403, "Only students can view their own academic profile");
    }

    if (actorMembership.status !== undefined && actorMembership.status !== ACTIVE_MEMBERSHIP_STATUS) {
        throw createError(403, "Only active students can view their own academic profile");
    }
}

function ensureStaffProfileActor({ institutionId, actorUserId, actorMembership }) {
    ensureActorMembershipContext({
        institutionId,
        actorUserId,
        actorMembership,
    });

    if (actorMembership.role === "student") {
        throw createError(403, "Students can only view their own academic profile");
    }
}

async function loadInstitutionRecord(institutionId) {
    const institution = await Institution.findOne({ _id: institutionId }).select("_id type").lean();
    if (!institution) {
        throw createError(404, "Institution not found");
    }

    return institution;
}

async function dispatchAcademicProfile({
    institution,
    institutionId,
    studentMembershipId,
    actorUserId,
    actorMembership,
    query = {},
    accessMode,
}) {
    if (institution.type === "school") {
        return schoolAcademicProfileService.buildSchoolAcademicProfile({
            institutionId,
            studentMembershipId,
            actorUserId,
            actorMembership,
            academicYearId: query.academicYearId,
            semesterId: query.semesterId || null,
            accessMode,
        });
    }

    if (institution.type === "university") {
        return universityAcademicProfileService.buildUniversityAcademicProfile({
            institutionId,
            studentMembershipId,
            actorUserId,
            actorMembership,
            semesterId: query.semesterId || null,
            accessMode,
        });
    }

    throw createError(409, "Academic profile is not supported for this institution type");
}

async function buildMyAcademicProfile({
    institutionId,
    actorUserId,
    actorMembership,
    query = {},
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    ensureSelfProfileActor({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });

    const institution = await loadInstitutionRecord(normalizedInstitutionId);
    const academicProfile = await dispatchAcademicProfile({
        institution,
        institutionId: normalizedInstitutionId,
        studentMembershipId: normalizeId(actorMembership._id),
        actorUserId,
        actorMembership,
        query,
        accessMode: ACADEMIC_PROFILE_ACCESS_MODES.self,
    });

    return {
        academicProfile,
    };
}

async function buildStudentAcademicProfile({
    institutionId,
    studentMembershipId,
    actorUserId,
    actorMembership,
    query = {},
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedStudentMembershipId = validateObjectId(studentMembershipId, "studentMembershipId");
    ensureStaffProfileActor({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });

    const institution = await loadInstitutionRecord(normalizedInstitutionId);
    const academicProfile = await dispatchAcademicProfile({
        institution,
        institutionId: normalizedInstitutionId,
        studentMembershipId: normalizedStudentMembershipId,
        actorUserId,
        actorMembership,
        query,
        accessMode: ACADEMIC_PROFILE_ACCESS_MODES.staff,
    });

    return {
        academicProfile,
    };
}

module.exports = {
    ACADEMIC_PROFILE_ACCESS_MODES,
    buildMyAcademicProfile,
    buildStudentAcademicProfile,
};
