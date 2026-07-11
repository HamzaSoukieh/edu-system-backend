# Billing (Stripe) — Local Setup & Lifecycle

This document explains how to configure Stripe **test mode** for local development
and how the subscription lifecycle works. Until real Stripe test values are set,
the billing API deliberately returns a structured, user-safe error rather than a
masked 500 — see [Configuration gate](#configuration-gate).

## 1. Required environment variables

| Variable | Purpose | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe test secret key | `sk_test_…` — from the Stripe dashboard. Never committed/logged. |
| `STRIPE_WEBHOOK_SECRET` | Verifies webhook signatures | `whsec_…` — printed by `stripe listen`. |
| `STRIPE_PRICE_PLUS_6_MONTH` | Price ID for the Plus plan | `price_…` — a real recurring test Price. |
| `STRIPE_PRICE_PRO_6_MONTH` | Price ID for the Pro plan | `price_…` — a real recurring test Price (≠ Plus). |
| `BILLING_SUCCESS_URL` | Base app URL Stripe returns to on success | Backend appends `?billing=success&session_id={CHECKOUT_SESSION_ID}`. |
| `BILLING_CANCEL_URL` | Base app URL Stripe returns to on cancel | Backend appends `?billing=cancel`. |

Price IDs are **never** hardcoded in source — they are resolved from the env at
request time.

## 2. Create the two test Prices

In the Stripe dashboard (test mode) → Products, create two products, each with a
recurring price (6-month interval), then copy their `price_…` IDs into
`STRIPE_PRICE_PLUS_6_MONTH` / `STRIPE_PRICE_PRO_6_MONTH`. Or via CLI:

```bash
stripe products create --name "Edu Plus"
stripe prices create --product <prod_id> --unit-amount 4900 --currency usd \
  --recurring[interval]=month --recurring[interval_count]=6
# repeat for Pro, then paste the price_… IDs into .env
```

## 3. Forward webhooks locally

```bash
stripe login
stripe listen --forward-to localhost:5000/stripe/webhook
```

`stripe listen` prints a webhook signing secret (`whsec_…`) — copy it into
`STRIPE_WEBHOOK_SECRET` in your `.env` and restart the backend. The webhook route
is mounted with a **raw body** parser *before* `express.json`, so signature
verification uses the exact bytes Stripe sent.

## 4. Configuration gate

Checkout and upgrade run `assertBillingConfigured()` **before** any Stripe call.
If the secret key is missing/placeholder, the price IDs are missing/placeholder,
or the return URLs are invalid, the API responds:

```json
{ "message": "Billing is temporarily unavailable. …", "code": "BILLING_NOT_CONFIGURED" }
```

with HTTP **503** — never a generic "Internal server error". The server logs
*which* variable is missing (name only, never the value). The gate is skipped in
tests that inject a mock Stripe client.

## 5. Subscription lifecycle

```
free ──choose plan──▶ checkout_pending ──webhook: checkout.session.completed / subscription.created──▶ active (plus|pro)
active(plus) ──upgrade-to-pro──▶ active(pro)
active ──invoice.payment_failed──▶ past_due ──invoice.paid──▶ active
active ──subscription.deleted / cancel──▶ canceled ──period end──▶ free
```

Canonical enums live in `src/services/billingConstants.js`
(`BILLING_PLANS`, `SUBSCRIPTION_STATUSES`, `PAID_SUBSCRIPTION_STATUSES`,
`DENIED_SUBSCRIPTION_STATUSES`) and are shared by models + services.

## 6. Webhook events handled

`checkout.session.completed`, `customer.subscription.created|updated|deleted`,
`invoice.paid`, `invoice.payment_failed`. Processing is **idempotent**
(`StripeWebhookEvent` ledger with a claim + stale-retry), reconciles by
customer/subscription/metadata, acknowledges unknown events, and records failures
for platform review while keeping retriable failures retriable.

## 7. Error codes (frontend contract)

`BILLING_NOT_CONFIGURED`, `BILLING_FORBIDDEN`, `INVALID_BILLING_PLAN`,
`SUBSCRIPTION_ALREADY_ACTIVE`, `UPGRADE_NOT_AVAILABLE`, `PAYMENT_ACTION_REQUIRED`,
`STRIPE_INVALID_REQUEST`, `STRIPE_UNAVAILABLE`. The billing controller returns
`{ message, code, details? }`; unexpected 5xx (no code) stay masked.

## 8. Test-mode end-to-end (manual)

1. Set the six env vars (real test key + prices + `whsec` from `stripe listen`).
2. `npm start`; `stripe listen --forward-to localhost:5000/stripe/webhook`.
3. Open the app → Billing → Choose Plus → Stripe Checkout.
4. Pay with test card `4242 4242 4242 4242`, any future expiry/CVC.
5. Stripe redirects back with `?billing=success`; the UI polls and shows **Plus active**.
6. Upgrade to Pro; confirm **Pro active**.
