# SautiLink Base — safe deployment checklist

Production is **not deployed** as of this document. Use the `sautilink/Base` repository and the dedicated Supabase project `gtzqirfwghijuzhvrnha`; never use SautiLink App secrets or database.

## 1. Verify code
- Require GitHub Actions typecheck, API encryption tests and build to pass before merging.
- Install the committed lockfile with `pnpm install --frozen-lockfile`, as CI does.
- Add multi-user and cross-tenant integration tests, plus threat-model review.

## 2. Database
- Dedicated project already has six Base tables and RLS enabled.
- For production API, create a **least-privilege server DB role** scoped to bot and encrypted credential inserts; do not use Supabase superuser credentials.
- Choose an IPv4-compatible Supabase connection pooler if needed by hosting. Configure verified PostgreSQL TLS.
- Keep the encrypted token encryption key outside the database and arrange backups/key rotation.

## 3. Web hosting
- Deploy `apps/web` on a Next.js-compatible host from this repository.
- Set environment (hosting UI, never Git):
  - `NEXT_PUBLIC_SUPABASE_URL=https://gtzqirfwghijuzhvrnha.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = publishable (not secret) key for Base project
  - `NEXT_PUBLIC_BASE_API_URL` = public **HTTPS** URL of deployed Base API
- Configure Base Supabase Auth Site URL and explicit redirect allowlist for the web domain and `/dashboard` login callback.
- Validate email delivery quotas and anti-abuse settings.

## 4. API hosting
- Deploy `apps/api` to a Node.js 22+ capable runtime supporting long-lived HTTP requests.
- Required private environment variables: `DATABASE_URL`, `BOT_TOKEN_ENCRYPTION_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `WEB_ORIGIN`.
- `WEB_ORIGIN` must be the exact web origin. TLS and request size limits are mandatory.
- Validate /health, authentication rejection, invalid Telegram token and encrypted database insert in staging before accepting traffic.
- Add **distributed** per-IP and per-user rate limits (Redis or equivalent), auditing, monitoring, and token rotation before public launch. Current API is **not production safe** without these gates.

## 5. Telegram
- Master bot `@SautiLinkBaseBot` is not connected yet.
- Never paste its token into GitHub or chat; set it only in a hosting secret manager.
- Only enable webhook after signature/secret verification, request deduplication and worker queue are implemented.

## Verification
- Confirm visitor can request email sign-in and get a session.
- Sign in with two independent test accounts; confirm RLS isolation on bots and child records.
- Connect a test bot, verify `getMe`, confirm its row is inactive, ciphertext cannot be decrypted without application key.
- Check API logs contain **no tokens**, bearer headers or connection strings.
- Confirm SautiLink App systems are untouched.
