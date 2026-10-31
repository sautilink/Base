# SautiLink Base — implementation status

Source branch: `feat/phase-1-foundation`. PR #1 remains Draft. Cloudflare Production serves this branch at `base.sautilink.com` at the owner's request; `main` remains empty and the separate SautiLink App infrastructure is unchanged.

## Verified staging state (2026-11-01)

- **Foundation:** `base.sautilink.com` and the separate Render Base API are live. The owner confirmed email login persists after refreshing the custom-domain dashboard.
- **Master bot:** the existing @SautiLinkBaseBot is enabled on Render staging. Telegram webhook registration passed its identity, destination and database preflight. The user reported **Master Bot PASS** after testing private-chat responses and opening the dashboard. The Base ledger had six `sent` updates and no `unknown` or `processing` updates in the latest 24-hour read. A `sent` ledger entry alone does not prove a visible reply; the user-observed test provides that confirmation.
- **Deployment:** GitHub CI passed for `739169a`; the separate Render API was live at that commit with `/health/ready` returning 200, `MASTER_BOT_ENABLED=true` and `BOT_CONNECT_ENABLED=true`. The connection endpoint still allows only the two configured test accounts. Cloudflare deployed `739169a` as active version `d18d78ba` at 100% traffic on `base.sautilink.com`. PR #1 was not merged.
- **Auth:** the owner confirmed saving a password, signing out, then signing in with email and password and seeing the bot after dashboard refresh. New account sign-up still requires email confirmation.
- **Two-account isolation and bot connection:** two genuine Base Auth users have signed in. A rolled-back SQL probe on the live Base database showed each could read only its own bot, command, reply rule and menu fixture; all four tables returned to zero rows afterward. Two attempts to connect @SautiLinkBaseBot were rejected without storing a bot. The separate BotFather test bot was then connected once; its row is inactive and its private credential is encrypted. Against the real row, the owner saw one bot under RLS and the other account saw zero. The database unique constraint inserted zero duplicate rows, and a bot-plus-credential rollback left counts at one each. The HTTP duplicate path and cross-account API check remain.

## Implemented, with remaining gates

| Area | Current state | Next gate |
| --- | --- | --- |
| Master bot | `/start`, `/help`, `/createbot`, `/dashboard` work in staging private chat; persistent update-ID deduplication is enabled | Monitor `unknown` and stalled updates; design reliable outbox delivery before high-volume use |
| User-bot connection | Protected owner and pre-auth IP quotas, two-account allowlist, token-free audit, verified Supabase owner binding, BotFather `getMe`, encrypted token storage and inactive registration are implemented. One real test bot is registered; database uniqueness and rollback checks passed | Verify HTTP duplicate handling and cross-account API denial before broader access |
| Commands and keyword replies | Owner-scoped editor/API and read-only simulator exist | Verify with two accounts; actual user-bot Telegram delivery is not enabled |
| Telegram Mini App | Not implemented | Verify signed Telegram `initData` before exposing account data |
| Broadcast, scheduling, analytics and team access | Not implemented | Design consent, queues, quotas and permissions |
| Public web | Base web is live on the custom domain, and user-bot connection is limited to the two approved test accounts | Review security, monitoring, retention, backups and bot delivery before a broader release or PR merge |

The Base platform is free for users, with fair-use protections. Never put BotFather tokens, database credentials, service-role keys, or webhook secrets in chat, GitHub, frontend bundles or public API responses. See `docs/PHASE_2_MASTER_BOT.md` and `docs/API_DEPLOYMENT.md` for the current staging runbooks.
