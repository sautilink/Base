# SautiLink Base — implementation status

Source branch: `feat/phase-1-foundation`. PR #1 remains Draft. Keep `main` and the separate SautiLink App infrastructure unchanged until a production review.

## Verified staging state (2026-10-31)

- **Foundation:** the Cloudflare feature Preview and the separate Render API are live. The API's `/health` and `/health/ready` return HTTP 200. A user reported successful email login and session restoration on the Preview.
- **Master bot:** the existing @SautiLinkBaseBot is enabled on Render staging. Telegram webhook registration passed its identity, destination and database preflight. The user reported **Master Bot PASS** after testing private-chat responses and opening the dashboard. The Base ledger had six `sent` updates and no `unknown` or `processing` updates in the latest 24-hour read. A `sent` ledger entry alone does not prove a visible reply; the user-observed test provides that confirmation.
- **Deployment:** Render staging was live at `ebd0420` when checked. GitHub CI for that commit passed. `MASTER_BOT_ENABLED=true`, `MASTER_BOT_REGISTER_WEBHOOK=false` and `BOT_CONNECT_ENABLED=false` are the observed staging modes. The master webhook requires its Telegram secret. No production deploy or merge was performed.

## Implemented, with remaining gates

| Area | Current state | Next gate |
| --- | --- | --- |
| Master bot | `/start`, `/help`, `/createbot`, `/dashboard` work in staging private chat; persistent update-ID deduplication is enabled | Monitor `unknown` and stalled updates; design reliable outbox delivery before high-volume use |
| User-bot connection | Protected owner and IP quotas, token-free audit, verified Supabase owner binding, BotFather `getMe`, encrypted token storage and inactive registration are implemented | Keep `BOT_CONNECT_ENABLED=false` until two genuine test accounts and a separate test bot prove ownership isolation, rollback and duplicate handling |
| Commands and keyword replies | Owner-scoped editor/API and read-only simulator exist | Verify with two accounts; actual user-bot Telegram delivery is not enabled |
| Telegram Mini App | Not implemented | Verify signed Telegram `initData` before exposing account data |
| Broadcast, scheduling, analytics and team access | Not implemented | Design consent, queues, quotas and permissions |
| Production | Not released | Review security, monitoring, retention, backups and domain configuration before merging PR #1 |

The Base platform is free for users, with fair-use protections. Never put BotFather tokens, database credentials, service-role keys, or webhook secrets in chat, GitHub, frontend bundles or public API responses. See `docs/PHASE_2_MASTER_BOT.md` and `docs/API_DEPLOYMENT.md` for the current staging runbooks.
