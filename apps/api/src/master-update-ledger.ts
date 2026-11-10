import { pool } from './auth-db';

export function extractUpdateId(body: unknown): number | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = (body as { update_id?: unknown }).update_id;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export async function claimMasterUpdate(updateId: number): Promise<boolean> {
  const result = await pool().query<{ update_id: string }>(
    "insert into base_private.master_update_ledger(update_id,status) values($1,'processing') on conflict (update_id) do nothing returning update_id",
    [updateId]
  );
  return result.rowCount === 1;
}

// We intentionally never resend a previously claimed update automatically.
// Network failures after sendMessage may mean Telegram delivered the reply.
export async function completeMasterUpdate(updateId: number, status: 'sent' | 'unknown'): Promise<void> {
  await pool().query(
    'update base_private.master_update_ledger set status=$2 where update_id=$1',
    [updateId, status]
  );
}
