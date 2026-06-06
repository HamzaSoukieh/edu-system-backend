const mongoose = require("mongoose");

const stripeWebhookEventSchema = new mongoose.Schema(
    {
        stripeEventId: {
            type: String,
            required: true,
            trim: true,
            unique: true,
            index: true,
        },
        type: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        status: {
            type: String,
            enum: ["processing", "processed", "failed"],
            default: "processing",
            required: true,
            index: true,
        },
        errorMessage: {
            type: String,
            trim: true,
            default: null,
        },
        processedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

stripeWebhookEventSchema.index({ stripeEventId: 1, status: 1 });

module.exports = mongoose.model("StripeWebhookEvent", stripeWebhookEventSchema);
