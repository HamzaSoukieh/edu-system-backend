const Institution = require("../models/Institution");
const Membership = require("../models/Membership");

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

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
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
    } else if (!hasAdminMembership) {
        nextStep = "wait_for_admin_access";
    } else {
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

async function getMyInstitutionContext(authUser) {
    if (!authUser?.id) {
        throw createError(401, "Unauthorized");
    }

    const rawMemberships = await Membership.find({ userId: authUser.id })
        .select("institutionId role status joinedAt")
        .sort({ createdAt: 1 })
        .lean();

    const institutionIds = rawMemberships.map((item) => item.institutionId);
    const institutions = await Institution.find({ _id: { $in: institutionIds } })
        .select("_id name type status ownerUserId")
        .lean();

    const institutionMap = new Map(institutions.map((item) => [item._id.toString(), item]));
    const membershipItems = rawMemberships
        .map((membership) => {
            const institution = institutionMap.get(membership.institutionId.toString());
            if (!institution) {
                return null;
            }

            return {
                institutionId: institution._id.toString(),
                name: institution.name,
                type: institution.type,
                institutionStatus: institution.status,
                role: membership.role,
                membershipStatus: membership.status,
                joinedAt: membership.joinedAt,
                isOwner: institution.ownerUserId?.toString() === authUser.id,
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
    getMyInstitutionContext,
    updateInstitution,
    updateInstitutionLogo,
};
