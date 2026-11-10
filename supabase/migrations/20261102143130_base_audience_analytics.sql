-- Dedicated Base project. Pseudonymous usage only; no chat IDs or message text.
create table base_private.bot_audience (
  bot_id uuid not null references public.base_bots(id) on delete cascade,
  visitor_key text not null check(visitor_key ~ '^[a-f0-9]{64}$'),
  subscription_state text not null default 'not_subscribed'
    check(subscription_state in ('not_subscribed','subscribed','unsubscribed')),
  consent_update_id bigint not null default -1 check(consent_update_id>=-1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key(bot_id,visitor_key),
  check(last_seen_at>=first_seen_at)
);
create index base_audience_first_seen_idx on base_private.bot_audience(bot_id,first_seen_at);
create index base_audience_last_seen_idx on base_private.bot_audience(bot_id,last_seen_at);
alter table base_private.bot_audience enable row level security;
revoke all on base_private.bot_audience from public,anon,authenticated,service_role;
grant select,insert,update on base_private.bot_audience to base_api_runtime;
create policy "Base audience server only" on base_private.bot_audience
  for all to base_api_runtime using(true) with check(true);

create table base_private.bot_activity_daily (
  bot_id uuid not null references public.base_bots(id) on delete cascade,
  day date not null,
  messages bigint not null default 0 check(messages>=0),
  menu_clicks bigint not null default 0 check(menu_clicks>=0),
  primary key(bot_id,day)
);
alter table base_private.bot_activity_daily enable row level security;
revoke all on base_private.bot_activity_daily from public,anon,authenticated,service_role;
grant select,insert,update on base_private.bot_activity_daily to base_api_runtime;
create policy "Base activity server only" on base_private.bot_activity_daily
  for all to base_api_runtime using(true) with check(true);
