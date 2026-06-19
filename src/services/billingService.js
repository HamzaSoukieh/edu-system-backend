const mongoose = require("mongoose");
const Stripe = require("stripe");
const Institution = require("../models/Institution");
const InstitutionBillingProfile = require("../models/InstitutionBillingProfile");
const StripeWebhookEvent = require("../models/StripeWebhookEvent");
const {
    BILLING_PLANS,
    PAID_SUBSCRIPTION_STATUSES,
    getBillingPlanConfig,
    resolveBillingPlanByStripePriceId,
    validateConfiguredBillingPrices,
} = require("./billingPlanConfig");
const { getInstitutionBillingEntitlements } = require("./billingEntitlementService");

let stripeClientForTests = null;

const STALE_WEBHOOK_PROCESSING_MS = 10 * 60 * 1000;
const CHECKOUT_ALLOWED_FIELDS = ["plan"];
const UPGRADE_FROM_PLAN = "plus";
const UPGRADE_TO_PLAN = "pro";
const UPGRADE_ALLOWED_STATUS = "active";
const UPGRADE_ALLOWED_COLLECTION_METHOD = "charge_automatically";
const STRIPE_API_VERSION = "2026-05-27.dahlia";
const STRIPE_SUBSCRIPTION_RETRIEVE_EXPAND = Object.freeze(["items.data.price"]);
const STRIPE_SUBSCRIPTION_UPDATE_EXPAND = Object.freeze(["latest_invoice.confirmation_secret"]);

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

function normalizeNestedId(value) {
    return normalizeId(value?._id || value);
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

function requireBillingPlanPriceId(planConfig) {
    const configuredPrices = validateConfiguredBillingPrices();
    const priceId = configuredPrices[planConfig?.plan];
    if (!priceId) {
        throw createError(500, "Billing plan price is not configured");
    }

    return priceId;
}

function requireUpgradePriceIds() {
    const configuredPrices = validateConfiguredBillingPrices();
    const plusPriceId = configuredPrices[UPGRADE_FROM_PLAN];
    const proPriceId = configuredPrices[UPGRADE_TO_PLAN];

    if (!plusPriceId || !proPriceId || plusPriceId === proPriceId) {
        throw createError(500, "Billing plan price is not configured");
    }

    return {
        plusPriceId,
        proPriceId,
    };
}

function getStripeClient() {
    if (stripeClientForTests) {
        return stripeClientForTests;
    }

    return new Stripe(requireConfig("STRIPE_SECRET_KEY"), {
        apiVersion: STRIPE_API_VERSION,
    });
}

function setStripeClientForTests(client) {
    stripeClientForTests = client;
}

function toStripeDate(value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return null;
    }

    const date = new Date(timestamp * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
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
        plan: profile.plan || null,
        billingInterval: profile.billingInterval || null,
        stripeProductId: profile.stripeProductId || null,
        status: profile.status || null,
        currentPeriodStart: profile.currentPeriodStart || null,
        currentPeriodEnd: profile.currentPeriodEnd || null,
        cancelAtPeriodEnd: profile.cancelAtPeriodEnd === true,
        trialEnd: profile.trialEnd || null,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
    };
}

function validateCheckoutInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    for (const field of Object.keys(payload)) {
        if (!CHECKOUT_ALLOWED_FIELDS.includes(field)) {
            throw createError(400, `Unexpected field: ${field}`);
        }
    }

    const plan = normalizeString(payload.plan).toLowerCase();
    if (!plan) {
        throw createError(400, "plan is required");
    }

    const planConfig = getBillingPlanConfig(plan);
    if (!planConfig) {
        throw createError(400, `plan must be one of: ${BILLING_PLANS.join(", ")}`);
    }

    return planConfig;
}

