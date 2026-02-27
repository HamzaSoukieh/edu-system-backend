const mongoose = require("mongoose");

const otpCodeSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            index: true,
        },
        purpose: {
            type: String,
            required: true,
            enum: ["signup", "login", "reset_password"],
            index: true,
        },
        codeHash: {
            type: String,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
        consumedAt: {
            type: Date,
            default: null,
        },
        attempts: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    { timestamps: true }
);

otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpCodeSchema.index({ email: 1, purpose: 1, consumedAt: 1 });

module.exports = mongoose.model("OtpCode", otpCodeSchema);
