const mongoose = require("mongoose");

const { NOTIFICATION_TYPES } = require("../constants/notificationConstants");

const academicDecisionNotificationDataSchema = new mongoose.Schema(
    {
        academicDecisionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicDecision",
            required: true,
        },
        studentMemberId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Membership",
            required: true,
        },
        enrollmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Enrollment",
            required: true,
        },
        sectionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Section",
            required: true,
        },
    },
    { _id: false }
);

const notificationSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
            index: true,
            immutable: true,
        },
        recipientUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
            immutable: true,
        },
        type: {
            type: String,
            enum: NOTIFICATION_TYPES,
            required: true,
            index: true,
            immutable: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 160,
            immutable: true,
        },
        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500,
            immutable: true,
        },
        data: {
            type: academicDecisionNotificationDataSchema,
            required: true,
            immutable: true,
        },
        createdByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            immutable: true,
        },
        readAt: {
            type: Date,
            default: null,
            index: true,
        },
    },
    { timestamps: true }
);

notificationSchema.index({ institutionId: 1, recipientUserId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index(
    {
        institutionId: 1,
        recipientUserId: 1,
        type: 1,
        "data.academicDecisionId": 1,
    },
    { unique: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
