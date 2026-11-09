import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { audienceMessageTime, audienceVisitorKey, privateAudienceSender } from './audience';
import { validUuid } from './bot-config';
import { pool } from './auth-db';
import { broadcastEnabled, encryptDestination } from './broadcast-config';

export function supportEnabled(botId: string, env = process.env): boolean {
  return validUuid(botId) && env.BASE_SUPPORT_SCHEMA_READY === 'true' && broadcastEnabled(env) &&
    (env.BASE_SUPPORT_BOT_IDS ?? '').split(',').some(id => id.trim().toLowerCase() === botId.toLowerCase());
}

export type SupportInput = { kind: 'notice' | 'start' | 'end' | 'text'; text: string; chatId: number; at: number };
export type SupportResult = { consumed: boolean; reply?: string };
export const supportNotice = 'For help from this bot’s support team, send /support agree followed by your question. The team can read your text and reply. Messages expire seven days after the conversation starts. Send /endsupport to stop new messages from entering the inbox. Do not send passwords, payment details, or other sensitive information.';

export function supportInput(body: unknown, text: string, username: string, now = Date.now()): SupportInput | null {
  const chatId = privateAudienceSender(body);
  const at = audienceMessageTime(body, now);
  if (!chatId || at === null || at < Math.floor(now / 1000) - 300 || text.includes('\0')) return null;
  const command = /^\/(support|endsupport)(?:@([a-z0-9_]+))?(?:\s+([\s\S]+))?$/i.exec(text);
  if (!command) return text.startsWith('/') ? null : { kind: 'text', text, chatId, at };
  if (command[2] && command[2].toLowerCase() !== username.toLowerCase()) return null;
  const agreed = /^agree\s+([\s\S]+)$/i.exec(command[3] ?? '')?.[1].trim();
  const kind = command[1].toLowerCase() === 'endsupport' ? 'end' : agreed ? 'start' : 'notice';
  return { kind, text: agreed ?? '', chatId, at };
}

export async function recordSupport(
  db: PoolClient, botId: string, updateId: number, input: SupportInput
): Promise<SupportResult> {
  if (input.kind === 'notice') return { consumed: true, reply: supportNotice };
  const visitor = createHash('sha256').update('base-support-v1\0')
    .update(audienceVisitorKey(botId, input.chatId, process.env.USER_BOT_WEBHOOK_SECRET_KEY)).digest('hex');
  // Serialize initial consent, repeated starts and closes for one visitor.
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,12))', [visitor]);
  type Thread = { id: string; expired: boolean; old: boolean; closed: boolean };
  let thread: Thread | undefined = (await db.query<Thread>(`
    select id, expires_at <= now() as expired, closed_at is not null as closed,
      (last_message_at,last_update_id) >= ($3::bigint,$4::bigint) as old
    from base_private.support_threads where bot_id=$1 and visitor_key=$2
    order by created_at desc, id desc limit 1 for update
  `, [botId, visitor, input.at, updateId])).rows[0];
  if (thread?.expired) {
    await db.query('delete from base_private.support_threads where id=$1', [thread.id]);
    thread = undefined;
  }
  if (thread?.old) return { consumed: true };
  if (input.kind === 'end') {
    if (thread) await db.query(`update base_private.support_threads
      set closed_at=coalesce(closed_at,now()), destination=null, updated_at=now(), last_message_at=$2, last_update_id=$3
      where id=$1`, [thread.id, input.at, updateId]);
    return { consumed: true, reply: 'Support conversation closed. Send /support to start again.' };
  }
  let id = thread?.closed ? undefined : thread?.id;
  if (!id && input.kind === 'start') {
    const recent = await db.query<{ count: number }>(`select count(*)::int as count from base_private.support_threads
      where bot_id=$1 and visitor_key=$2 and expires_at>now()`, [botId, visitor]);
    if (recent.rows[0].count >= 5) return { consumed: true, reply: 'You have reached the support conversation limit. Please try again later.' };
    const destination = encryptDestination(botId, visitor, input.chatId, process.env.BOT_TOKEN_ENCRYPTION_KEY);
    id = (await db.query<{ id: string }>(`insert into base_private.support_threads
      (bot_id,visitor_key,destination,last_message_at,last_update_id) values ($1,$2,$3,$4,$5) returning id
    `, [botId, visitor, destination, input.at, updateId])).rows[0].id;
  }
  if (!id) return { consumed: false };
  const inserted = await db.query(`insert into base_private.support_messages(thread_id,direction,body,status)
    select $1,'visitor',$2,'received' where
    (select count(*) from base_private.support_messages where thread_id=$1 and direction='visitor') < 60
  `, [id, input.text]);
  if (!inserted.rowCount) return { consumed: true, reply: input.kind === 'start'
    ? 'This conversation is full. Send /endsupport, then /support to start a new one.' : undefined };
  await db.query('update base_private.support_threads set updated_at=now(), last_message_at=$2, last_update_id=$3 where id=$1', [id, input.at, updateId]);
  return { consumed: true, reply: input.kind === 'start' ? 'Your question is in the support inbox. Send /endsupport when you are done.' : undefined };
}

// Called by the authenticated scheduler even if all bot IDs are removed.
export async function pruneSupport(): Promise<void> {
  if (process.env.BASE_SUPPORT_SCHEMA_READY !== 'true') return;
  await pool().query(`delete from base_private.support_threads where id in (
    select id from base_private.support_threads where expires_at <= now()
    order by expires_at limit 200 for update skip locked)`);
}

export async function checkSupportSchema(): Promise<void> {
  if (process.env.BASE_SUPPORT_SCHEMA_READY !== 'true') return;
  const result = await pool().query<{ ok: boolean }>(`select
    (select bool_and(has_table_privilege(current_user, 'base_private.support_threads', p))
      from unnest(array['SELECT','INSERT','UPDATE','DELETE']) as p)
    and has_table_privilege(current_user, 'base_private.support_messages', 'SELECT')
    and has_table_privilege(current_user, 'base_private.support_messages', 'INSERT')
    and has_column_privilege(current_user, 'base_private.support_messages', 'status', 'UPDATE')
    and (select bool_and(not has_any_column_privilege(r,t,'SELECT,INSERT,UPDATE,REFERENCES')
      and not has_table_privilege(r,t,'DELETE,TRUNCATE'))
      from unnest(array['anon','authenticated','service_role']) as r
      cross join unnest(array['base_private.support_threads','base_private.support_messages']) as t)
    and (select count(*)=2 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='base_private' and c.relname in ('support_threads','support_messages') and c.relrowsecurity) as ok`);
  if (result.rows[0]?.ok !== true) throw new Error('Unexpected support inbox privileges');
}
