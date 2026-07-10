const Institution = require("../models/Institution");
const Membership = require("../models/Membership");
const MemberProfile = require("../models/MemberProfile");
const ResponsibilityAssignment = require("../models/ResponsibilityAssignment");
const Semester = require("../models/Semester");
const AcademicYear = require("../models/AcademicYear");
const Department = require("../models/Department");
const ClassLevel = require("../models/ClassLevel");
const Subject = require("../models/Subject");
const Section = require("../models/Section");

// True if the institution already has any type-specific academic structure, in which
// case its type must not change (D-004 / IM-1).
async function institutionHasAcademicStructure(institutionId) {
    const [dept, level, subject, section, semester, year] = await Promise.all([
        Department.exists({ institutionId }),
        ClassLevel.exists({ institutionId }),
        Subject.exists({ institutionId }),
        Section.exists({ institutionId }),
        Semester.exists({ institutionId }),
        AcademicYear.exists({ institutionId }),
    ]);
    return Boolean(dept || level || subject || section || semester || year);
}
const {
    ROLE_PERMISSIONS,
    RESPONSIBILITY_PERMISSIONS,
    isResponsibilityScopeAllowed,
} = require("../auth/permissions");
const { isResponsibilityAssignmentActiveNow } = require("../auth/scopedResponsibilities");

const INSTITUTION_TYPES = ["school", "university"];
const ACTIVE_CONTEXT_SORT = { startDate: -1, createdAt: -1, _id: -1 };

function createError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim();
}

