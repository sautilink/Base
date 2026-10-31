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
- `WEB_ORIGIN`: exact authenticated frontend origin (for staging, the current branch Preview URL)
- `MASTER_BOT_ENABLED=false`: keep the master bot disabled until deduplication, retry safety and monitoring are implemented
- `PORT=3001`: optional hosting port override

`BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` are intentionally unset during development; do not activate the master webhook yet. Do not share tokens or passwords in chat.

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
- `POST /bots/connect`: authenticated and capped at five attempts per account per 15-minute window, checks Telegram BotFather token via getMe, saves encrypted token and inactive bot
- `GET /bots/:botId/config`: owner-scoped config read
- `PATCH /bots/:botId/welcome`: owner-scoped welcome message editing
- `POST/PATCH/DELETE /bots/:botId/commands`: owner-scoped command editing (item ID on PATCH/DELETE)
- `POST/PATCH/DELETE /bots/:botId/rules`: owner-scoped keyword rules (item ID on PATCH/DELETE)
- `PATCH /bots/:botId/rules/:itemId/toggle`: pause/enable reply rule
- `POST /bots/:botId/simulate`: **read-only** preview of matching a message; does not contact Telegram
- `POST /telegram/master`: present but disabled unless `MASTER_BOT_ENABLED=true`

## Before the API becomes publicly reachable

1. Add network/edge-based IP rate limiting and anti-abuse protection. Per-account database limits alone are not sufficient.
2. Review Postgres least-privilege role and prove server write operations respect tenant ownership with separate real test accounts. Do not reuse SautiLink App credentials.
3. Test Telegram getMe error handling, duplication, DB rollback, token encryption and deletion with safe test bots only.
4. Verify Supabase login, RLS isolation, strict CORS and valid TLS from a genuine HTTPS staging frontend.
5. Add production-safe request logs, exception redaction, key rotation, monitoring, backups and incident response.
6. Add durable Telegram update ID deduplication and reliable delivery retries **before enabling** the master bot webhook or any connected user bot.
7. Configure `NEXT_PUBLIC_BASE_API_URL` in the **Base web branch Preview build environment**, not in source code, then rebuild and validate the web dashboard.

No automatic production deployment occurs from this document. Keep PR #1 Draft until these gates are reviewed.
