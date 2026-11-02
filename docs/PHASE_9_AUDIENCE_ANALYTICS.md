# Phase 9 — Audience and subscription analytics

Scope: `feat/phase-1-foundation`, the isolated Base database/API, and `base.sautilink.com`. PR #1 remains Draft; `main` and SautiLink App are outside this release.

## Product behavior

- The owner editor and Telegram Mini App show unique visitors, explicitly subscribed visitors, active visitors over rolling 7/30 days, and opted-out visitors.
- A selectable 30-day chart and accessible daily table show new visitors, private text messages and supported menu taps. Daily buckets use UTC and arrival time. A unique visitor is one private Telegram sender per bot; group chats, unsupported media updates, edited messages and old history are not imported.
- `/subscribe` opts in; `/unsubscribe` opts out without disabling ordinary commands or menus. `/start` does not subscribe anyone. These two preference commands are reserved in both command editors. Simulator replies never change preferences or analytics.
- This phase records preferences, not delivery destinations. Broadcast sending, scheduling, subscriber exports, names and chat IDs are not implemented here. A future broadcast phase needs its own encrypted destination storage, consent-preserving collection flow, queues and quotas.

## Data and delivery semantics

`base_private.bot_audience` stores a domain-separated HMAC of bot ID and Telegram chat ID, first/last interaction times, and subscription preference/order. `base_private.bot_activity_daily` stores daily aggregate counts. Neither table stores chat IDs, usernames, names or message contents. They are inaccessible to `anon`, `authenticated` and the storage `service_role`. Only the existing Base runtime can read/write them, behind an API query that checks verified ownership in the same SQL snapshot as aggregation.

The update ledger claim, audience preference and daily counters commit in one transaction. Duplicates do not increment counters or replay replies. Failed database work rolls back before a Telegram send. A possibly accepted Telegram send is still marked `unknown` and never retried automatically; recorded consent survives an ambiguous confirmation reply.

Consent is ordered by Telegram message timestamp, then update ID within the same second. Telegram can randomize its next update ID after a week of inactivity, so update ID alone cannot decide which preference is newer. See the official [Telegram Update reference](https://core.telegram.org/bots/api#update).

Pseudonyms use the existing server-only `USER_BOT_WEBHOOK_SECRET_KEY` with a separate HMAC domain. Key rotation must include an explicit audience migration/reset plan; otherwise the same person will get a new pseudonym. No automatic retention or pruning was added. Review retention and key rotation before wider access.

## Verification and rollout

- API/web typechecks and the Next.js production build pass locally.
- All 95 API tests pass locally. Coverage includes pseudonym isolation, real private senders, explicit preference commands, timestamp validation, duplicate/atomic claims, transaction rollback, unmatched incoming usage and ambiguous confirmations.
- Base-only migrations: `20261102143130_base_audience_analytics` and `20261102144415_base_audience_consent_order`. They add private tables and a consent-order column without changing any bot credentials or existing content.
- Both migrations are applied and recorded on Base only. Rolled-back database probes passed RLS/grants, nonnegative counters, invalid identity rejection, delayed consent and update-ID restarts. The actual API aggregate query passed correct totals, 30 filled days and foreign-owner denial. No fixture bot or audience row is retained.
- Publish with the existing Cloudflare feature-branch pipeline and manually deploy the same tested revision to the dedicated Base API. Confirm exact API release/ready health, the `phase-9-audience-analytics` web marker, and authenticated browser behavior before declaring live acceptance.

## Live checkpoint — 2026-11-02

- Code revision `28c16cd4cae78a8d432de1c4c6454b60ace1449d` passed [CI #161](https://github.com/sautilink/Base/actions/runs/41465551125), including the OpenNext build and Wrangler dry-run.
- Render deployment `dep-dbka6pugekts73f6ue20` became Live. `/health/release` returned that exact revision and `/health/ready` returned ready. The unsigned analytics endpoint returned 401 with `Cache-Control: no-store`.
- Cloudflare build `b5975a90-01e3-4595-bf22-12b37fb43b6f` was Ready, with Worker `a3462741` active at 100% traffic. The custom domain returned `phase-9-audience-analytics`.
- Authenticated owner browser acceptance passed on `base.sautilink.com`: session survived refresh, the active bot/content/menus remained visible, the new analytics endpoint loaded, chart selection and all 30 daily rows worked. Simulating `/subscribe` returned the preference guidance and left the real audience/subscriber counts at zero.
- The final database integrity check found zero fixture bots, zero audience rows, zero activity buckets, and both migration-history entries. A zero audience at rollout is expected until a new real interaction arrives.
- Security Advisor was rerun: zero errors, zero informational findings, with only the pre-existing [Leaked Password Protection Disabled warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Real Telegram `/subscribe → /unsubscribe → /ping` acceptance passed by owner observation: the owner confirmed both subscription commands replied and `/ping` returned `pong`. This confirms the visible Telegram replies; exact post-test dashboard counters were not independently rechecked in this acceptance update.
