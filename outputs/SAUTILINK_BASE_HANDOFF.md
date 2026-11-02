# SautiLink Base — release handoff

**Checkpoint:** 2026-11-02. This file is safe for source control. Keep credentials, private account details and raw Telegram initData out of it.

## Release boundary

- Work is on `feat/phase-1-foundation`. PR #1 is Draft and targets the intentionally empty `main`; do not merge it without a separate release decision.
- Cloudflare Production serves the feature branch on `base.sautilink.com` at the owner's request. The separate SautiLink App infrastructure is untouched.
- The Base Render API is a separate staging service. User-bot connection and delivery remain restricted to the approved test accounts.

## Current implementation

- Base Auth, owner-scoped bot connection and editing, commands and keyword replies, simulator, activation/pause, encrypted BotFather token storage and token rotation.
- Private Telegram delivery ledger, owner-only delivery and webhook-health diagnostics, conservative manual retention and at-most-once handling of ambiguous sends. Unknown outcomes are not replayed automatically.
- @SautiLinkBaseBot offers an inline Telegram Mini App button in private chat. `/miniapp` verifies raw Telegram initData with the Base API before loading the existing dashboard. The user must still have a separate Base Auth session. Telegram identity alone grants no bot access.

## Verified on 2026-11-02

- GitHub CI #154 passed for `f2e225c`; CI #155 passed for the Mini App timeout/retry fix at `16ff45c`.
- Cloudflare build `54c86a87` published `16ff45c` as active Worker version `a1fcdf60`, Ready at 100% traffic. Direct browser access to `https://base.sautilink.com/miniapp` displays the Telegram launch guidance and no dashboard.
- The separate Base API deployed `f2e225c` as `dep-dbjuvpp42hec73e51o00`; `/health/release` showed that exact revision and `/health/ready` was ready. The unsigned Mini App verification POST returned 401; the custom-domain CORS preflight returned 204 with the reviewed origin.
- The initial Telegram Mini App test showed verification unavailable. `16ff45c` extended the API timeout and added a safe retry, but Retry then showed the Telegram launch guidance. A direct download of `telegram.org/js/telegram-web-app.js` from the tested network timed out, confirming the external SDK host was unavailable here. The subsequent web revision reads Telegram's signed launch fragment directly, with API verification unchanged.
- Cloudflare build `1c1e56e3` then published the direct launch-fragment fix at `ffd5cc6`; Worker version `d672a993` was active at 100% traffic. A fake launch was rejected, direct browser access showed launch guidance, and the owner confirmed a fresh Telegram Mini App launch showed @techhubtz_support_bot and opened its editor. This is the owner acceptance for Phase 7.
- The user bot remained active after the pause test. An observed `pong` arrived after reactivation, so that observation does not prove a reply while paused. Activation now drops queued Telegram updates to prevent replay on reactivation.

## Next gates

1. Test a separate second Base account inside the Mini App before broad access. The owner path passed; the regular dashboard's second-account isolation was already checked.
2. Review rate limits, monitoring, backup/restore, retention and recovery for ambiguous Telegram delivery before a wider release.

See `docs/PHASE_7_MINIAPP.md`, `docs/PHASE_PROGRESS.md` and the Base operational runbooks. No BotFather menu button or Main Mini App setting was changed in this phase.
