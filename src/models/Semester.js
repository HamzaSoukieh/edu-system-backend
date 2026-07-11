const mongoose = require("mongoose");

const { TEACHING_DAY_LABELS } = require("../constants/scheduleConstants");

const semesterSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
        },
        academicYearId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicYear",
            default: null,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
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
        teachingDays: {
            type: [String],
            required: true,
            validate: {
                validator(value) {
                    return (
                        Array.isArray(value) &&
                        value.length > 0 &&
                        value.every((day) => TEACHING_DAY_LABELS.includes(day))
                    );
                },
                message: "Semester teachingDays must contain valid weekdays",
            },
        },
        calendarOverrides: {
            type: [
                {
                    _id: false,
                    date: {
                        type: Date,
                        required: true,
                    },
                    type: {
                        type: String,
                        enum: ["off"],
                        required: true,
                    },
                    reason: {
                        type: String,
                        trim: true,
                        default: null,
                    },
                },
            ],
            default: [],
        },
        examDates: {
            type: [
                {
                    _id: false,
                    date: {
                        type: Date,
                        required: true,
                    },
                    type: {
                        type: String,
                        enum: ["midterm", "final"],
                        required: true,
                    },
                    reason: {
                        type: String,
                        trim: true,
                        default: null,
                    },
                },
            ],
            default: [],
        },
        weekCount: {
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

semesterSchema.index({ institutionId: 1, status: 1, startDate: -1 });
semesterSchema.index(
    { institutionId: 1 },
    {
        unique: true,
        partialFilterExpression: { status: "active" },
    }
);

module.exports = mongoose.model("Semester", semesterSchema);
