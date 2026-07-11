const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const Membership = require("../models/Membership");

const { NOTIFICATION_TYPES } = require("../constants/notificationConstants");
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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

function normalizeLowerString(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parsePositiveInteger(rawValue, fallback, min, max) {
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < min) {
        return fallback;
    }

    return max !== undefined && parsed > max ? max : parsed;
}

function parseOptionalBoolean(rawValue, fieldName) {
    if (rawValue === undefined) {
        return false;
    }

    const normalized = normalizeLowerString(rawValue);
    if (!normalized || normalized === "false") {
        return false;
    }
    if (normalized === "true") {
        return true;
    }

    throw createError(400, `${fieldName} must be true or false`);
}

function ensureActiveActorMembership({ institutionId, actorUserId, actorMembership }) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (normalizeId(actorMembership.institutionId) !== normalizeId(institutionId)) {
        throw createError(403, "Institution access denied");
    }

    if (normalizeId(actorMembership.userId) !== normalizeId(actorUserId)) {
        throw createError(403, "Institution access denied");
    }

    if (actorMembership.status !== undefined && actorMembership.status !== "active") {
        throw createError(403, "Institution access denied");
    }
}

function isDuplicateKeyError(error) {
    return Boolean(error) && error.name === "MongoServerError" && error.code === 11000;
}

function toNotificationResponse(notification) {
    return {
        id: normalizeId(notification._id),
        institutionId: normalizeId(notification.institutionId),
        recipientUserId: normalizeId(notification.recipientUserId),
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: {
            academicDecisionId: normalizeId(notification.data?.academicDecisionId),
            studentMemberId: normalizeId(notification.data?.studentMemberId),
            enrollmentId: normalizeId(notification.data?.enrollmentId),
            sectionId: normalizeId(notification.data?.sectionId),
        },
        createdByUserId: normalizeId(notification.createdByUserId),
        readAt: notification.readAt || null,
        createdAt: notification.createdAt,
        updatedAt: notification.updatedAt,
    };
}

async function createNotificationOnce({
    institutionId,
    recipientUserId,
    type,
    title,
    message,
    data,
    createdByUserId = null,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedRecipientUserId = validateObjectId(recipientUserId, "recipientUserId");
    if (!NOTIFICATION_TYPES.includes(type)) {
        throw createError(400, "notification type is invalid");
    }

    const academicDecisionId = validateObjectId(data?.academicDecisionId, "data.academicDecisionId");
    const existing = await Notification.findOne({
        institutionId: normalizedInstitutionId,
        recipientUserId: normalizedRecipientUserId,
        type,
        "data.academicDecisionId": academicDecisionId,
    })
        .select("_id institutionId recipientUserId type title message data createdByUserId readAt createdAt updatedAt")
        .lean();

    if (existing) {
        return {
            notification: toNotificationResponse(existing),
            created: false,
        };
    }

    try {
        const notification = await Notification.create({
            institutionId: normalizedInstitutionId,
            recipientUserId: normalizedRecipientUserId,
            type,
            title,
            message,
            data: {
                academicDecisionId,
                studentMemberId: validateObjectId(data?.studentMemberId, "data.studentMemberId"),
                enrollmentId: validateObjectId(data?.enrollmentId, "data.enrollmentId"),
                sectionId: validateObjectId(data?.sectionId, "data.sectionId"),
            },
            createdByUserId: createdByUserId ? validateObjectId(createdByUserId, "createdByUserId") : null,
        });

        return {
            notification: toNotificationResponse(notification),
            created: true,
        };
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            const duplicate = await Notification.findOne({
                institutionId: normalizedInstitutionId,
                recipientUserId: normalizedRecipientUserId,
                type,
                "data.academicDecisionId": academicDecisionId,
            })
                .select("_id institutionId recipientUserId type title message data createdByUserId readAt createdAt updatedAt")
                .lean();
            if (duplicate) {
                return {
                    notification: toNotificationResponse(duplicate),
                    created: false,
                };
            }
        }

        throw error;
    }
}

async function createNotificationsOnce(items = []) {
    const results = [];
    for (const item of items) {
        results.push(await createNotificationOnce(item));
    }

    return results;
}

