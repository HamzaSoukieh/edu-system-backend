const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        passwordHash: {
            type: String,
            required: true,
        },
        isEmailVerified: {
            type: Boolean,
            default: false,
        },
        mustChangePassword: {
            type: Boolean,
            default: false,
        },
        status: {
            type: String,
            enum: ["active", "suspended", "archived"],
            default: "active",
        },
        // Bumped to invalidate every previously-issued access token for this user
        // (password reset, logout-all). Checked against the access-token claim in authJwt.
        tokenVersion: {
            type: Number,
            default: 0,
        },
        lastLoginAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
