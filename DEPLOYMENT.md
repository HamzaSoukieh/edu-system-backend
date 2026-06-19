# Deployment

This backend is a Node.js / Express / Mongoose API prepared for Railway or Render with MongoDB Atlas.

## Runtime

- Install command: `npm install`
- Start command: `npm start`
- Backend entry: `src/server.js`
- Default port: `5000`
- Port source: `process.env.PORT || 5000`

`package.json` already defines:

```json
"start": "node src/server.js"
```

## Required Environment Variables

Set real values in Railway or Render environment variables. Do not commit real secrets to GitHub.

```env
PORT=5000
NODE_ENV=production

MONGO_URI=mongodb+srv://<db_username>:<db_password>@cluster0.uj0qy.mongodb.net/edu-saas?retryWrites=true&w=majority&appName=Cluster0

JWT_SECRET=replace-with-long-random-secret
QR_JWT_SECRET=replace-with-another-long-random-secret

FRONTEND_URL=https://frontend-domain.com
FRONTEND_URLS=https://frontend-domain.com,http://localhost:5173,http://localhost:3000

GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-gmail-app-password
EMAIL_FROM=your-email@gmail.com

STRIPE_SECRET_KEY=sk_test_or_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_PLUS_6_MONTH=price_replace_me
STRIPE_PRICE_PRO_6_MONTH=price_replace_me

BILLING_SUCCESS_URL=https://frontend-domain.com/billing/success?session_id={CHECKOUT_SESSION_ID}
BILLING_CANCEL_URL=https://frontend-domain.com/billing/cancel
```

## MongoDB Atlas

The backend reads MongoDB from `MONGO_URI`.

Use a MongoDB Atlas connection string like:

```env
MONGO_URI=mongodb+srv://<db_username>:<db_password>@cluster0.uj0qy.mongodb.net/edu-saas?retryWrites=true&w=majority&appName=Cluster0
```

Atlas checklist:

- Create an Atlas database user.
- Allow network access for the deployment platform. For simple Render/Railway deployment, `0.0.0.0/0` is commonly used.
- Replace `<db_username>` and `<db_password>` in the environment variable only, not in committed files.

## Frontend Handoff

The frontend only needs the deployed backend API URL, for example:

```txt
https://backend-domain.com
```

The backend CORS allow-list is controlled by:

- `FRONTEND_URL` for one frontend domain.
- `FRONTEND_URLS` for a comma-separated list of frontend domains.

Do not use `*` with credentialed browser requests.

## Stripe

The Stripe webhook route is:

```txt
POST /stripe/webhook
```

After deployment, configure Stripe to send webhooks to:

```txt
https://backend-domain.com/stripe/webhook
```

Then copy the generated Stripe webhook signing secret into:

```env
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

Billing success and cancel URLs should point to the deployed frontend domain:

```env
BILLING_SUCCESS_URL=https://frontend-domain.com/billing/success?session_id={CHECKOUT_SESSION_ID}
BILLING_CANCEL_URL=https://frontend-domain.com/billing/cancel
```

## Local Files And Uploads

This project currently uses local folders such as `uploads/` and `storage/` for files. Local files are not safe long-term on many free hosting plans because files can disappear after redeploys, restarts, or instance replacement.

For production, add object storage later, such as S3-compatible storage, Cloudflare R2, or another managed file storage service.

## Railway / Render Notes

Use these values when creating the backend service:

- Build command: `npm install`
- Start command: `npm start`
- Node service root: repository root
- Environment variables: set all required variables in the platform dashboard

Free hosting can sleep or restart. That is acceptable for testing, but production should use a paid plan and persistent/object storage.