function ensureOwnerOrAdmin({ institution, institutionId, actorUserId, actorMembership }) {
    const normalizedActorUserId = normalizeId(actorUserId);
    if (!normalizedActorUserId || !isValidObjectId(normalizedActorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    const actorMembershipUserId = normalizeNestedId(actorMembership.userId);
    const actorMembershipInstitutionId = normalizeNestedId(actorMembership.institutionId);
    if (
        actorMembershipUserId !== normalizedActorUserId ||
        actorMembershipInstitutionId !== normalizeId(institutionId) ||
        actorMembership.status !== "active"
    ) {
        throw createError(403, "Institution access denied");
    }

    if (actorMembership.role === "admin") {
        return;
    }

    if (normalizeId(institution.ownerUserId) === normalizedActorUserId) {
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

async function createCheckoutSession({ institutionId, actorUserId, actorMembership, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    const planConfig = validateCheckoutInput(payload);

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

    if (PAID_SUBSCRIPTION_STATUSES.includes(normalizeString(existingProfile?.status).toLowerCase())) {
        throw createError(409, "Institution already has an active subscription");
    }

    const priceId = requireBillingPlanPriceId(planConfig);
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
            plan: planConfig.plan,
        },
        subscription_data: {
            metadata: {
                institutionId: institutionId.toString(),
                plan: planConfig.plan,
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
        entitlements: getInstitutionBillingEntitlements(profile),
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
        entitlements: getInstitutionBillingEntitlements(profile),
    };
}

function createStripeSubscriptionConflictError() {
    return createError(409, "Stripe subscription identity conflict");
}

function createUpgradeConflictError(message = "Subscription upgrade is not available") {
    return createError(409, message);
}

function getFirstSubscriptionItem(subscription) {
    const items = subscription?.items?.data;
    if (!Array.isArray(items) || items.length === 0) {
        return null;
    }

    return items[0] || null;
}

function normalizeStripeProductId(product) {
    if (!product) {
        return null;
    }

    if (typeof product === "string") {
        return normalizeString(product) || null;
    }

    if (typeof product === "object") {
        return normalizeString(product.id) || null;
    }

    return null;
}

function normalizeStripeCustomerId(customer) {
    if (typeof customer === "string") {
        return normalizeString(customer) || null;
    }

    if (customer && typeof customer === "object") {
        return normalizeString(customer.id) || null;
    }

    return null;
}

function normalizeStripeSubscriptionId(subscription) {
    if (typeof subscription === "string") {
        return normalizeString(subscription) || null;
    }

    if (subscription && typeof subscription === "object") {
        return normalizeString(subscription.id) || null;
    }

    return null;
}

function normalizeStripeObjectId(value) {
    if (typeof value === "string") {
        return normalizeString(value) || null;
    }

    if (value && typeof value === "object") {
        return normalizeString(value.id) || null;
    }

    return null;
}

function normalizeStripeSubscriptionItemId(item) {
    return normalizeString(item?.id) || null;
}

function createStripeIdentityConflictError() {
    return createError(409, "Stripe billing identity conflict");
}

function addInstitutionCandidate(candidateIds, institutionId) {
    const normalizedInstitutionId = normalizeId(institutionId);
    if (normalizedInstitutionId && isValidObjectId(normalizedInstitutionId)) {
        candidateIds.add(normalizedInstitutionId);
    }
}

function resolveSingleInstitutionCandidate(candidateIds) {
    if (candidateIds.size === 0) {
        return null;
    }

    if (candidateIds.size > 1) {
        throw createStripeIdentityConflictError();
    }

    return [...candidateIds][0];
}

async function findInstitutionIdByStripeSubscriptionId(subscriptionId) {
    const normalizedSubscriptionId = normalizeString(subscriptionId);
    if (!normalizedSubscriptionId) {
        return null;
    }

    const profile = await InstitutionBillingProfile.findOne({
        stripeSubscriptionId: normalizedSubscriptionId,
    })
        .select("institutionId")
        .lean();

    return normalizeId(profile?.institutionId);
}

async function findInstitutionIdByStripeCustomerId(customerId) {
    const normalizedCustomerId = normalizeString(customerId);
    if (!normalizedCustomerId) {
        return null;
    }

    const profile = await InstitutionBillingProfile.findOne({
        stripeCustomerId: normalizedCustomerId,
    })
        .select("institutionId")
        .lean();

    return normalizeId(profile?.institutionId);
}

function getSubscriptionItems(subscription) {
    const items = subscription?.items?.data;
    return Array.isArray(items) ? items : [];
}

function normalizeStripePriceId(price) {
    return normalizeStripeObjectId(price);
}

function getSubscriptionItemPriceId(item) {
    return normalizeStripePriceId(item?.price);
}

function pendingUpdateContainsPrice(subscription, priceId) {
    const targetPriceId = normalizeString(priceId);
    const pendingItems = subscription?.pending_update?.subscription_items;
    if (!targetPriceId || !Array.isArray(pendingItems)) {
        return false;
    }

    return pendingItems.some((item) => getSubscriptionItemPriceId(item) === targetPriceId);
}

function hasStripeSchedule(subscription) {
    return Boolean(normalizeStripeObjectId(subscription?.schedule));
}

function validateLiveStripeSubscriptionForUpgrade(subscription) {
    if (normalizeString(subscription?.status).toLowerCase() !== UPGRADE_ALLOWED_STATUS) {
        throw createUpgradeConflictError("Stripe subscription status is not eligible for upgrade");
    }

    if (normalizeString(subscription?.collection_method).toLowerCase() !== UPGRADE_ALLOWED_COLLECTION_METHOD) {
        throw createUpgradeConflictError("Subscription collection method is not eligible for upgrade");
    }

    if (hasStripeSchedule(subscription)) {
        throw createUpgradeConflictError("Scheduled subscriptions are not eligible for upgrade");
    }
}

function getSingleUpgradeableSubscriptionItem({ subscription, plusPriceId, proPriceId }) {
    const items = getSubscriptionItems(subscription);
    if (items.length !== 1) {
        throw createUpgradeConflictError("Subscription item is not eligible for upgrade");
    }

    const item = items[0];
    const itemId = normalizeStripeSubscriptionItemId(item);
    const priceId = getSubscriptionItemPriceId(item);
    const quantity = Number(item.quantity);

    if (!itemId || !priceId || quantity !== 1) {
        throw createUpgradeConflictError("Subscription item is not eligible for upgrade");
    }

    if (priceId === proPriceId) {
        throw createUpgradeConflictError("Subscription is already on Pro");
    }

    if (priceId !== plusPriceId) {
        throw createUpgradeConflictError("Subscription price is not eligible for upgrade");
    }

    return item;
}

function extractStripeInvoiceClientSecret(subscription) {
    const invoice = subscription?.latest_invoice;
    if (!invoice || typeof invoice !== "object") {
        return null;
    }

    const confirmationSecret = normalizeString(invoice.confirmation_secret?.client_secret);
    if (confirmationSecret) {
        return confirmationSecret;
    }

    return null;
}

function extractStripeInvoicePaymentStatus(subscription) {
    const invoice = subscription?.latest_invoice;
    if (!invoice || typeof invoice !== "object") {
        return null;
    }

    const paymentIntentStatus = normalizeString(invoice.payment_intent?.status).toLowerCase();
    if (paymentIntentStatus) {
        return paymentIntentStatus;
    }

    const invoicePaymentStatus = normalizeString(invoice.payment?.status).toLowerCase();
    if (invoicePaymentStatus) {
        return invoicePaymentStatus;
    }

    const firstPayment = Array.isArray(invoice.payments?.data) ? invoice.payments.data[0] : null;
    return (
        normalizeString(firstPayment?.payment_intent?.status).toLowerCase() ||
        normalizeString(firstPayment?.payment?.payment_intent?.status).toLowerCase() ||
        normalizeString(firstPayment?.status).toLowerCase() ||
        null
    );
}

function toUpgradeResponse(subscription) {
    const hasPendingUpdate = Boolean(subscription?.pending_update);
    const clientSecret = extractStripeInvoiceClientSecret(subscription);
    const paymentStatus = extractStripeInvoicePaymentStatus(subscription);
    const upgrade = {
        fromPlan: UPGRADE_FROM_PLAN,
        toPlan: UPGRADE_TO_PLAN,
    };

    if (!hasPendingUpdate) {
        upgrade.status = "processing";
        return {
            upgrade,
        };
    }

    if (clientSecret && paymentStatus === "requires_action") {
        upgrade.status = "payment_action_required";
        upgrade.clientSecret = clientSecret;
        return {
            upgrade,
        };
    }

    if (paymentStatus === "requires_payment_method") {
        upgrade.status = "payment_failed";
        return {
            upgrade,
        };
    }

    upgrade.status = "payment_incomplete";
    return {
        upgrade,
    };
}

function validateLocalUpgradeEligibility(profile) {
    if (!profile) {
        throw createError(404, "Billing profile not found");
    }

    const localPlan = normalizeString(profile.plan).toLowerCase();
    if (localPlan === UPGRADE_TO_PLAN) {
        throw createUpgradeConflictError("Institution is already on Pro");
    }

    if (localPlan !== UPGRADE_FROM_PLAN) {
        throw createUpgradeConflictError("Only Plus subscriptions can be upgraded to Pro");
    }

    if (normalizeString(profile.status).toLowerCase() !== UPGRADE_ALLOWED_STATUS) {
        throw createUpgradeConflictError("Subscription status is not eligible for upgrade");
    }

    if (!normalizeString(profile.stripeCustomerId)) {
        throw createUpgradeConflictError("Billing profile is missing Stripe customer");
    }

    if (!normalizeString(profile.stripeSubscriptionId)) {
        throw createUpgradeConflictError("Billing profile is missing Stripe subscription");
    }
}

function validateLocalUpgradePriceSynchronization(profile, plusPriceId) {
    if (normalizeString(profile?.stripePriceId) !== plusPriceId) {
        throw createUpgradeConflictError("Local billing profile is not synchronized");
    }
}

async function validateStripeMappingForUpgrade({ institutionId, profile, subscription }) {
    const normalizedInstitutionId = normalizeId(institutionId);
    const profileCustomerId = normalizeString(profile.stripeCustomerId);
    const profileSubscriptionId = normalizeString(profile.stripeSubscriptionId);
    const subscriptionId = normalizeStripeSubscriptionId(subscription);
    const subscriptionCustomerId = normalizeStripeCustomerId(subscription.customer);

    if (!subscriptionId || subscriptionId !== profileSubscriptionId) {
        throw createStripeSubscriptionConflictError();
    }

    if (!subscriptionCustomerId || subscriptionCustomerId !== profileCustomerId) {
        throw createStripeSubscriptionConflictError();
    }

    const metadataInstitutionId = normalizeString(subscription.metadata?.institutionId);
    if (metadataInstitutionId && metadataInstitutionId !== normalizedInstitutionId) {
        throw createStripeSubscriptionConflictError();
    }

    const mappedBySubscription = await findInstitutionIdByStripeSubscriptionId(subscriptionId);
    if (mappedBySubscription && mappedBySubscription !== normalizedInstitutionId) {
        throw createStripeSubscriptionConflictError();
    }

    const mappedByCustomer = await findInstitutionIdByStripeCustomerId(subscriptionCustomerId);
    if (mappedByCustomer && mappedByCustomer !== normalizedInstitutionId) {
        throw createStripeSubscriptionConflictError();
    }
}

function getSubscriptionUpgradeStateMarker(subscription) {
    const latestInvoiceId = normalizeStripeObjectId(subscription?.latest_invoice);
    if (latestInvoiceId) {
        return `invoice:${latestInvoiceId}`;
    }

    const updatedTimestamp = Number(subscription?.updated);
    if (Number.isFinite(updatedTimestamp) && updatedTimestamp > 0) {
        return `updated:${updatedTimestamp}`;
    }

    const firstItem = getFirstSubscriptionItem(subscription);
    const periodEnd = firstItem?.current_period_end ?? subscription?.current_period_end;
    const normalizedPeriodEnd = Number(periodEnd);
    if (Number.isFinite(normalizedPeriodEnd) && normalizedPeriodEnd > 0) {
        return `period:${normalizedPeriodEnd}`;
    }

    return "no-invoice";
}

async function upgradeSubscriptionToPro({ institutionId, actorUserId, actorMembership }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    const [institution, profile] = await Promise.all([
        loadInstitutionForBilling({ institutionId }),
        InstitutionBillingProfile.findOne({ institutionId }).lean(),
    ]);

    ensureOwnerOrAdmin({
        institution,
        institutionId,
        actorUserId,
        actorMembership,
    });

    validateLocalUpgradeEligibility(profile);
    const { plusPriceId, proPriceId } = requireUpgradePriceIds();
    validateLocalUpgradePriceSynchronization(profile, plusPriceId);

    const stripe = getStripeClient();
    const subscriptionId = normalizeString(profile.stripeSubscriptionId);
    let subscription;
    try {
        subscription = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: [...STRIPE_SUBSCRIPTION_RETRIEVE_EXPAND],
        });
    } catch (_error) {
        throw createError(502, "Stripe subscription retrieval failed");
    }

    await validateStripeMappingForUpgrade({
        institutionId,
        profile,
        subscription,
    });

    validateLiveStripeSubscriptionForUpgrade(subscription);

    if (pendingUpdateContainsPrice(subscription, proPriceId)) {
        throw createUpgradeConflictError("Subscription upgrade is already in progress");
    }

    if (subscription?.pending_update) {
        throw createUpgradeConflictError("Subscription has a pending update");
    }

    const item = getSingleUpgradeableSubscriptionItem({
        subscription,
        plusPriceId,
        proPriceId,
    });
    const itemId = normalizeStripeSubscriptionItemId(item);

    let updatedSubscription;
    try {
        updatedSubscription = await stripe.subscriptions.update(
            subscriptionId,
            {
                items: [
                    {
                        id: itemId,
                        price: proPriceId,
                    },
                ],
                proration_behavior: "always_invoice",
                payment_behavior: "pending_if_incomplete",
                expand: [...STRIPE_SUBSCRIPTION_UPDATE_EXPAND],
            },
            {
                idempotencyKey: `subscription-upgrade:${normalizeId(institutionId)}:${subscriptionId}:${getSubscriptionUpgradeStateMarker(subscription)}:${plusPriceId}:to:${proPriceId}`,
            }
        );
    } catch (_error) {
        throw createError(502, "Stripe subscription upgrade failed");
    }

    return toUpgradeResponse(updatedSubscription);
}

function buildSubscriptionProfileUpdates(subscription) {
    const item = getFirstSubscriptionItem(subscription);
    const price = item?.price || null;
    const priceId = normalizeStripePriceId(price);
    const planConfig = resolveBillingPlanByStripePriceId(priceId);

    return {
        stripeCustomerId: normalizeStripeCustomerId(subscription.customer),
        stripeSubscriptionId: normalizeString(subscription.id) || null,
        stripePriceId: priceId,
        stripeProductId: normalizeStripeProductId(price?.product),
        plan: planConfig ? planConfig.plan : null,
        billingInterval: planConfig ? planConfig.billingInterval : null,
        status: normalizeString(subscription.status) || null,
        currentPeriodStart: toStripeDate(item?.current_period_start ?? subscription.current_period_start),
        currentPeriodEnd: toStripeDate(item?.current_period_end ?? subscription.current_period_end),
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
    const candidateIds = new Set();
    addInstitutionCandidate(candidateIds, subscription.metadata?.institutionId);

    const subscriptionId = normalizeStripeSubscriptionId(subscription);
    if (subscriptionId) {
        addInstitutionCandidate(
            candidateIds,
            await findInstitutionIdByStripeSubscriptionId(subscriptionId)
        );
    }

    const customerId = normalizeStripeCustomerId(subscription.customer);
    if (customerId) {
        addInstitutionCandidate(candidateIds, await findInstitutionIdByStripeCustomerId(customerId));
    }

    return resolveSingleInstitutionCandidate(candidateIds);
}

async function retrieveAndUpdateSubscription(subscriptionId) {
    const normalizedSubscriptionId = normalizeString(subscriptionId);
    if (!normalizedSubscriptionId) {
        return null;
    }

    const subscription = await getStripeClient().subscriptions.retrieve(normalizedSubscriptionId);
    return updateBillingProfileFromSubscription(subscription);
}

async function retrieveAndUpdateCurrentSubscriptionForWebhook(subscription) {
    const subscriptionId = normalizeStripeSubscriptionId(subscription);
    if (!subscriptionId) {
        return null;
    }

    return retrieveAndUpdateSubscription(subscriptionId);
}

async function handleCheckoutSessionCompleted(session) {
    const institutionId = await resolveInstitutionIdForCheckoutSession(session);
    if (!institutionId) {
        return null;
    }

    const institution = await Institution.findOne({ _id: institutionId })
        .select("_id")
        .lean();
    if (!institution) {
        return null;
    }

    const updates = {
        stripeCustomerId: normalizeStripeCustomerId(session.customer),
    };
    const sessionSubscriptionId = normalizeStripeSubscriptionId(session.subscription);
    if (sessionSubscriptionId) {
        updates.stripeSubscriptionId = sessionSubscriptionId;
    }

    if (sessionSubscriptionId) {
        const subscription = await getStripeClient().subscriptions.retrieve(sessionSubscriptionId);
        Object.assign(updates, buildSubscriptionProfileUpdates(subscription));
    }

    return upsertBillingProfile({
        institutionId,
        updates,
    });
}

async function resolveInstitutionIdForCheckoutSession(session) {
    const candidateIds = new Set();
    addInstitutionCandidate(candidateIds, session.metadata?.institutionId);
    addInstitutionCandidate(candidateIds, session.client_reference_id);

    const customerId = normalizeStripeCustomerId(session.customer);
    if (customerId) {
        addInstitutionCandidate(candidateIds, await findInstitutionIdByStripeCustomerId(customerId));
    }

    const sessionSubscriptionId = normalizeStripeSubscriptionId(session.subscription);
    if (sessionSubscriptionId) {
        addInstitutionCandidate(
            candidateIds,
            await findInstitutionIdByStripeSubscriptionId(sessionSubscriptionId)
        );
    }

    return resolveSingleInstitutionCandidate(candidateIds);
}

async function handleInvoiceEvent(invoice) {
    const subscriptionId =
        normalizeStripeSubscriptionId(invoice.subscription) ||
        normalizeStripeSubscriptionId(invoice.parent?.subscription_details?.subscription);

    if (!subscriptionId) {
        return null;
    }

    return retrieveAndUpdateSubscription(subscriptionId);
}

async function handleStripeWebhookEvent(event) {
    const object = event.data?.object || {};

    if (event.type === "checkout.session.completed") {
        return handleCheckoutSessionCompleted(object);
    }

    if (
        event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated"
    ) {
        return retrieveAndUpdateCurrentSubscriptionForWebhook(object);
    }

    if (event.type === "customer.subscription.deleted") {
        return updateBillingProfileFromSubscription(object);
    }

    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
        return handleInvoiceEvent(object);
    }

    return null;
}

async function resolveInstitutionIdForFailedWebhook(event) {
    const object = event?.data?.object || {};
    if (event?.type === "checkout.session.completed") {
        return resolveInstitutionIdForCheckoutSession(object);
    }
    if (event?.type?.startsWith("customer.subscription.")) {
        return resolveInstitutionIdForSubscription(object);
    }
    if (event?.type === "invoice.paid" || event?.type === "invoice.payment_failed") {
        const subscriptionId =
            normalizeStripeSubscriptionId(object.subscription) ||
            normalizeStripeSubscriptionId(object.parent?.subscription_details?.subscription);
        return subscriptionId ? findInstitutionIdByStripeSubscriptionId(subscriptionId) : null;
    }
    return null;
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
        const billingProfile = await handleStripeWebhookEvent(event);
        const institutionId = normalizeNestedId(billingProfile?.institutionId);
        await StripeWebhookEvent.findOneAndUpdate(
            { stripeEventId: event.id },
            {
                $set: {
                    type: event.type,
                    status: "processed",
                    processedAt: new Date(),
                    errorMessage: null,
                    ...(institutionId ? { institutionId } : {}),
                },
            },
            { returnDocument: "after", runValidators: true }
        );
    } catch (error) {
        let institutionId = null;
        try {
            institutionId = normalizeId(await resolveInstitutionIdForFailedWebhook(event));
        } catch (_resolutionError) {
            // Conflicting or unavailable mappings remain unattributed instead of being guessed.
        }
        await StripeWebhookEvent.findOneAndUpdate(
            { stripeEventId: event.id },
            {
                $set: {
                    type: event.type,
                    status: "failed",
                    processedAt: null,
                    errorMessage: normalizeErrorMessage(error),
                    ...(institutionId ? { institutionId } : {}),
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
            attemptCount: 1,
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
                $inc: { attemptCount: 1 },
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
    upgradeSubscriptionToPro,
    getBillingStatus,
    processStripeWebhookEvent,
    constructStripeWebhookEvent,
    updateBillingProfileFromSubscription,
    buildSubscriptionProfileUpdates,
    claimStripeWebhookEvent,
    validateCheckoutInput,
    requireBillingPlanPriceId,
    normalizeStripeProductId,
    normalizeStripePriceId,
    getSingleUpgradeableSubscriptionItem,
    extractStripeInvoiceClientSecret,
    STRIPE_API_VERSION,
};
