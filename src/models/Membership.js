const mongoose = require("mongoose");

const membershipSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
        },
        role: {
            type: String,
            required: true,
            enum: ["admin", "instructor", "student"],
        },
        status: {
            type: String,
            enum: ["active", "suspended"],
            default: "active",
            index: true,
        },
        invitedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        joinedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

membershipSchema.index({ userId: 1, institutionId: 1 }, { unique: true });
membershipSchema.index({ institutionId: 1, role: 1 });
membershipSchema.index({ institutionId: 1, status: 1, role: 1 });

module.exports = mongoose.model("Membership", membershipSchema);
