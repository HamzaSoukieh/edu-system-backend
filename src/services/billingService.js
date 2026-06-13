const mongoose = require("mongoose");
const Stripe = require("stripe");
const Institution = require("../models/Institution");
const InstitutionBillingProfile = require("../models/InstitutionBillingProfile");
const StripeWebhookEvent = require("../models/StripeWebhookEvent");

let stripeClientForTests = null;

const STALE_WEBHOOK_PROCESSING_MS = 10 * 60 * 1000;
const ACTIVE_OR_MANAGED_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"];

function createError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeString(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim();
}

function normalizeId(value) {
    if (!value) {
        return null;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed || null;
    }

    if (typeof value.toString === "function") {
        const asString = value.toString().trim();
        return asString || null;
    }

    return null;
}

function isValidObjectId(value) {
    const normalized = normalizeId(value);
    return Boolean(normalized) && mongoose.Types.ObjectId.isValid(normalized);
}

function requireConfig(name) {
    const value = normalizeString(process.env[name]);
    if (!value) {
        throw createError(500, `${name} is not configured`);
    }

    return value;
}

function getStripeClient() {
    if (stripeClientForTests) {
        return stripeClientForTests;
    }

    return new Stripe(requireConfig("STRIPE_SECRET_KEY"));
}

function setStripeClientForTests(client) {
    stripeClientForTests = client;
}

function toStripeDate(value) {
    if (!value) {
        return null;
    }

    return new Date(Number(value) * 1000);
}

function normalizeErrorMessage(error) {
    const message = normalizeString(error?.message || "Stripe webhook processing failed");
    return message.slice(0, 1000);
}

function toBillingProfileResponse(profile) {
    if (!profile) {
        return null;
    }

    return {
        institutionId: profile.institutionId.toString(),
        stripeCustomerId: profile.stripeCustomerId || null,
        stripeSubscriptionId: profile.stripeSubscriptionId || null,
        stripePriceId: profile.stripePriceId || null,
        status: profile.status || null,
        currentPeriodEnd: profile.currentPeriodEnd || null,
        cancelAtPeriodEnd: profile.cancelAtPeriodEnd === true,
        trialEnd: profile.trialEnd || null,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
    };
}

function ensureOwnerOrAdmin({ institution, institutionId, actorUserId, actorMembership }) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (normalizeId(actorMembership.institutionId) !== normalizeId(institutionId)) {
        throw createError(403, "Institution access denied");
    }

    if (actorMembership.status && actorMembership.status !== "active") {
        throw createError(403, "Institution access denied");
    }

    if (actorMembership.role === "admin") {
        return;
    }

    if (normalizeId(institution.ownerUserId) === normalizeId(actorUserId)) {
        return;
    }

    throw createError(403, "Permission denied");
}

async function loadInstitutionForBilling({ institutionId }) {
    const institution = await Institution.findOne({ _id: institutionId })
        .select("_id name ownerUserId status")
        .lean();

    if (!institution) {
        throw createError(404, "Institution not found");
    }

    return institution;
}

async function getOrCreateBillingCustomer({ institution, existingProfile }) {
    if (existingProfile?.stripeCustomerId) {
        return existingProfile.stripeCustomerId;
    }

    const stripe = getStripeClient();
    const institutionId = institution._id.toString();
    const customer = await stripe.customers.create(
        {
            name: institution.name,
            metadata: {
                institutionId,
            },
        },
        {
            idempotencyKey: `customer:create:${institutionId}`,
        }
    );

    if (!customer?.id) {
        throw createError(502, "Stripe customer creation failed");
    }

    return customer.id;
}

async function upsertBillingProfile({ institutionId, updates }) {
    return InstitutionBillingProfile.findOneAndUpdate(
        { institutionId },
        {
            $set: updates,
            $setOnInsert: {
                institutionId,
            },
        },
        {
            upsert: true,
            returnDocument: "after",
            runValidators: true,
            setDefaultsOnInsert: true,
        }
    ).lean();
}

