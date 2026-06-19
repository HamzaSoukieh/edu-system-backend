# Stripe Billing Postman Guide

Use these files:

- `postman/stripe-billing.postman_collection.json`
- `postman/stripe-billing.local.postman_environment.json`

The local environment uses the development seed accounts only:

- Owner/admin: `owner@example.test` / `Password123!`
- Instructor: `instructor@example.test` / `Password123!`
- Student: `student1@example.test` / `Password123!`

Run `npm run seed:dev` before testing if those accounts are missing. These are local demo credentials, not production accounts.

## Checkout Flow

1. Run the `00 Auth` folder in order.
2. `Create Fresh Billing Sandbox Institution` creates a new unpaid institution and replaces `institutionId` in the selected Postman environment.
3. Run `Get Billing Status`. A fresh sandbox has no billing profile and no paid access.
4. Run either `Create Plus Checkout Session` or the alternative Pro Checkout request.
5. Open the stored `checkoutUrl` and complete Stripe Checkout with Stripe test data.
6. Keep Stripe CLI webhook forwarding active so the local profile receives the subscription state.

Do not use the seeded Demo University for checkout tests. It intentionally has a fake local Pro/trialing billing profile so general development data remains usable, and the duplicate-subscription guard correctly rejects another checkout.

## Plus To Pro Upgrade Flow

1. Create a fresh billing sandbox.
2. Create a Plus Checkout Session.
3. Complete Checkout in Stripe.
4. Wait for verified webhooks to synchronize the profile.
5. Run `Verify Plus Is Active Before Upgrade`.
6. Only continue when the response shows `plan: "plus"` and `status: "active"`.
7. Run `Upgrade To Pro`.
8. Run the immediate status request. Local entitlements remain Plus while Stripe payment/update processing is pending.
9. After the successful verified webhook, run the final status request and confirm Pro limits.

The upgrade endpoint cannot upgrade an unpaid tenant, a Pro tenant, or a tenant that has only created a Checkout Session. It requires an existing live Stripe subscription that is active and currently uses the configured Plus Price.

## Stripe CLI

Use the existing local Stripe CLI setup and forward events to:

```text
http://localhost:5000/stripe/webhook
```

When the backend and MongoDB run through Docker Compose, start all three services together:

```powershell
docker compose up backend mongo stripe-cli
```

When the backend runs directly on the Windows host at port 5000, run only the Stripe CLI image and forward through Docker's host bridge:

```powershell
docker run --rm --name edu-saas-stripe-listener --env-file .env.docker stripe/stripe-cli:latest listen --forward-to http://host.docker.internal:5000/stripe/webhook
```

Keep the listener running before opening/completing Stripe Checkout. If Checkout completes while the listener is stopped, Stripe can have an active subscription while the local `InstitutionBillingProfile` still has `plan: null` and `status: null`.

Do not complete both Plus and Pro Checkout Sessions for the same fresh sandbox. Choose one direct checkout path. For upgrade testing, complete Plus only, verify it is active locally, and then use the upgrade endpoint.

The backend webhook secret must match the secret printed by the active Stripe CLI listener. Never commit that real secret or any real Stripe API key/Price ID.
