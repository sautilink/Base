create table base_private.bot_knowledge (
  bot_id uuid primary key references public.base_bots(id) on delete cascade,
  entries jsonb not null default '[]'::jsonb
    check (jsonb_typeof(entries)='array' and jsonb_array_length(entries)<=20),
  telegram_enabled boolean not null default false,
  quota_day date,
  calls integer not null default 0 check (calls between 0 and 30)
);
alter table base_private.bot_knowledge enable row level security;
revoke all on base_private.bot_knowledge from public, anon, authenticated, service_role;
grant select,insert,update(entries,telegram_enabled,quota_day,calls) on base_private.bot_knowledge to base_api_runtime;
create policy bot_knowledge_runtime on base_private.bot_knowledge for all to base_api_runtime using (true) with check (true);
