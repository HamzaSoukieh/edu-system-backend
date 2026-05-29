const mongoose = require("mongoose");

const HOMEWORK_SUBMISSION_METHODS = ["offline", "online_upload"];
const HOMEWORK_SUBMISSION_STATUSES = ["submitted", "late", "missing", "returned"];

const homeworkSubmissionSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
            index: true,
        },
        homeworkId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Homework",
            required: true,
            index: true,
        },
        sectionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Section",
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
        submissionMethod: {
            type: String,
            enum: HOMEWORK_SUBMISSION_METHODS,
            required: true,
            index: true,
        },
        fileKey: {
            type: String,
            trim: true,
            default: null,
        },
        originalFilename: {
            type: String,
            trim: true,
            default: null,
        },
        mimeType: {
            type: String,
            trim: true,
            default: null,
        },
        sizeBytes: {
            type: Number,
            default: null,
            min: 0,
        },
        submittedAt: {
            type: Date,
            default: null,
            index: true,
        },
        status: {
            type: String,
            enum: HOMEWORK_SUBMISSION_STATUSES,
            required: true,
            index: true,
        },
        studentNote: {
            type: String,
            trim: true,
            default: "",
        },
        instructorFeedback: {
            type: String,
            trim: true,
            default: "",
        },
        markedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    { timestamps: true }
);

homeworkSubmissionSchema.index(
    { institutionId: 1, homeworkId: 1, enrollmentId: 1 },
    { unique: true }
);
homeworkSubmissionSchema.index({ institutionId: 1, sectionId: 1, homeworkId: 1 });
homeworkSubmissionSchema.index({ institutionId: 1, studentMemberId: 1 });
homeworkSubmissionSchema.index({ institutionId: 1, status: 1 });

homeworkSubmissionSchema.pre("validate", function normalizeSubmissionFileFields() {
    if (this.submissionMethod === "offline") {
        this.fileKey = null;
        this.originalFilename = null;
        this.mimeType = null;
        this.sizeBytes = null;
        return;
    }

    if (this.submissionMethod === "online_upload" && this.status !== "missing") {
        if (!this.fileKey || !this.originalFilename || !this.mimeType || this.sizeBytes === null) {
            throw new Error("Online homework submissions require file metadata");
        }
    }
});

module.exports = mongoose.model("HomeworkSubmission", homeworkSubmissionSchema);
