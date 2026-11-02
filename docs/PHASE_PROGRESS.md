# SautiLink Base — implementation status

Source branch: `feat/phase-1-foundation`. PR #1 remains Draft. Cloudflare Production serves this branch at `base.sautilink.com` at the owner's request; `main` remains empty and the separate SautiLink App infrastructure is unchanged.

## Phase 10: Broadcast Center and scheduling — 2026-11-02

- Added owner drafts, saved-content/media preview, explicit final review, UTC scheduling, durable recipient queue, cancellation and progress counts. Delivery-ready destinations are captured encrypted only on a new `/subscribe` and cleared on `/unsubscribe`.
- Local verification passed 104 API tests, six web tests, typechecks and a Next production build. Rolled-back Base database lifecycle/grant tests passed. Scheduler activation requires a dedicated server secret; no real broadcast has been sent by these tests. See `docs/PHASE_10_BROADCAST_CENTER.md` for bounds and rollout.

## Phase 9: Audience and subscription analytics — 2026-11-02

- Added owner-only audience counts, rolling activity, selectable 30-day chart and daily figures in the web/Mini App editor.
- Added explicit `/subscribe` and `/unsubscribe`; ordinary bot use never grants opt-in. Claims, consent and counters commit atomically. Private HMAC pseudonyms replace raw Telegram identities in analytics.
- Live at `28c16cd`: 95 API tests and CI #161 passed; Render exact SHA/ready and Cloudflare Worker `a3462741` at 100% were confirmed. Owner browser chart/table/simulator acceptance and rolled-back SQL isolation passed. The owner also confirmed real Telegram `/subscribe`, `/unsubscribe` and `/ping` replies worked. See `docs/PHASE_9_AUDIENCE_ANALYTICS.md`. Broadcast sending and scheduling remain future work.

## Phase 8: Content Manager and Menu Builder — 2026-11-02

