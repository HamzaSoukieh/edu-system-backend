const mongoose = require("mongoose");

const SCHOOL_FINAL_OUTCOME_STATUSES = ["draft", "finalized", "cancelled"];
const SCHOOL_PROMOTION_DECISIONS = [
    "promoted",
    "repeat_year",
    "conditional_promotion",
    "manual_review",
];

const policySnapshotSchema = new mongoose.Schema(
    {
        policyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SchoolAcademicPolicy",
            required: true,
        },
        policyName: {
            type: String,
            required: true,
            trim: true,
        },
        resolutionLevel: {
            type: String,
            default: null,
            trim: true,
        },
    },
    { _id: false }
);

const outcomeSnapshotSchema = new mongoose.Schema(
    {
        yearlyAveragePercentage: {
            type: Number,
            default: null,
        },
        failedSubjectCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        criticalFailedSubjects: {
            type: [mongoose.Schema.Types.Mixed],
            default: [],
        },
        complete: {
            type: Boolean,
            required: true,
        },
        hasMissingResults: {
            type: Boolean,
            required: true,
        },
        missingResults: {
            type: [mongoose.Schema.Types.Mixed],
            default: [],
        },
    },
    { _id: false }
);

const overrideSchema = new mongoose.Schema(
    {
        isOverridden: {
            type: Boolean,
            default: false,
        },
        overriddenBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        overriddenAt: {
            type: Date,
            default: null,
        },
        reason: {
            type: String,
            trim: true,
            default: null,
        },
    },
    { _id: false }
);

const schoolFinalOutcomeSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
            index: true,
        },
        academicYearId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicYear", // DB-4: was a dangling ObjectId; enable populate()
            required: true,
            index: true,
        },
        classLevelId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ClassLevel",
            required: true,
            index: true,
        },
        schoolClassId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SchoolClass",
            required: true,
            index: true,
        },
        studentMembershipId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Membership",
            required: true,
            index: true,
        },
        policy: {
            type: policySnapshotSchema,
            required: true,
        },
        outcomeSnapshot: {
            type: outcomeSnapshotSchema,
            required: true,
        },
        calculatedDecision: {
            type: String,
            enum: SCHOOL_PROMOTION_DECISIONS,
            required: true,
        },
        calculatedReasons: {
            type: [mongoose.Schema.Types.Mixed],
            default: [],
        },
        calculatedReasonCodes: {
            type: [String],
            default: [],
        },
        calculatedWarnings: {
            type: [mongoose.Schema.Types.Mixed],
            default: [],
        },
        finalDecision: {
            type: String,
            enum: SCHOOL_PROMOTION_DECISIONS,
            required: true,
        },
        finalReasons: {
            type: [mongoose.Schema.Types.Mixed],
            default: [],
        },
        finalReasonCodes: {
            type: [String],
            default: [],
        },
        finalWarnings: {
            type: [mongoose.Schema.Types.Mixed],
            default: [],
        },
        override: {
            type: overrideSchema,
            default: () => ({}),
        },
        status: {
            type: String,
            enum: SCHOOL_FINAL_OUTCOME_STATUSES,
            default: "finalized",
            index: true,
        },
        finalizedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        finalizedAt: {
            type: Date,
            required: true,
        },
        audit: {
            createdBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true,
            },
            updatedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true,
            },
        },
    },
    { timestamps: true }
);

schoolFinalOutcomeSchema.index(
    {
        institutionId: 1,
        academicYearId: 1,
        studentMembershipId: 1,
        status: 1,
    },
    {
        unique: true,
        partialFilterExpression: {
            status: "finalized",
        },
    }
);
schoolFinalOutcomeSchema.index({ institutionId: 1, _id: 1 });

module.exports = mongoose.model("SchoolFinalOutcome", schoolFinalOutcomeSchema);
