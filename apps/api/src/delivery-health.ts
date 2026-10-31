import { pool } from './auth-db';

export type DeliveryHealthRow = {
  sent_24h: string | number;
  ignored_24h: string | number;
  unknown_7d: string | number;
  processing_7d: string | number;
  stale_processing_7d: string | number;
  last_update_at: Date | string | null;
};

function count(value: string | number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error('Invalid delivery health count');
  }
  return result;
}

export function formatDeliveryHealth(row: DeliveryHealthRow) {
  const sent24h = count(row.sent_24h);
  const ignored24h = count(row.ignored_24h);
  const unknown7d = count(row.unknown_7d);
  const processing7d = count(row.processing_7d);
  const staleProcessing7d = count(row.stale_processing_7d);
  if (staleProcessing7d > processing7d) throw new Error('Invalid delivery health summary');
  const date = row.last_update_at === null ? null : new Date(row.last_update_at);
  if (date !== null && !Number.isFinite(date.getTime())) throw new Error('Invalid delivery health timestamp');
  return {
    sent24h,
    ignored24h,
    unknown7d,
    processing7d,
    staleProcessing7d,
    lastUpdateAt: date?.toISOString() ?? null,
    needsReview: unknown7d > 0 || staleProcessing7d > 0
  };
}

/** Never disclose update IDs, messages, Telegram chat IDs or credentials. */
export async function ownerDeliveryHealth(botId: string, ownerId: string) {
  const result = await pool().query<DeliveryHealthRow>(
    'select * from base_private.owner_bot_delivery_summary($1::uuid,$2::uuid)',
    [botId, ownerId]
  );
  if (!result.rows[0]) throw new Error('Delivery health unavailable');
  return formatDeliveryHealth(result.rows[0]);
}