async function createCheckoutSession({ institutionId, actorUserId, actorMembership }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    const [institution, existingProfile] = await Promise.all([
        loadInstitutionForBilling({ institutionId }),
        InstitutionBillingProfile.findOne({ institutionId }).lean(),
    ]);

    ensureOwnerOrAdmin({
        institution,
        institutionId,
        actorUserId,
        actorMembership,
    });

    if (
        existingProfile?.stripeSubscriptionId &&
        ACTIVE_OR_MANAGED_SUBSCRIPTION_STATUSES.includes(existingProfile.status)
    ) {
        throw createError(409, "Institution already has an active subscription");
    }

    const priceId = requireConfig("STRIPE_PRICE_BASIC_MONTHLY");
    const stripeCustomerId = await getOrCreateBillingCustomer({
        institution,
        existingProfile,
    });

    const profile = await upsertBillingProfile({
        institutionId,
        updates: {
            stripeCustomerId,
            stripePriceId: priceId,
        },
    });

    const stripe = getStripeClient();
    const checkoutSession = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: [
            {
                price: priceId,
                quantity: 1,
            },
        ],
        success_url: requireConfig("BILLING_SUCCESS_URL"),
        cancel_url: requireConfig("BILLING_CANCEL_URL"),
        client_reference_id: institutionId.toString(),
        metadata: {
            institutionId: institutionId.toString(),
        },
        subscription_data: {
            metadata: {
                institutionId: institutionId.toString(),
            },
        },
    });

    if (!checkoutSession?.url) {
        throw createError(502, "Stripe checkout session creation failed");
    }

    return {
        checkoutSession: {
            id: checkoutSession.id,
            url: checkoutSession.url,
        },
        billingProfile: toBillingProfileResponse(profile),
    };
}

async function getBillingStatus({ institutionId, actorUserId, actorMembership }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    const institution = await loadInstitutionForBilling({ institutionId });
    ensureOwnerOrAdmin({
        institution,
        institutionId,
        actorUserId,
        actorMembership,
    });

    const profile = await InstitutionBillingProfile.findOne({ institutionId }).lean();

    return {
        billingProfile: toBillingProfileResponse(profile),
    };
}

function buildSubscriptionProfileUpdates(subscription) {
    const priceId = subscription.items?.data?.[0]?.price?.id || null;

    return {
        stripeCustomerId: normalizeString(subscription.customer) || null,
        stripeSubscriptionId: normalizeString(subscription.id) || null,
        stripePriceId: priceId,
        status: normalizeString(subscription.status) || null,
        currentPeriodEnd: toStripeDate(subscription.current_period_end),
        cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
        trialEnd: toStripeDate(subscription.trial_end),
    };
}

async function updateBillingProfileFromSubscription(subscription) {
    const institutionId = await resolveInstitutionIdForSubscription(subscription);
    if (!institutionId) {
        return null;
    }

    const institution = await Institution.findOne({ _id: institutionId })
        .select("_id")
        .lean();
    if (!institution) {
        return null;
    }

    return upsertBillingProfile({
        institutionId,
        updates: buildSubscriptionProfileUpdates(subscription),
    });
}

async function resolveInstitutionIdForSubscription(subscription) {
    const metadataInstitutionId = normalizeId(subscription.metadata?.institutionId);
    if (metadataInstitutionId && isValidObjectId(metadataInstitutionId)) {
        return metadataInstitutionId;
    }

    const subscriptionId = normalizeString(subscription.id);
    if (subscriptionId) {
        const profile = await InstitutionBillingProfile.findOne({
            stripeSubscriptionId: subscriptionId,
        })
            .select("institutionId")
            .lean();

        if (profile?.institutionId) {
            return normalizeId(profile.institutionId);
        }
    }

    const customerId = normalizeString(subscription.customer);
    if (customerId) {
        const profile = await InstitutionBillingProfile.findOne({
            stripeCustomerId: customerId,
        })
            .select("institutionId")
            .lean();

        if (profile?.institutionId) {
            return normalizeId(profile.institutionId);
        }
    }

    return null;
}

async function retrieveAndUpdateSubscription(subscriptionId) {
    const normalizedSubscriptionId = normalizeString(subscriptionId);
    if (!normalizedSubscriptionId) {
        return null;
    }

    const subscription = await getStripeClient().subscriptions.retrieve(normalizedSubscriptionId);
    return updateBillingProfileFromSubscription(subscription);
}

