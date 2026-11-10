import { pool } from './auth-db';
import { validUuid } from './bot-config';
import { matchKnowledgeTopic } from './openai-faq';

export type KnowledgeEntry = { question: string; answer: string };
export const smartReplyNotice = 'Smart Replies can match your question to a saved FAQ. To send your question to OpenAI for matching, type /ask agree followed by your question. Avoid passwords, account details and other private information.';
export const smartReplyNoMatch = 'I could not find a matching FAQ. Please contact the bot team.';
export const smartReplyUnavailable = 'Smart Replies is temporarily unavailable. Please try again later.';
export const smartReplyQuestionLimit = 600;

export function smartRepliesEnabled(botId: string, env = process.env): boolean {
  return validUuid(botId) && env.BASE_AI_SCHEMA_READY === 'true' &&
    (env.BASE_AI_BOT_IDS ?? '').split(',').some(id => id.trim().toLowerCase() === botId.toLowerCase());
}

export function parseAsk(text: string, username: string): { question: string | null } | null {
  const match = /^\/ask(?:@([a-z0-9_]{5,32}))?(?:\s+([\s\S]+))?$/i.exec(text.trim());
  if (!match || (match[1] && match[1].toLowerCase() !== username.toLowerCase())) return null;
  const question = /^agree\s+([\s\S]+)$/i.exec(match[2] ?? '')?.[1].trim();
  return { question: question || null };
}

export async function useSmartReply(botId: string, question: string | null, telegram: boolean): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return telegram ? null : smartReplyUnavailable;
  if (telegram) {
    const enabled = await pool().query(`select 1 from base_private.bot_knowledge
      where bot_id=$1 and telegram_enabled and jsonb_array_length(entries)>0`, [botId]);
    if (!enabled.rowCount) return null;
  }
  if (!question) return smartReplyNotice;
  if (question.length > smartReplyQuestionLimit || question.includes('\0')) return 'Please enter a question of up to 600 characters.';

  // Claim a slot before contacting OpenAI. UTC limits are shared by previews
  // and Telegram, and knowledge edits never reset the counter.
  const claimed = await pool().query<{ entries: KnowledgeEntry[] }>(`update base_private.bot_knowledge
    set calls=case when quota_day=(now() at time zone 'UTC')::date then calls+1 else 1 end,
      quota_day=(now() at time zone 'UTC')::date
    where bot_id=$1 and ($2::boolean=false or telegram_enabled)
      and jsonb_array_length(entries)>0
      and (quota_day is distinct from (now() at time zone 'UTC')::date or calls<30)
    returning entries`, [botId, telegram]);
  const entries = claimed.rows[0]?.entries;
  if (!entries) return 'No FAQs are available, or the daily Smart Replies limit has been reached.';
  try {
    const match = await matchKnowledgeTopic(question, entries.map(entry => entry.question), key);
    return match === null ? smartReplyNoMatch : entries[match].answer;
  } catch { return smartReplyUnavailable; }
}

export async function checkSmartRepliesSchema(): Promise<void> {
  if (process.env.BASE_AI_SCHEMA_READY !== 'true') return;
  const result = await pool().query<{ ok: boolean }>(`select
    has_table_privilege(current_user,'base_private.bot_knowledge','SELECT')
    and has_table_privilege(current_user,'base_private.bot_knowledge','INSERT')
    and (select bool_and(has_column_privilege(current_user,'base_private.bot_knowledge',c,'UPDATE'))
      from unnest(array['entries','telegram_enabled','quota_day','calls']) as c)
    and (select bool_and(not has_any_column_privilege(r,'base_private.bot_knowledge','SELECT,INSERT,UPDATE,REFERENCES')
      and not has_table_privilege(r,'base_private.bot_knowledge','DELETE,TRUNCATE'))
      from unnest(array['anon','authenticated','service_role']) as r)
    and (select relrowsecurity from pg_class where oid='base_private.bot_knowledge'::regclass) as ok`);
  if (result.rows[0]?.ok !== true) throw new Error('Unexpected Smart Replies privileges');
}
