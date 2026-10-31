import { pool } from './auth-db';
import { validUuid } from './bot-config';
import { extractUpdateId } from './master-update-ledger';

export { extractUpdateId };

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
