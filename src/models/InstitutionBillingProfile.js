const mongoose = require("mongoose");
const {
    BILLING_INTERVALS,
    BILLING_PLANS,
    SUBSCRIPTION_STATUSES,
} = require("../services/billingConstants");

function normalizeNullableString(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const normalized = String(value).trim();
    return normalized || null;
}

const institutionBillingProfileSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
            unique: true,
        },
        stripeCustomerId: {
            type: String,
            set: normalizeNullableString,
            default: null,
        },
        stripeSubscriptionId: {
            type: String,
            set: normalizeNullableString,
            default: null,
        },
        stripePriceId: {
            type: String,
            set: normalizeNullableString,
            default: null,
        },
        plan: {
            type: String,
            enum: BILLING_PLANS,
            default: null,
        },
        billingInterval: {
            type: String,
            enum: BILLING_INTERVALS,
            default: null,
        },
        stripeProductId: {
            type: String,
            set: normalizeNullableString,
            default: null,
        },
        status: {
            type: String,
            enum: SUBSCRIPTION_STATUSES,
            default: null,
        },
        currentPeriodStart: {
            type: Date,
            default: null,
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

institutionBillingProfileSchema.index(
    { stripeCustomerId: 1 },
    { unique: true, partialFilterExpression: { stripeCustomerId: { $type: "string" } } }
);
institutionBillingProfileSchema.index(
    { stripeSubscriptionId: 1 },
    { unique: true, partialFilterExpression: { stripeSubscriptionId: { $type: "string" } } }
);

module.exports = mongoose.model("InstitutionBillingProfile", institutionBillingProfileSchema);
