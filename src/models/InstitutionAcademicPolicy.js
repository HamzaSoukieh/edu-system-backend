const mongoose = require("mongoose");

const gpaBandSchema = new mongoose.Schema(
    {
        minPercentage: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },
        maxPercentage: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },
        gradePoint: {
            type: Number,
            required: true,
            min: 0,
        },
    },
    { _id: false }
);

const outcomeThresholdSchema = new mongoose.Schema(
    {
        failedMaxPercentage: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },
        improvableMinPercentage: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },
        improvableMaxPercentage: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },
        finalPassMinPercentage: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },
    },
    { _id: false }
);

const repeatPolicySchema = new mongoose.Schema(
    {
        enabled: {
            type: Boolean,
            required: true,
            default: true,
        },
        gpaCalculationMethod: {
            type: String,
            enum: [
                "all_attempts",
                "latest_attempt_only",
                "best_attempt_only",
                "replace_failed_with_passed",
            ],
            required: true,
            default: "best_attempt_only",
        },
        earnedCreditsMethod: {
            type: String,
            enum: ["count_once_per_subject", "count_each_passed_attempt"],
            required: true,
            default: "count_once_per_subject",
        },
        prerequisiteMethod: {
            type: String,
            enum: ["best_passed_attempt", "latest_attempt"],
            required: true,
            default: "best_passed_attempt",
        },
        allowGradeImprovementRepeats: {
            type: Boolean,
            required: true,
            default: true,
        },
        blockRepeatAfterFinalPass: {
            type: Boolean,
            required: true,
            default: true,
        },
    },
    { _id: false }
);

const institutionAcademicPolicySchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        status: {
            type: String,
            enum: ["draft", "active", "archived"],
            required: true,
            default: "draft",
            index: true,
        },
        effectiveFromSemesterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Semester",
            required: true,
            index: true,
        },
        // MVP keeps one start semester only; later versions resolve forward until the next policy starts.
        minimumEnrollmentCreditHours: {
            type: Number,
            required: true,
            min: 0,
        },
        defaultMaxCreditHours: {
            type: Number,
            required: true,
            min: 0,
        },
        overloadMinGpa: {
            type: Number,
            required: true,
            min: 0,
        },
        overloadMaxCreditHours: {
            type: Number,
            required: true,
            min: 0,
        },
        outcomeThresholds: {
            type: outcomeThresholdSchema,
            required: true,
        },
        gpaBands: {
            type: [gpaBandSchema],
            required: true,
            default: [],
        },
        repeatPolicy: {
            type: repeatPolicySchema,
            default: () => ({}),
        },
        createdByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        updatedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    { timestamps: true }
);

function sortBandsAscending(gpaBands = []) {
    return [...gpaBands].sort((left, right) => {
        if (left.minPercentage !== right.minPercentage) {
            return left.minPercentage - right.minPercentage;
        }

        return left.maxPercentage - right.maxPercentage;
    });
}

institutionAcademicPolicySchema.pre("validate", function sortGpaBandsBeforeValidation() {
    if (Array.isArray(this.gpaBands) && this.gpaBands.length) {
        this.gpaBands = sortBandsAscending(this.gpaBands);
    }
});

institutionAcademicPolicySchema.index({
    institutionId: 1,
    status: 1,
    effectiveFromSemesterId: 1,
});
institutionAcademicPolicySchema.index(
    { institutionId: 1, effectiveFromSemesterId: 1 },
    {
        unique: true,
        partialFilterExpression: { status: "active" },
    }
);

// Graduation credit requirements belong in a future department/program requirement model, not here.

module.exports = mongoose.model("InstitutionAcademicPolicy", institutionAcademicPolicySchema);
