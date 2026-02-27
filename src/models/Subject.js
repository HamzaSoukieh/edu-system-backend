const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
            index: true,
        },
        departmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Department",
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        nameNormalized: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        code: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },
        creditHours: {
            type: Number,
            required: true,
            min: 1,
        },
        status: {
            type: String,
            enum: ["active", "archived"],
            default: "active",
            index: true,
        },
        createdByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);

subjectSchema.index({ institutionId: 1, code: 1 }, { unique: true });
subjectSchema.index({ departmentId: 1, nameNormalized: 1 }, { unique: true });
subjectSchema.index({ institutionId: 1, departmentId: 1, status: 1 });

module.exports = mongoose.model("Subject", subjectSchema);
