const mongoose = require("mongoose");
const Institution = require("../models/Institution");
const InstitutionBillingProfile = require("../models/InstitutionBillingProfile");
const Membership = require("../models/Membership");
const PlatformAdmin = require("../models/PlatformAdmin");
const PlatformAuditLog = require("../models/PlatformAuditLog");
const StripeWebhookEvent = require("../models/StripeWebhookEvent");
const platformPermissions = require("../auth/platformPermissions");
const { PLATFORM_AUDIT_ACTIONS } = require("../auth/platformAuditActions");
const { BILLING_PLANS, SUBSCRIPTION_STATUSES } = require("./billingConstants");
const { getInstitutionBillingEntitlements } = require("./billingEntitlementService");
const { resolveBillingPlanByStripePriceId } = require("./billingPlanConfig");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const BILLING_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const INSTITUTION_TYPES = ["school", "university"];
const INSTITUTION_STATUSES = ["active", "archived"];
const AUDIT_RESULTS = ["success", "denied", "failed"];
const ALLOWED_AUDIT_METADATA_FIELDS = ["page", "limit", "filterCount", "returnedCount", "errorCode"];
const FAILED_AUDIT_ERROR_CODE = "PLATFORM_OPERATION_FAILED";
const INSTITUTION_QUERY_FIELDS = ["page", "limit", "status", "type", "search", "plan", "subscriptionStatus"];
const WEBHOOK_QUERY_FIELDS = ["page", "limit", "eventType", "status", "institutionId", "stripeEventId", "dateFrom", "dateTo"];
const AUDIT_QUERY_FIELDS = ["page", "limit", "actorPlatformAdminId", "action", "targetType", "targetId", "institutionId", "result", "dateFrom", "dateTo"];

function createError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeId(value) {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    return normalized || null;
}

function requireObjectId(value, field) {
    const normalized = normalizeId(value);
    if (!normalized || !mongoose.Types.ObjectId.isValid(normalized)) {
        throw createError(400, `${field} must be a valid id`);
    }
    return normalized;
}

function parsePagination(query) {
    const page = query.page === undefined || query.page === "" ? DEFAULT_PAGE : Number(query.page);
    const limit = query.limit === undefined || query.limit === "" ? DEFAULT_LIMIT : Number(query.limit);
    if (!Number.isInteger(page) || page < 1) throw createError(400, "page must be a positive integer");
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        throw createError(400, `limit must be an integer between 1 and ${MAX_LIMIT}`);
    }
    return { page, limit, skip: (page - 1) * limit };
}

function rejectUnexpectedQueryFields(query, allowed) {
    const unexpected = Object.keys(query).find((field) => !allowed.includes(field));
    if (unexpected) throw createError(400, `Unexpected query field: ${unexpected}`);
}

function parseEnum(value, field, allowed) {
    const normalized = normalizeString(value).toLowerCase();
    if (!normalized) return null;
    if (!allowed.includes(normalized)) throw createError(400, `${field} must be one of: ${allowed.join(", ")}`);
    return normalized;
}

function parseDate(value, field, endOfDay = false) {
    const normalized = normalizeString(value);
    if (!normalized) return null;
    if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(normalized)) throw createError(400, `${field} must be a valid date`);
    const date = new Date(endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? `${normalized}T23:59:59.999Z` : normalized);
    if (Number.isNaN(date.getTime())) throw createError(400, `${field} must be a valid date`);
    return date;
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function resolveAndAssertPlatformActor(context, permission) {
    const adminId = requireObjectId(context?.platformAdminId, "platformAdminId");
    const userId = requireObjectId(context?.actorUserId, "actorUserId");

    const platformAdmin = await PlatformAdmin.findOne({
        _id: adminId,
        userId,
        status: "active",
    }).select("_id userId role status").lean();

    if (!platformAdmin || platformAdmin.status !== "active" || normalizeId(platformAdmin.userId) !== userId) {
        throw createError(403, "Platform access denied");
    }

    const permissions = platformPermissions.getPlatformRolePermissions(platformAdmin.role);
    if (!platformAdmin.role || !permissions || !permissions.includes(permission)) {
        throw createError(403, "Platform permission denied");
    }

    return {
        adminId,
        userId,
        role: platformAdmin.role,
        permissions,
    };
}

