const mongoose = require("mongoose");

const classStudentAssignmentSchema = new mongoose.Schema(
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
        classId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SchoolClass",
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
            enum: ["assigned", "removed"],
            default: "assigned",
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

classStudentAssignmentSchema.index(
    { institutionId: 1, semesterId: 1, studentMemberId: 1 },
    { unique: true }
);
classStudentAssignmentSchema.index({ institutionId: 1, classId: 1, semesterId: 1, status: 1 });

module.exports = mongoose.model("ClassStudentAssignment", classStudentAssignmentSchema);
