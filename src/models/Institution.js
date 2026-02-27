const mongoose = require("mongoose");

const policySchema = new mongoose.Schema(
    {
        warnAfterAbsences: {
            type: Number,
            min: 0,
            default: 3,
        },
        dropAfterAbsences: {
            type: Number,
            min: 0,
            default: 5,
        },
        lateToAbsenceRatio: {
            type: Number,
            min: 1,
            default: 3,
        },
        excusedCountsAsAbsence: {
            type: Boolean,
            default: false,
        },
        maxSubjectsPerSemester: {
            type: Number,
            min: 0,
            default: null,
        },
        addDropDeadlineWeek: {
            type: Number,
            min: 1,
            default: null,
        },
        defaultHourlyRate: {
            type: Number,
            min: 0,
            default: 60,
        },
    },
    { _id: false }
);

const institutionSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        type: {
            type: String,
            required: true,
            enum: ["school", "university"],
        },
        logoUrl: {
            type: String,
            trim: true,
            default: null,
        },
        ownerUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        policies: {
            type: policySchema,
            default: () => ({}),
        },
        status: {
            type: String,
            enum: ["active", "archived"],
            default: "active",
            index: true,
        },
    },
    { timestamps: true }
);

institutionSchema.index({ name: 1, type: 1 });

module.exports = mongoose.model("Institution", institutionSchema);
