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
        status: {
            type: String,
            enum: ["active", "suspended", "archived"],
            default: "active",
        },
        lastLoginAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
