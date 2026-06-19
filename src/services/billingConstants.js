const BILLING_PLANS = Object.freeze(["plus", "pro"]);
const BILLING_INTERVALS = Object.freeze(["six_month"]);
const SUBSCRIPTION_STATUSES = Object.freeze([
    "incomplete",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "incomplete_expired",
    "paused",
]);
const PAID_SUBSCRIPTION_STATUSES = Object.freeze(["active", "trialing", "past_due"]);
const DENIED_SUBSCRIPTION_STATUSES = Object.freeze([
    "incomplete",
    "incomplete_expired",
    "unpaid",
    "canceled",
    "paused",
]);
const ACTIVE_STAFF_ROLES = Object.freeze(["admin", "instructor"]);

module.exports = {
    ACTIVE_STAFF_ROLES,
    BILLING_INTERVALS,
    BILLING_PLANS,
    DENIED_SUBSCRIPTION_STATUSES,
    PAID_SUBSCRIPTION_STATUSES,
    SUBSCRIPTION_STATUSES,
};
