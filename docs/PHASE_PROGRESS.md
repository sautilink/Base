# SautiLink Base — implementation status

Source branch: `feat/phase-1-foundation`. PR #1 remains Draft. Cloudflare Production serves this branch at `base.sautilink.com` at the owner's request; `main` remains empty and the separate SautiLink App infrastructure is unchanged.

## Verified staging state (2026-10-31)

- **Foundation:** `base.sautilink.com` and the separate Render Base API are live. The owner confirmed email login persists after refreshing the custom-domain dashboard.
- **Master bot:** the existing @SautiLinkBaseBot is enabled on Render staging. Telegram webhook registration passed its identity, destination and database preflight. The user reported **Master Bot PASS** after testing private-chat responses and opening the dashboard. The Base ledger had six `sent` updates and no `unknown` or `processing` updates in the latest 24-hour read. A `sent` ledger entry alone does not prove a visible reply; the user-observed test provides that confirmation.
- **Deployment:** GitHub CI and the Cloudflare Production build passed for `7e957ff`. The separate Render API was live at that commit. `MASTER_BOT_ENABLED=true`, `MASTER_BOT_REGISTER_WEBHOOK=false` and `BOT_CONNECT_ENABLED=false` were the last observed API modes before the restricted test rollout. PR #1 was not merged.
- **Two-account isolation:** two genuine Base Auth users have signed in. A rolled-back SQL probe on the live Base database showed each could read only its own bot, command, reply rule and menu fixture; all four tables returned to zero rows afterward. A separate BotFather test bot exists, but real connection and API tests remain.

## Implemented, with remaining gates

| Area | Current state | Next gate |
| --- | --- | --- |
| Master bot | `/start`, `/help`, `/createbot`, `/dashboard` work in staging private chat; persistent update-ID deduplication is enabled | Monitor `unknown` and stalled updates; design reliable outbox delivery before high-volume use |
| User-bot connection | Protected owner and pre-auth IP quotas, two-account allowlist, token-free audit, verified Supabase owner binding, BotFather `getMe`, encrypted token storage and inactive registration are implemented | Perform the restricted live test with the separate bot; verify duplicate rejection, rollback and cross-account API denial before broader access |
| Commands and keyword replies | Owner-scoped editor/API and read-only simulator exist | Verify with two accounts; actual user-bot Telegram delivery is not enabled |
| Telegram Mini App | Not implemented | Verify signed Telegram `initData` before exposing account data |
| Broadcast, scheduling, analytics and team access | Not implemented | Design consent, queues, quotas and permissions |
| Public web | Base web is live on the custom domain, but user-bot connection remains gated | Review security, monitoring, retention, backups and bot delivery before a broader release or PR merge |

The Base platform is free for users, with fair-use protections. Never put BotFather tokens, database credentials, service-role keys, or webhook secrets in chat, GitHub, frontend bundles or public API responses. See `docs/PHASE_2_MASTER_BOT.md` and `docs/API_DEPLOYMENT.md` for the current staging runbooks.
