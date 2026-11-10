-- Isolated Base project only. Delivery destinations never enter public schemas.
alter table base_private.bot_audience add column destination_ciphertext bytea
  check(destination_ciphertext is null or octet_length(destination_ciphertext) between 30 and 96);
alter table base_private.bot_audience add constraint base_audience_destination_consent
  check(destination_ciphertext is null or subscription_state='subscribed');

create table base_private.broadcast_campaigns (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null,
  owner_id uuid not null,
  content_id uuid not null,
  title text not null check(char_length(title) between 1 and 100),
  status text not null default 'draft' check(status in ('draft','scheduled','sending','completed','cancelled')),
  content_snapshot jsonb,
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(id,bot_id),
  foreign key(bot_id,owner_id) references public.base_bots(id,owner_id) on delete cascade,
  foreign key(content_id,bot_id) references public.base_content_items(id,bot_id),
  check(status in ('draft','cancelled') or (content_snapshot is not null and scheduled_at is not null))
);
create index base_broadcast_due_idx on base_private.broadcast_campaigns(scheduled_at) where status in ('scheduled','sending');
create index base_broadcast_owner_idx on base_private.broadcast_campaigns(bot_id,created_at desc);
create unique index base_broadcast_one_active_idx on base_private.broadcast_campaigns(bot_id) where status in ('scheduled','sending');
alter table base_private.broadcast_campaigns enable row level security;
revoke all on base_private.broadcast_campaigns from public,anon,authenticated,service_role;
grant select,insert,update on base_private.broadcast_campaigns to base_api_runtime;
create policy "Base broadcast server only" on base_private.broadcast_campaigns
  for all to base_api_runtime using(true) with check(true);

create table base_private.broadcast_recipients (
  campaign_id uuid not null,
  bot_id uuid not null,
  visitor_key text not null,
  consent_message_at bigint not null,
  consent_update_id bigint not null,
  status text not null default 'queued' check(status in ('queued','processing','sent','unknown','skipped')),
  claimed_at timestamptz,
  finished_at timestamptz,
  primary key(campaign_id,visitor_key),
  foreign key(campaign_id,bot_id) references base_private.broadcast_campaigns(id,bot_id) on delete cascade,
  foreign key(bot_id,visitor_key) references base_private.bot_audience(bot_id,visitor_key) on delete cascade
);
create index base_broadcast_recipient_bot_idx on base_private.broadcast_recipients(bot_id,visitor_key);
create index base_broadcast_recipient_queue_idx on base_private.broadcast_recipients(campaign_id,status);
alter table base_private.broadcast_recipients enable row level security;
revoke all on base_private.broadcast_recipients from public,anon,authenticated,service_role;
grant select,insert,update on base_private.broadcast_recipients to base_api_runtime;
create policy "Base broadcast recipients server only" on base_private.broadcast_recipients
  for all to base_api_runtime using(true) with check(true);

create table base_private.broadcast_scheduler (
  singleton boolean primary key default true check(singleton),
  last_tick_at timestamptz
);
insert into base_private.broadcast_scheduler(singleton) values(true);
alter table base_private.broadcast_scheduler enable row level security;
revoke all on base_private.broadcast_scheduler from public,anon,authenticated,service_role;
grant select,update on base_private.broadcast_scheduler to base_api_runtime;
create policy "Base scheduler server only" on base_private.broadcast_scheduler
  for all to base_api_runtime using(true) with check(true);