- Added private media uploads, saved text/media content, command bindings, nested menus, HTTPS buttons, Back navigation, interactive preview, and callback/media delivery. Web branding uses the existing SautiLink logo followed by gray Base.
- The additive migration is applied to Base only. Local typechecks and 87 API tests passed; rolled-back database tests passed owner isolation and tree/content constraints. See `docs/PHASE_8_CONTENT_MENUS.md` for scope and live acceptance evidence.
- Live acceptance passed on `ad0a270` (CI #159, API exact revision/ready, Cloudflare Worker `84f5949e` at 100%). Browser upload, private media preview, command binding and nested preview passed. The user confirmed the real Telegram image/caption and menu/Back navigation worked. Storage RLS also hid the uploaded file from the second account. Demo content and menus remain editable on the approved test bot.

## Phase 7: Telegram Mini App — 2026-11-02

- Added a Telegram inline Mini App launch button to the Base master bot's private-chat replies, with the existing browser dashboard link retained.
- Added `/miniapp` on the custom-domain web app. Raw Telegram `initData` is verified by the Base API with the master bot token, a bounded timestamp and duplicate-field rejection before the existing Base dashboard is shown. Telegram identity alone never grants account access; the user still signs in to Base with the existing Supabase account.
- Added mobile safe-area styling, safe return from Base password login, and signature/tamper/expiry tests. Rollout and remaining live Telegram acceptance are in `docs/PHASE_7_MINIAPP.md`.
- CI #156 passed. Cloudflare published `ffd5cc6` on `base.sautilink.com`; the Base API was verified live at `f2e225c` with ready health, 401 for unsigned Mini App data and 204 for the custom-domain CORS preflight. The Telegram JavaScript host was unreachable from the tested network, so the web page now reads the signed launch fragment directly. A fake launch was rejected and a direct browser visit showed only Telegram launch guidance. The owner confirmed a fresh Telegram Mini App launch showed @techhubtz_support_bot and opened its editor, then reported the second Base account saw zero bots. These UI acceptance checks passed by user observation.

## Phase 5: diagnostics, reliability and private retention — 2026-11-01

- Draft [PR #4](https://github.com/sautilink/Base/pull/4) adds owner-only, read-only Telegram webhook health diagnostics, a dashboard warning when the active database status conflicts with Telegram webhook ownership, and a safe reminder to retry webhook cleanup for paused bots. It does not disclose Telegram URLs, errors, IPs, tokens or message contents.
- The delivery handler now marks a claimed update as `unknown` if the second status lookup fails but the incident can still be persisted; it **never** automatically replays a possibly accepted Telegram response.
- Operator-only retention migration `base_operator_terminal_ledger_retention` applied **only to the separate Base Supabase project**, not SautiLink App. The `SECURITY INVOKER` preview/prune functions are not executable by browser roles, `service_role`, `base_api_runtime` or `base_api_login`. No cron/automatic pruning exists.
- Safe synthetic database test **PASS**: 180-day preview, 1-row batch cap, preservation of `unknown`/`processing`, removal of fixture rows. Post-test Base DB still had **1 active bot, 1 encrypted credential, 5 update-ledger rows**, and 0 fixture bots. No live bot credential was changed or deleted.
- [CI #140](https://github.com/sautilink/Base/actions/runs/41261265269) **PASS** (typecheck, API tests, builds, Cloudflare dry-run). This phase is not yet declared on the live custom domain until its production Worker revision is confirmed. Latest Supabase security advisor had only the existing leaked-password-protection warning.
- Manual two-account authenticated HTTP test, Telegram pause/restart and Cloudflare phase-specific custom-domain release remain **pending**. The source of truth for operational procedure is `docs/PHASE_5_OPERATIONS.md`.

## Phase 3/4 deployment checkpoint — 2026-11-01

- [PR #2](https://github.com/sautilink/Base/pull/2) and [PR #3](https://github.com/sautilink/Base/pull/3) were fast-forwarded into `feat/phase-1-foundation` only, not `main`. Telegram delivery health, paused-only encrypted token rotation, and the DB migrations were shipped to the dedicated Base test environment.
- **Render API Phase 4** was live as `dep-dbj963tg1s2s73f3jbbg` at commit `c12fc2a`; staging readiness #56 and CI #137 passed. Real bot remains active.
- The exact Phase 4 `base-release` marker was **not** confirmed at `base.sautilink.com` or the Cloudflare branch Preview in the last read-only check. GitHub CI Cloudflare build is not evidence of Worker publication; the production dashboard must be inspected. Do not claim this frontend live without a successful exact-version check.

## Phase 3: delivery diagnostics (review branch only; 2026-11-01)

- Draft [PR #2](https://github.com/sautilink/Base/pull/2) targets `feat/phase-1-foundation` and contains an owner-only delivery-health API endpoint, a dashboard diagnostic view, a private aggregate function, and tests. CI #127 succeeded; this is **not yet deployed**.
- Additive Base-only Supabase migration `base_owner_delivery_health_summary` (history version `20261101000417`) **was applied** and verified. Server roles can call the function; browser roles cannot. A different genuine Base user received empty aggregate results for the existing test bot. No account IDs, chat content, tokens or update IDs were exposed.
- One test bot, one encrypted credential, five ledger records at the migration-time integrity check; no delivery rows or bot configuration were changed by the migration.
- Live UI/HTTP verification, manual Telegram pause/cleanup test and owner-approved staging deployment remain pending. PR #1, the feature-branch deployment, `main` and the separate SautiLink App have not been changed.
- Note: the Supabase security advisor still shows its existing `Leaked Password Protection Disabled` Auth warning; it is separate from Phase 3. Full outbox recovery, ledger retention, WAF limits and credential rotation are future work.

See `docs/DELIVERY_HEALTH.md` for staged rollout order.

## Verified staging state (2026-11-01)

- **Foundation:** `base.sautilink.com` and the separate Render Base API are live. The owner confirmed email login persists after refreshing the custom-domain dashboard.
- **Master bot:** the existing @SautiLinkBaseBot is enabled on Render staging. Telegram webhook registration passed its identity, destination and database preflight. The user reported **Master Bot PASS** after testing private-chat responses and opening the dashboard. The Base ledger had six `sent` updates and no `unknown` or `processing` updates in the latest 24-hour read. A `sent` ledger entry alone does not prove a visible reply; the user-observed test provides that confirmation.
- **Deployment:** The separate Render API is live at `a3cfcdb` (`dep-dbj7d4ss728c7391bvmg`), with `/health/ready` returning 200 and `USER_BOT_DELIVERY_ENABLED=true`. GitHub CI #123 passed 60 API tests, typechecks and builds. Cloudflare Production serves the feature branch at `base.sautilink.com`; the `a3cfcdb` Worker build was Ready at 100% traffic when checked. The connection and delivery endpoints still allow only the two configured test accounts. PR #1 was not merged.
- **Auth:** the owner confirmed saving a password, signing out, then signing in with email and password and seeing the bot after dashboard refresh. New account sign-up still requires email confirmation.
- **Two-account isolation and bot connection:** two genuine Base Auth users have signed in. A rolled-back SQL probe on the live Base database showed each could read only its own bot, command, reply rule and menu fixture; all four tables returned to zero rows afterward. Two attempts to connect @SautiLinkBaseBot were rejected without storing a bot. The separate BotFather test bot was connected once with an encrypted private credential. Against the real row, the owner saw one bot under RLS and the other account saw zero. A duplicate HTTP request from the second account returned `This Telegram bot is already connected` and produced one `already_connected` audit. Database uniqueness and transaction-rollback checks also passed.
- **Real user-bot delivery:** the owner saved `/ping → pong`, verified the simulator, then activated @techhubtz_support_bot. The dashboard still showed active after refresh. Telegram accepted and confirmed the Base staging webhook; an unauthenticated webhook POST returned 401. The owner observed a real `pong` reply in Telegram. The private ledger showed one `sent` and two `ignored` updates, with no chat content stored. Live pause and two-account editor checks remain to be tested.
- **Invalid token and provider failures:** a synthetic token submitted through the signed-in production dashboard returned `Invalid bot token` and produced one `invalid_token` audit, leaving the existing bot and encrypted credential unchanged. Automated tests simulate Telegram network failures, HTTP 429/503 and malformed JSON; each returns a token-free provider error. A real Telegram outage has not been induced.

## Implemented, with remaining gates

| Area | Current state | Next gate |
| --- | --- | --- |
| Master bot | `/start`, `/help`, `/createbot`, `/dashboard` work in staging private chat; persistent update-ID deduplication is enabled | Monitor `unknown` and stalled updates; design reliable outbox delivery before high-volume use |
| User-bot connection | Protected owner and pre-auth IP quotas, two-account allowlist, token-free audit, verified Supabase owner binding, BotFather `getMe`, encrypted token storage and inactive registration are implemented. One real test bot is active; database uniqueness, rollback, second-account duplicate and live invalid-token checks passed. Provider failures passed simulated tests | Monitor real provider failures and complete edge limits, retention, token rotation and disconnection before broader access |
| Commands and keyword replies | Owner-scoped editor/API and read-only simulator exist. Restricted activation, per-bot signed webhook, private delivery ledger and pause control are implemented. The real test bot replied `pong` to `/ping`; the ledger recorded one sent update | Test live pause and two-account editor isolation; add operational recovery for ambiguous/stalled deliveries before broad access |
| Telegram Mini App | Inline master-bot launch, signed launch verification, owner editor and second-account empty list passed; separate Base Auth still gates bot data | Complete wider operational review before broad access |
| Content and menus | Private media library, content commands, nested buttons/links, simulator and real Telegram image/menu delivery passed | Media quota/retention automation and wider operational review before broad access |
| Audience analytics | Owner counts, 30-day chart/table and explicit preferences live on the custom domain; CI/browser/SQL checks passed; owner confirmed real Telegram subscribe/unsubscribe/ping replies | Monitor live usage; review retention and key rotation before broader access |
| Broadcast and scheduling | Draft/review, encrypted destinations and bounded durable dispatch implemented | Verify live draft flow; activate the dedicated scheduler only after approval, then test an explicitly confirmed campaign |
| Team access | Not implemented | Design roles and permissions |
| Public web | Base web is live on the custom domain, and user-bot connection is limited to the two approved test accounts | Review security, monitoring, retention, backups and bot delivery before a broader release or PR merge |

The Base platform is free for users, with fair-use protections. Never put BotFather tokens, database credentials, service-role keys, or webhook secrets in chat, GitHub, frontend bundles or public API responses. See `docs/PHASE_2_MASTER_BOT.md` and `docs/API_DEPLOYMENT.md` for the current staging runbooks.
