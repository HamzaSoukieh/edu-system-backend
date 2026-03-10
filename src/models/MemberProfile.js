const mongoose = require("mongoose");

const memberProfileSchema = new mongoose.Schema(
    {
        membershipId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Membership",
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
            index: true,
        },
        firstName: {
            type: String,
            required: true,
            trim: true,
        },
        lastName: {
            type: String,
            required: true,
            trim: true,
        },
        fatherName: {
            type: String,
            trim: true,
            default: null,
        },
        motherName: {
            type: String,
            trim: true,
            default: null,
        },
        birthPlace: {
            type: String,
            trim: true,
            default: null,
        },
        birthDate: {
            type: Date,
            default: null,
        },
        gender: {
            type: String,
            enum: ["male", "female"],
            default: null,
        },
        nationality: {
            type: String,
            trim: true,
            default: null,
        },
        nationalNumber: {
            type: String,
            required: true,
            trim: true,
        },
        mobile: {
            type: String,
            trim: true,
            default: null,
        },
        profilePictureUrl: {
            type: String,
            trim: true,
            default: null,
        },
        fullName: {
            type: String,
            required: true,
            trim: true,
        },
        fullNameNormalized: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
    },
    { timestamps: true }
);

memberProfileSchema.index({ membershipId: 1 }, { unique: true });
memberProfileSchema.index({ institutionId: 1, nationalNumber: 1 }, { unique: true });
memberProfileSchema.index({ institutionId: 1, fullNameNormalized: 1 });
memberProfileSchema.index({ institutionId: 1, userId: 1 });

module.exports = mongoose.model("MemberProfile", memberProfileSchema);
