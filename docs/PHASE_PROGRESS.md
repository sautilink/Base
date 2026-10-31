# SautiLink Base — implementation status

This is an engineering status record, not a promise that every feature is live.
Source branch: `feat/phase-1-foundation`; PR #1 remains Draft. Do not merge or deploy `main` without the production release review.

## What is implemented in source

- **Phase 1: Foundation** — pnpm monorepo, TypeScript/NestJS, Next.js/Inter, dedicated Base Supabase schema with RLS, encrypted-token primitives, Supabase Auth client, GitHub CI, and a working Cloudflare branch Preview from the earlier baseline. The Base API and full end-to-end login have not been verified live.
- **Phase 2: Master bot (initial implementation)** — `/telegram/master` webhook controller with constant-time secret comparison and private-chat responses for `/start`, `/help`, `/createbot`, `/dashboard`. Off by default using `MASTER_BOT_ENABLED=false`. No Telegram webhook is registered, and no master token is stored in Git.
- **Phase 3: Bot connect (development)** — `POST /bots/connect` verifies a Supabase access token and Telegram `getMe`, encrypts the supplied BotFather token at rest, and creates an inactive bot in a transaction. It needs distributed rate limiting, scoped PostgreSQL credentials, auditing, token rotation and integration tests before public exposure.
- **Phase 4: Commands/welcome (editor + API)** — protected per-owner GET, POST, PATCH and DELETE endpoints for command configuration; welcome message editing; web editor. This config is stored in existing tables. No Telegram runtime delivers these messages yet.
- **Phase 5: Telegram Mini App** — not started; signed Telegram initData verification is a hard requirement.
- **Phase 6: Web dashboard (initial implementation)** — email login screen, owner-only bot list from Supabase RLS, token connection form, command/reply editor, default white/Inter styling. API URL and Supabase publishable key must be present during the Next.js build for live use.
- **Phase 7: Keyword smart replies (editor + API)** — keyword create/edit/delete and enable/pause, server-side owner checks. Delivery worker and AI replies are not implemented.
- **Phase 8: Broadcast/scheduling** — not started; opt-in recipient model, quotas, deduplication and queue are prerequisites.
- **Phase 9: Analytics/team** — not started; analytics consent and role-based authorization design needed.
- **Phase 10: Security/release** — GitHub tests and Cloudflare dry-run checks are in CI. Not ready for production; complete the gates below.

## Verification and rollout gates

1. Confirm latest GitHub CI typecheck, API tests, web build, OpenNext build and Wrangler dry-run.
2. Check the new Cloudflare branch Preview after the commit; a prior successful Preview is not proof that newer commits were deployed.
3. Configure only **Base** public build variables for web authentication; configure Base Supabase Auth Site URL, redirect allowlist, and email delivery controls.
4. Host the NestJS API separately with scoped DB role, TLS, secret manager, strict allowed origin, payload limit, distributed user/IP rate limiting and logs that never expose bearer headers or bot tokens.
5. Add automated multi-account authorization tests for commands, reply rules and connect; verify atomic rollback and invalid BotFather token behaviour. Run staged tests against dedicated Base test users before public traffic.
6. Add Telegram update-id deduplication, handling for failed sends, webhook abuse prevention, monitoring and bounded retry before enabling `MASTER_BOT_ENABLED` or registering a webhook.
7. Add bot token rotation/revocation, disconnect cleanup and webhook secret verification before activating connected user bots.
8. Obtain a separate production review before merging PR #1 and switching `base.sautilink.com` to new code.

The Base service is free for users, with fair-use protections and no required paid tier or forced ads. Never share infrastructure credentials in chat, frontend code or GitHub. Do not use SautiLink App's DB or backend.
