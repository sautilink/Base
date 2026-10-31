import { pool } from './auth-db';
import { randomInt } from 'node:crypto';
import { validUuid } from './bot-config';
import { extractUpdateId } from './master-update-ledger';

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

export async function claimUserBotUpdate(botId: string, updateId: number): Promise<boolean> {
  if (!validUuid(botId) || !Number.isSafeInteger(updateId) || updateId < 0) throw new Error('Invalid update identity');
  const result = await pool().query(
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
