create table base_private.support_threads (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.base_bots(id) on delete cascade,
  visitor_key text not null check (visitor_key ~ '^[0-9a-f]{64}$'),
  destination bytea,
  last_message_at bigint not null,
  last_update_id bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '168 hours'),
  closed_at timestamptz,
  check ((closed_at is null) = (destination is not null))
);
create unique index support_one_open_thread on base_private.support_threads(bot_id, visitor_key) where closed_at is null;
create index support_thread_expiry on base_private.support_threads(expires_at);
create index support_thread_list on base_private.support_threads(bot_id, updated_at desc, id desc);
create index support_thread_visitor on base_private.support_threads(bot_id, visitor_key, created_at desc, id desc);

create table base_private.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references base_private.support_threads(id) on delete cascade,
  direction text not null check (direction in ('visitor', 'team')),
  body text not null check (char_length(body) between 1 and 4096),
  request_id uuid,
  actor_id uuid,
  status text not null check (status in ('received', 'sending', 'accepted', 'unknown')),
  created_at timestamptz not null default now(),
  unique (thread_id, request_id),
  check ((direction = 'visitor' and request_id is null and actor_id is null and status = 'received')
      or (direction = 'team' and request_id is not null and actor_id is not null and status <> 'received'))
);
create index support_message_timeline on base_private.support_messages(thread_id, created_at, id);

alter table base_private.support_threads enable row level security;
alter table base_private.support_messages enable row level security;
revoke all on base_private.support_threads, base_private.support_messages from public, anon, authenticated, service_role;
grant select, insert, update, delete on base_private.support_threads to base_api_runtime;
grant select, insert, update(status) on base_private.support_messages to base_api_runtime;
create policy support_thread_runtime on base_private.support_threads for all to base_api_runtime using (true) with check (true);
create policy support_message_runtime on base_private.support_messages for all to base_api_runtime using (true) with check (true);
