-- SautiLink Base only: dedicated server privilege envelope.
-- This is a NOLOGIN role; never connect to Postgres as postgres/service_role from the API.
-- A separately provisioned LOGIN role may be granted this role after review.
-- It is not shared with SautiLink App. Browser roles get NO privileges here.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'base_api_runtime') then
    create role base_api_runtime nologin noinherit;
  end if;
end $$;

grant usage on schema public, base_private to base_api_runtime;
grant select on public.base_bots to base_api_runtime;
grant insert(owner_id, telegram_bot_id, username, display_name) on public.base_bots to base_api_runtime;
grant update(welcome_message) on public.base_bots to base_api_runtime;

grant select, insert, update, delete on public.base_commands to base_api_runtime;
grant select, insert, update, delete on public.base_reply_rules to base_api_runtime;

grant insert(bot_id, token_ciphertext, key_version) on base_private.bot_credentials to base_api_runtime;
grant select, insert, update on base_private.bot_connect_limits to base_api_runtime;
grant select(update_id), insert(update_id, status), update(status)
  on base_private.master_update_ledger to base_api_runtime;

-- PostgreSQL RLS must explicitly permit this server role.
-- The API verifies Supabase sessions and applies owner_id filters to ALL bot
-- reads/writes; this server role has broad access to Base-only tables and must
-- never be shared with clients, a public RPC, frontend, or an untrusted service.
create policy "server read base bots"
  on public.base_bots for select to base_api_runtime using (true);
create policy "server connect base bots"
  on public.base_bots for insert to base_api_runtime with check (true);
create policy "server edit base welcome"
  on public.base_bots for update to base_api_runtime using (true) with check (true);

create policy "server read base commands"
  on public.base_commands for select to base_api_runtime using (true);
create policy "server add base commands"
  on public.base_commands for insert to base_api_runtime with check (true);
create policy "server edit base commands"
  on public.base_commands for update to base_api_runtime using (true) with check (true);
create policy "server remove base commands"
  on public.base_commands for delete to base_api_runtime using (true);

create policy "server read base rules"
  on public.base_reply_rules for select to base_api_runtime using (true);
create policy "server add base rules"
  on public.base_reply_rules for insert to base_api_runtime with check (true);
create policy "server edit base rules"
  on public.base_reply_rules for update to base_api_runtime using (true) with check (true);
create policy "server remove base rules"
  on public.base_reply_rules for delete to base_api_runtime using (true);

create policy "server save encrypted token"
  on base_private.bot_credentials for insert to base_api_runtime with check (true);
create policy "server select connect quota"
  on base_private.bot_connect_limits for select to base_api_runtime using (true);
create policy "server start connect quota"
  on base_private.bot_connect_limits for insert to base_api_runtime with check (true);
create policy "server update connect quota"
  on base_private.bot_connect_limits for update to base_api_runtime using (true) with check (true);
create policy "server select master updates"
  on base_private.master_update_ledger for select to base_api_runtime using (true);
create policy "server claim master update"
  on base_private.master_update_ledger for insert to base_api_runtime with check (true);
create policy "server mark master update"
  on base_private.master_update_ledger for update to base_api_runtime using (true) with check (true);

comment on role base_api_runtime is
  'NOLOGIN capability envelope for SautiLink Base server. Strict app-level owner checks required; never expose it to browser.';
