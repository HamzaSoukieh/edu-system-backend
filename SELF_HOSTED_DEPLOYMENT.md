# Self-Hosted Docker Deployment

This deployment is separate from the existing development Compose workflow. It runs one backend replica behind Nginx with an authenticated local MongoDB, persistent Docker volumes, and optional Let's Encrypt HTTPS.

Nginx, MongoDB, Docker, Certbot, and Let's Encrypt are free software. A public server and a domain are separate requirements and are not automatically free.

## 1. Prerequisites

- A Linux server with Docker Engine and the Docker Compose plugin.
- Enough disk space for MongoDB, public uploads, private PDFs, logs, and backups.
- For trusted HTTPS: a public IP, a domain/subdomain, and inbound TCP ports 80 and 443.
- Outbound access for the backend (Stripe and email) and Certbot (Let's Encrypt).

Localhost testing uses HTTP. A publicly trusted certificate cannot be issued for `localhost`.

## 2. Public server and DNS

Create an `A` record such as:

```text
api.example.com -> SERVER_PUBLIC_IPV4
```

Wait for DNS to resolve to the server before requesting a certificate. If IPv6 is published with an `AAAA` record, it must also reach this server.

## 3. Firewall

Allow inbound SSH, HTTP, and HTTPS. Keep backend port 5000 and MongoDB port 27017 closed. Neither is published by `compose.selfhosted.yml`.

Example with UFW:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 4. Create the environment file

```bash
cp .env.selfhosted.example .env.selfhosted
chmod 600 .env.selfhosted
```

Fill every secret and replace all example URLs. `MONGO_INITDB_ROOT_USERNAME` and `MONGO_INITDB_ROOT_PASSWORD` initialize MongoDB authentication. Use the same credentials in `MONGO_URI`:

```env
MONGO_URI=mongodb://USERNAME:PASSWORD@mongo:27017/edu-system?authSource=admin
```

Percent-encode reserved characters in URI credentials. For example, `@` becomes `%40`, `:` becomes `%3A`, `/` becomes `%2F`, and `#` becomes `%23`. The plain values remain in the `MONGO_INITDB_*` variables. Mongo initialization variables only apply when `mongo_data` is first created; changing them later does not rotate an existing database password.

Never commit `.env.selfhosted`.

## 5. Validate and build

```bash
docker compose -f compose.selfhosted.yml config
docker compose -f compose.selfhosted.yml build
```

The production image uses Node 22 on Debian and installs the locked production dependency tree with `npm ci --omit=dev`. This glibc-based image is compatible with the repository's native `bcrypt` package. It contains `src`, production dependencies, and empty writable upload directories—not tests, development data, environment files, or TLS keys.

## 6. Local HTTP test

For testing on the server before DNS is ready, temporarily change this line in `nginx/conf.d/default.conf`:

```nginx
server_name localhost;
```

Start the HTTP bootstrap deployment:

```bash
mkdir -p certbot/conf certbot/www
docker compose -f compose.selfhosted.yml up -d --build
docker compose -f compose.selfhosted.yml ps
curl http://localhost/health
```

Expected response:

```json
{"status":"ok"}
```

Restore `server_name api.example.com;` and replace the placeholder with the real API hostname before certificate issuance.

## 7. HTTP bootstrap behavior

`nginx/conf.d/default.conf` is intentionally HTTP-only. It serves `/.well-known/acme-challenge/` from the shared Certbot webroot and proxies everything else to `backend:5000`.

Do not activate the HTTPS example before a certificate exists. Compose mounts only `default.conf`, so `default.https.example.conf` is documentation until it is copied over the active file.

Test through the public hostname:

```bash
curl http://api.example.com/health
```

## 8. Request the first certificate

After DNS and port 80 work:

```bash
docker compose -f compose.selfhosted.yml run --rm certbot \
  certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email \
  -d api.example.com
```

Check the result without printing private-key contents:

```bash
sudo ls -la certbot/conf/live/api.example.com
```

## 9. Activate HTTPS

First replace every `api.example.com` in `nginx/conf.d/default.https.example.conf` with the real API hostname. Then activate it:

```bash
cp nginx/conf.d/default.https.example.conf nginx/conf.d/default.conf
docker compose -f compose.selfhosted.yml exec nginx nginx -t
docker compose -f compose.selfhosted.yml exec nginx nginx -s reload
```

Test both endpoints:

```bash
curl -I http://api.example.com/health
curl https://api.example.com/health
```

The HTTP request should redirect to HTTPS and HTTPS should return `{"status":"ok"}`. After HTTPS and renewal are confirmed, uncomment the HSTS line in the active configuration, run `nginx -t`, and reload. The provided HSTS policy intentionally omits `includeSubDomains` and `preload`.

## 10. Authentication rate limiting

Nginx keys limits by client IP and returns HTTP 429. Confirmed routes from `src/routes/authRoutes.js` use:

- 10 requests/minute, burst 5: `/auth/login`, `/auth/password/reset`, `/auth/otp/verify`.
- 5 requests/minute, burst 3: `/auth/signup`, `/auth/password/forgot`, `/auth/otp/resend`.

`/auth/signup` currently initiates signup OTP delivery, `/auth/password/forgot` initiates reset OTP delivery, and `/auth/otp/resend` requires JWT authentication. TODO/verify these limits against real user traffic and shared-campus NAT behavior before tightening them. Nginx limits supplement rather than replace application-level abuse prevention.

The rest of the API, `/health`, and `/stripe/webhook` are not authentication-rate-limited.

## 11. Stripe production webhook

Configure Stripe to send production events to:

```text
https://api.example.com/stripe/webhook
```

Set its signing secret as `STRIPE_WEBHOOK_SECRET`. Nginx keeps the path and body unchanged. Express mounts this route with `express.raw({ type: "application/json" })` before general JSON parsing, and no JWT middleware is added.

## 12. Certificate renewal

Test renewal without changing certificates:

```bash
docker compose -f compose.selfhosted.yml run --rm certbot renew --dry-run
```

After that succeeds, add a host cron entry:

```cron
17 3 * * * cd /opt/edu-saas-backend && docker compose -f compose.selfhosted.yml run --rm certbot renew --quiet && docker compose -f compose.selfhosted.yml exec -T nginx nginx -s reload
```

Reloading Nginx after a no-op renewal is harmless. Monitor cron failures and certificate expiry; the Certbot service does not run continuously.

## 13. Verify proxy and storage behavior

- Make an authenticated platform request and confirm the platform audit record contains the real client IP, not a Docker address. Express trusts exactly one proxy hop in production.
- Upload a 10 MB PDF and confirm it succeeds through Nginx. Nginx permits 12 MB for multipart overhead; Express retains its 10 MB file limit.
- Confirm `/storage/...` returns 404. Private homework and section-material files remain available only through their authorized download routes.
- Recreate the backend and verify files remain:

```bash
docker compose -f compose.selfhosted.yml up -d --force-recreate backend
```

Named local volumes support one server and one backend replica. Before adding replicas or servers, migrate uploads and private storage to shared object storage.

## 14. Backups

Docker volumes are persistent storage, not backups. Store backups on another machine or storage provider and test restoration regularly.

Create a protected backup directory:

```bash
mkdir -p backups
chmod 700 backups
```

MongoDB archive:

```bash
docker compose -f compose.selfhosted.yml exec -T mongo sh -c \
  'mongodump --archive --gzip --db "$MONGO_INITDB_DATABASE" --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' \
  > backups/mongo-$(date +%F).archive.gz
```

Public uploads and private storage:

```bash
docker compose -f compose.selfhosted.yml run --rm --no-deps -T --entrypoint sh backend \
  -c 'tar -czf - -C /app/uploads .' > backups/uploads-$(date +%F).tar.gz

docker compose -f compose.selfhosted.yml run --rm --no-deps -T --entrypoint sh backend \
  -c 'tar -czf - -C /app/storage .' > backups/storage-$(date +%F).tar.gz
```

Certificates, including private keys:

```bash
sudo tar -czf backups/certbot-$(date +%F).tar.gz certbot/conf
sudo chmod 600 backups/certbot-*.tar.gz
```

Losing the server or disk can lose the database, profile/logo uploads, private homework PDFs, private section materials, and certificate files unless off-server backups exist.

## 15. Logs and troubleshooting

```bash
docker compose -f compose.selfhosted.yml ps
docker compose -f compose.selfhosted.yml logs -f backend
docker compose -f compose.selfhosted.yml logs -f nginx
docker compose -f compose.selfhosted.yml logs -f mongo
```

Common checks:

- `502 Bad Gateway`: backend is unhealthy, still connecting to MongoDB, or Nginx needs reloading after backend recreation.
- Mongo authentication failure: verify URI encoding, `authSource=admin`, and the credentials used when the volume was first initialized.
- Certbot validation failure: verify DNS, port 80, firewall/NAT, and the ACME webroot location.
- Nginx `413`: the request exceeds 12 MB; application file limits remain 2 MB for images and 10 MB for PDFs by default.
- CORS missing: production accepts only normalized `FRONTEND_URL` and `FRONTEND_URLS` values; it does not add localhost automatically.

## 16. Rollback

Keep the previous image tag/configuration and take backups before deployment. For an application rollback, restore the previous commit or image and recreate only backend/Nginx:

```bash
git checkout <known-good-commit> -- Dockerfile compose.selfhosted.yml nginx/conf.d/default.conf src/app.js src/server.js
docker compose -f compose.selfhosted.yml up -d --build backend nginx
```

Do not delete named volumes during an application rollback. Never use `docker compose down -v` unless permanent data deletion is intended and verified backups exist. Database schema/data rollback requires a separately tested `mongorestore` plan appropriate to the change.

## 17. Final operational checklist

1. Public server and domain are provisioned separately.
2. DNS resolves correctly.
3. Only ports 80/443 (and restricted SSH) are open.
4. `.env.selfhosted` is populated and mode 600.
5. `docker compose -f compose.selfhosted.yml config` succeeds.
6. Containers build and become healthy.
7. Local/bootstrap `/health` succeeds over HTTP.
8. First certificate exists under `certbot/conf/live/`.
9. HTTPS config passes `nginx -t` and is reloaded.
10. HTTP redirects to HTTPS.
11. Stripe production webhook is updated and verified.
12. `certbot renew --dry-run` succeeds and cron is installed.
13. Platform audit logs show the real client IP.
14. Image/PDF uploads work and private storage is not static.
15. Files survive backend recreation.
16. MongoDB, file, and certificate backups are copied off-server.
