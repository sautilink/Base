-- Dedicated SautiLink Base project only. Existing text replies remain intact.
create table public.base_content_items (
 id uuid primary key default gen_random_uuid(),
 bot_id uuid not null,
 owner_id uuid not null,
 title text not null check(char_length(title) between 1 and 100),
 kind text not null check(kind in ('text','photo','video','audio','document')),
 body text not null default '',
 storage_path text unique,
 mime text,
 bytes integer,
 archived boolean not null default false,
 created_at timestamptz not null default now(),
 unique(id,bot_id),
 foreign key(bot_id,owner_id) references public.base_bots(id,owner_id) on delete cascade,
 check ((kind='text' and char_length(body) between 1 and 4000 and storage_path is null and mime is null and bytes is null)
 or (kind<>'text' and char_length(body)<=1024 and storage_path is not null and storage_path like owner_id::text || '/' || bot_id::text || '/%' and mime is not null and bytes is not null and bytes between 1 and 10485760))
);
create index base_content_bot_idx on public.base_content_items(bot_id);
alter table public.base_content_items enable row level security;
create policy "content owner read" on public.base_content_items for select to authenticated using(owner_id=(select auth.uid()));
create policy "content server access" on public.base_content_items for all to base_api_runtime using(true) with check(true);
grant select on public.base_content_items to authenticated;
grant select,insert,update on public.base_content_items to base_api_runtime;

alter table public.base_commands add column content_id uuid;
alter table public.base_commands add constraint base_command_content_fk foreign key(content_id,bot_id) references public.base_content_items(id,bot_id);
alter table public.base_menu_items add column content_id uuid;
alter table public.base_menu_items add column url text check(url is null or url ~ '^https://');
alter table public.base_menu_items add constraint base_menu_content_fk foreign key(content_id,bot_id) references public.base_content_items(id,bot_id);
grant select,insert,update,delete on public.base_menu_items to base_api_runtime;
create policy "menu server access" on public.base_menu_items for all to base_api_runtime using(true) with check(true);

-- Serialize tree edits, and reject cycles even when a client writes through REST.
create function base_private.validate_menu_tree() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.bot_id::text,8));
 if new.parent_id is not null and exists(select 1 from public.base_menu_items where id=new.parent_id and bot_id=new.bot_id and url is not null) then
  raise exception 'Link buttons cannot contain submenus' using errcode='23514'; end if;
 if new.url is not null and exists(select 1 from public.base_menu_items where parent_id=new.id and bot_id=new.bot_id) then
  raise exception 'Submenu parent cannot become a link' using errcode='23514'; end if;
 if new.parent_id is not null and exists (
  with recursive ancestors(id,parent_id) as (
   select m.id,m.parent_id from public.base_menu_items m where m.id=new.parent_id and m.bot_id=new.bot_id
   union select m.id,m.parent_id from public.base_menu_items m join ancestors a on m.id=a.parent_id where m.bot_id=new.bot_id
  ) select 1 from ancestors where id=new.id
 ) then raise exception 'Menu cycle' using errcode='23514'; end if;
 if tg_op='INSERT' and (select count(*) from public.base_menu_items where bot_id=new.bot_id)>=100 then
  raise exception 'Menu limit reached' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function base_private.validate_menu_tree() from public;
grant execute on function base_private.validate_menu_tree() to authenticated,base_api_runtime;
create trigger base_menu_tree_guard before insert or update on public.base_menu_items for each row execute function base_private.validate_menu_tree();

create function base_private.validate_content_link() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.content_id is not null then
  perform 1 from public.base_content_items where id=new.content_id and bot_id=new.bot_id and not archived for share;
  if not found then raise exception 'Content is unavailable' using errcode='23514'; end if;
 end if;
 return new;
end $$;
revoke all on function base_private.validate_content_link() from public;
grant execute on function base_private.validate_content_link() to authenticated,base_api_runtime;
create trigger base_command_content_guard before insert or update on public.base_commands for each row execute function base_private.validate_content_link();
create trigger base_menu_content_guard before insert or update on public.base_menu_items for each row execute function base_private.validate_content_link();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('base-content','base-content',false,10485760,array['image/jpeg','image/png','image/webp','video/mp4','audio/mpeg','audio/ogg','audio/wav','application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
grant usage on schema storage to base_api_runtime;
grant select(bucket_id,name,metadata) on storage.objects to base_api_runtime;
create policy "Base media server metadata" on storage.objects for select to base_api_runtime using(bucket_id='base-content');
create policy "Base media owner read" on storage.objects for select to authenticated using (
 bucket_id='base-content' and (storage.foldername(name))[1]=(select auth.uid())::text and exists
 (select 1 from public.base_bots b where b.id::text=(storage.foldername(name))[2] and b.owner_id=(select auth.uid())));
create policy "Base media owner upload" on storage.objects for insert to authenticated with check (
 bucket_id='base-content' and (storage.foldername(name))[1]=(select auth.uid())::text and exists
 (select 1 from public.base_bots b where b.id::text=(storage.foldername(name))[2] and b.owner_id=(select auth.uid())));
create policy "Base media owner cleanup" on storage.objects for delete to authenticated using (
 bucket_id='base-content' and (storage.foldername(name))[1]=(select auth.uid())::text and not exists
 (select 1 from public.base_content_items c where c.storage_path=name));