function validateListQuery(query = {}) {
    return {
        unreadOnly: parseOptionalBoolean(query.unreadOnly, "unreadOnly"),
        page: parsePositiveInteger(query.page, DEFAULT_PAGE, 1),
        limit: parsePositiveInteger(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
    };
}

async function listMyNotifications({
    institutionId,
    actorUserId,
    actorMembership,
    query = {},
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    ensureActiveActorMembership({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });
    const filters = validateListQuery(query);
    const notificationQuery = {
        institutionId: normalizedInstitutionId,
        recipientUserId: validateObjectId(actorUserId, "actorUserId"),
    };
    if (filters.unreadOnly) {
        notificationQuery.readAt = null;
    }

    const [total, notifications] = await Promise.all([
        Notification.countDocuments(notificationQuery),
        Notification.find(notificationQuery)
            .select("_id institutionId recipientUserId type title message data createdByUserId readAt createdAt updatedAt")
            .sort({ createdAt: -1, _id: -1 })
            .skip((filters.page - 1) * filters.limit)
            .limit(filters.limit)
            .lean(),
    ]);

    return {
        notifications: notifications.map(toNotificationResponse),
        pagination: {
            page: filters.page,
            limit: filters.limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / filters.limit),
        },
    };
}

async function markMyNotificationRead({
    institutionId,
    notificationId,
    actorUserId,
    actorMembership,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedNotificationId = validateObjectId(notificationId, "notificationId");
    ensureActiveActorMembership({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });

    const notification = await Notification.findOneAndUpdate(
        {
            _id: normalizedNotificationId,
            institutionId: normalizedInstitutionId,
            recipientUserId: validateObjectId(actorUserId, "actorUserId"),
        },
        { $set: { readAt: new Date() } },
        { returnDocument: "after", runValidators: true }
    )
        .select("_id institutionId recipientUserId type title message data createdByUserId readAt createdAt updatedAt")
        .lean();

    if (!notification) {
        throw createError(404, "Notification not found");
    }

    return {
        notification: toNotificationResponse(notification),
    };
}

async function markDecisionNotificationReadForRecipient({
    institutionId,
    recipientUserId,
    academicDecisionId,
    type,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedRecipientUserId = validateObjectId(recipientUserId, "recipientUserId");
    const normalizedAcademicDecisionId = validateObjectId(academicDecisionId, "academicDecisionId");
    if (!NOTIFICATION_TYPES.includes(type)) {
        throw createError(400, "notification type is invalid");
    }

    const notification = await Notification.findOneAndUpdate(
        {
            institutionId: normalizedInstitutionId,
            recipientUserId: normalizedRecipientUserId,
            type,
            "data.academicDecisionId": normalizedAcademicDecisionId,
            readAt: null,
        },
        { $set: { readAt: new Date() } },
        { returnDocument: "after", runValidators: true }
    )
        .select("_id institutionId recipientUserId type title message data createdByUserId readAt createdAt updatedAt")
        .lean();

    return {
        notification: notification ? toNotificationResponse(notification) : null,
        updated: Boolean(notification),
    };
}

async function markDecisionReviewNotificationsRead({ institutionId, academicDecisionId }) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedAcademicDecisionId = validateObjectId(academicDecisionId, "academicDecisionId");
    const readAt = new Date();

    const result = await Notification.updateMany(
        {
            institutionId: normalizedInstitutionId,
            type: "academic_decision_review_required",
            "data.academicDecisionId": normalizedAcademicDecisionId,
            readAt: null,
        },
        { $set: { readAt } },
        { runValidators: true }
    );

    return {
        readAt,
        matchedCount: result.matchedCount ?? result.n ?? 0,
        modifiedCount: result.modifiedCount ?? result.nModified ?? 0,
    };
}

module.exports = {
    createNotificationOnce,
    createNotificationsOnce,
    listMyNotifications,
    markMyNotificationRead,
    markDecisionNotificationReadForRecipient,
    markDecisionReviewNotificationsRead,
    toNotificationResponse,
};
