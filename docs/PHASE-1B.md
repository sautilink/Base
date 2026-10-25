# Phase 1B — Database, Auth and CI

## Boundaries
SautiLink Base requires a **separate Supabase project**. Do not run `database/schema.sql` against the SautiLink App project. This schema is a reviewed proposal, not yet deployed.

## Authentication
Use Supabase Auth in the next implementation step. Every user-facing table enables RLS, and policies allow the authenticated owner to operate on their own bots and child records. Never rely on user-controlled metadata for authorization. Telegram Mini App signed initData must be verified on the server before sessions are issued.

## Secrets
Bot tokens belong only in `base_private.bot_credentials`, encrypted with an application-managed key. Frontend must never receive plaintext tokens, ciphertext, privileged database credentials or encryption keys. Application workers should use a least-privilege database role and a server-only secret manager.

## Database deployment checklist
1. Provision **new** Supabase project named for Base (cost/region approved separately).
2. Verify that it is not an existing SautiLink database.
3. Review schema and run in a development Base database first.
4. Test RLS with two distinct authenticated users (cross-tenant reads and writes must fail).
5. Confirm `base_private` is not exposed in Data API.
6. Run database security advisors and verify no unexpected privileges.
7. Backfill migration history before production rollout.

## CI
Workflow installs pinned pnpm, performs frozen-lockfile install, typecheck and build. PR remains draft until checks are green. No deployment is configured.

## Pending
Supabase Auth client/server integration, bot ownership API validation, bot token encryption implementation, migrations, webhook verification and runtime testing.
