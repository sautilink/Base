# Phase 4 — safe BotFather token rotation (restricted test only)

> **Historical rollout note (2026-11-01):** Sections below describe the rollout gates at the time they were drafted. Phase 3/4 server code and SQL have since been deployed to restricted Base staging; API staging readiness #56 succeeded. Phase 5 adds operator-only retention and webhook monitoring. Cloudflare custom-domain publication must be verified separately; see `docs/PHASE_PROGRESS.md` and `docs/PHASE_5_OPERATIONS.md` for current status.


This feature is for a **user-owned Telegram test bot only**, not the SautiLink Base master bot. A replacement token is submitted over HTTPS using the already authenticated Base dashboard. It is handled server-side, encrypted with the existing Base AES-256-GCM key, and never returned to the browser. No raw token is stored in logs, audit tables, URL parameters, browser storage, or GitHub.

## Safety gates

1. The Base API requires `USER_BOT_DELIVERY_ENABLED=true`, a valid Supabase session, the two approved test-owner allowlist, and a bot owned by that user. Only `inactive` bots can rotate.
2. The request is subjected to the existing durable per-owner connection quota **before** Telegram calls.
3. The server checks token syntax; rejects the master bot; calls Telegram `getMe` to verify the original bot ID **and** username; and calls `getWebhookInfo` to reject any webhook owned by another app. It does not call `setWebhook`, `deleteWebhook`, `sendMessage`, or alter master-bot registration during rotation.
4. The dedicated `base_private.rotate_owner_bot_credential` SQL function checks owner and inactive status again under a row lock, then replaces encrypted credentials (key version 1). This avoids a race between the status checked by HTTP and the database update. The SQL never sets the bot active.
5. Anonymous and authenticated browser PostgreSQL roles may **not** execute the function. The API role does not receive direct credential `SELECT` or `UPDATE` grants; the dedicated function is its only update capability. API readiness verifies the private function remains unavailable to browser roles.

## Rollout order

1. Merge/review Phase 4 tests on a **feature PR targeting `feat/phase-1-foundation`**. Do not merge into `main`.
2. Confirm the SQL in `database/user-bot-token-rotation.sql` targets the dedicated project `sautilink-base` and apply as a named additive migration, **before** deploying API code. New API readiness intentionally rejects missing or browser-exposed functions.
3. Verify role grants with `has_function_privilege`, the new SQL function's `search_path`, and an owner mismatch/inactive-state test using a **rolled-back** transaction and a synthetic ciphertext. Never touch the live encrypted token during the test.
4. Deploy the exact CI-passed commit on the restricted Base staging API. Verify `/health/ready`, missing-auth HTTP 401, wrong-user HTTP 404 (with a real second-account session), active-bot rotation refusal 409, and no token included in HTTP errors. Browser role cannot read raw ciphertext.
5. Deploy Base web through its existing Cloudflare feature-branch production path. Confirm form renders for paused bots only. **Do not actually rotate the live test bot unless its owner has regenerated its BotFather token and explicitly chooses to replace it.** Paste tokens only into the HTTPS dashboard, never into the chat.
6. With a test token intentionally rotated in BotFather, pause the bot, verify Telegram webhook cleanup, submit the replacement token, confirm status remains inactive, then manually activate and verify one real `/ping → pong` exchange. Keep the two-test-owner gate until complete.

## Pause-in-flight limitation

Phase 4 re-checks the stored bot status immediately before `sendMessage`, so an update that started while the bot was active but sees a pause before send is marked `ignored` without a Telegram send. This **narrows** the pause race. It cannot cancel a `sendMessage` request already in flight, and a database failure after the update was claimed may leave an at-most-once `processing` record. There is **no automatic retry** of unknown, processing or sent updates. Operators must review delivery-health diagnostics; outbox recovery and a stronger transaction-level pause barrier are still needed before general release.
