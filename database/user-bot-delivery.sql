-- Apply ONLY to the dedicated SautiLink Base Supabase project.
-- Server-only encrypted credential access and at-most-once user-bot delivery.
-- No Telegram tokens, chat IDs, messages, or raw webhook secrets enter the ledger.

create table if not exists base_private.user_bot_update_ledger (
  bot_id uuid not null references public.base_bots(id) on delete cascade,
  update_id bigint not null check (update_id >= 0),
  status text not null check (status in ('processing', 'sent', 'ignored', 'unknown')),
  created_at timestamptz not null default now(),
  primary key (bot_id, update_id)
);
create index if not exists user_bot_update_ledger_created_idx
  on base_private.user_bot_update_ledger(created_at);
alter table base_private.user_bot_update_ledger enable row level security;
revoke all on base_private.user_bot_update_ledger from public, anon, authenticated;
grant select(bot_id, update_id), insert(bot_id, update_id, status), update(status)
  on base_private.user_bot_update_ledger to base_api_runtime;

drop policy if exists "server read user bot updates" on base_private.user_bot_update_ledger;
create policy "server read user bot updates" on base_private.user_bot_update_ledger
  for select to base_api_runtime using (true);
drop policy if exists "server claim user bot update" on base_private.user_bot_update_ledger;
create policy "server claim user bot update" on base_private.user_bot_update_ledger
  for insert to base_api_runtime with check (true);
drop policy if exists "server finish user bot update" on base_private.user_bot_update_ledger;
create policy "server finish user bot update" on base_private.user_bot_update_ledger
  for update to base_api_runtime using (true) with check (true);

-- The runtime cannot directly SELECT base_private.bot_credentials. These
-- narrow functions return only encrypted bytes after server-side row checks.
create or replace function base_private.owner_bot_credential(p_bot_id uuid, p_owner_id uuid)
returns table(token_ciphertext bytea, key_version integer)
language sql security definer set search_path = ''
as $$
  select c.token_ciphertext, c.key_version
  from base_private.bot_credentials c
  join public.base_bots b on b.id = c.bot_id
  where b.id = p_bot_id and b.owner_id = p_owner_id
$$;
revoke all on function base_private.owner_bot_credential(uuid, uuid) from public, anon, authenticated;
grant execute on function base_private.owner_bot_credential(uuid, uuid) to base_api_runtime;

create or replace function base_private.active_bot_credential(p_bot_id uuid)
returns table(token_ciphertext bytea, key_version integer)
language sql security definer set search_path = ''
as $$
  select c.token_ciphertext, c.key_version
  from base_private.bot_credentials c
  join public.base_bots b on b.id = c.bot_id
  where b.id = p_bot_id and b.status = 'active'
$$;
revoke all on function base_private.active_bot_credential(uuid) from public, anon, authenticated;
grant execute on function base_private.active_bot_credential(uuid) to base_api_runtime;

grant update(status) on public.base_bots to base_api_runtime;

comment on table base_private.user_bot_update_ledger is
  'At-most-once user-bot delivery state; stores bot/update IDs only, no message or chat content. Retention review required.';