function normalizeInstitutionType(value) {
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

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function formatDateOnly(value) {
    if (!value) {
        return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toISOString().slice(0, 10);
}

function toInstitutionResponse(institution) {
    return {
        id: institution._id.toString(),
        name: institution.name,
        type: institution.type,
        logoUrl: institution.logoUrl,
        status: institution.status,
        policies: institution.policies,
        ownerUserId: institution.ownerUserId?.toString() || null,
        updatedAt: institution.updatedAt,
    };
}

function toMemberProfileSummary(profile) {
    if (!profile) {
        return null;
    }

    return {
        fullName: profile.fullName || null,
        firstName: profile.firstName || null,
        lastName: profile.lastName || null,
        mobile: profile.mobile || null,
        profilePictureUrl: profile.profilePictureUrl || null,
    };
}

function toScopedCapability(assignment) {
    return {
        responsibilityType: assignment.responsibilityType,
        scopeType: assignment.scopeType,
        scopeId: normalizeId(assignment.scopeId),
        permissions: [...(RESPONSIBILITY_PERMISSIONS[assignment.responsibilityType] || [])],
    };
}

function toActiveSemesterSummary(semester) {
    if (!semester) {
        return null;
    }

    return {
        id: normalizeId(semester._id),
        academicYearId: normalizeId(semester.academicYearId),
        name: semester.name || null,
        startDate: formatDateOnly(semester.startDate),
        endDate: formatDateOnly(semester.endDate),
        status: semester.status,
    };
}

function toActiveAcademicYearSummary(academicYear) {
    if (!academicYear) {
        return null;
    }

    return {
        id: normalizeId(academicYear._id),
        name: academicYear.name,
        startDate: formatDateOnly(academicYear.startDate),
        endDate: formatDateOnly(academicYear.endDate),
        status: academicYear.status,
    };
}

function toMembershipSummary(membership) {
    return {
        institutionId: membership.institutionId.toString(),
        role: membership.role,
        status: membership.status,
        joinedAt: membership.joinedAt,
    };
}

function groupByInstitutionId(records) {
    const grouped = new Map();
    for (const record of records) {
        const institutionId = normalizeId(record.institutionId);
        if (!institutionId) {
            continue;
        }

        if (!grouped.has(institutionId)) {
            grouped.set(institutionId, []);
        }

        grouped.get(institutionId).push(record);
    }

    return grouped;
}

function mapFirstActiveByInstitutionId(records) {
    const mapped = new Map();
    for (const record of records) {
        const institutionId = normalizeId(record.institutionId);
        if (!institutionId || mapped.has(institutionId)) {
            continue;
        }

        mapped.set(institutionId, record);
    }

    return mapped;
}

function isSupportedActiveAssignment(assignment, now) {
    if (!RESPONSIBILITY_PERMISSIONS[assignment.responsibilityType]) {
        return false;
    }

    if (!isResponsibilityScopeAllowed(assignment.responsibilityType, assignment.scopeType)) {
        return false;
    }

    return isResponsibilityAssignmentActiveNow(assignment, now);
}

function pickActiveInstitution(memberships) {
    const activeMemberships = memberships.filter((item) => item.membershipStatus === "active");
    if (!activeMemberships.length) {
        return memberships[0] || null;
    }

    const activeAdminMembership = activeMemberships.find((item) => item.role === "admin");
    return activeAdminMembership || activeMemberships[0];
}

function buildOnboarding({ user, memberships, activeInstitution }) {
    const hasInstitutions = memberships.length > 0;
    const hasActiveMembership = memberships.some((item) => item.membershipStatus === "active");
    const hasAdminMembership = memberships.some(
        (item) => item.membershipStatus === "active" && item.role === "admin"
    );

    let nextStep = null;
    if (!user.isEmailVerified) {
        nextStep = "verify_email";
    } else if (!hasInstitutions) {
        nextStep = "create_or_join_institution";
    } else if (!hasActiveMembership) {
        nextStep = "wait_for_membership_activation";
    } else if (hasAdminMembership) {
        nextStep = "build_academic_structure";
    }

    return {
        isEmailVerified: user.isEmailVerified,
        hasInstitutions,
        hasActiveMembership,
        hasAdminMembership,
        activeInstitutionType: activeInstitution?.type || null,
        nextStep,
    };
}

function buildInstitutionCreate(payload) {
    if (!isPlainObject(payload)) {
        throw createError(400, "Invalid request body");
    }

    const name = normalizeString(payload.name);
    if (!name) {
        throw createError(400, "Institution name is required");
    }

    const type = normalizeInstitutionType(payload.type);
    if (!type) {
        throw createError(400, "Institution type is required");
    }

    if (!INSTITUTION_TYPES.includes(type)) {
        throw createError(400, "Invalid institution type");
    }

    return {
        name,
        type,
    };
}

async function getMyInstitutionContext(authUser) {
    if (!authUser?.id) {
        throw createError(401, "Unauthorized");
    }

    const rawMemberships = await Membership.find({ userId: authUser.id })
        .select("_id institutionId role status joinedAt")
        .sort({ createdAt: 1 })
        .lean();

    const institutionIds = rawMemberships.map((item) => item.institutionId);
    const membershipIds = rawMemberships.map((item) => item._id);
    const [
        institutions,
        profiles,
        responsibilityAssignments,
        activeSemesters,
        activeAcademicYears,
    ] = await Promise.all([
        Institution.find({ _id: { $in: institutionIds } })
            .select("_id name type status ownerUserId")
            .lean(),
        MemberProfile.find({
            institutionId: { $in: institutionIds },
            membershipId: { $in: membershipIds },
        })
            .select("membershipId institutionId fullName firstName lastName mobile profilePictureUrl")
            .lean(),
        ResponsibilityAssignment.find({
            institutionId: { $in: institutionIds },
            userId: authUser.id,
            isActive: true,
        })
            .select("_id institutionId userId scopeType scopeId responsibilityType isActive startAt endAt")
            .lean(),
        Semester.find({
            institutionId: { $in: institutionIds },
            status: "active",
        })
            .select("_id institutionId academicYearId name startDate endDate status createdAt")
            .sort(ACTIVE_CONTEXT_SORT)
            .lean(),
        AcademicYear.find({
            institutionId: { $in: institutionIds },
            status: "active",
        })
            .select("_id institutionId name startDate endDate status createdAt")
            .sort(ACTIVE_CONTEXT_SORT)
            .lean(),
    ]);

    const institutionMap = new Map(institutions.map((item) => [item._id.toString(), item]));
    const profileMap = new Map(
        profiles.map((profile) => [`${normalizeId(profile.institutionId)}:${normalizeId(profile.membershipId)}`, profile])
    );
    const activeAssignmentsByInstitutionId = groupByInstitutionId(
        responsibilityAssignments.filter((assignment) => isSupportedActiveAssignment(assignment, new Date()))
    );
    const activeSemesterMap = mapFirstActiveByInstitutionId(activeSemesters);
    const activeAcademicYearMap = mapFirstActiveByInstitutionId(activeAcademicYears);
    const membershipItems = rawMemberships
        .map((membership) => {
            const institutionId = normalizeId(membership.institutionId);
            const membershipId = normalizeId(membership._id);
            const institution = institutionMap.get(institutionId);
            if (!institution) {
                return null;
            }

            const profile = profileMap.get(`${institutionId}:${membershipId}`) || null;
            const scopedCapabilities = (activeAssignmentsByInstitutionId.get(institutionId) || [])
                .map(toScopedCapability);

            return {
                institutionId,
                membershipId,
                name: institution.name,
                type: institution.type,
                institutionStatus: institution.status,
                role: membership.role,
                membershipStatus: membership.status,
                joinedAt: membership.joinedAt,
                isOwner: normalizeId(institution.ownerUserId) === normalizeId(authUser.id),
                memberProfile: toMemberProfileSummary(profile),
                permissions: [...(ROLE_PERMISSIONS[membership.role] || [])],
                scopedCapabilities,
                activeSemester: toActiveSemesterSummary(activeSemesterMap.get(institutionId)),
                activeAcademicYear: toActiveAcademicYearSummary(activeAcademicYearMap.get(institutionId)),
            };
        })
        .filter(Boolean);

    const activeInstitution = pickActiveInstitution(membershipItems);

    return {
        user: {
            id: authUser.id,
            email: authUser.email,
            status: authUser.status,
            isEmailVerified: authUser.isEmailVerified,
        },
        institutions: membershipItems,
        activeInstitutionId: activeInstitution ? activeInstitution.institutionId : null,
        onboarding: buildOnboarding({
            user: authUser,
            memberships: membershipItems,
            activeInstitution,
        }),
    };
}

async function createInstitution(authUser, payload) {
    if (!authUser?.id) {
        throw createError(401, "Unauthorized");
    }

    const input = buildInstitutionCreate(payload);

    let institution = null;
    let membership = null;
    try {
        institution = await Institution.create({
            name: input.name,
            type: input.type,
            ownerUserId: authUser.id,
        });

        membership = await Membership.create({
            userId: authUser.id,
            institutionId: institution._id,
            role: "admin",
            status: "active",
        });
    } catch (error) {
        if (membership?._id) {
            await Membership.deleteOne({ _id: membership._id });
        }

        if (institution?._id) {
            await Institution.deleteOne({ _id: institution._id });
        }

        throw error;
    }

    return {
        institution: toInstitutionResponse(institution),
        membership: toMembershipSummary(membership),
    };
}

function buildInstitutionUpdate(payload) {
    if (!isPlainObject(payload)) {
        throw createError(400, "Invalid request body");
    }

    const updates = {};

    if (payload.name !== undefined) {
        const normalizedName = normalizeString(payload.name);
        if (!normalizedName) {
            throw createError(400, "Institution name cannot be empty");
        }
        updates.name = normalizedName;
    }

    if (payload.type !== undefined) {
        const normalizedType = normalizeString(payload.type).toLowerCase();
        if (!INSTITUTION_TYPES.includes(normalizedType)) {
            throw createError(400, "type must be school or university");
        }
        updates.type = normalizedType;
    }

    if (payload.logoUrl !== undefined) {
        if (payload.logoUrl === null) {
            updates.logoUrl = null;
        } else {
            const normalizedLogoUrl = normalizeString(payload.logoUrl);
            if (!normalizedLogoUrl) {
                throw createError(400, "logoUrl cannot be empty");
            }
            updates.logoUrl = normalizedLogoUrl;
        }
    }

    if (payload.policies !== undefined) {
        if (!isPlainObject(payload.policies)) {
            throw createError(400, "policies must be an object");
        }

        const allowedPolicyKeys = [
            "warnAfterAbsences",
            "dropAfterAbsences",
            "lateToAbsenceRatio",
            "excusedCountsAsAbsence",
            "maxSubjectsPerSemester",
            "addDropDeadlineWeek",
            "defaultHourlyRate",
        ];

        Object.keys(payload.policies).forEach((key) => {
            if (!allowedPolicyKeys.includes(key)) {
                throw createError(400, `Unknown policy field: ${key}`);
            }

            const value = payload.policies[key];
            if (key === "warnAfterAbsences") {
                if (!Number.isInteger(value) || value <= 0) {
                    throw createError(400, "warnAfterAbsences must be positive integer");
                }
            }

            if (key === "lateToAbsenceRatio") {
                if (!isFiniteNumber(value) || value <= 0) {
                    throw createError(400, "lateToAbsenceRatio must be number > 0");
                }
            }

            if (key === "excusedCountsAsAbsence") {
                if (typeof value !== "boolean") {
                    throw createError(400, "excusedCountsAsAbsence must be boolean");
                }
            }

            updates[`policies.${key}`] = payload.policies[key];
        });
    }

    if (!Object.keys(updates).length) {
        throw createError(400, "No valid fields to update");
    }

    return updates;
}

async function updateInstitution(institutionId, payload) {
    const updates = buildInstitutionUpdate(payload);

    // Institution type is meaningful only while the institution is empty (D-004 / IM-1).
    // Changing it later would orphan school-vs-university-specific structure, so guard it:
    // no-op if unchanged, explicit 409 if academic data exists — never a silent drop.
    if (updates.type !== undefined) {
        const current = await Institution.findById(institutionId).select("_id type").lean();
        if (!current) {
            throw createError(404, "Institution not found");
        }
        if (updates.type === current.type) {
            delete updates.type; // no-op change; $set may end up empty, which is fine
        } else if (await institutionHasAcademicStructure(institutionId)) {
            throw createError(
                409,
                "Institution type cannot be changed after academic structure exists"
            );
        }
    }

    const institution = await Institution.findByIdAndUpdate(
        institutionId,
        { $set: updates },
        { returnDocument: "after", runValidators: true }
    )
        .select("_id name type logoUrl status policies ownerUserId updatedAt")
        .lean();

    if (!institution) {
        throw createError(404, "Institution not found");
    }

    return {
        institution: toInstitutionResponse(institution),
    };
}

async function updateInstitutionLogo(institutionId, logoUrl) {
    const normalizedLogoUrl = normalizeString(logoUrl);
    if (!normalizedLogoUrl) {
        throw createError(400, "logoUrl is required");
    }

    const institution = await Institution.findByIdAndUpdate(
        institutionId,
        { $set: { logoUrl: normalizedLogoUrl } },
        { returnDocument: "after", runValidators: true }
    )
        .select("_id name type logoUrl status policies ownerUserId updatedAt")
        .lean();

    if (!institution) {
        throw createError(404, "Institution not found");
    }

    return {
        institution: toInstitutionResponse(institution),
    };
}

module.exports = {
    createInstitution,
    getMyInstitutionContext,
    updateInstitution,
    updateInstitutionLogo,
};