function toDateOrNull(value) {
    return value || null;
}

function safeAuditMetadata(metadata) {
    const output = {};
    for (const field of ALLOWED_AUDIT_METADATA_FIELDS) {
        if (["string", "number", "boolean"].includes(typeof metadata?.[field])) output[field] = metadata[field];
    }
    return output;
}

async function writeAudit(actor, context, entry) {
    await PlatformAuditLog.create({
        actorPlatformAdminId: actor.adminId,
        actorUserId: actor.userId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: normalizeString(entry.targetId) || null,
        institutionId: entry.institutionId || null,
        reason: null,
        metadata: safeAuditMetadata(entry.metadata),
        ipAddress: normalizeString(context.ipAddress).slice(0, 100) || null,
        userAgent: normalizeString(context.userAgent).slice(0, 500) || null,
        result: entry.result || "success",
    });
}

function validObjectIdOrNull(value) {
    const normalized = normalizeId(value);
    return normalized && mongoose.Types.ObjectId.isValid(normalized) ? normalized : null;
}

async function writeFailedAuditSafely(actor, context, entry) {
    try {
        await writeAudit(actor, context, {
            action: entry.action,
            targetType: entry.targetType,
            targetId: entry.targetId || null,
            institutionId: entry.institutionId || null,
            metadata: { errorCode: FAILED_AUDIT_ERROR_CODE },
            result: "failed",
        });
    } catch (_auditError) {
        // Preserve the original operation error when best-effort failure auditing is unavailable.
    }
}

async function executePlatformOperation({ context, requiredPermission, audit, operation }) {
    const actor = await resolveAndAssertPlatformActor(context, requiredPermission);
    try {
        return await operation(actor);
    } catch (error) {
        await writeFailedAuditSafely(actor, context, audit);
        throw error;
    }
}

function toPagination(page, limit, total) {
    return { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) };
}

function toCounts(row = {}) {
    const totalMemberships = row.totalMemberships || 0;
    const activeMemberships = row.activeMemberships || 0;
    const activeAdmins = row.activeAdmins || 0;
    const activeInstructors = row.activeInstructors || 0;
    const activeStudents = row.activeStudents || 0;
    return {
        totalUsers: row.totalUsers || 0,
        totalMemberships,
        activeMemberships,
        inactiveMemberships: Math.max(0, totalMemberships - activeMemberships),
        suspendedMemberships: row.suspendedMemberships || 0,
        activeStudents,
        activeAdmins,
        activeInstructors,
        activeStaff: activeAdmins + activeInstructors,
    };
}

function toBilling(profile) {
    const entitlements = getInstitutionBillingEntitlements(profile);
    return {
        plan: entitlements.plan,
        billingInterval: entitlements.billingInterval,
        subscriptionStatus: entitlements.subscriptionStatus,
        hasPaidAccess: entitlements.hasPaidAccess,
        currentPeriodStart: toDateOrNull(entitlements.currentPeriodStart),
        currentPeriodEnd: toDateOrNull(entitlements.currentPeriodEnd),
        cancelAtPeriodEnd: entitlements.cancelAtPeriodEnd,
        trialEnd: toDateOrNull(entitlements.trialEnd),
    };
}

function toSeatUsage(profile, counts) {
    const entitlements = getInstitutionBillingEntitlements(profile);
    return {
        activeStudents: counts.activeStudents,
        maxActiveStudents: entitlements.maxActiveStudents,
        remainingStudentSeats: Math.max(0, entitlements.maxActiveStudents - counts.activeStudents),
        activeStaff: counts.activeStaff,
        maxActiveStaff: entitlements.maxActiveStaff,
        remainingStaffSeats: Math.max(0, entitlements.maxActiveStaff - counts.activeStaff),
    };
}

