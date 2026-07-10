const mongoose = require("mongoose");

// Stateful, rotating refresh tokens (D-008). The raw token is returned to the client
// exactly once; only its SHA-256 hash is stored. Rotation revokes the old token and
// issues a new one in the same `family`. Presenting an already-revoked token is treated
// as reuse/theft and revokes the entire family.
const refreshTokenSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        tokenHash: {
            type: String,
            required: true,
            unique: true,
        },
        // Rotation chain identifier: all tokens rotated from one login share a family.
        family: {
            type: String,
            required: true,
            index: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
        revokedAt: {
            type: Date,
            default: null,
        },
        replacedByTokenHash: {
            type: String,
            default: null,
        },
        createdByIp: {
            type: String,
            default: null,
        },
        userAgent: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

// TTL: expired refresh tokens are purged automatically.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
