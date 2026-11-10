-- Dedicated Base only. Disposable fixtures, no Telegram calls; always roll back.
begin;
do $$
declare
  test_bot uuid:=gen_random_uuid(); test_owner uuid; test_content uuid:=gen_random_uuid();
  campaign uuid:=gen_random_uuid(); other_campaign uuid:=gen_random_uuid(); n bigint;
begin
  select owner_id into strict test_owner from public.base_bots limit 1;
  if not (select bool_and(not has_table_privilege(r,t,'SELECT'))
    from unnest(array['anon','authenticated','service_role']) r cross join
    unnest(array['base_private.broadcast_campaigns','base_private.broadcast_recipients','base_private.broadcast_scheduler']) t)
    then raise exception 'Browser or storage role can read broadcasts'; end if;
  if not (select bool_and(has_table_privilege('base_api_login',t,p))
    from unnest(array['base_private.broadcast_campaigns','base_private.broadcast_recipients']) t
    cross join unnest(array['SELECT','INSERT','UPDATE']) p) then raise exception 'Runtime grants missing'; end if;
  if (select count(*) from pg_class c join pg_namespace s on s.oid=c.relnamespace
    where s.nspname='base_private' and c.relname in ('broadcast_campaigns','broadcast_recipients','broadcast_scheduler') and c.relrowsecurity)<>3
    then raise exception 'Broadcast RLS missing'; end if;
  insert into public.base_bots(id,owner_id,telegram_bot_id,username,display_name,status)
    values(test_bot,test_owner,900000000002,'BaseBroadcastFixtureBot','Disposable broadcast fixture','inactive');
  insert into public.base_content_items(id,bot_id,owner_id,title,kind,body)
    values(test_content,test_bot,test_owner,'Fixture content','text','Disposable test');
  insert into base_private.broadcast_campaigns(id,bot_id,owner_id,content_id,title)
    values(campaign,test_bot,test_owner,test_content,'Fixture campaign');
  if exists(select 1 from base_private.broadcast_campaigns where id=campaign and owner_id='00000000-0000-0000-0000-000000000001') then raise exception 'Foreign owner predicate leaked campaign'; end if;
  insert into base_private.bot_audience(bot_id,visitor_key,subscription_state,consent_update_id,consent_message_at,destination_ciphertext)
    values(test_bot,repeat('b',64),'subscribed',123,1700000000,decode(repeat('01',32),'hex'));
  update base_private.broadcast_campaigns set status='scheduled',scheduled_at=now(),content_snapshot=jsonb_build_object('body','Frozen content') where id=campaign;
  insert into base_private.broadcast_recipients(campaign_id,bot_id,visitor_key,consent_message_at,consent_update_id)
    select campaign,bot_id,visitor_key,consent_message_at,consent_update_id from base_private.bot_audience where bot_id=test_bot and subscription_state='subscribed' and destination_ciphertext is not null;
  select count(*) into n from base_private.broadcast_recipients where campaign_id=campaign;
  if n<>1 then raise exception 'Audience snapshot missing'; end if;
  begin
    insert into base_private.broadcast_recipients(campaign_id,bot_id,visitor_key,consent_message_at,consent_update_id)
      values(campaign,test_bot,repeat('b',64),1700000000,123);
    raise exception 'Duplicate recipient accepted';
  exception when unique_violation then null; end;
  begin
    insert into base_private.broadcast_campaigns(id,bot_id,owner_id,content_id,title,status,scheduled_at,content_snapshot)
      values(other_campaign,test_bot,test_owner,test_content,'Second active','scheduled',now(),'{}');
    raise exception 'Second active campaign accepted';
  exception when unique_violation then null; end;
  begin
    update base_private.bot_audience set subscription_state='unsubscribed' where bot_id=test_bot;
    raise exception 'Opt-out retained destination';
  exception when check_violation then null; end;
  update base_private.bot_audience set subscription_state='unsubscribed',destination_ciphertext=null,consent_update_id=124 where bot_id=test_bot;
  if exists(select 1 from base_private.bot_audience where bot_id=test_bot and visitor_key=repeat('b',64) and subscription_state='subscribed' and destination_ciphertext is not null and consent_message_at=1700000000 and consent_update_id=123)
    then raise exception 'Opt-out remained eligible'; end if;
  update base_private.broadcast_recipients set status='processing',claimed_at=now()-interval '11 minutes' where campaign_id=campaign;
  update base_private.broadcast_recipients set status='unknown',finished_at=now() where bot_id=test_bot and status='processing' and claimed_at<now()-interval '10 minutes';
  if not exists(select 1 from base_private.broadcast_recipients where campaign_id=campaign and status='unknown') then raise exception 'Crash outcome was replayable'; end if;
  update base_private.broadcast_campaigns set status='cancelled',completed_at=now() where id=campaign;
  if exists(select 1 from base_private.broadcast_campaigns where id=campaign and status in ('scheduled','sending')) then raise exception 'Cancellation remained dispatchable'; end if;
end $$;
select 'PASS: private grants/RLS, owner predicates, snapshots, unique recipients, opt-out, crash handling and cancellation; fixtures rolled back' as result;
rollback;
