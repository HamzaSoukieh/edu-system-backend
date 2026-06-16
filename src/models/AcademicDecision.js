const mongoose = require("mongoose");

const ACADEMIC_DECISION_TYPES = ["enrollment_drop"];
const ACADEMIC_DECISION_STATUSES = [
    "recommended",
    "approved",
    "applying",
    "rejected",
    "applied",
    "cancelled",
];
const ACADEMIC_DECISION_ACTIONS = [
    "recommended",
    "approved",
    "applying",
    "rejected",
    "applied",
    "cancelled",
];

const academicDecisionHistorySchema = new mongoose.Schema(
    {
        action: {
            type: String,
            enum: ACADEMIC_DECISION_ACTIONS,
            required: true,
            trim: true,
        },
        fromStatus: {
            type: String,
            enum: ACADEMIC_DECISION_STATUSES,
            default: null,
        },
        toStatus: {
            type: String,
            enum: ACADEMIC_DECISION_STATUSES,
            required: true,
        },
        actorUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        at: {
            type: Date,
            required: true,
        },
        note: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: null,
        },
    },
    { _id: false }
);

const academicDecisionSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
            index: true,
            immutable: true,
        },
        studentMemberId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Membership",
            required: true,
            index: true,
            immutable: true,
        },
        enrollmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Enrollment",
            required: true,
            index: true,
            immutable: true,
        },
        sectionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Section",
            required: true,
            index: true,
            immutable: true,
        },
        decisionType: {
            type: String,
            enum: ACADEMIC_DECISION_TYPES,
            required: true,
            index: true,
            immutable: true,
        },
        status: {
            type: String,
            enum: ACADEMIC_DECISION_STATUSES,
            default: "recommended",
            required: true,
            index: true,
        },
        isOpen: {
            type: Boolean,
            required: true,
            default: true,
            index: true,
        },
        reason: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000,
        },
        evidenceSnapshot: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({}),
            immutable: true,
        },
        scopeSnapshot: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({}),
            immutable: true,
        },
        reviewSnapshot: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        recommendedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
            immutable: true,
        },
        approvedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        rejectedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        appliedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        applyingByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        cancelledByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        recommendedAt: {
            type: Date,
            required: true,
            immutable: true,
        },
        approvedAt: {
            type: Date,
            default: null,
        },
        rejectedAt: {
            type: Date,
            default: null,
        },
        appliedAt: {
            type: Date,
            default: null,
        },
        applyingAt: {
            type: Date,
            default: null,
        },
        cancelledAt: {
            type: Date,
            default: null,
        },
        history: {
            type: [academicDecisionHistorySchema],
            default: [],
        },
    },
    { timestamps: true }
);

academicDecisionSchema.index({ institutionId: 1, status: 1, createdAt: -1 });
academicDecisionSchema.index({ institutionId: 1, studentMemberId: 1 });
academicDecisionSchema.index({ institutionId: 1, enrollmentId: 1 });
academicDecisionSchema.index({ institutionId: 1, recommendedByUserId: 1 });
academicDecisionSchema.index({ institutionId: 1, decisionType: 1, sectionId: 1, status: 1 });
academicDecisionSchema.index(
    {
        institutionId: 1,
        enrollmentId: 1,
        decisionType: 1,
    },
    {
        unique: true,
        partialFilterExpression: {
            isOpen: true,
        },
    }
);

module.exports = mongoose.model("AcademicDecision", academicDecisionSchema);
