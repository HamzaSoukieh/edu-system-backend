const mongoose = require("mongoose");

const platformAdminSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },
        role: {
            type: String,
            enum: ["platform_owner"],
            required: true,
        },
        status: {
            type: String,
            enum: ["active", "suspended"],
            required: true,
            default: "active",
        },
        createdByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        lastAccessAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

platformAdminSchema.index({ status: 1, role: 1 });

module.exports = mongoose.model("PlatformAdmin", platformAdminSchema);
