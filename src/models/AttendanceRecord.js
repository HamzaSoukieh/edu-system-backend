const mongoose = require("mongoose");
const { ATTENDANCE_STATUSES, ATTENDANCE_SOURCES } = require("../constants/attendanceConstants");

const attendanceRecordSchema = new mongoose.Schema(
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
        sectionSessionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SectionSession",
            required: true,
            index: true,
        },
        enrollmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Enrollment",
            required: true,
            index: true,
        },
        studentMemberId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Membership",
            required: true,
            index: true,
        },
        attendanceStatus: {
            type: String,
            enum: ATTENDANCE_STATUSES,
            required: true,
            index: true,
        },
        source: {
            type: String,
            enum: ATTENDANCE_SOURCES,
            required: true,
            index: true,
        },
        checkedInAt: {
            type: Date,
            default: null,
        },
        note: {
            type: String,
            trim: true,
            default: null,
        },
        recordedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    { timestamps: true }
);

attendanceRecordSchema.index({ institutionId: 1, sectionSessionId: 1, enrollmentId: 1 }, { unique: true });

module.exports = mongoose.model("AttendanceRecord", attendanceRecordSchema);