async function handleCheckoutSessionCompleted(session) {
    const institutionId = normalizeId(session.metadata?.institutionId || session.client_reference_id);
    if (!institutionId || !isValidObjectId(institutionId)) {
        return null;
    }

    const institution = await Institution.findOne({ _id: institutionId })
        .select("_id")
        .lean();
    if (!institution) {
        return null;
    }

    const updates = {
        stripeCustomerId: normalizeString(session.customer) || null,
    };
    if (session.subscription) {
        updates.stripeSubscriptionId = normalizeString(session.subscription);
    }

    const profile = await upsertBillingProfile({
        institutionId,
        updates,
    });

    if (session.subscription) {
        await retrieveAndUpdateSubscription(session.subscription);
    }

    return profile;
}

async function handleInvoiceEvent(invoice) {
    const subscriptionId =
        normalizeString(invoice.subscription) ||
        normalizeString(invoice.parent?.subscription_details?.subscription);

    if (!subscriptionId) {
        return null;
    }

    return retrieveAndUpdateSubscription(subscriptionId);
}

async function handleStripeWebhookEvent(event) {
    const object = event.data?.object || {};

    if (event.type === "checkout.session.completed") {
        await handleCheckoutSessionCompleted(object);
        return;
    }

    if (
        event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
    ) {
        await updateBillingProfileFromSubscription(object);
        return;
    }

    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
        await handleInvoiceEvent(object);
    }
}

async function processStripeWebhookEvent(event) {
    if (!event?.id || !event?.type) {
        throw createError(400, "Invalid Stripe event");
    }

    const claim = await claimStripeWebhookEvent(event);
    if (!claim.claimed) {
        return {
            received: true,
            duplicate: true,
        };
    }

    try {
        await handleStripeWebhookEvent(event);
        await StripeWebhookEvent.findOneAndUpdate(
            { stripeEventId: event.id },
            {
                $set: {
                    type: event.type,
                    status: "processed",
                    processedAt: new Date(),
                    errorMessage: null,
                },
            },
            { returnDocument: "after", runValidators: true }
        );
    } catch (error) {
        await StripeWebhookEvent.findOneAndUpdate(
            { stripeEventId: event.id },
            {
                $set: {
                    type: event.type,
                    status: "failed",
                    processedAt: null,
                    errorMessage: normalizeErrorMessage(error),
                },
            },
            { returnDocument: "after", runValidators: true }
        );
        throw error;
    }

    return {
        received: true,
        duplicate: false,
    };
}

async function claimStripeWebhookEvent(event) {
    const staleCutoff = new Date(Date.now() - STALE_WEBHOOK_PROCESSING_MS);

    try {
        await StripeWebhookEvent.create({
            stripeEventId: event.id,
            type: event.type,
            status: "processing",
            processedAt: null,
            errorMessage: null,
        });
        return {
            claimed: true,
        };
    } catch (error) {
        if (error?.code !== 11000) {
            throw error;
        }

        const retryClaim = await StripeWebhookEvent.findOneAndUpdate(
            {
                stripeEventId: event.id,
                $or: [
                    { status: "failed" },
                    { status: "processing", updatedAt: { $lt: staleCutoff } },
                    { status: "processing", updatedAt: null, createdAt: { $lt: staleCutoff } },
                ],
            },
            {
                $set: {
                    type: event.type,
                    status: "processing",
                    processedAt: null,
                    errorMessage: null,
                },
            },
            { returnDocument: "after", runValidators: true }
        ).lean();

        if (!retryClaim) {
            return {
                claimed: false,
            };
        }

        return {
            claimed: true,
        };
    }
}

function constructStripeWebhookEvent({ rawBody, signature }) {
    const webhookSecret = requireConfig("STRIPE_WEBHOOK_SECRET");
    const stripe = getStripeClient();

    try {
        return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (_error) {
        throw createError(400, "Invalid Stripe webhook signature");
    }
}

module.exports = {
    setStripeClientForTests,
    toBillingProfileResponse,
    createCheckoutSession,
    getBillingStatus,
    processStripeWebhookEvent,
    constructStripeWebhookEvent,
    updateBillingProfileFromSubscription,
    buildSubscriptionProfileUpdates,
    claimStripeWebhookEvent,
};