function deriveBillingSync(profile, webhook = {}) {
    let state = "unknown";
    if (!profile) state = "missing_profile";
    else if (webhook.failedWebhookCount > 0) state = "webhook_failed";
    else if (!profile.plan) state = "unknown_plan";
    else if (!profile.stripeCustomerId) state = "missing_customer_mapping";
    else if (!profile.stripeSubscriptionId) state = "missing_subscription_mapping";
    else if (!profile.stripePriceId || resolveBillingPlanByStripePriceId(profile.stripePriceId)?.plan !== profile.plan) state = "unknown_price";
    else if (!webhook.lastSuccessfulWebhookAt || Date.now() - new Date(webhook.lastSuccessfulWebhookAt).getTime() > BILLING_STALE_MS) state = "stale";
    else state = "synced";

    return {
        state,
        lastWebhookAt: webhook.lastWebhookAt || null,
        lastSuccessfulWebhookAt: webhook.lastSuccessfulWebhookAt || null,
        failedWebhookCount: webhook.failedWebhookCount || 0,
        latestFailureAt: webhook.latestFailureAt || null,
    };
}

function buildMembershipAggregation(institutionIds) {
    return [
        { $match: { institutionId: { $in: institutionIds } } },
        { $group: {
            _id: "$institutionId",
            userIds: { $addToSet: "$userId" },
            totalMemberships: { $sum: 1 },
            activeMemberships: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
            suspendedMemberships: { $sum: { $cond: [{ $eq: ["$status", "suspended"] }, 1, 0] } },
            activeStudents: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "active"] }, { $eq: ["$role", "student"] }] }, 1, 0] } },
            activeAdmins: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "active"] }, { $eq: ["$role", "admin"] }] }, 1, 0] } },
            activeInstructors: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "active"] }, { $eq: ["$role", "instructor"] }] }, 1, 0] } },
        } },
        { $project: { totalUsers: { $size: "$userIds" }, totalMemberships: 1, activeMemberships: 1, suspendedMemberships: 1, activeStudents: 1, activeAdmins: 1, activeInstructors: 1 } },
    ];
}

function buildWebhookAggregation(institutionIds) {
    return [
        { $match: { institutionId: { $in: institutionIds } } },
        { $group: {
            _id: "$institutionId",
            lastWebhookAt: { $max: "$updatedAt" },
            lastSuccessfulWebhookAt: { $max: { $cond: [{ $eq: ["$status", "processed"] }, "$processedAt", null] } },
            failedWebhookCount: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
            latestFailureAt: { $max: { $cond: [{ $eq: ["$status", "failed"] }, "$updatedAt", null] } },
        } },
    ];
}

async function loadOperationalMaps(institutions, { includeBilling = true, includeWebhooks = true } = {}) {
    const ids = institutions.map((item) => item._id);
    if (ids.length === 0) return { profiles: new Map(), counts: new Map(), webhooks: new Map() };
    const [profiles, countRows, webhookRows] = await Promise.all([
        includeBilling || includeWebhooks
            ? InstitutionBillingProfile.find({ institutionId: { $in: ids } }).lean()
            : Promise.resolve([]),
        Membership.aggregate(buildMembershipAggregation(ids)),
        includeWebhooks
            ? StripeWebhookEvent.aggregate(buildWebhookAggregation(ids))
            : Promise.resolve([]),
    ]);
    return {
        profiles: new Map(profiles.map((row) => [String(row.institutionId), row])),
        counts: new Map(countRows.map((row) => [String(row._id), toCounts(row)])),
        webhooks: new Map(webhookRows.map((row) => [String(row._id), row])),
    };
}

