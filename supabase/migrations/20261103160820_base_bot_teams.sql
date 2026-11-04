-- Base only. An invitation grants nothing until its named account accepts.
create table public.base_bot_members (
 id uuid primary key default gen_random_uuid(),
 bot_id uuid not null,
 owner_id uuid not null,
 member_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('admin','editor','viewer')),
 label text not null check(char_length(label) between 1 and 60),
 status text not null default 'invited' check(status in ('invited','active','revoked')),
 expires_at timestamptz not null default now()+interval '7 days',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(bot_id,member_id),
 foreign key(bot_id,owner_id) references public.base_bots(id,owner_id) on delete cascade,
 check(member_id<>owner_id)
);
create index base_members_account_idx on public.base_bot_members(member_id,status);
alter table public.base_bot_members enable row level security;
revoke all on public.base_bot_members from public,anon,authenticated,service_role;
grant select on public.base_bot_members to authenticated;
grant select,insert,update on public.base_bot_members to base_api_runtime;
create policy "team self or owner read" on public.base_bot_members for select to authenticated
 using(member_id=(select auth.uid()) or owner_id=(select auth.uid()));
create policy "team server access" on public.base_bot_members for all to base_api_runtime using(true) with check(true);

create table base_private.bot_team_events (
 id uuid primary key default gen_random_uuid(),
 bot_id uuid not null references public.base_bots(id) on delete cascade,
 actor_id uuid not null,
 member_id uuid not null,
 action text not null check(action in ('invited','accepted','declined','revoked','role_changed','left')),
 role text not null check(role in ('admin','editor','viewer')),
 label text not null check(char_length(label) between 1 and 60),
 created_at timestamptz not null default now()
);
create index base_team_events_bot_idx on base_private.bot_team_events(bot_id,created_at desc);
alter table base_private.bot_team_events enable row level security;
revoke all on base_private.bot_team_events from public,anon,authenticated,service_role;
grant select,insert on base_private.bot_team_events to base_api_runtime;
create policy "team event server read" on base_private.bot_team_events for select to base_api_runtime using(true);
create policy "team event server append" on base_private.bot_team_events for insert to base_api_runtime with check(true);

-- No new browser mutation policy on bots/commands/rules/menus. Team writes
-- go through the verified API permission checks. Media still uses Storage RLS.
create policy "team content read" on public.base_content_items for select to authenticated using (
 exists(select 1 from public.base_bot_members m where m.bot_id=base_content_items.bot_id
 and m.member_id=(select auth.uid()) and m.status='active'));
create policy "Base media team read" on storage.objects for select to authenticated using (
 bucket_id='base-content' and exists(select 1 from public.base_bot_members m
 where m.owner_id::text=(storage.foldername(name))[1] and m.bot_id::text=(storage.foldername(name))[2]
 and m.member_id=(select auth.uid()) and m.status='active'));
create policy "Base media team upload" on storage.objects for insert to authenticated with check (
 bucket_id='base-content' and exists(select 1 from public.base_bot_members m
 where m.owner_id::text=(storage.foldername(name))[1] and m.bot_id::text=(storage.foldername(name))[2]
 and m.member_id=(select auth.uid()) and m.status='active' and m.role in ('admin','editor')));
create policy "Base media team unused cleanup" on storage.objects for delete to authenticated using (
 bucket_id='base-content' and exists(select 1 from public.base_bot_members m
 where m.owner_id::text=(storage.foldername(name))[1] and m.bot_id::text=(storage.foldername(name))[2]
 and m.member_id=(select auth.uid()) and m.status='active' and m.role in ('admin','editor'))
 and not exists(select 1 from public.base_content_items c where c.storage_path=name));
