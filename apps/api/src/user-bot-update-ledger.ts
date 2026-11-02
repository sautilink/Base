import { pool } from './auth-db';
import { randomInt } from 'node:crypto';
import { validUuid } from './bot-config';
import { extractUpdateId } from './master-update-ledger';
import type { AudienceObservation } from './audience';
import type { Pool } from 'pg';

export { extractUpdateId };

/** Test the actual restricted DB login and RLS policy without persisting a probe update. */
export async function probeUserBotLedgerWrite(botId: string): Promise<void> {
  if (!validUuid(botId)) throw new Error('Invalid bot ID');
  let client;
  try { client = await pool().connect(); }
  catch { throw new Error('User-bot update ledger unavailable'); }
  let discard = false;
  try {
    await client.query('BEGIN');
    const updateId = 8_000_000_000_000_000 + randomInt(1, 1_000_000_000);
    const inserted = await client.query(
      "insert into base_private.user_bot_update_ledger(bot_id,update_id,status) values($1,$2,'processing') returning update_id",
      [botId, updateId]
    );
    if (inserted.rowCount !== 1) throw new Error('Ledger probe insert failed');
    const changed = await client.query(
      "update base_private.user_bot_update_ledger set status='ignored' where bot_id=$1 and update_id=$2",
      [botId, updateId]
    );
    if (changed.rowCount !== 1) throw new Error('Ledger probe update failed');
  } catch {
    throw new Error('User-bot update ledger unavailable');
  } finally {
    try { await client.query('ROLLBACK'); }
    catch { discard = true; }
    client.release(discard ? new Error('Ledger rollback failed') : undefined);
    if (discard) throw new Error('User-bot update ledger unavailable');
  }
}

export async function claimUserBotUpdate(botId: string, updateId: number, observation?: AudienceObservation, database?: Pick<Pool, 'connect' | 'query'>): Promise<boolean> {
  if (!validUuid(botId) || !Number.isSafeInteger(updateId) || updateId < 0) throw new Error('Invalid update identity');
  if (observation) {
    if (!/^[a-f0-9]{64}$/.test(observation.visitorKey) || !['message','menu'].includes(observation.kind) ||
        ![null,'subscribe','unsubscribe'].includes(observation.action) ||
        (observation.action !== null && (!Number.isSafeInteger(observation.actionAt) || observation.actionAt! <= 0))) throw new Error('Invalid audience observation');
    const client = await (database ?? pool()).connect();
    let discard = false;
    try {
      await client.query('BEGIN');
      const claim = await client.query(
        "insert into base_private.user_bot_update_ledger(bot_id,update_id,status) values($1,$2,'processing') on conflict(bot_id,update_id) do nothing returning update_id",
        [botId,updateId]
      );
      if (claim.rowCount !== 1) { await client.query('COMMIT'); return false; }
      // The claim, consent preference and counters commit together. A DB
      // failure rolls everything back so Telegram can safely retry before send.
      const state = observation.action === 'subscribe' ? 'subscribed' : observation.action === 'unsubscribe' ? 'unsubscribed' : 'not_subscribed';
      await client.query(`insert into base_private.bot_audience(bot_id,visitor_key,subscription_state,consent_update_id,consent_message_at)
        values($1,$2,$3,$4,$5) on conflict(bot_id,visitor_key) do update set
        last_seen_at=greatest(bot_audience.last_seen_at,excluded.last_seen_at),
        subscription_state=case when (excluded.consent_message_at,excluded.consent_update_id)>(bot_audience.consent_message_at,bot_audience.consent_update_id) then excluded.subscription_state else bot_audience.subscription_state end,
        consent_update_id=case when (excluded.consent_message_at,excluded.consent_update_id)>(bot_audience.consent_message_at,bot_audience.consent_update_id) then excluded.consent_update_id else bot_audience.consent_update_id end,
        consent_message_at=greatest(bot_audience.consent_message_at,excluded.consent_message_at)`,
        [botId,observation.visitorKey,state,observation.action ? updateId : -1,observation.action ? observation.actionAt : -1]);
      await client.query(`insert into base_private.bot_activity_daily(bot_id,day,messages,menu_clicks)
        values($1,(now() at time zone 'UTC')::date,$2,$3) on conflict(bot_id,day) do update set
        messages=bot_activity_daily.messages+excluded.messages,
        menu_clicks=bot_activity_daily.menu_clicks+excluded.menu_clicks`,
        [botId,observation.kind === 'message' ? 1 : 0,observation.kind === 'menu' ? 1 : 0]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { discard = true; }
      throw error;
    } finally { client.release(discard ? new Error('Audience transaction rollback failed') : undefined); }
  }
  const result = await (database ?? pool()).query(
    "insert into base_private.user_bot_update_ledger(bot_id, update_id, status) values($1,$2,'processing') on conflict(bot_id,update_id) do nothing returning update_id",
    [botId, updateId]
  );
  return result.rowCount === 1;
}

/** An ambiguous send is never retried automatically. */
export async function completeUserBotUpdate(botId: string, updateId: number, status: 'sent' | 'ignored' | 'unknown'): Promise<void> {
  await pool().query(
    'update base_private.user_bot_update_ledger set status=$3 where bot_id=$1 and update_id=$2',
    [botId, updateId, status]
  );
}
