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
            default: null,
            index: true,
        },
        classLevelId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ClassLevel",
            default: null,
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
        description: {
            type: String,
            trim: true,
            default: null,
        },
        creditHours: {
            type: Number,
            min: 1,
            default: null,
        },
        prerequisiteSubjectIds: {
            type: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Subject",
                },
            ],
            default: [],
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
subjectSchema.index(
    { institutionId: 1, departmentId: 1, nameNormalized: 1 },
    {
        unique: true,
        partialFilterExpression: {
            departmentId: { $type: "objectId" },
        },
    }
);
subjectSchema.index(
    { institutionId: 1, classLevelId: 1, nameNormalized: 1 },
    {
        unique: true,
        partialFilterExpression: {
            classLevelId: { $type: "objectId" },
        },
    }
);
subjectSchema.index(
    { institutionId: 1, departmentId: 1, status: 1 },
    {
        partialFilterExpression: {
            departmentId: { $type: "objectId" },
        },
    }
);
subjectSchema.index(
    { institutionId: 1, classLevelId: 1, status: 1 },
    {
        partialFilterExpression: {
            classLevelId: { $type: "objectId" },
        },
    }
);

module.exports = mongoose.model("Subject", subjectSchema);