function validateInstitutionListQuery(query = {}) {
    rejectUnexpectedQueryFields(query, INSTITUTION_QUERY_FIELDS);
    const pagination = parsePagination(query);
    const search = normalizeString(query.search);
    if (search.length > 100) throw createError(400, "search must be at most 100 characters");
    return {
        ...pagination,
        status: parseEnum(query.status, "status", INSTITUTION_STATUSES),
        type: parseEnum(query.type, "type", INSTITUTION_TYPES),
        plan: parseEnum(query.plan, "plan", BILLING_PLANS),
        subscriptionStatus: parseEnum(query.subscriptionStatus, "subscriptionStatus", SUBSCRIPTION_STATUSES),
        search,
    };
}

async function listInstitutions({ context, query = {} }) {
    return executePlatformOperation({
        context,
        requiredPermission: "platform.institutions.read",
        audit: {
            action: PLATFORM_AUDIT_ACTIONS.INSTITUTIONS_LIST,
            targetType: "institution_collection",
        },
        operation: async (actor) => {
            const input = validateInstitutionListQuery(query);
            const includeBilling = actor.permissions.includes("platform.billing.read");
            const includeWebhooks = actor.permissions.includes("platform.webhooks.read");
            if ((input.plan || input.subscriptionStatus) && !includeBilling) {
                throw createError(403, "Platform permission denied");
            }

            const filter = {};
            if (input.status) filter.status = input.status;
            if (input.type) filter.type = input.type;
            if (input.search) filter.name = { $regex: escapeRegex(input.search), $options: "i" };
            if (input.plan || input.subscriptionStatus) {
                const billingFilter = {};
                if (input.plan) billingFilter.plan = input.plan;
                if (input.subscriptionStatus) billingFilter.status = input.subscriptionStatus;
                const matchingProfiles = await InstitutionBillingProfile.find(billingFilter).select("institutionId").lean();
                filter._id = { $in: matchingProfiles.map((row) => row.institutionId) };
            }

            const [institutions, total] = await Promise.all([
                Institution.find(filter).select("_id name type status createdAt updatedAt").sort({ createdAt: -1, _id: -1 }).skip(input.skip).limit(input.limit).lean(),
                Institution.countDocuments(filter),
            ]);
            const maps = await loadOperationalMaps(institutions, { includeBilling, includeWebhooks });
            const items = institutions.map((institution) => {
                const id = String(institution._id);
                const profile = maps.profiles.get(id) || null;
                const counts = maps.counts.get(id) || toCounts();
                const item = {
                    institutionId: id,
                    name: institution.name,
                    type: institution.type,
                    status: institution.status,
                    counts: {
                        totalMemberships: counts.totalMemberships,
                        activeMemberships: counts.activeMemberships,
                        activeStudents: counts.activeStudents,
                        activeStaff: counts.activeStaff,
                    },
                };
                if (includeBilling) {
                    const seatUsage = toSeatUsage(profile, counts);
                    item.billing = toBilling(profile);
                    item.seatUsage = {
                        activeStudents: seatUsage.activeStudents,
                        maxActiveStudents: seatUsage.maxActiveStudents,
                        activeStaff: seatUsage.activeStaff,
                        maxActiveStaff: seatUsage.maxActiveStaff,
                    };
                }
                if (includeWebhooks) {
                    const sync = deriveBillingSync(profile, maps.webhooks.get(id));
                    item.billingSync = {
                        state: sync.state,
                        lastWebhookAt: sync.lastWebhookAt,
                        failedWebhookCount: sync.failedWebhookCount,
                    };
                }
                return item;
            });
            await writeAudit(actor, context, {
                action: PLATFORM_AUDIT_ACTIONS.INSTITUTIONS_LIST,
                targetType: "institution_collection",
                metadata: { page: input.page, limit: input.limit, returnedCount: items.length },
            });
            return { items, pagination: toPagination(input.page, input.limit, total) };
        },
    });
}

