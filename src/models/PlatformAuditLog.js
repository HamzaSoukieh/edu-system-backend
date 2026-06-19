const mongoose = require("mongoose");

const platformAuditLogSchema = new mongoose.Schema(
    {
        actorPlatformAdminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformAdmin",
            required: true,
            index: true,
        },
        actorUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        action: { type: String, required: true, trim: true, index: true },
        targetType: { type: String, required: true, trim: true, index: true },
        targetId: { type: String, trim: true, default: null },
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            default: null,
        },
        reason: { type: String, trim: true, default: null },
        metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        ipAddress: { type: String, trim: true, default: null },
        userAgent: { type: String, trim: true, default: null },
        result: {
            type: String,
            enum: ["success", "denied", "failed"],
            required: true,
        },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

platformAuditLogSchema.index({ createdAt: -1 });
platformAuditLogSchema.index({ actorPlatformAdminId: 1, createdAt: -1 });
platformAuditLogSchema.index({ institutionId: 1, createdAt: -1 });

module.exports = mongoose.model("PlatformAuditLog", platformAuditLogSchema);
