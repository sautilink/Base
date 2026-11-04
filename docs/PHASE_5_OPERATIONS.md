# SautiLink Base — Phase 5 operations and recovery

This is a **restricted, test-owner-only** release. `main` and the SautiLink App are outside scope. Do not pause or rotate a real BotFather token during automated tests.

## Operator dashboard

The bot editor has two independent read-only checks:

1. **Delivery health** (Base private ledger): accepted, ignored, unknown, stale processing; these are aggregate counts, never raw update IDs, message bodies, chat IDs, tokens or IPs.
2. **Telegram webhook** (Telegram `getWebhookInfo` through the owner-authenticated API): ownership classified as Base / no webhook / other application, pending update count, last provider error time. No webhook URL, error text, provider IP, token or raw response is sent to browsers. Refresh is manual. An unreachable Telegram service yields a generic 502 and leaves the bot unchanged.

If a bot is `inactive` but Telegram still reports **Base** as webhook owner, use **Verify webhook cleanup** on that bot. It only removes the webhook if it still matches Base's exact URL. If a foreign app owns the webhook, it must be resolved separately; Base must never take it over or delete it. A paused bot does not send new Base replies, though Telegram calls already in flight cannot be canceled.

## Delivery incidents

The user-bot ledger intentionally has **at-most-once** semantics. Never automatically resend `unknown` or stale `processing` rows: a Telegram timeout may have occurred after successful delivery. On a failure after update claim but before sending, the handler attempts to classify the update as `unknown`. If PostgreSQL is unavailable even for that state write, the row may remain `processing`; operator investigation is required.

Run the owner's Delivery Health dashboard check and verify current Telegram webhook ownership. Avoid diagnostic logging of message bodies, bot tokens, Telegram URLs, signed webhook headers and ciphertext. An outbox with explicit operator-controlled recovery is a future phase, not present here.

## Private ledger retention

**No automatic deletion or scheduled job is installed.** The reviewed migration `database/user-bot-ledger-retention.sql` creates two operator-only, `SECURITY INVOKER` functions in the unexposed `base_private` schema:

- `select * from base_private.preview_user_bot_ledger_retention(180);` returns the number of terminal updates older than 180 days and the total number of unresolved updates.
- `select base_private.prune_user_bot_terminal_updates(180,500);` deletes **up to 500** old rows with status `sent` or `ignored`; it never deletes `unknown` or `processing`. Minimum retention age is 90 days; maximum batch 1000. These functions are **not executable** by `anon`, `authenticated`, or `base_api_runtime`. Only run them from a reviewed, authorized database operator session, after a backup and a preview. Document each actual run in private operations records, not public PRs.

Deleting old terminal update IDs can weaken deduplication against artificially replayed ancient updates, so the default 180-day age is deliberately conservative. Do not schedule deletion until Telegram retry guarantees, recovery policy and incident-retention requirements have been reviewed.

## Staging validation checklist

1. Confirm GitHub CI passes typechecks, API tests, Next.js build, Cloudflare dry-run.
2. Apply reviewed SQL to **the dedicated Supabase Base project only**, as an additive migration. Verify private EXECUTE privileges, RLS grants and that the functions do not expose underlying data. Run security advisors.
3. Run a synthetic database fixture only within a transaction and roll it back; check that older terminal rows are eligible, recent rows and unresolved states are preserved and only a bounded batch is deleted. Never mutate the real test bot's update ledger.
4. Deploy the exact reviewed feature commit to Render staging (after migration, where applicable); check `/health/ready`, Base configuration, disabled/unauthenticated routes, webhook secret rejection and browser-origin CORS.
5. Cloudflare Worker publish is distinct from GitHub `build:cloudflare`. The custom-domain smoke test must verify an exact public release marker, not just HTTP 200 or the older homepage copy. A passing GitHub build is **not** proof the new UI is live.
6. Signed-in actual owner: confirm webhook diagnostic counts, the correct bot, manual Refresh and unchanged `/ping → pong`. Second real Base account: must receive 404 for the owner's bot diagnostics; never copy session tokens to PR, chat or CI.
7. Manual Telegram pause test, Telegram webhook cleanup, reactivation and token rotation must be intentional; do not change the only working test bot just to make a CI badge green.

## Cloudflare blocked publish: how to verify

The Worker is `sautilink-base-web`, domain `base.sautilink.com`, source `sautilink/Base`, branch `feat/phase-1-foundation`. Check Cloudflare Workers & Pages > Worker > Settings > Builds / Branch control and Deployments. Build command: `pnpm install --frozen-lockfile && pnpm build:cloudflare`; deploy command: `pnpm --filter @base/web deploy:cloudflare`. A dry-run from GitHub CI does not publish. Inspect Cloudflare build log for selected SHA, successful Wrangler publish and the active Worker version. Then re-run staging readiness probe against the custom domain.

## Public release blockers

Automated subscription billing, multi-tenant broad access, durable queue/outbox recovery, retention scheduling, edge-level DDoS controls and audited token recovery policies remain out of scope. Keep the two-owner allowlist and early-access messaging in place.
