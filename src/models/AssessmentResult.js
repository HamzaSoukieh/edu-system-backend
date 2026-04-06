const mongoose = require("mongoose");

const assessmentResultSchema = new mongoose.Schema(
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
        assessmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Assessment",
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
        score: {
            type: Number,
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

assessmentResultSchema.index({ institutionId: 1, assessmentId: 1, enrollmentId: 1 }, { unique: true });
assessmentResultSchema.index({ institutionId: 1, studentMemberId: 1, sectionId: 1, assessmentId: 1 });

module.exports = mongoose.model("AssessmentResult", assessmentResultSchema);
