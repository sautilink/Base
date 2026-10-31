# Phase 2 — @SautiLinkBaseBot (staging activation checklist)

**Master bot:** @SautiLinkBaseBot — the existing Telegram bot (do not create a duplicate).
**Scope:** SautiLink Base staging, separate from the SautiLink App.
**Status:** webhook registration code is prepared, **not activated**. Keep PR #1 Draft and production unchanged.

## Already verified
- Base API is live on Render staging and `GET /health/ready` verifies the isolated Base database and restricted role.
- Cloudflare feature Preview supports real Supabase email login and session restoration (user reported PASS on 2026-10-31).
- The master command router supports private `/start`, `/help`, `/createbot` and `/dashboard`, with trusted URLs only.
- Telegram request secret validation and persistent update-ID deduplication are in place; unknown send outcomes require manual review.
- A dedicated webhook secret is already stored in Render. Never copy or disclose it.
- Runtime database access uses **column-level grants**, not broad table grants: master ledger reads only `update_id`, inserts `update_id/status`, updates `status`. Browser sessions have none of those privileges.
- Activation preflight attempts a restricted-role ledger INSERT+UPDATE inside a transaction which is **ROLLED BACK**, with zero persistent test updates.
- Automated tests cover strict bot identity matching, rejection of an existing webhook at another URL, approved staging destination, no dropping queued updates, invalid tokens/secrets and both explicit activation flags.

## Controlled master webhook activation (not performed yet)

The following flags and values are configured **only in the private Render environment**, not in GitHub:

| Variable | Status and purpose |
| --- | --- |
| `MASTER_BOT_ENABLED` | **false** until final live test; incoming requests return 404 |
| `MASTER_BOT_REGISTER_WEBHOOK` | **false** until live test; no Telegram registration calls happen |
| `TELEGRAM_WEBHOOK_SECRET` | Existing, stored privately in Render |
| `BOT_TOKEN` | Must be provided privately by the owner from the **existing @SautiLinkBaseBot** in BotFather (never in chat) |
| `BASE_DASHBOARD_URL` | Exact approved HTTPS Base Preview URL |
| `BOT_CONNECT_ENABLED` | **false**; unrelated user-bot connections remain disabled |

When **both** `MASTER_BOT_ENABLED=true` and `MASTER_BOT_REGISTER_WEBHOOK=true` are intentionally set on the staging service, the server:

1. Validates the token format, the dashboard redirect host and webhook secret syntax.
2. Probes the private database ledger using real INSERT and UPDATE with ROLLBACK.
3. Calls Telegram `getMe` and verifies the token is for @SautiLinkBaseBot.
4. Calls `getWebhookInfo`; refuses to overwrite another existing webhook destination.
5. Calls `setWebhook` for the **fixed** Render staging URL and the secret header, with `allowed_updates=['message']`, `max_connections=1` and `drop_pending_updates=false`.
6. Logs only an acknowledgement, **never** a Telegram token, URL containing the token, message/chat content, bearer header or webhook secret.

If any preflight fails, registration is not attempted. Do not enable these flags without an operator able to monitor the rollout and revert the switches. Enabling them is an explicit live integration action, **not** part of routine staging deploys.

## Testing after activating
- Operator opens the existing master Telegram bot in a private chat and sends `/start`, `/help`, `/createbot`, `/dashboard`.
- The correct approved Cloudflare Preview dashboard opens from inline buttons.
- Duplicate `update_id` is acknowledged without a second response; no invalid secret is accepted.
- Investigate any unmatched / unknown or stalled ledger records before rollout.

**Critical limitation:** This is currently at-most-once sending, not guaranteed delivery or exactly-once semantics. On crash after claim, a response may be lost. If Telegram accepts a send and the request times out, the ledger records `unknown`; do not blindly retry.

## Monitoring (read-only, operator only)
Run in the **dedicated Base Supabase** SQL editor, not from the browser client:

```sql
select status, count(*) as updates
from base_private.master_update_ledger
where created_at > now() - interval '24 hours'
group by status order by status;
```

```sql
select update_id, status, created_at
from base_private.master_update_ledger
where status = 'unknown'
   or (status = 'processing' and created_at < now() - interval '5 minutes')
order by created_at desc limit 50;
```

## Later release gates
- IP / edge throttling and abuse monitoring for the public API.
- Multi-account authorization and encryption/rollback tests for connected *user* bots.
- Bounded retry/queue work if the platform needs guaranteed delivery.
- Explicit production review. Do not merge Draft PR #1 or modify the primary SautiLink App.
