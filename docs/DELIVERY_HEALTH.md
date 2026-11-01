# Delivery Health — owner-scoped, restricted staging

SautiLink Base user-bot delivery is **at most once**, not guaranteed exactly once. An ambiguous Telegram send may already have reached the recipient. Never automatically resend an `unknown` update. A process crash after claim may leave `processing`. The new health view is **diagnostic only**, not a recovery or retry queue.

## What changes

- `GET /bots/:botId/delivery-health` requires a verified Base Supabase session, the restricted two-test-account gate, the enabled delivery flag, and the same owner-scoped bot lookup as activation/pause.
- A private `SECURITY DEFINER` PostgreSQL function returns **aggregated counts only**: sent and ignored in the last 24 hours; unknown, processing and processing older than five minutes in the last seven days; and latest update timestamp in that seven-day window.
- There is no message text, token, Telegram chat ID, update ID, IP address or username in the response. The function is in `base_private`, with only `base_api_runtime` EXECUTE; browser roles have no access.
- The dashboard shows these counts and a manual Refresh button. If any unknown or stalled update is present, the owner sees a review warning, not a resend action.

## Database validation — 2026-11-01

The additive migration `base_owner_delivery_health_summary` was applied to the dedicated `sautilink-base` Supabase project and confirmed in its migration history (version `20261101000417`). Read-only checks verified that `base_api_login` and `base_api_runtime` can call the function while `authenticated` and `anon` cannot. Browser ledger SELECT remains forbidden. The existing bot and encrypted credential rows are intact. With a genuine second Base Auth account, the function returned zero counts and no timestamp for a bot owned by the first account; that bot does have update-ledger entries. The owner-scoped function returned normal aggregate counts (no raw update IDs or message content).

CI #127 at `cd0a3d0` completed successfully, including API tests, typechecks, builds and Cloudflare dry-run. **No new API or frontend deployment has been performed** and the new owner endpoint still needs an authenticated two-account live test after deploying the code. Existing staging endpoints remain on the previously deployed revision.

After applying the migration, the Supabase security advisor still reported `Leaked Password Protection Disabled`, an Auth configuration warning unrelated to this migration. Performance advisor noted two older unrelated foreign-key indexes and a new unused delivery-health index; usage is expected only after the new endpoint starts making queries.

## Safe rollout order

1. Leave PR #1 Draft and the existing `feat/phase-1-foundation` deployment untouched.
2. **Complete:** The reviewed `database/user-bot-delivery-health.sql` has been applied as the named Supabase migration to the dedicated Base project. No browser privilege was granted.
3. **Complete (database layer):** Verify `has_function_privilege('base_api_runtime', 'base_private.owner_bot_delivery_summary(uuid,uuid)', 'EXECUTE')` is true, and `has_function_privilege('authenticated', 'base_private.owner_bot_delivery_summary(uuid,uuid)', 'EXECUTE')` is false. Also verify a mismatched owner UUID receives zero counts; do not output identifiable ledger rows.
4. **CI complete; deployment pending:** API tests, types, web build, Wrangler dry-run and CI passed. Deploy the API + web to the separate Base test environment only after review/approval. `/health/ready` intentionally fails if the function is unavailable or exposed to browser roles.
5. **Pending live authentication test:** Sign in as the test-bot owner and confirm the aggregate, then sign in as the other test account and confirm `404` for the same bot's health URL. Confirm the existing `/ping → pong` path and pause/re-activate separately before broader rollout.

## Limitations

- Seven days is a *viewing window*, not a retention policy. Incidents older than seven days are not shown; query the private ledger through approved operator access for full reconciliation.
- A `sent` count indicates Telegram API acceptance and is not guaranteed proof of user-visible delivery; an `ignored` count includes messages with no configured reply.
- No automatic retry, retention cleanup, token rotation or disconnection is introduced. Those still require separate design/review, as does a durable outbox for high volume.
- Do not place the `base_private` schema in the Supabase exposed schemas or return raw SQL/PG errors to the browser.
