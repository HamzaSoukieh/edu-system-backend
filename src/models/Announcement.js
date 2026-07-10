const mongoose = require("mongoose");

const ANNOUNCEMENT_AUDIENCES = ["all", "admin", "instructor", "student"];
const ANNOUNCEMENT_STATUSES = ["published", "archived"];

const announcementSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        body: {
            type: String,
            required: true,
            trim: true,
        },
        // "all" is visible to every member; a role value targets that base role.
        audience: {
            type: String,
            enum: ANNOUNCEMENT_AUDIENCES,
            default: "all",
            index: true,
        },
        status: {
            type: String,
            enum: ANNOUNCEMENT_STATUSES,
            default: "published",
            index: true,
        },
        authorUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        authorMembershipId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Membership",
            default: null,
        },
    },
    { timestamps: true }
);

announcementSchema.index({ institutionId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("Announcement", announcementSchema);
module.exports.ANNOUNCEMENT_AUDIENCES = ANNOUNCEMENT_AUDIENCES;
module.exports.ANNOUNCEMENT_STATUSES = ANNOUNCEMENT_STATUSES;
