const mongoose = require("mongoose");

const ASSESSMENT_TYPES = ["quiz", "assignment", "midterm", "final", "project", "practical", "oral", "other"];
const ASSESSMENT_STATUSES = ["draft", "announced", "published", "archived"];

const assessmentSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
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
        title: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
            default: null,
        },
        type: {
            type: String,
            enum: ASSESSMENT_TYPES,
            required: true,
            index: true,
        },
        assessmentDate: {
            type: Date,
            required: true,
            index: true,
        },
        maxScore: {
            type: Number,
            required: true,
            min: 0,
        },
        weight: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },
        status: {
            type: String,
            enum: ASSESSMENT_STATUSES,
            default: "draft",
            index: true,
        },
        publishedAt: {
            type: Date,
            default: null,
        },
        publishedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        createdByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);

assessmentSchema.index({ institutionId: 1, sectionId: 1, status: 1, assessmentDate: -1, _id: -1 });
assessmentSchema.index(
    { institutionId: 1, sectionSessionId: 1, assessmentDate: -1 },
    {
        partialFilterExpression: {
            sectionSessionId: { $type: "objectId" },
        },
    }
);

module.exports = mongoose.model("Assessment", assessmentSchema);
