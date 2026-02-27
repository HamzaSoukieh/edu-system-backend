const mongoose = require("mongoose");

const responsibilityAssignmentSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        scopeType: {
            type: String,
            required: true,
            enum: ["institution", "department", "class", "section"],
            index: true,
        },
        scopeId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        responsibilityType: {
            type: String,
            required: true,
            enum: ["head", "mentor", "coordinator"],
            index: true,
        },
        permissions: {
            type: [String],
            default: [],
        },
        startAt: {
            type: Date,
            default: null,
        },
        endAt: {
            type: Date,
            default: null,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
    },
    { timestamps: true }
);

responsibilityAssignmentSchema.index(
    { userId: 1, institutionId: 1, scopeType: 1, scopeId: 1, responsibilityType: 1 },
    { unique: true }
);
responsibilityAssignmentSchema.index({ institutionId: 1, scopeType: 1, scopeId: 1, isActive: 1 });

module.exports = mongoose.model("ResponsibilityAssignment", responsibilityAssignmentSchema);
