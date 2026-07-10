const mongoose = require("mongoose");

const semesterWeightSchema = new mongoose.Schema(
    {
        semesterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Semester",
            required: true,
        },
        weight: {
            type: Number,
            required: true,
            min: 0,
        },
    },
    { _id: false }
);

const criticalSubjectRuleSchema = new mongoose.Schema(
    {
        subjectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject",
            required: true,
        },
        failAction: {
            type: String,
            required: true,
            enum: ["warning", "manual_review", "repeat_year"],
        },
    },
    { _id: false }
);

const schoolAcademicPolicySchema = new mongoose.Schema(
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
            default: "draft",
            index: true,
        },
        appliesTo: {
            academicYearId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "AcademicYear", // DB-4: enable populate()
                required: true,
            },
            schoolStageId: {
                type: mongoose.Schema.Types.ObjectId,
                default: null,
            },
            classLevelId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "ClassLevel",
                default: null,
            },
        },
        gradingRules: {
            gradingMode: {
                type: String,
                enum: ["percentage"],
                default: "percentage",
                required: true,
            },
            scaleMax: {
                type: Number,
                required: true,
                min: 0,
            },
            subjectPassMinPercentage: {
                type: Number,
                required: true,
                min: 0,
            },
            yearPassMinPercentage: {
                type: Number,
                required: true,
                min: 0,
            },
        },
        aggregationRules: {
            yearCalculationMethod: {
                type: String,
                enum: ["weighted_semesters"],
                required: true,
            },
            semesterWeights: {
                type: [semesterWeightSchema],
                default: [],
            },
        },
        failureRules: {
            failIfAnyCriticalSubjectFailed: {
                type: Boolean,
                default: false,
            },
            criticalSubjectRules: {
                type: [criticalSubjectRuleSchema],
                default: [],
            },
            failIfFailedSubjectCountAtLeast: {
                type: Number,
                default: null,
                min: 1,
            },
            countCriticalSubjectsInFailedSubjectTotal: {
                type: Boolean,
                default: true,
            },
        },
        promotionRules: {
            enabled: {
                type: Boolean,
                default: true,
            },
            passDecision: {
                type: String,
                enum: ["promoted", "repeat_year", "conditional_promotion", "manual_review"],
                required: true,
            },
            failDecision: {
                type: String,
                enum: ["promoted", "repeat_year", "conditional_promotion", "manual_review"],
                required: true,
            },
            allowConditionalPromotion: {
                type: Boolean,
                default: false,
            },
            allowManualReview: {
                type: Boolean,
                default: true,
            },
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

schoolAcademicPolicySchema.index({
    institutionId: 1,
    status: 1,
    "appliesTo.academicYearId": 1,
    "appliesTo.schoolStageId": 1,
    "appliesTo.classLevelId": 1,
});

// DB-3: at most one ACTIVE school policy per (institution, year, class level).
// Without this, two active policies could coexist and promotion/outcome logic
// would resolve an ambiguous policy non-deterministically. Mirrors the
// InstitutionAcademicPolicy partial-unique-on-active guard.
schoolAcademicPolicySchema.index(
    {
        institutionId: 1,
        "appliesTo.academicYearId": 1,
        "appliesTo.classLevelId": 1,
    },
    {
        unique: true,
        partialFilterExpression: { status: "active" },
        name: "uniq_active_school_policy_per_year_level",
    }
);

module.exports = mongoose.model("SchoolAcademicPolicy", schoolAcademicPolicySchema);