async function loadInstitutionOperationalDetail(institutionId, options) {
    const id = requireObjectId(institutionId, "institutionId");
    const institution = await Institution.findOne({ _id: id }).select("_id name type status createdAt updatedAt").lean();
    if (!institution) throw createError(404, "Institution not found");
    const maps = await loadOperationalMaps([institution], options);
    const profile = maps.profiles.get(id) || null;
    const counts = maps.counts.get(id) || toCounts();
    return { id, institution, profile, counts, webhook: maps.webhooks.get(id) };
}

function mapInstitutionDetail(data, { includeBilling, includeWebhooks }) {
    const result = {
        institution: {
            institutionId: data.id,
            name: data.institution.name,
            type: data.institution.type,
            status: data.institution.status,
            createdAt: data.institution.createdAt,
            updatedAt: data.institution.updatedAt,
        },
        counts: data.counts,
    };
    if (includeBilling) {
        const billing = toBilling(data.profile);
        billing.stripeCustomerId = data.profile?.stripeCustomerId || null;
        billing.stripeSubscriptionId = data.profile?.stripeSubscriptionId || null;
        billing.stripePriceId = data.profile?.stripePriceId || null;
        result.billing = billing;
        result.seatUsage = toSeatUsage(data.profile, data.counts);
    }
    if (includeWebhooks) result.billingSync = deriveBillingSync(data.profile, data.webhook);
    return result;
}

async function getInstitutionSummary({ context, institutionId }) {
    const safeInstitutionId = validObjectIdOrNull(institutionId);
    return executePlatformOperation({
        context,
        requiredPermission: "platform.institutions.read",
        audit: {
            action: PLATFORM_AUDIT_ACTIONS.INSTITUTION_VIEW,
            targetType: "institution",
            targetId: safeInstitutionId,
            institutionId: safeInstitutionId,
        },
        operation: async (actor) => {
            const includeBilling = actor.permissions.includes("platform.billing.read");
            const includeWebhooks = actor.permissions.includes("platform.webhooks.read");
            const data = await loadInstitutionOperationalDetail(institutionId, { includeBilling, includeWebhooks });
            const result = mapInstitutionDetail(data, { includeBilling, includeWebhooks });
            await writeAudit(actor, context, {
                action: PLATFORM_AUDIT_ACTIONS.INSTITUTION_VIEW,
                targetType: "institution",
                targetId: data.id,
                institutionId: data.id,
            });
            return result;
        },
    });
}

function sanitizeErrorMessage(value) {
    let message = normalizeString(value) || "Stripe webhook processing failed";
    message = message
        .replace(/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_]+\b/gi, "[redacted]")
        .replace(/\bwhsec_[A-Za-z0-9_]+\b/gi, "[redacted]")
        .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
        .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, "[redacted]");
    return message.slice(0, 500);
}

function toWebhookResponse(row) {
    return {
        webhookEventId: String(row._id),
        stripeEventId: row.stripeEventId,
        eventType: row.type,
        status: row.status,
        institutionId: row.institutionId ? String(row.institutionId) : null,
        errorMessage: sanitizeErrorMessage(row.errorMessage),
        attemptCount: Number.isInteger(row.attemptCount) ? row.attemptCount : 1,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        processedAt: row.processedAt || null,
    };
}

