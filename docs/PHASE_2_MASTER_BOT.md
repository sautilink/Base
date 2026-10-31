# Phase 2 — @SautiLinkBaseBot on staging

**Master bot:** the existing @SautiLinkBaseBot. Do not create a duplicate.
**Scope:** the dedicated SautiLink Base Render staging API, separate from SautiLink App.
**Status (2026-10-31):** webhook registered and Master Bot private-chat test reported **PASS** by the user. PR #1 remains Draft; production is unchanged.

## Confirmed activation

- Render registered the fixed staging webhook after verifying the BotFather identity, checking the existing webhook destination, and testing restricted database ledger writes in a rolled-back transaction. The token and webhook secret remain private Render environment variables.
- After one-time registration, staging runs with `MASTER_BOT_ENABLED=true`, `MASTER_BOT_REGISTER_WEBHOOK=false`, and `BOT_CONNECT_ENABLED=false`. The registration switch stays off on ordinary restarts.
- The user tested the master bot's private-chat replies and reported **Master Bot PASS**. The dashboard link opened. This is the human confirmation that the ledger status by itself cannot provide.
- A read-only Base database check found six `sent` updates and no `unknown` or `processing` updates in the latest 24 hours. `sent` also covers updates requiring no reply, so do not use that count as a count of visible messages.
- The current staging API returned HTTP 200 for `/health` and `/health/ready`; `/client-config` reported the master enabled and user-bot connections disabled. GitHub CI passed at `ebd0420`.

## Safety properties and limits

- `POST /telegram/master` requires the Telegram secret header; unauthorized calls are rejected. Only private-chat `/start`, `/help`, `/createbot` and `/dashboard` produce master replies.
- Update IDs are claimed in the private Base ledger before a send attempt. Duplicate updates are acknowledged without another send.
- Delivery is **at most once**. If Telegram accepts a message but the API times out, the outcome is `unknown`; never automatically resend it without reconciliation. A crash after claim can leave `processing` and lose a reply.
- The master bot does not connect customer bots. `BOT_CONNECT_ENABLED` remains off pending separate two-account security tests.
- Never copy the master token, webhook secret, chat IDs, or message bodies into logs, documentation or Git.

## Operator checks (read-only)

Run these only in the dedicated Base Supabase SQL editor or a scoped operator connection:

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

Investigate any `unknown` or stale `processing` updates before further rollout. Before production or high-volume use, review edge throttling, monitoring and a reliable delivery/outbox design. Keep `main` and SautiLink App untouched until a separate release review.
