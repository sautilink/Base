# SautiLink Base API — staging container and release gates

Scope: dedicated SautiLink Base backend only. The separate SautiLink App backend and database must not be changed.

## Container build (from repository root)

```sh
docker build -f apps/api/Dockerfile -t sautilink-base-api:staging .
```

The image uses Node.js 22, pnpm 9.15.4, a committed lockfile, and compiles the NestJS API. The root `.dockerignore` excludes .env files and build artifacts. The container runs without root privileges on port 3001.

Check locally without connecting any secrets:

```sh
docker run --rm -p 3001:3001 sautilink-base-api:staging
# From a second terminal:
curl -f http://127.0.0.1:3001/health
```

Expected health result: `{"status":"ok","service":"sautilink-base-api"}`.
A successful health check is **not** proof that authentication, database writes, or Telegram messaging work.

## Server secrets to configure in a private hosting secrets manager

- `SUPABASE_URL`: the dedicated Base project URL `https://gtzqirfwghijuzhvrnha.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`: public Base project publishable key used to validate user sessions
- `DATABASE_URL`: private PostgreSQL connection using a reviewed least-privilege server role **in Base**, never the SautiLink App project
- `BOT_TOKEN_ENCRYPTION_KEY`: 32 cryptographically random bytes encoded in base64; never store it in Git, logs or frontend bundles
- `WEB_ORIGIN`: exact branch Preview origin; the API also permits the reviewed `https://base.sautilink.com` origin
- `MASTER_BOT_ENABLED=true`: the **existing** @SautiLinkBaseBot is enabled in staging after user-confirmed private-chat tests (2026-10-31).
- `MASTER_BOT_REGISTER_WEBHOOK=false`: successful one-time Telegram staging registration has completed; no re-registration on restart.
- `BOT_CONNECT_ENABLED=false`: ordinary user-bot connections remain disabled pending real two-account security tests.
- `BOT_CONNECT_IP_HMAC_KEY`: dedicated random 32-byte base64 secret in **Render only**, never in Git or browser, required before enabling user-bot connections.
- `PORT=3001`: optional hosting port override

`BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` have been installed privately in Render for the **master** bot only. Never copy, log, expose or re-register them without an explicit reviewed activation. Do not share tokens or passwords in chat.

**Database role caveat:** The protected `base_private` tables have RLS and no public policies. A plain `authenticated` connection cannot write them. Establish an audited narrow server-only access path before attempting real bot connection; do not resolve permission errors by exposing the private schema to browsers.

## TLS certificate for Base Session Pooler

The dedicated Base session pooler is `aws-0-eu-west-1.pooler.supabase.com:5432`.
TLS identity verification is required; **never** set `rejectUnauthorized=false` or use `sslmode=disable`.

To configure a trusted certificate:

1. In the **SautiLink Base** Supabase dashboard, open **Database Settings → SSL Configuration → Download Certificate**. Download the project's official PEM (often named `prod-ca-2021.crt`).
2. Keep database passwords out of chat and Git. The certificate itself is public.
3. Set `SUPABASE_DB_CA_CERT` as a private Render environment variable containing the **entire** certificate PEM, including `-----BEGIN CERTIFICATE-----` and `-----END CERTIFICATE-----`.
4. Redeploy staging and verify `GET /health/ready` returns HTTP 200. If certificate validation fails, do **not** relax TLS; inspect the certificate/hostname and the sanitized Render diagnostics.

The official CA download is available through the project's authenticated dashboard; do not rely on guessed static certificate URLs. The older `https://supabase.com/prod-ca-2021.crt` URL returned HTTP 404 during the October 31 staging build and must not be used.

## Prepared routes

- `GET /health`: health check
- `POST /bots/connect`: currently **OFF**; when enabled, authenticated and capped at 5 attempts/account and 20 attempts/HMAC-IP per 15 minutes, validates BotFather token via getMe, writes credential-free audit events, commits encrypted token atomically and registers an **inactive** bot. The platform's master bot is blocked.
- `GET /bots/:botId/config`: owner-scoped config read
- `PATCH /bots/:botId/welcome`: owner-scoped welcome message editing
- `POST/PATCH/DELETE /bots/:botId/commands`: owner-scoped command editing (item ID on PATCH/DELETE)
- `POST/PATCH/DELETE /bots/:botId/rules`: owner-scoped keyword rules (item ID on PATCH/DELETE)
- `PATCH /bots/:botId/rules/:itemId/toggle`: pause/enable reply rule
- `POST /bots/:botId/simulate`: **read-only** preview of matching a message; does not contact Telegram
- `POST /telegram/master`: **enabled in staging** for the verified @SautiLinkBaseBot, requiring the secret Telegram webhook header.

## User-bot connection staging hardening (2026-10-31)

- The dedicated Base database has `base_private.bot_connect_ip_limits` and `base_private.bot_connect_audit`, both with RLS and no browser access. SQL: `database/bot-connect-security.sql`.
- Only a keyed HMAC-SHA256 digest of the apparent client IP is stored. The raw IP, token, JWT, email and incoming body are **not** stored in these tables.
- The API trusts exactly one Render ingress proxy hop. Never trust arbitrary `X-Forwarded-For` or `CF-Connecting-IP` headers from callers. Re-evaluate proxy configuration if the ingress topology changes.
- Server-side `owner_id` is obtained exclusively from verified Supabase Auth. Browser-provided owner IDs are ignored.
- Quotas are consumed before Telegram verification. The unauthenticated API has no token-verification oracle.
- Pending privacy cleanup: configure an operator-approved scheduled job before opening this endpoint publicly. Delete expired IP quota rows older than 24 hours and audit entries older than 30 days.
- This is **not yet** a full customer release. Two real test users must demonstrate isolation, persistence, duplicate detection and rollback before changing `BOT_CONNECT_ENABLED`.

## Before the API becomes publicly reachable

1. Persistent per-IP application quotas are implemented; add edge/WAF-level IP limits and monitoring before significant public traffic. Per-account and application IP limits do not replace network controls.
2. Review Postgres least-privilege role and prove server write operations respect tenant ownership with separate real test accounts. Do not reuse SautiLink App credentials.
3. Test Telegram getMe error handling, duplication, DB rollback, token encryption and deletion with safe test bots only.
4. Verify Supabase login, RLS isolation, strict CORS and valid TLS from a genuine HTTPS staging frontend.
5. Add production-safe request logs, exception redaction, key rotation, monitoring, backups and incident response.
6. Master webhook has at-most-once update-ID deduplication and user-confirmed private-chat delivery. Evaluate reliable outbox delivery before high-volume production rollout or enabling any user-bot webhook.
7. Base web builds embed only the Base API URL, Supabase project URL, and browser-safe publishable key. Do not copy service keys or admin secrets into the web build.

No automatic production deployment occurs from this document. Keep PR #1 Draft until these gates are reviewed.