function validateWebhookQuery(query = {}, fixedInstitutionId = null) {
    const allowedFields = fixedInstitutionId
        ? WEBHOOK_QUERY_FIELDS.filter((field) => field !== "institutionId")
        : WEBHOOK_QUERY_FIELDS;
    rejectUnexpectedQueryFields(query, allowedFields);
    const pagination = parsePagination(query);
    const eventType = normalizeString(query.eventType);
    const stripeEventId = normalizeString(query.stripeEventId);
    if (eventType.length > 150) throw createError(400, "eventType must be at most 150 characters");
    if (stripeEventId.length > 150) throw createError(400, "stripeEventId must be at most 150 characters");
    const institutionId = fixedInstitutionId || (query.institutionId ? requireObjectId(query.institutionId, "institutionId") : null);
    const dateFrom = parseDate(query.dateFrom, "dateFrom");
    const dateTo = parseDate(query.dateTo, "dateTo", true);
    if (dateFrom && dateTo && dateFrom > dateTo) throw createError(400, "dateFrom must be before dateTo");
    if (query.status && normalizeString(query.status).toLowerCase() !== "failed") throw createError(400, "Only failed webhook events are available");
    return { ...pagination, eventType, stripeEventId, institutionId, dateFrom, dateTo };
}

async function queryFailedWebhooks(input) {
    const filter = { status: "failed" };
    if (input.eventType) filter.type = input.eventType;
    if (input.stripeEventId) filter.stripeEventId = input.stripeEventId;
    if (input.institutionId) filter.institutionId = input.institutionId;
    if (input.dateFrom || input.dateTo) {
        filter.createdAt = {};
        if (input.dateFrom) filter.createdAt.$gte = input.dateFrom;
        if (input.dateTo) filter.createdAt.$lte = input.dateTo;
    }
    const [rows, total] = await Promise.all([
        StripeWebhookEvent.find(filter).select("_id stripeEventId type status institutionId errorMessage attemptCount createdAt updatedAt processedAt").sort({ updatedAt: -1, _id: -1 }).skip(input.skip).limit(input.limit).lean(),
        StripeWebhookEvent.countDocuments(filter),
    ]);
    return { items: rows.map(toWebhookResponse), pagination: toPagination(input.page, input.limit, total) };
}

async function listFailedWebhookEvents({ context, query = {} }) {
    return executePlatformOperation({
        context,
        requiredPermission: "platform.webhooks.read",
        audit: {
            action: PLATFORM_AUDIT_ACTIONS.WEBHOOK_FAILURES_LIST,
            targetType: "stripe_webhook_event_collection",
            institutionId: validObjectIdOrNull(query.institutionId),
        },
        operation: async (actor) => {
            const input = validateWebhookQuery(query);
            const result = await queryFailedWebhooks(input);
            await writeAudit(actor, context, {
                action: PLATFORM_AUDIT_ACTIONS.WEBHOOK_FAILURES_LIST,
                targetType: "stripe_webhook_event_collection",
                institutionId: input.institutionId,
                metadata: { page: input.page, limit: input.limit, returnedCount: result.items.length },
            });
            return result;
        },
    });
}

async function getInstitutionBilling({ context, institutionId, query = {} }) {
    const safeInstitutionId = validObjectIdOrNull(institutionId);
    return executePlatformOperation({
        context,
        requiredPermission: "platform.billing.read",
        audit: {
            action: PLATFORM_AUDIT_ACTIONS.INSTITUTION_BILLING_VIEW,
            targetType: "institution_billing",
            targetId: safeInstitutionId,
            institutionId: safeInstitutionId,
        },
        operation: async (actor) => {
            const webhookInput = validateWebhookQuery(query, safeInstitutionId || institutionId);
            const includeWebhooks = actor.permissions.includes("platform.webhooks.read");
            const data = await loadInstitutionOperationalDetail(institutionId, {
                includeBilling: true,
                includeWebhooks,
            });
            const result = {
                institutionId: data.id,
                billing: {
                    ...toBilling(data.profile),
                    stripeCustomerId: data.profile?.stripeCustomerId || null,
                    stripeSubscriptionId: data.profile?.stripeSubscriptionId || null,
                    stripePriceId: data.profile?.stripePriceId || null,
                },
                seatUsage: toSeatUsage(data.profile, data.counts),
            };
            if (includeWebhooks) {
                result.billingSync = deriveBillingSync(data.profile, data.webhook);
                result.failedWebhooks = await queryFailedWebhooks(webhookInput);
            }
            await writeAudit(actor, context, {
                action: PLATFORM_AUDIT_ACTIONS.INSTITUTION_BILLING_VIEW,
                targetType: "institution_billing",
                targetId: data.id,
                institutionId: data.id,
            });
            return result;
        },
    });
}

