const mongoose = require("mongoose");

const ENROLLMENT_STATUSES = ["enrolled", "dropped"];

const enrollmentSchema = new mongoose.Schema(
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
        studentMemberId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Membership",
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ENROLLMENT_STATUSES,
            default: "enrolled",
            index: true,
        },
        enrolledAt: {
            type: Date,
            default: Date.now,
            required: true,
        },
        droppedAt: {
            type: Date,
            default: null,
        },
        droppedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        droppedByAcademicDecisionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicDecision",
            default: null,
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

enrollmentSchema.index({ institutionId: 1, sectionId: 1, studentMemberId: 1 }, { unique: true });
// DB-14: hot path — many services query a student's enrollments by
// (institution, student, status) (eligibility, academic profile, outcomes, …).
enrollmentSchema.index({ institutionId: 1, studentMemberId: 1, status: 1 });

module.exports = mongoose.model("Enrollment", enrollmentSchema);
