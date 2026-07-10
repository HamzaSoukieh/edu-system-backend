const mongoose = require("mongoose");
const { isResponsibilityScopeAllowed, RESPONSIBILITY_TYPES } = require("../auth/permissions");

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
            enum: ["institution", "department", "class", "classLevel", "section"],
            index: true,
            validate: {
                validator(value) {
                    if (!this.responsibilityType) {
                        return true;
                    }

                    return isResponsibilityScopeAllowed(this.responsibilityType, value);
                },
                message: "scopeType is not allowed for responsibilityType",
            },
        },
        scopeId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        responsibilityType: {
            type: String,
            required: true,
            enum: RESPONSIBILITY_TYPES,
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
