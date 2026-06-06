const mongoose = require("mongoose");

const SUBSCRIPTION_STATUSES = [
    "incomplete",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "incomplete_expired",
    "paused",
];

const institutionBillingProfileSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
            unique: true,
            index: true,
        },
        stripeCustomerId: {
            type: String,
            trim: true,
            default: null,
        },
        stripeSubscriptionId: {
            type: String,
            trim: true,
            default: null,
        },
        stripePriceId: {
            type: String,
            trim: true,
            default: null,
        },
        status: {
            type: String,
            enum: SUBSCRIPTION_STATUSES,
            default: null,
            index: true,
        },
        currentPeriodEnd: {
            type: Date,
            default: null,
        },
        cancelAtPeriodEnd: {
            type: Boolean,
            default: false,
        },
        trialEnd: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

institutionBillingProfileSchema.index({ institutionId: 1, status: 1 });
institutionBillingProfileSchema.index({ institutionId: 1, stripeSubscriptionId: 1 });
institutionBillingProfileSchema.index(
    { stripeCustomerId: 1 },
    { unique: true, partialFilterExpression: { stripeCustomerId: { $type: "string" } } }
);
institutionBillingProfileSchema.index(
    { stripeSubscriptionId: 1 },
    { unique: true, partialFilterExpression: { stripeSubscriptionId: { $type: "string" } } }
);

module.exports = mongoose.model("InstitutionBillingProfile", institutionBillingProfileSchema);
