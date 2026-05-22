const mongoose = require("mongoose");

const academicYearSchema = new mongoose.Schema(
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
        nameNormalized: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        startDate: {
            type: Date,
            required: true,
            index: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        status: {
            type: String,
            enum: ["draft", "active", "archived"],
            default: "draft",
            index: true,
        },
        createdByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        archivedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

academicYearSchema.path("endDate").validate(function validateEndDate(value) {
    if (!this.startDate || !value) {
        return true;
    }

    return value.getTime() > this.startDate.getTime();
}, "Academic year endDate must be after startDate");

academicYearSchema.index({ institutionId: 1, nameNormalized: 1 }, { unique: true });
academicYearSchema.index({ institutionId: 1, status: 1, startDate: -1 });
academicYearSchema.index(
    { institutionId: 1, status: 1 },
    {
        unique: true,
        partialFilterExpression: { status: "active" },
    }
);

module.exports = mongoose.model("AcademicYear", academicYearSchema);
