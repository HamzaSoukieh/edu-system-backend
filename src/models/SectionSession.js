const mongoose = require("mongoose");

const SECTION_SESSION_TYPES = ["lecture", "lab"];
const SECTION_SESSION_STATUSES = ["scheduled", "completed", "cancelled"];
const ATTENDANCE_STATES = ["not_started", "open", "closed"];

const sectionSessionSchema = new mongoose.Schema(
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
        sessionType: {
            type: String,
            enum: SECTION_SESSION_TYPES,
            required: true,
            index: true,
        },
        sessionDate: {
            type: Date,
            required: true,
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
        status: {
            type: String,
            enum: SECTION_SESSION_STATUSES,
            default: "scheduled",
            index: true,
        },
        statusNote: {
            type: String,
            trim: true,
            default: null,
        },
        statusChangedAt: {
            type: Date,
            default: null,
        },
        statusChangedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        attendanceState: {
            type: String,
            enum: ATTENDANCE_STATES,
            default: "not_started",
            index: true,
        },
        attendanceOpenedAt: {
            type: Date,
            default: null,
        },
        attendanceClosedAt: {
            type: Date,
            default: null,
        },
        attendanceOpenedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        currentQrTokenHash: {
            type: String,
            default: null,
        },
        currentQrTokenExpiresAt: {
            type: Date,
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

sectionSessionSchema.index(
    { institutionId: 1, sectionId: 1, sessionDate: 1, startTime: 1, sessionType: 1 },
    { unique: true }
);

module.exports = mongoose.model("SectionSession", sectionSessionSchema);
