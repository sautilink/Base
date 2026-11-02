-- Run after migration. Every fixture and write is rolled back.
begin;
do $$
declare
  test_bot uuid := gen_random_uuid();
  test_owner uuid;
  state text;
  counter bigint;
begin
  select owner_id into strict test_owner from public.base_bots limit 1;
  if has_table_privilege('authenticated','base_private.bot_audience','SELECT')
     or has_table_privilege('anon','base_private.bot_audience','SELECT')
     or has_table_privilege('service_role','base_private.bot_audience','SELECT')
     or has_table_privilege('authenticated','base_private.bot_activity_daily','SELECT') then
    raise exception 'Browser or storage role can read audience'; end if;
  if not (select bool_and(has_table_privilege('base_api_login',t,p))
      from unnest(array['base_private.bot_audience','base_private.bot_activity_daily']) t
      cross join unnest(array['SELECT','INSERT','UPDATE']) p) then
    raise exception 'Runtime is missing audience permissions'; end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='base_private' and c.relname in ('bot_audience','bot_activity_daily') and c.relrowsecurity)<>2 then
    raise exception 'Audience RLS missing'; end if;
  insert into public.base_bots(id,owner_id,telegram_bot_id,username,display_name,status)
    values(test_bot,test_owner,900000000001,'BaseAnalyticsFixtureBot','Disposable analytics fixture','inactive');

  insert into base_private.bot_audience(bot_id,visitor_key,subscription_state,consent_update_id,consent_message_at)
    values(test_bot,repeat('a',64),'subscribed',200,1000);
  -- A newer opt-out must win over a delayed older opt-in.
  insert into base_private.bot_audience(bot_id,visitor_key,subscription_state,consent_update_id,consent_message_at)
    values(test_bot,repeat('a',64),'unsubscribed',202,1001)
    on conflict(bot_id,visitor_key) do update set
      subscription_state=case when (excluded.consent_message_at,excluded.consent_update_id)>(bot_audience.consent_message_at,bot_audience.consent_update_id) then excluded.subscription_state else bot_audience.subscription_state end,
      consent_update_id=case when (excluded.consent_message_at,excluded.consent_update_id)>(bot_audience.consent_message_at,bot_audience.consent_update_id) then excluded.consent_update_id else bot_audience.consent_update_id end,
      consent_message_at=greatest(bot_audience.consent_message_at,excluded.consent_message_at);
  insert into base_private.bot_audience(bot_id,visitor_key,subscription_state,consent_update_id,consent_message_at)
    values(test_bot,repeat('a',64),'subscribed',201,1000)
    on conflict(bot_id,visitor_key) do update set
      subscription_state=case when (excluded.consent_message_at,excluded.consent_update_id)>(bot_audience.consent_message_at,bot_audience.consent_update_id) then excluded.subscription_state else bot_audience.subscription_state end,
      consent_update_id=case when (excluded.consent_message_at,excluded.consent_update_id)>(bot_audience.consent_message_at,bot_audience.consent_update_id) then excluded.consent_update_id else bot_audience.consent_update_id end,
      consent_message_at=greatest(bot_audience.consent_message_at,excluded.consent_message_at);
  select subscription_state into state from base_private.bot_audience where bot_id=test_bot;
  if state<>'unsubscribed' then raise exception 'Delayed opt-in overwrote opt-out'; end if;
  -- IDs can restart after inactivity. A later message with a lower ID still wins.
  insert into base_private.bot_audience(bot_id,visitor_key,subscription_state,consent_update_id,consent_message_at)
    values(test_bot,repeat('a',64),'subscribed',1,1002)
    on conflict(bot_id,visitor_key) do update set
      subscription_state=case when (excluded.consent_message_at,excluded.consent_update_id)>(bot_audience.consent_message_at,bot_audience.consent_update_id) then excluded.subscription_state else bot_audience.subscription_state end,
      consent_update_id=case when (excluded.consent_message_at,excluded.consent_update_id)>(bot_audience.consent_message_at,bot_audience.consent_update_id) then excluded.consent_update_id else bot_audience.consent_update_id end,
      consent_message_at=greatest(bot_audience.consent_message_at,excluded.consent_message_at);
  select subscription_state into state from base_private.bot_audience where bot_id=test_bot;
  if state<>'subscribed' then raise exception 'Randomized update ID blocked new consent'; end if;
  update base_private.bot_audience set subscription_state='unsubscribed' where bot_id=test_bot;

  insert into base_private.bot_activity_daily(bot_id,day,messages,menu_clicks) values(test_bot,current_date,1,0);
  insert into base_private.bot_activity_daily(bot_id,day,messages,menu_clicks) values(test_bot,current_date,0,1)
    on conflict(bot_id,day) do update set messages=bot_activity_daily.messages+excluded.messages,menu_clicks=bot_activity_daily.menu_clicks+excluded.menu_clicks;
  select messages+menu_clicks into counter from base_private.bot_activity_daily where bot_id=test_bot;
  if counter<>2 then raise exception 'Daily counters lost an interaction'; end if;
  begin
    insert into base_private.bot_audience(bot_id,visitor_key) values(test_bot,'raw-chat-id');
    raise exception 'Raw identity accepted';
  exception when check_violation then null; end;
  begin
    update base_private.bot_activity_daily set messages=-1 where bot_id=test_bot;
    raise exception 'Negative count accepted';
  exception when check_violation then null; end;
end $$;
select 'PASS: permissions, RLS, monotonic consent, counters, validation; fixtures rolled back' as result;
rollback;
