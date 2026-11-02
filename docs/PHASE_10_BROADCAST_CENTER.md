# Phase 10 — Broadcast Center and scheduling

Scope: Base only, `feat/phase-1-foundation`, Draft PR #1. Do not merge `main` or modify SautiLink App resources.

## Product behavior

- Owners create/edit drafts using saved text, photo, video, audio or document content. Drafts send nothing.
- Preview shows the actual current message/media, recipient count and requested time. The final confirmation must match the preview's content fingerprint and audience count; changes require a new review.
- Send now and scheduling up to 30 days ahead use a durable Postgres recipient queue. The content and current eligible audience are frozen at confirmation. New subscribers do not join an already queued campaign.
- A visitor becomes delivery-ready only by sending a new `/subscribe` after this release. Existing Phase 9 pseudonyms cannot be converted into delivery addresses. Ordinary bot use never opts in. `/unsubscribe` clears the encrypted destination atomically with its preference and ledger claim.
- Owners can cancel drafts or queued campaigns. The dispatcher checks bot activation, campaign state, subscription state and consent generation before delivery. Re-subscribing starts a new consent generation, so an old queued campaign is skipped for that visitor.
- Accepted, waiting, skipped and unknown counts are owner-only. Accepted means Telegram API acceptance, not reading or receipt. Unknown outcomes are never automatically retried. A request already in flight cannot be recalled by pause, cancel or opt-out.

## Bounded pilot

- At most 200 recipients per campaign, one scheduled/sending campaign per bot, three queued broadcasts per day and 50 stored campaigns per bot.
- One global dispatcher uses a session advisory lock on the existing Base session pooler. Claims use database row locks and commit before Telegram is called. Each tick handles at most ten recipients with a 20-second preparation budget and at least 1.1 seconds between accepted sends. A media request can finish after that preparation budget.
- A crashed `processing` recipient becomes `unknown` after ten minutes; it is never put back in `queued`. A paused bot waits for activation. Campaigns over 24 hours overdue expire instead of sending stale content.
- Scheduler polling is every minute, with a health heartbeat. Queue confirmation requires a recent heartbeat. Cold starts, provider delays and outages can delay the chosen time; this pilot does not promise exact-second delivery or high-volume throughput.

## Storage and access

`base_private.broadcast_campaigns`, `broadcast_recipients` and `broadcast_scheduler` have RLS and grants only for the existing Base runtime. Browser roles and the storage `service_role` cannot read them. API queries additionally check the verified Base owner; no chat IDs, visitor pseudonyms or recipient ciphertext are returned to browser responses.

Destinations are AES-256-GCM encrypted with a key derived from the existing server-only bot encryption key and a separate domain. Associated data binds each ciphertext to its bot and visitor pseudonym. The raw destination exists only in the Telegram handler or immediately before a send. Unsubscribe clears it. No subscriber export, raw message storage or automatic replay was added. Key rotation and retention need an operator plan before wider access.

## Scheduler activation

The OpenNext custom Worker keeps the existing fetch handler and adds a scheduled handler. The committed cron runs every minute but performs no network call unless its **runtime secret** `BASE_BROADCAST_DISPATCH_KEY` is present. This must never be a build variable, `NEXT_PUBLIC_` value, committed file, URL parameter or client-visible setting.

The same dedicated 32-random-byte base64url secret belongs only on:

1. Cloudflare Worker `sautilink-base-web` as a runtime secret.
2. Render `sautilink-base-api-staging` as a server environment variable, with `BASE_BROADCAST_ENABLED=true` and existing user-bot delivery still enabled.

The Worker calls only the fixed Base API `/internal/broadcasts/dispatch` endpoint using a header. The endpoint cannot create campaigns or expose subscriber details. No browser session, bot credential or user content is passed to Cloudflare by the scheduler. A fresh dedicated secret is required; do not reuse any existing service credential.

Activation through the browser requires the owner's action-time approval for this new credential/access. Complete code, migration, tests and a reviewable live draft/preview before requesting it. No broadcast may be sent as part of that configuration approval alone; a real send needs a concrete campaign and explicit owner confirmation.

Operational consequence: one-minute polling keeps the free Base API active. Render's [750 free instance hours are shared by the workspace](https://render.com/docs/free#free-instance-hours); check workspace usage before continuous activation. No paid service, plan upgrade or separate Render worker is provisioned by this phase. [Cloudflare Cron changes](https://developers.cloudflare.com/workers/configuration/cron-triggers/) can take up to 15 minutes to propagate.

## Verification checkpoint

- API/web typechecks and the Next.js production build pass.
- 104 API tests pass, including encryption/AAD isolation, review/UTC bounds, disabled/unauthorized dispatch, global-lease exclusion, opt-out/cancel checks, unknown outcomes, bounded batches and explicit destination capture.
- Six web tests pass, including secret-free disabled cron behavior, fixed-host header-only dispatch, no retry and existing browser-origin/security checks.
- The rolled-back database probe passed private grants/RLS, owner predicates, audience snapshots, unique recipient/active-campaign constraints, opt-out eligibility, crash handling and cancellation. Its fixtures never invoke Telegram.
- Migration `20261102151851_base_broadcast_center` is applied and recorded on Base only. The post-apply check found zero fixture bots and zero campaigns. Record confirmed rollout and remaining activation/Telegram acceptance below.
