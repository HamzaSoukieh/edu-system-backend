const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
        },
        actorUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },
        action: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        entityType: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        entityId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({}),
        },
    },
    { timestamps: true }
);

auditLogSchema.index({ institutionId: 1, createdAt: -1 });
auditLogSchema.index({ institutionId: 1, action: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
