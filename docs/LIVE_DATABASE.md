# Dedicated SautiLink Base Supabase database

**Project**: `sautilink-base` (project ref `gtzqirfwghijuzhvrnha`, organisation: SautiLink Base).
Never target the `sautilink` or `sautilink-test` projects.

## Applied on 2026-10-26
1. `initial_base_schema_and_rls` — schema in `database/schema.sql`; 5 public tables and `base_private.bot_credentials`.
2. `lock_down_bot_mutations_until_verified_server_routes` — disable browser writes to bot tables.
3. `enforce_least_privilege_data_api_grants` — remove implicit TRUNCATE/REFERENCES/TRIGGER and anonymous access; see `database/security-hardening.sql`.

## Observed verification
- Six expected tables exist, with RLS enabled.
- Public-facing bot tables: `authenticated` role has SELECT only.
- `base_profiles`: `authenticated` has INSERT, SELECT, UPDATE, constrained by RLS.
- No `anon` or `authenticated` schema usage on `base_private`.
- Supabase security advisor has one informational `rls_enabled_no_policy` result on `base_private.bot_credentials`. This table is intentionally inaccessible to public client roles.

## Pending security tests
Run integration tests with two real separate Supabase Auth test accounts to prove cross-tenant reads and writes are blocked. Do not claim this is complete based on static policy inspection.

## Authentication integration
The browser client currently uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from deployment environment settings. Configure only the **Base** project's publishable key. Configure redirect allowlist in Supabase Auth. Do not commit service-role keys or Telegram bot tokens.

## Migration notes
These SQL files document the applied schema and access restrictions; SQL migration history is recorded in Supabase. Do not blindly re-run initial schema on an existing database.
