-- SautiLink Base only: fixed-window per-account connect attempt limit.
-- This table is server-only: it is not exposed through Supabase Data API.
create table if not exists base_private.bot_connect_limits (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  window_started timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count between 0 and 6)
);
alter table base_private.bot_connect_limits enable row level security;
revoke all on table base_private.bot_connect_limits from public, anon, authenticated;
comment on table base_private.bot_connect_limits is 'Server-only bounded 15-minute rate limit for bot token validation; no public RLS policy.';
