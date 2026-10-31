# Architecture — Phase 1

This repository is a pnpm/Turborepo monorepo. The first runnable services are `apps/api` (NestJS health endpoint) and `apps/web` (Next.js landing preview).

## Planned components

- `apps/mini-app`: Telegram Mini App with verified initData authentication.
- `apps/worker`: queues for broadcasts and scheduled jobs.
- `packages/bot-engine`: grammY webhook routing and per-tenant bot lifecycle.
- `packages/database`: PostgreSQL schema and migrations with tenant isolation.
- `packages/security`: encryption, authorization, webhook secret validation.

## Security gates before connecting user bots

1. Encrypt bot tokens at rest and keep encryption keys outside the database.
2. Verify Telegram webhook secret tokens and Mini App initData server-side.
3. Authenticate every API call; enforce bot ownership and tenant boundaries.
4. Rate-limit bot creation, broadcast queues, and AI usage.
5. Store no credentials in source control; configure secrets only in hosting environment.
6. Add integration tests, monitoring, backups and incident procedures before production.

All features are intended to be free with fair-use controls. No Telegram bot or database is connected in Phase 1.
