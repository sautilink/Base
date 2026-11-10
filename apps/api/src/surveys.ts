import { createHmac } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from './auth-db';
import { validUuid } from './bot-config';
import { requireEncryptionKey } from './bot-security';
import { broadcastEnabled } from './broadcast-config';
import { privateCallback } from './content-delivery';

export function surveysEnabled(botId: string, env = process.env): boolean {
  return validUuid(botId) && env.BASE_SURVEY_SCHEMA_READY === 'true' && broadcastEnabled(env) &&
    (env.BASE_SURVEY_BOT_IDS ?? '').split(',').some(id => id.trim().toLowerCase() === botId.toLowerCase());
}

export function isSurveyCommand(text: string, username: string): boolean {
  const match = /^\/survey(?:@([a-z0-9_]{5,32}))?$/i.exec(text.trim());
  return !!match && (!match[1] || match[1].toLowerCase() === username.toLowerCase());
}

export function surveyCallback(body: unknown) {
  const callback = privateCallback(body);
  if (!callback) return null;
  const match = /^vote:([0-9a-f-]{36}):([1-6])$/.exec(callback.data);
  if (!match || !validUuid(match[1])) return null;
  return { chatId: callback.chatId, queryId: callback.queryId, surveyId: match[1], choice: Number(match[2]) };
}

export type SurveyVote = NonNullable<ReturnType<typeof surveyCallback>>;

export async function surveyReply(botId: string) {
  const result = await pool().query<{ id: string; question: string; choices: string[] }>(`select id, question, choices
    from base_private.bot_surveys where bot_id=$1 and closed_at is null and expires_at>now()`, [botId]);
  const survey = result.rows[0];
  if (!survey) return { responseText: 'There is no open survey right now.' };
  return {
    responseText: survey.question + '\n\nChoose one answer. The bot team sees vote totals.',
    buttons: survey.choices.map((text, index) => ({ text, callback_data: 'vote:' + survey.id + ':' + (index + 1) })),
  };
}

export async function recordSurveyVote(db: PoolClient, botId: string, vote: SurveyVote): Promise<string> {
  const key = createHmac('sha256', requireEncryptionKey(process.env.USER_BOT_WEBHOOK_SECRET_KEY))
    .update('sautilink-base:survey-vote:v1\0' + botId + '\0' + vote.surveyId + '\0' + vote.chatId)
    .digest('hex');
  // Lock the open survey until the update claim and vote commit together.
  const result = await db.query<{ open: boolean; recorded: boolean }>(`with eligible as (
    select id from base_private.bot_surveys
      where id=$1 and bot_id=$2 and closed_at is null and expires_at>now()
        and $3::smallint between 1 and cardinality(choices) for share
  ), vote as (
    insert into base_private.bot_survey_votes(survey_id,voter_key,choice)
      select id,$4,$3 from eligible on conflict do nothing returning survey_id
  )
  select exists(select 1 from eligible) as open, exists(select 1 from vote) as recorded`,
  [vote.surveyId, botId, vote.choice, key]);
  const state = result.rows[0];
  if (state.recorded) return 'Your vote was recorded.';
  return state.open ? 'You already voted in this survey.' : 'This survey is closed or unavailable.';
}

export async function pruneSurveys(): Promise<void> {
  if (process.env.BASE_SURVEY_SCHEMA_READY !== 'true') return;
  await pool().query(`delete from base_private.bot_surveys where id in (
    select id from base_private.bot_surveys where expires_at<=now()
      order by expires_at limit 100 for update skip locked)`);
}

export async function checkSurveySchema(): Promise<void> {
  if (process.env.BASE_SURVEY_SCHEMA_READY !== 'true') return;
  const result = await pool().query<{ ok: boolean }>(`select
    has_table_privilege(current_user,'base_private.bot_surveys','SELECT')
    and has_table_privilege(current_user,'base_private.bot_surveys','INSERT')
    and has_table_privilege(current_user,'base_private.bot_surveys','DELETE')
    and has_column_privilege(current_user,'base_private.bot_surveys','closed_at','UPDATE')
    and has_table_privilege(current_user,'base_private.bot_survey_votes','SELECT')
    and has_table_privilege(current_user,'base_private.bot_survey_votes','INSERT')
    and (select bool_and(not has_any_column_privilege(r,t,'SELECT,INSERT,UPDATE,REFERENCES')
      and not has_table_privilege(r,t,'DELETE,TRUNCATE'))
      from unnest(array['anon','authenticated','service_role']) as r
      cross join unnest(array['base_private.bot_surveys','base_private.bot_survey_votes']) as t)
    and (select count(*)=2 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='base_private' and c.relname in ('bot_surveys','bot_survey_votes') and c.relrowsecurity) as ok`);
  if (result.rows[0]?.ok !== true) throw new Error('Unexpected survey privileges');
}
