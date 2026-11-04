import { userBotTelegramCall, userBotWebhookUrl } from './user-bot-telegram';

export type WebhookHealth = {
  ownership: 'base' | 'none' | 'other';
  pendingUpdates: number | null;
  lastErrorAt: string | null;
};

/** Only sanitized metadata can leave the server. Never expose Telegram URLs or error text. */
export async function inspectUserBotWebhook(
  botId: string, token: string, fetcher: typeof fetch = fetch
): Promise<WebhookHealth> {
  const result = await userBotTelegramCall(token, 'getWebhookInfo', undefined, fetcher);
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('Telegram webhook status unavailable');
  }
  const info = result as Record<string, unknown>;
  if (typeof info.url !== 'string') throw new Error('Telegram webhook status unavailable');
  const ownership = info.url === '' ? 'none' : info.url === userBotWebhookUrl(botId) ? 'base' : 'other';
  const pendingUpdates = typeof info.pending_update_count === 'number' &&
    Number.isSafeInteger(info.pending_update_count) && info.pending_update_count >= 0 &&
    info.pending_update_count <= 10_000_000
    ? info.pending_update_count : null;
  const lastErrorAt = typeof info.last_error_date === 'number' &&
    Number.isSafeInteger(info.last_error_date) &&
    info.last_error_date > 0 && info.last_error_date < 4_102_444_800
    ? new Date(info.last_error_date * 1000).toISOString() : null;
  return { ownership, pendingUpdates, lastErrorAt };
}
