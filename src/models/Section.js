const mongoose = require("mongoose");

const { SECTION_STATUSES } = require("../constants/sectionConstants");
const SCHEDULE_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SECTION_SCHEDULE_SESSION_TYPES = ["lecture", "lab"];

const sectionSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
            index: true,
        },
        semesterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Semester",
            required: true,
            index: true,
        },
        subjectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject",
            required: true,
            index: true,
        },
        schoolClassId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SchoolClass",
            default: null,
            index: true,
        },
        code: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },
        title: {
            type: String,
            trim: true,
            default: null,
        },
        instructorMemberId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Membership",
            default: null,
            index: true,
        },
        capacity: {
            type: Number,
            min: 1,
            default: null,
        },
        schedule: {
            type: [
                {
                    _id: false,
                    sessionType: {
                        type: String,
                        enum: SECTION_SCHEDULE_SESSION_TYPES,
                        default: null,
                    },
                    day: {
                        type: String,
                        required: true,
                        enum: SCHEDULE_DAYS,
                    },
                    startTime: {
                        type: String,
                        required: true,
                        trim: true,
                    },
                    endTime: {
                        type: String,
                        required: true,
                        trim: true,
                    },
                    room: {
                        type: String,
                        trim: true,
                        default: null,
                    },
                },
            ],
            default: [],
        },
        status: {
            type: String,
            enum: SECTION_STATUSES,
            default: "draft",
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

sectionSchema.index({ institutionId: 1, semesterId: 1, subjectId: 1, code: 1 }, { unique: true });
sectionSchema.index({ institutionId: 1, schoolClassId: 1, semesterId: 1, status: 1 });

module.exports = mongoose.model("Section", sectionSchema);
