const mongoose = require("mongoose");
const InstitutionBillingProfile = require("../models/InstitutionBillingProfile");
const Membership = require("../models/Membership");
const {
    ACTIVE_STAFF_ROLES,
    getBillingPlanConfig,
    getSeatCategoryForMembershipState,
    isPaidSubscriptionStatus,
} = require("./billingPlanConfig");

function createError(statusCode, message, extra = {}) {
    const error = new Error(message);
    error.statusCode = statusCode;
    Object.assign(error, extra);
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

function getInstitutionBillingEntitlements(profile) {
    const storedPlanConfig = getBillingPlanConfig(profile?.plan);
    const subscriptionStatus = profile?.status || null;
    const hasPaidAccess = Boolean(storedPlanConfig && isPaidSubscriptionStatus(subscriptionStatus));

    return {
        plan: storedPlanConfig ? storedPlanConfig.plan : null,
        billingInterval: storedPlanConfig ? storedPlanConfig.billingInterval : null,
        subscriptionStatus,
        hasPaidAccess,
        maxActiveStudents: hasPaidAccess ? storedPlanConfig.maxActiveStudents : 0,
        maxActiveStaff: hasPaidAccess ? storedPlanConfig.maxActiveStaff : 0,
        currentPeriodStart: profile?.currentPeriodStart || null,
        currentPeriodEnd: profile?.currentPeriodEnd || null,
        cancelAtPeriodEnd: profile?.cancelAtPeriodEnd === true,
        trialEnd: profile?.trialEnd || null,
    };
}

async function loadInstitutionBillingEntitlements({ institutionId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    const profile = await InstitutionBillingProfile.findOne({ institutionId }).lean();
    return getInstitutionBillingEntitlements(profile);
}

async function countInstitutionActiveSeats({ institutionId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    const [activeStudents, activeStaff] = await Promise.all([
        Membership.countDocuments({
            institutionId,
            role: "student",
            status: "active",
        }),
        Membership.countDocuments({
            institutionId,
            role: { $in: [...ACTIVE_STAFF_ROLES] },
            status: "active",
        }),
    ]);

    return {
        activeStudents,
        activeStaff,
    };
}

function createBillingLimitError({ entitlements, category, limit, currentCount }) {
    const label = category === "student" ? "student" : "staff";
    return createError(403, `Active ${label} membership limit reached`, {
        code: "BILLING_LIMIT_REACHED",
        details: {
            plan: entitlements.plan,
            category,
            limit,
            currentCount,
        },
    });
}

async function assertInstitutionWithinLimit({ institutionId, category }) {
    if (!["student", "staff"].includes(category)) {
        throw createError(500, "Invalid billing seat category");
    }

    const [entitlements, seatCounts] = await Promise.all([
        loadInstitutionBillingEntitlements({ institutionId }),
        countInstitutionActiveSeats({ institutionId }),
    ]);

    const limit = category === "student" ? entitlements.maxActiveStudents : entitlements.maxActiveStaff;
    const currentCount = category === "student" ? seatCounts.activeStudents : seatCounts.activeStaff;

    if (currentCount >= limit) {
        throw createBillingLimitError({
            entitlements,
            category,
            limit,
            currentCount,
        });
    }
}

async function assertMembershipSeatTransitionAllowed({
    institutionId,
    sourceMembership = null,
    destinationMembership,
}) {
    if (!destinationMembership || typeof destinationMembership !== "object") {
        throw createError(400, "Invalid membership transition");
    }

    const sourceCategory = sourceMembership
        ? getSeatCategoryForMembershipState(sourceMembership)
        : null;
    const destinationCategory = getSeatCategoryForMembershipState(destinationMembership);

    if (!destinationCategory || destinationCategory === sourceCategory) {
        return;
    }

    await assertInstitutionWithinLimit({
        institutionId,
        category: destinationCategory,
    });
}

module.exports = {
    assertInstitutionWithinLimit,
    assertMembershipSeatTransitionAllowed,
    countInstitutionActiveSeats,
    getInstitutionBillingEntitlements,
    loadInstitutionBillingEntitlements,
};
