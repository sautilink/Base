# SautiLink Base — operational handoff
**Updated:** 2026-11-01 (UTC). All details are Base-only; never confuse with SautiLink App.

## Repository / branches
- GitHub: `sautilink/Base`; staging/source branch: `feat/phase-1-foundation`.
- `main` deliberately remains **unmerged** and unchanged at `ad0cc265`.
- PR #1 is the original draft foundation PR targeting `main`.
- PR #2 (delivery-health), PR #3 (token rotation), PR #4 (Phase 5 ops) were **fast-forwarded into the Base staging branch only**. GitHub may show them as merged, but **not into `main`**.
- Separate diagnostics branch: `diagnostics/cloudflare-release-check`, for public read-only tests only.

## Live infrastructure and verified status
- Web Worker: `sautilink-base-web`, user-facing `https://base.sautilink.com/`, source `feat/phase-1-foundation` intended. Cloudflare publish is **separate** from GitHub CI's Wrangler build/dry-run.
- Phase 5 frontend: `base-release=phase-5-ops-hardening` in `apps/web/app/layout.tsx`. A public read-only diagnostic #3 on 2026-11-01 at ~01:35 UTC found both custom domain and branch Preview returning HTTP 200, showing earlier approved-testers copy, but **not** the Phase 5 marker. Do not claim Phase 5 UI live until the custom domain HTML includes that marker and readiness passes.
- Render API: `sautilink-base-api-staging`, service `srv-dbim2e2jnfac73b0nlkg`, workspace `tea-dbilqoetlv9c73b3disg`, endpoint `https://sautilink-base-api-staging.onrender.com`. **LIVE** deploy `dep-dbj9e3m7bikc73eprm6g`, commit `3978a6971d2acc8e3dac7e6c8dee4b9798100feb`, succeeded 2026-11-01 ~01:35 UTC. Render auto-deploy is **OFF**; manual deploy via Render is required on future API changes.
- Dedicated Base Supabase project: `gtzqirfwghijuzhvrnha` (`sautilink-base`). Never apply Base SQL to the primary SautiLink App project.
- Database check after Phase 5: **1 active test bot**, **1 encrypted credential**, **5 user-bot delivery ledger rows**, **zero temporary fixture bots**. The master bot and user test bot were not paused, disconnected or token-rotated in these phases.

## Current features
- Two approved test-account gate; Supabase-verified owner binding; HTTPS API CORS; BotFather `getMe` verified bot connection; AES-256-GCM encrypted bot credentials in unexposed `base_private` schema.
- Master bot @SautiLinkBaseBot and a separate user test bot (original live `/ping → pong` observed). Original test bot still active.
- Bot builder: welcome text, commands, keyword replies, simulation. User-bot activation/deactivation, webhook secret, at-most-once update ledger, manual pause and webhook cleanup.
- Phase 3: owner-only delivery-health aggregate with no raw messages or tokens.
- Phase 4: owner-only replacement of BotFather token while `inactive`; server-verified bot identity, signed webhook ownership, owner-specific SQL function with row locking. Do not regenerate a real token without owner intent.
- Phase 5: owner-only Telegram webhook-health metadata (owned/none/foreign; bounded pending count; last error timestamp), no URL/IP/error-text leak. Dashboard warns of active/drift and paused-but-webhook-present states. Post-claim DB-read failure tries to mark incident `unknown` rather than leaving `processing`; no automatic replay of ambiguous sends.

## Migrations in the dedicated Base project
- `base_owner_delivery_health_summary` version `20261101000417`.
- `base_inactive_bot_token_rotation` version `20261101011550`.
- `base_operator_terminal_ledger_retention` version `20261101013025`.
- Retention functions `base_private.preview_user_bot_ledger_retention(180)` and `base_private.prune_user_bot_terminal_updates(180,500)` are operator-only SECURITY INVOKER. NOT executable by browser roles, `service_role`, `base_api_runtime` or `base_api_login`. No cron and no live-data deletion have been scheduled or performed. A synthetic fixture was inserted, safely pruned in bounded batches and deleted. Real rows remain intact.
- Security advisor still notes existing `Leaked Password Protection Disabled` configuration warning; no migration-related advisor issue appeared.

## CI / verification
- Phase 5 PR #4 quality [CI #140](https://github.com/sautilink/Base/actions/runs/41261265269) **PASS**.
- Final branch code [CI #143](https://github.com/sautilink/Base/actions/runs/41261476148) and feature-branch [CI #144](https://github.com/sautilink/Base/actions/runs/41261615263) **PASS**: typechecks, automated API tests, Next.js build, Cloudflare dry-run.
- Staging readiness #60 (https://github.com/sautilink/Base/actions/runs/41261610354) was re-run after Render deploy; API liveness, database readiness, browser-safe config, auth/feature-gate denial and Preview CORS steps passed. Exact custom-domain Phase 5 marker check was still unresolved at the last checkpoint. Check latest workflow conclusion rather than assuming pass.
- Diagnostic #3 (https://github.com/sautilink/Base/actions/runs/41261711098) read-only proof of Cloudflare publication mismatch.

## Immediate high-value next steps
1. Check Cloudflare Worker `sautilink-base-web` Settings > Build > Branch control. The **production branch** should be `feat/phase-1-foundation` and deploy command `pnpm --filter @base/web deploy:cloudflare`. Verify build logs, commit and deployment target. Production and Preview can differ. If needed, retry production publish from Cloudflare dashboard. Never put Wrangler access tokens in code or chat.
2. Re-run staging readiness against `https://base.sautilink.com` and verify **exact** `phase-5-ops-hardening` release marker, not just HTTP 200.
3. Authenticated HTTP acceptance with two genuine Base sessions: owner sees `GET /bots/:id/delivery-health` and `GET /bots/:id/webhook-health`; other user must receive 404. No access tokens in logs, PR comments or chat. Database-level cross-owner checks have passed, but this does not replace HTTP acceptance.
4. Owner-controlled test in Telegram: one `/ping → pong`; pause user bot; confirm no new Base reply; confirm Telegram webhook removed (or cleanup pending safely); reactivate; confirm replies resume. Do not pause live test bot without deciding to run this manual acceptance.
5. Confirm BotFather token rotation after intentional regeneration **only on a paused bot**, with real new token typed inside HTTPS dashboard. The encrypted credential and DB row remain; identity and webhook checks guard replacement. Never expose token here.
6. Before public release: design durable outbox/recovery for ambiguous sends and stale processing, edge-level limits, formal retention policy/backups, alerting, broad-scale access policy and appropriate Auth password security settings.

## Non-negotiable rules
- Preserve `main` and independent SautiLink App systems.
- No real bot token, database DSN, encryption key, session credential, Telegram chat ID or unredacted webhook URL in GitHub, docs, chat or build logs.
- Do not auto-resend `unknown` or `processing`: Telegram may already have accepted a reply.
- Do not claim Cloudflare live deployment from GitHub build alone.
- Preserve the single active user test bot unless owner explicitly requests a live pause/rotation/disconnect.

More documentation: `docs/PHASE_PROGRESS.md`, `docs/USER_BOT_DELIVERY.md`, `docs/DELIVERY_HEALTH.md`, `docs/TOKEN_ROTATION.md`, `docs/PHASE_5_OPERATIONS.md`.
