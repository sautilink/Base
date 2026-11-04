-- Run inside BEGIN/ROLLBACK on the dedicated Base project. No Telegram calls.
-- Reuses existing account IDs only for foreign keys; no account is changed.
create function pg_temp.assert_team(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Team test failed: %',message; end if; end $$;
do $$ declare a uuid; b uuid; bot uuid:=gen_random_uuid(); begin
 select owner_id into a from public.base_bots order by created_at limit 1;
 select id into b from auth.users where id<>a order by created_at limit 1;
 if a is null or b is null then raise exception 'Two existing test accounts required';end if;
 perform set_config('base.test_owner',a::text,true);
 perform set_config('base.test_member',b::text,true);
 perform set_config('base.test_bot',bot::text,true);
 insert into public.base_bots(id,owner_id,telegram_bot_id,username,display_name)
 values(bot,a,800000000000000001,'base_team_rollback_fixture','Team rollback fixture');
 insert into public.base_bot_members(bot_id,owner_id,member_id,role,label)
 values(bot,a,b,'viewer','Rollback teammate');
 insert into public.base_content_items(bot_id,owner_id,title,kind,body,storage_path,mime,bytes)
 values(bot,a,'Rollback image','photo','Test',a::text||'/'||bot::text||'/linked.png','image/png',20);
 insert into storage.objects(bucket_id,name,metadata) values
 ('base-content',a::text||'/'||bot::text||'/linked.png','{"size":20,"mimetype":"image/png"}'),
 ('base-content',a::text||'/'||bot::text||'/unused.png','{"size":20,"mimetype":"image/png"}');
end $$;
select pg_temp.assert_team(not has_table_privilege('authenticated','public.base_bot_members','INSERT,UPDATE,DELETE'),'no browser membership writes');
select pg_temp.assert_team(not has_table_privilege('anon','public.base_bot_members','SELECT'),'no anonymous membership reads');
select pg_temp.assert_team(not has_table_privilege('authenticated','base_private.bot_team_events','SELECT'),'private team audit');
select pg_temp.assert_team(not has_table_privilege('base_api_login','base_private.bot_team_events','UPDATE,DELETE'),'append-only runtime audit');
select pg_temp.assert_team(has_table_privilege('base_api_login','public.base_bot_members','SELECT,INSERT,UPDATE'),'runtime membership privileges');

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('base.test_member'),true);
select pg_temp.assert_team((select count(*)=1 from public.base_bot_members where bot_id=current_setting('base.test_bot')::uuid),'recipient sees own invitation');
select pg_temp.assert_team((select count(*)=0 from public.base_content_items where bot_id=current_setting('base.test_bot')::uuid),'pending invitation grants no content');
select pg_temp.assert_team((select count(*)=0 from storage.objects where name like current_setting('base.test_owner')||'/'||current_setting('base.test_bot')||'/%'),'pending invitation grants no media');
do $$ begin
 begin update public.base_bot_members set role='admin' where bot_id=current_setting('base.test_bot')::uuid;raise exception 'Browser promoted itself';exception when insufficient_privilege then null;end;
end $$;
reset role;

-- Wrong account cannot accept; expiry cannot be bypassed by the acceptance SQL.
with accepted as(update public.base_bot_members set status='active' where bot_id=current_setting('base.test_bot')::uuid and member_id=current_setting('base.test_owner')::uuid and status='invited' and expires_at>now() returning id)
select pg_temp.assert_team((select count(*)=0 from accepted),'wrong recipient cannot accept');
update public.base_bot_members set expires_at=now()-interval '1 minute' where bot_id=current_setting('base.test_bot')::uuid;
with accepted as(update public.base_bot_members set status='active' where bot_id=current_setting('base.test_bot')::uuid and member_id=current_setting('base.test_member')::uuid and status='invited' and expires_at>now() returning id)
select pg_temp.assert_team((select count(*)=0 from accepted),'expired invitation cannot accept');
update public.base_bot_members set status='active' where bot_id=current_setting('base.test_bot')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('base.test_member'),true);
select pg_temp.assert_team((select count(*)=1 from public.base_content_items where bot_id=current_setting('base.test_bot')::uuid),'viewer reads shared content');
select pg_temp.assert_team((select count(*)=2 from storage.objects where name like current_setting('base.test_owner')||'/'||current_setting('base.test_bot')||'/%'),'viewer reads shared media');
do $$ begin
 begin insert into storage.objects(bucket_id,name) values('base-content',current_setting('base.test_owner')||'/'||current_setting('base.test_bot')||'/viewer.png');raise exception 'Viewer uploaded';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.base_bot_members set role='editor' where bot_id=current_setting('base.test_bot')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('base.test_member'),true);
insert into storage.objects(bucket_id,name) values('base-content',current_setting('base.test_owner')||'/'||current_setting('base.test_bot')||'/editor.png');
select pg_temp.assert_team((select count(*)=3 from storage.objects where name like current_setting('base.test_owner')||'/'||current_setting('base.test_bot')||'/%'),'editor can upload to shared bot');
-- No update/upsert policy was added: even an editor cannot replace linked media.
with changed as(update storage.objects set metadata='{}' where name=current_setting('base.test_owner')||'/'||current_setting('base.test_bot')||'/linked.png' returning id)
select pg_temp.assert_team((select count(*)=0 from changed),'editor cannot overwrite linked media');
reset role;
update public.base_bot_members set status='revoked' where bot_id=current_setting('base.test_bot')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('base.test_member'),true);
select pg_temp.assert_team((select count(*)=0 from public.base_content_items where bot_id=current_setting('base.test_bot')::uuid),'revoked member loses content');
select pg_temp.assert_team((select count(*)=0 from storage.objects where name like current_setting('base.test_owner')||'/'||current_setting('base.test_bot')||'/%'),'revoked member loses media');
reset role;
select 'PASS: team grants, pending access, recipient binding, expiry, viewer/editor media, overwrite denial, revocation' as team_checks;
