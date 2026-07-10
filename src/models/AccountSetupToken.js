const mongoose = require("mongoose");

// One-time, expiring, hashed password-setup token for admin-created members (D-006).
// Replaces the insecure "initial password = national number" bootstrap. The raw token
// is emailed once as a setup link; only its SHA-256 hash is stored.
const accountSetupTokenSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            default: null,
        },
        tokenHash: {
            type: String,
            required: true,
            unique: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
        consumedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

// TTL cleanup of expired tokens.
accountSetupTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AccountSetupToken", accountSetupTokenSchema);
