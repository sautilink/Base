-- SautiLink Base schema proposal. Apply ONLY to a NEW dedicated Base project.
-- No existing SautiLink database should receive this SQL.
create extension if not exists pgcrypto;

create table public.base_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.base_bots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  telegram_bot_id bigint unique not null,
  username text not null,
  display_name text not null default '',
  status text not null default 'inactive' check (status in ('inactive','active','suspended')),
  welcome_message text not null default '',
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index base_bots_owner_idx on public.base_bots(owner_id);

create table public.base_commands (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.base_bots(id) on delete cascade,
  command text not null check (command ~ '^[a-z0-9_]{1,32}$'),
  response_text text not null default '',
  created_at timestamptz not null default now(),
  unique(bot_id,command)
);
create index base_commands_bot_idx on public.base_commands(bot_id);

create table public.base_menu_items (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.base_bots(id) on delete cascade,
  parent_id uuid,
  title text not null check (char_length(title) between 1 and 64),
  response_text text not null default '',
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  unique(id,bot_id),
  foreign key (parent_id,bot_id) references public.base_menu_items(id,bot_id) on delete cascade,
  check(parent_id is distinct from id)
);
create index base_menus_bot_idx on public.base_menu_items(bot_id,position);

create table public.base_reply_rules (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.base_bots(id) on delete cascade,
  keyword text not null check (char_length(keyword) between 1 and 128),
  response_text text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(bot_id,keyword)
);
create index base_rules_bot_idx on public.base_reply_rules(bot_id);

-- Bot secrets are deliberately inaccessible through Supabase Data API.
create schema if not exists base_private;
revoke all on schema base_private from public, anon, authenticated;
create table base_private.bot_credentials (
  bot_id uuid primary key references public.base_bots(id) on delete cascade,
  token_ciphertext bytea not null,
  key_version integer not null default 1,
  updated_at timestamptz not null default now()
);
revoke all on base_private.bot_credentials from public, anon, authenticated;

alter table public.base_profiles enable row level security;
alter table public.base_bots enable row level security;
alter table public.base_commands enable row level security;
alter table public.base_menu_items enable row level security;
alter table public.base_reply_rules enable row level security;
alter table base_private.bot_credentials enable row level security;

create policy "profile read own" on public.base_profiles for select to authenticated
 using ((select auth.uid()) = id);
create policy "profile insert own" on public.base_profiles for insert to authenticated
 with check ((select auth.uid()) = id);
create policy "profile update own" on public.base_profiles for update to authenticated
 using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "bot read own" on public.base_bots for select to authenticated
 using (owner_id = (select auth.uid()));
create policy "bot insert own" on public.base_bots for insert to authenticated
 with check (owner_id = (select auth.uid()));
create policy "bot update own" on public.base_bots for update to authenticated
 using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "bot delete own" on public.base_bots for delete to authenticated
 using (owner_id = (select auth.uid()));

create policy "command read own" on public.base_commands for select to authenticated
 using (exists(select 1 from public.base_bots b where b.id = bot_id and b.owner_id = (select auth.uid())));
create policy "command write own" on public.base_commands for insert to authenticated
 with check (exists(select 1 from public.base_bots b where b.id = bot_id and b.owner_id = (select auth.uid())));
create policy "command update own" on public.base_commands for update to authenticated
 using (exists(select 1 from public.base_bots b where b.id = bot_id and b.owner_id = (select auth.uid())))
 with check (exists(select 1 from public.base_bots b where b.id = bot_id and b.owner_id = (select auth.uid())));
create policy "command delete own" on public.base_commands for delete to authenticated
 using (exists(select 1 from public.base_bots b where b.id = bot_id and b.owner_id = (select auth.uid())));

create policy "menu read own" on public.base_menu_items for select to authenticated
 using (exists(select 1 from public.base_bots b where b.id = bot_id and b.owner_id = (select auth.uid())));
create policy "menu insert own" on public.base_menu_items for insert to authenticated
 with check (exists(select 1 from public.base_bots b where b.id = bot_id and b.owner_id = (select auth.uid())));
create policy "menu update own" on public.base_menu_items for update to authenticated
 using (exists(select 1 from public.base_bots b where b.id = bot_id and b.owner_id = (select auth.uid())))
 with check (exists(select 1 from public.base_bots b where b.id = bot_id and b.owner_id = (select auth.uid())));
create policy "menu delete own" on public.base_menu_items for delete to authenticated
 using (exists(select 1 from public.base_bots b where b.id = bot_id and b.owner_id = (select auth.uid())));

create policy "rule read own" on public.base_reply_rules for select to authenticated
 using (exists(select 1 from public.base_bots b where b.id = bot_id and b.owner_id = (select auth.uid())));
create policy "rule insert own" on public.base_reply_rules for insert to authenticated
 with check (exists(select 1 from public.base_bots b where b.id = bot_id and b.owner_id = (select auth.uid())));
create policy "rule update own" on public.base_reply_rules for update to authenticated
 using (exists(select 1 from public.base_bots b where b.id = bot_id and b.owner_id = (select auth.uid())))
 with check (exists(select 1 from public.base_bots b where b.id = bot_id and b.owner_id = (select auth.uid())));
create policy "rule delete own" on public.base_reply_rules for delete to authenticated
 using (exists(select 1 from public.base_bots b where b.id = bot_id and b.owner_id = (select auth.uid())));

-- Expose only carefully scoped tables to authenticated users; never credentials.
grant usage on schema public to authenticated;
grant select,insert,update,delete on public.base_profiles,public.base_bots,public.base_commands,public.base_menu_items,public.base_reply_rules to authenticated;