function toAuditResponse(row) {
    return {
        platformAuditLogId: String(row._id),
        actorPlatformAdminId: String(row.actorPlatformAdminId),
        actorUserId: String(row.actorUserId),
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId || null,
        institutionId: row.institutionId ? String(row.institutionId) : null,
        reason: row.reason || null,
        metadata: safeAuditMetadata(row.metadata),
        ipAddress: row.ipAddress || null,
        userAgent: row.userAgent || null,
        result: row.result,
        createdAt: row.createdAt,
    };
}

function validateAuditQuery(query = {}) {
    rejectUnexpectedQueryFields(query, AUDIT_QUERY_FIELDS);
    const pagination = parsePagination(query);
    const ids = {};
    for (const field of ["actorPlatformAdminId", "institutionId"]) {
        if (query[field]) ids[field] = requireObjectId(query[field], field);
    }
    const result = parseEnum(query.result, "result", AUDIT_RESULTS);
    const dateFrom = parseDate(query.dateFrom, "dateFrom");
    const dateTo = parseDate(query.dateTo, "dateTo", true);
    if (dateFrom && dateTo && dateFrom > dateTo) throw createError(400, "dateFrom must be before dateTo");
    for (const field of ["action", "targetType", "targetId"]) {
        if (normalizeString(query[field]).length > 150) throw createError(400, `${field} must be at most 150 characters`);
    }
    return { ...pagination, ...ids, result, action: normalizeString(query.action), targetType: normalizeString(query.targetType), targetId: normalizeString(query.targetId), dateFrom, dateTo };
}

async function listPlatformAuditLogs({ context, query = {} }) {
    return executePlatformOperation({
        context,
        requiredPermission: "platform.audit.read",
        audit: {
            action: PLATFORM_AUDIT_ACTIONS.AUDIT_LIST,
            targetType: "platform_audit_log_collection",
            institutionId: validObjectIdOrNull(query.institutionId),
        },
        operation: async (actor) => {
            const input = validateAuditQuery(query);
            const filter = {};
            for (const field of ["actorPlatformAdminId", "institutionId", "result", "action", "targetType", "targetId"]) if (input[field]) filter[field] = input[field];
            if (input.dateFrom || input.dateTo) {
                filter.createdAt = {};
                if (input.dateFrom) filter.createdAt.$gte = input.dateFrom;
                if (input.dateTo) filter.createdAt.$lte = input.dateTo;
            }
            const [rows, total] = await Promise.all([
                PlatformAuditLog.find(filter).select("_id actorPlatformAdminId actorUserId action targetType targetId institutionId reason metadata ipAddress userAgent result createdAt").sort({ createdAt: -1, _id: -1 }).skip(input.skip).limit(input.limit).lean(),
                PlatformAuditLog.countDocuments(filter),
            ]);
            const items = rows.map(toAuditResponse);
            await writeAudit(actor, context, {
                action: PLATFORM_AUDIT_ACTIONS.AUDIT_LIST,
                targetType: "platform_audit_log_collection",
                metadata: { page: input.page, limit: input.limit, returnedCount: items.length },
            });
            return { items, pagination: toPagination(input.page, input.limit, total) };
        },
    });
}

module.exports = {
    deriveBillingSync,
    getInstitutionBilling,
    getInstitutionSummary,
    listFailedWebhookEvents,
    listInstitutions,
    listPlatformAuditLogs,
    resolveAndAssertPlatformActor,
    sanitizeErrorMessage,
    validateAuditQuery,
    validateInstitutionListQuery,
    validateWebhookQuery,
};
