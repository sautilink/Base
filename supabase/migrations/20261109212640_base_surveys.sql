create table base_private.bot_surveys (
  id uuid primary key,
  bot_id uuid not null references public.base_bots(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 240),
  choices text[] not null check (cardinality(choices) between 2 and 6),
  published_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '720 hours'),
  closed_at timestamptz
);
create unique index bot_surveys_one_open on base_private.bot_surveys(bot_id) where closed_at is null;
create index bot_surveys_history on base_private.bot_surveys(bot_id, published_at desc);
create index bot_surveys_expiry on base_private.bot_surveys(expires_at);

create table base_private.bot_survey_votes (
  survey_id uuid not null references base_private.bot_surveys(id) on delete cascade,
  voter_key text not null check (voter_key ~ '^[0-9a-f]{64}$'),
  choice smallint not null check (choice between 1 and 6),
  primary key (survey_id, voter_key)
);
create index bot_survey_vote_counts on base_private.bot_survey_votes(survey_id, choice);

alter table base_private.bot_surveys enable row level security;
alter table base_private.bot_survey_votes enable row level security;
revoke all on base_private.bot_surveys, base_private.bot_survey_votes from public, anon, authenticated, service_role;
grant select, insert, update(closed_at), delete on base_private.bot_surveys to base_api_runtime;
grant select, insert on base_private.bot_survey_votes to base_api_runtime;
create policy survey_runtime on base_private.bot_surveys for all to base_api_runtime using (true) with check (true);
create policy survey_vote_runtime on base_private.bot_survey_votes for all to base_api_runtime using (true) with check (true);
