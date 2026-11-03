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
- Seven web tests pass, including secret-free disabled cron behavior, fixed-host header-only dispatch, rejected redirects without retry and existing browser-origin/security checks.
- The rolled-back database probe passed private grants/RLS, owner predicates, audience snapshots, unique recipient/active-campaign constraints, opt-out eligibility, crash handling and cancellation. Its fixtures never invoke Telegram.
- Migration `20261102151851_base_broadcast_center` is applied and recorded on Base only. The post-apply check found zero fixture bots and zero campaigns. Record confirmed rollout and remaining activation/Telegram acceptance below.

## Live checkpoint — 2026-11-02

- Code `843f0b7c399eb1f29473b92326f4c3012f10aaa0` passed [CI #164](https://github.com/sautilink/Base/actions/runs/41473393354), including the custom OpenNext Worker build and Wrangler dry-run.
- Render deployment `dep-dbkatmh42hec73f59rs0` became Live. Exact release SHA and ready health passed; unsigned broadcasts returned 401 and the disabled dispatch endpoint returned 404.
- Cloudflare build `e854e544-280c-4546-a1d2-c8c9f8192db6` published Worker `5ea9f654`, Ready at 100% traffic. The custom domain exposes `phase-10-broadcast-center`. Its slower initialization/dependency stage completed successfully; build configuration was not changed speculatively.
- Owner browser acceptance passed: `Base broadcast demo` saved as a draft using the existing demo photo, survived refresh, and displayed its private media/caption in final review. Dar es Salaam schedule preview displayed the chosen local time. Both confirmation modes stayed disabled while the scheduler and eligible audience were unavailable.
- The real owner analytics now show one visitor, three private messages and zero subscribed after the Phase 9 opt-out, matching the owner's reported three-command test.
- Security Advisor rerun found zero errors and zero informational findings; only the pre-existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains. The actual dispatcher claim query also passed PostgreSQL EXPLAIN parsing/planning without claiming or sending a recipient.
- At this checkpoint scheduler activation awaited owner approval. The retained demo draft was editable and unqueued. The activation checkpoint below supersedes that configuration gate; real Telegram broadcast acceptance is still pending.

## Scheduler live checkpoint — 2026-11-03

- The owner explicitly approved a fresh 32-random-byte dispatch secret on Cloudflare `sautilink-base-web` Production and Render `sautilink-base-api-staging`, enabling broadcasts and deploying those two resources. The secret was stored only in those runtime settings, never in source control, build variables or output. Render's other environment settings were preserved; no paid resource was created.
- Initial cron logs exposed a runtime incompatibility: Workers rejects Node's `redirect: 'error'` before making a request. Code `0da84867707fa40c6bde47b4b62bb04d28b7c990` changes it to `manual` and rejects non-success responses without following redirects or retrying. This preserves the fixed-host credential boundary. See the [Workers Request API](https://developers.cloudflare.com/workers/runtime-apis/request/).
- [CI #166](https://github.com/sautilink/Base/actions/runs/41564319218) passed, including 104 API tests, seven web tests, typechecks, builds and Wrangler dry-run. Cloudflare build `550577ba-8d15-42a9-aa3b-0fd7a28d3856` published Worker `52dc81be`, Ready at 100% traffic, from that feature-branch commit. The production runtime secret survived publication.
- Render's configuration deployment `dep-dbkk1uec6qcc73aljt3g` enabled the protected endpoint. The follow-up deployment `dep-dbkk6d2jnfac7395sn8g` became Live at exact code SHA `0da8486`; `/health/release` matched, `/health/ready` was ready, and an unsigned dispatch POST returned 401.
- Consecutive one-minute cron events at 05:11:56 and 05:12:57 Africa/Dar_es_Salaam completed successfully after the fix. The owner dashboard at `base.sautilink.com` showed **Scheduler Connected** after refreshing, proving a recent authenticated API heartbeat. No manual heartbeat was injected.
- The separate web-release probe was still searching for the old uppercase text branding. Live home/login/dashboard returned 200 with the current logo's accessible name and Phase 10 marker. The probe now checks that actual branding and marker; it does not claim the phase marker proves an exact commit.
- The retained `Base broadcast demo` remains a draft; no campaign was queued or sent. Ready/subscribed counts are both zero after the earlier opt-out. Next acceptance needs a fresh real `/subscribe`, followed by a concrete owner-confirmed send or timed campaign. Configuration approval alone does not authorize sending the draft.

## Real broadcast and schedule checkpoint — 2026-11-03

- At code `aaa7bd0`, a fresh real `/subscribe` produced one subscribed and delivery-ready recipient. The owner explicitly approved sending the reviewed demo photo/caption once. `Base broadcast demo`, queued at 05:27:04 Africa/Dar_es_Salaam, completed with audience 1, accepted 1, waiting/skipped/unknown 0. The owner then confirmed receiving the image and caption in Telegram.
- The owner requested the next schedule/cancellation tests using the same demo content and one recipient. `Base cancellation test` was queued for 05:35:00 Africa/Dar_es_Salaam. Native `window.confirm` blocked the browser controller; its documented dialog API did not expose a confirm handle, and the owner was asked to finish cancellation manually. Cancellation was not confirmed before dispatch. After reloading, that campaign was completed with accepted 1 and waiting/skipped/unknown 0. This proves the scheduled queue dispatched; it does **not** prove cancellation worked. Do not report this campaign as cancelled or replay it.
- Cancellation confirmation is now rendered inside the campaign card, naming the campaign and retaining the in-flight warning and explicit final confirmation. Opening the confirmation does not call the API. `Keep campaign` receives focus and sends nothing; only `Confirm cancellation` posts the existing owner-checked cancel endpoint. Local web typecheck and all seven web tests pass. The next live cancellation test must use the final remaining campaign slot today; do not raise the three-campaign daily limit to test it.
