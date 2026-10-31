# Phase 2: Master Telegram Bot — staging readiness

The master bot is @SautiLinkBaseBot and SautiLink Base is free. The web and NestJS API are separate from the main SautiLink App.

## Implemented
- Private chat onboarding commands: /start, /help, /createbot and /dashboard. Commands addressed to other bots are ignored; inline URL buttons are restricted to @BotFather and approved SautiLink Base dashboard hosts.
- Fail-closed webhook secret validation using a byte-length check and timingSafeEqual.
- A server-only durable PostgreSQL ledger in `base_private.master_update_ledger` keyed by Telegram `update_id`.
- Deduplication: a claimed update is processed at most once; duplicates are acknowledged without sending another reply.
- Delivery states: `processing` while handling, `sent` for confirmed or no-reply updates and `unknown` after an unsuccessful/uncertain send attempt.
- No message bodies, chat IDs, bot tokens or inbound payloads are persisted in the ledger.
- Unit tests for Telegram command handling, secret validation and update ID parsing.

## Trade-off
The ledger prioritizes **at-most-once send attempts**, not guaranteed delivery. If a process crashes after claiming an update but before sending, the update may stay in `processing` and its reply may be lost. If Telegram accepts a send but the network loses the HTTP response, the update is `unknown` and is not blindly retried. This avoids duplicate messages but requires monitoring and manual reconciliation. Do not represent this as exactly-once or full delivery reliability.

## Monitoring (read-only)

Use the private project SQL editor as an authorized operator. No chat IDs, raw update payloads or bot tokens are stored in this ledger.

```sql
select status, count(*) as updates
from base_private.master_update_ledger
where created_at > now() - interval '24 hours'
group by status order by status;
```

Review uncertain sends and stalled claims before enabling higher traffic:

```sql
select update_id, status, created_at
from base_private.master_update_ledger
where status = 'unknown'
   or (status = 'processing' and created_at < now() - interval '5 minutes')
order by created_at desc limit 50;
```

Do not automatically resend 'unknown' or stale 'processing' updates; Telegram may have delivered the message.

## Database
Applied migration `master_update_ledger` to **dedicated** Base Supabase project `gtzqirfwghijuzhvrnha`; RLS enabled, no public/browser privileges. Only a reviewed server-only database role may write the ledger.

## Still disabled
`MASTER_BOT_ENABLED=false` on Render. No live Telegram webhook registered or BotFather token installed. The NestJS API on Render currently has no server DB connection or master bot token. Do not enable `MASTER_BOT_ENABLED` until all gates are passed.

## Activation gates (sequential)
1. Use the dedicated NOLOGIN database capability role `base_api_runtime` already created in Base, provision a distinct private LOGIN role (never the Supabase admin/postgres role), and store the exact reviewed Session Pooler `DATABASE_URL` exclusively in Render secrets. The pooler hostname must be copied from the Base Supabase Connect panel, not inferred from region. Test TLS and role permissions. Test TLS and private-table write permissions. Never borrow SautiLink App credentials.
2. Configure the Base API auth publishable key (not a server secret), and verify web Auth end-to-end.
3. Configure a strong Telegram master token and webhook secret **inside Render only**. Set `BASE_DASHBOARD_URL` to the reviewed HTTPS dashboard address; the bot rejects untrusted redirect hosts. Never paste them into GitHub or chat.
4. Add IP throttling / inbound webhook abuse controls, monitored unknown/processing states, graceful shutdown and delivery telemetry. Consider a durable outbox/worker if reliability requirements favor retry with idempotent delivery semantics.
5. Verify private-message-only responses against a test user and ensure duplicates never trigger a second send.
6. Set the Telegram webhook to the reviewed HTTPS API URL and supply the secret_token only once all checks pass.
7. Review and approve a production deployment separately; do not merge Draft PR #1 automatically.

## Status
Phase 2 implementation is prepared in the feature branch and the dedicated Base database. Production activation and real Telegram delivery are **not** completed.
