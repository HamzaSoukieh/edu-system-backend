const mongoose = require("mongoose");
const Announcement = require("../models/Announcement");
const { ANNOUNCEMENT_AUDIENCES } = require("../models/Announcement");

const MAX_TITLE = 200;
const MAX_BODY = 5000;

function createError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function isValidObjectId(value) {
    return Boolean(value) && mongoose.Types.ObjectId.isValid(value);
}

function normalizeId(value) {
    if (!value) return null;
    return typeof value === "string" ? value : value.toString();
}

function toAnnouncementResponse(announcement) {
    return {
        id: announcement._id.toString(),
        institutionId: announcement.institutionId.toString(),
        title: announcement.title,
        body: announcement.body,
        audience: announcement.audience,
        status: announcement.status,
        authorUserId: announcement.authorUserId ? announcement.authorUserId.toString() : null,
        createdAt: announcement.createdAt,
        updatedAt: announcement.updatedAt,
    };
}

// Only institution admins may author/modify announcements.
function ensureAdmin(actorMembership) {
    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }
    if (actorMembership.role !== "admin") {
        throw createError(403, "Only administrators can manage announcements");
    }
}

function validateRequiredString(value, field, maxLength) {
    if (typeof value !== "string" || !value.trim()) {
        throw createError(400, `${field} is required`);
    }
    const trimmed = value.trim();
    if (trimmed.length > maxLength) {
        throw createError(400, `${field} must be at most ${maxLength} characters`);
    }
    return trimmed;
}

function validateAudience(value) {
    if (value === undefined || value === null || value === "") {
        return "all";
    }
    if (!ANNOUNCEMENT_AUDIENCES.includes(value)) {
        throw createError(400, `audience must be one of ${ANNOUNCEMENT_AUDIENCES.join(", ")}`);
    }
    return value;
}

async function createAnnouncement({ institutionId, actorUserId, actorMembership, payload = {} }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }
    ensureAdmin(actorMembership);

    const title = validateRequiredString(payload.title, "title", MAX_TITLE);
    const body = validateRequiredString(payload.body, "body", MAX_BODY);
    const audience = validateAudience(payload.audience);

    const announcement = await Announcement.create({
        institutionId,
        title,
        body,
        audience,
        status: "published",
        authorUserId: actorUserId,
        authorMembershipId: normalizeId(actorMembership._id),
    });

    return { announcement: toAnnouncementResponse(announcement) };
}

async function listAnnouncements({ institutionId, actorMembership, query = {} }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }
    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    const mongoQuery = { institutionId, status: "published" };

    // Admins see everything; other members see "all" + announcements for their role.
    if (actorMembership.role !== "admin") {
        mongoQuery.audience = { $in: ["all", actorMembership.role] };
    } else if (query.audience && ANNOUNCEMENT_AUDIENCES.includes(query.audience)) {
        mongoQuery.audience = query.audience;
    }

    const announcements = await Announcement.find(mongoQuery)
        .sort({ createdAt: -1, _id: -1 })
        .limit(100)
        .lean();

    return {
        total: announcements.length,
        announcements: announcements.map(toAnnouncementResponse),
    };
}

async function updateAnnouncement({ institutionId, announcementId, actorMembership, payload = {} }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }
    if (!announcementId || !isValidObjectId(announcementId)) {
        throw createError(400, "Invalid announcement id");
    }
    ensureAdmin(actorMembership);

    const updates = {};
    if (payload.title !== undefined) {
        updates.title = validateRequiredString(payload.title, "title", MAX_TITLE);
    }
    if (payload.body !== undefined) {
        updates.body = validateRequiredString(payload.body, "body", MAX_BODY);
    }
    if (payload.audience !== undefined) {
        updates.audience = validateAudience(payload.audience);
    }
    if (payload.status !== undefined) {
        if (!["published", "archived"].includes(payload.status)) {
            throw createError(400, "status must be published or archived");
        }
        updates.status = payload.status;
    }
    if (!Object.keys(updates).length) {
        throw createError(400, "No valid fields to update");
    }

    const announcement = await Announcement.findOneAndUpdate(
        { _id: announcementId, institutionId },
        { $set: updates },
        { returnDocument: "after", runValidators: true }
    ).lean();

    if (!announcement) {
        throw createError(404, "Announcement not found");
    }

    return { announcement: toAnnouncementResponse(announcement) };
}

async function deleteAnnouncement({ institutionId, announcementId, actorMembership }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }
    if (!announcementId || !isValidObjectId(announcementId)) {
        throw createError(400, "Invalid announcement id");
    }
    ensureAdmin(actorMembership);

    const result = await Announcement.deleteOne({ _id: announcementId, institutionId });
    if (!result.deletedCount) {
        throw createError(404, "Announcement not found");
    }
    return { message: "Announcement deleted successfully" };
}

module.exports = {
    createAnnouncement,
    listAnnouncements,
    updateAnnouncement,
    deleteAnnouncement,
    toAnnouncementResponse,
};
