-- SautiLink Base: Phase 2 user-bot connect safeguards.
-- Applied to dedicated Base Supabase (gtzqirfwghijuzhvrnha) on 2026-10-31.
-- Apply only once; never run against the separate SautiLink App database.
-- These are server-only tables; no raw IPs, bot credentials, JWTs or message bodies.

create table if not exists base_private.bot_connect_ip_limits (
  ip_digest bytea primary key check(octet_length(ip_digest)=32),
  window_started timestamptz not null default now(),
  attempt_count integer not null default 0 check(attempt_count between 0 and 21)
);
create table if not exists base_private.bot_connect_audit (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  ip_digest bytea not null check(octet_length(ip_digest)=32),
  outcome text not null check(outcome in (
    'received','invalid_format','invalid_token','provider_failure',
    'invalid_bot','master_bot','already_connected','storage_error','connected'
  )),
  telegram_bot_id bigint,
  created_at timestamptz not null default now()
);
create index if not exists bot_connect_audit_created_idx
  on base_private.bot_connect_audit(created_at);

alter table base_private.bot_connect_ip_limits enable row level security;
alter table base_private.bot_connect_audit enable row level security;
revoke all on base_private.bot_connect_ip_limits, base_private.bot_connect_audit
  from public, anon, authenticated;
grant select, insert, update on base_private.bot_connect_ip_limits to base_api_runtime;
grant insert, select, update on base_private.bot_connect_audit to base_api_runtime;
grant usage on sequence base_private.bot_connect_audit_id_seq to base_api_runtime;

-- Policies are created once as part of this migration; rerunning only the
-- CREATE POLICY statements without checks would produce duplicate-policy errors.
create policy "server read ip quota" on base_private.bot_connect_ip_limits
  for select to base_api_runtime using (true);
create policy "server add ip quota" on base_private.bot_connect_ip_limits
  for insert to base_api_runtime with check(true);
create policy "server update ip quota" on base_private.bot_connect_ip_limits
  for update to base_api_runtime using(true) with check(true);
create policy "server read connect audit" on base_private.bot_connect_audit
  for select to base_api_runtime using(true);
create policy "server add connect audit" on base_private.bot_connect_audit
  for insert to base_api_runtime with check(true);
create policy "server update connect audit" on base_private.bot_connect_audit
  for update to base_api_runtime using(true) with check(true);

comment on table base_private.bot_connect_ip_limits is
  'Private HMAC-SHA256 pseudonymous IP digest for bounded token-verification attempts.';
comment on table base_private.bot_connect_audit is
  'Private BotFather connection outcomes without bot tokens, raw IPs or auth sessions.';

-- Retention for operator's private scheduled SQL maintenance:
-- delete from base_private.bot_connect_ip_limits
--   where window_started < now() - interval '24 hours';
-- delete from base_private.bot_connect_audit
--   where created_at < now() - interval '30 days';
-- Configure a trustworthy scheduled cleanup before public launch.
