const mongoose = require("mongoose");

const { HOMEWORK_TYPES, HOMEWORK_STATUSES } = require("../constants/homeworkConstants");
const HOMEWORK_SUBMISSION_MODES = ["none", "offline", "online_upload"];

const homeworkSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
            index: true,
        },
        sectionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Section",
            required: true,
            index: true,
        },
        sectionSessionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SectionSession",
            default: null,
            index: true,
        },
        assessmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Assessment",
            default: null,
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        titleNormalized: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        instructions: {
            type: String,
            trim: true,
            default: "",
        },
        type: {
            type: String,
            enum: HOMEWORK_TYPES,
            required: true,
            index: true,
        },
        dueAt: {
            type: Date,
            default: null,
            index: true,
        },
        submissionMode: {
            type: String,
            enum: HOMEWORK_SUBMISSION_MODES,
            default: "offline",
            required: true,
            index: true,
        },
        allowLate: {
            type: Boolean,
            default: false,
        },
        status: {
            type: String,
            enum: HOMEWORK_STATUSES,
            default: "draft",
            required: true,
            index: true,
        },
        createdByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        archivedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

homeworkSchema.index({ institutionId: 1, sectionId: 1, status: 1 });
homeworkSchema.index({ institutionId: 1, sectionId: 1, dueAt: 1 });
homeworkSchema.index({ institutionId: 1, sectionId: 1, titleNormalized: 1 });
homeworkSchema.index(
    { institutionId: 1, assessmentId: 1 },
    {
        partialFilterExpression: {
            assessmentId: { $type: "objectId" },
        },
    }
);

module.exports = mongoose.model("Homework", homeworkSchema);
