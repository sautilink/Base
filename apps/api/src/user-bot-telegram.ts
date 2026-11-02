import { createHmac } from 'node:crypto';
import { requireEncryptionKey } from './bot-security';
import { validUuid } from './bot-config';

const WEBHOOK_ROOT = 'https://sautilink-base-api-staging.onrender.com/telegram/bots/';

export function userBotWebhookUrl(botId: string): string {
  if (!validUuid(botId)) throw new Error('Invalid bot ID');
  return WEBHOOK_ROOT + botId.toLowerCase();
}

export function userBotWebhookSecret(botId: string, encodedKey: string | undefined): string {
  if (!validUuid(botId)) throw new Error('Invalid bot ID');
  const key = requireEncryptionKey(encodedKey);
  return createHmac('sha256', key)
    .update('sautilink-base:user-bot-webhook:v1\0' + botId.toLowerCase())
    .digest('base64url');
}

export function privateTextMessage(body: unknown): { chatId: number; text: string } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const message = (body as { message?: unknown }).message;
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  const data = message as { chat?: { id?: unknown; type?: unknown }; text?: unknown; from?: { is_bot?: unknown } };
  if (data.chat?.type !== 'private' || data.from?.is_bot === true || typeof data.text !== 'string') return null;
  const chatId = data.chat.id;
  if (typeof chatId !== 'number' || !Number.isSafeInteger(chatId) || chatId <= 0) return null;
  const text = data.text.trim();
  if (!text || text.length > 4096) return null;
  return { chatId, text };
}

/** All errors are intentionally generic: Telegram request URLs contain bot tokens. */
export async function userBotTelegramCall(
  token: string, method: 'getWebhookInfo' | 'setWebhook' | 'deleteWebhook' | 'sendMessage',
  body?: Record<string, unknown>, fetcher: typeof fetch = fetch
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    throw new Error('Telegram bot request unavailable');
  }
  if (!response.ok) throw new Error('Telegram bot request unavailable');
  let data: { ok?: unknown; result?: unknown };
  try { data = await response.json() as typeof data; }
  catch { throw new Error('Telegram bot request unavailable'); }
  if (data?.ok !== true) throw new Error('Telegram bot request unavailable');
  return data.result;
}

export class ForeignWebhookError extends Error {}

async function webhookInfo(token: string, fetcher: typeof fetch): Promise<{ url: string }> {
  const result = await userBotTelegramCall(token, 'getWebhookInfo', undefined, fetcher) as { url?: unknown } | null;
  if (!result || typeof result.url !== 'string') throw new Error('Telegram webhook status unavailable');
  return { url: result.url };
}

/** Refuse to take over a webhook belonging to another application. */
export async function registerUserBotWebhook(
  token: string, botId: string, secret: string, fetcher: typeof fetch = fetch
): Promise<void> {
  const url = userBotWebhookUrl(botId);
  const previous = await webhookInfo(token, fetcher);
  if (previous.url && previous.url !== url) throw new ForeignWebhookError('Bot already uses another Telegram webhook');
  const registered = await userBotTelegramCall(token, 'setWebhook', {
    url, secret_token: secret, allowed_updates: ['message'],
    // A paused bot must not answer messages queued while its webhook was removed.
    max_connections: 1, drop_pending_updates: true
  }, fetcher);
  if (registered !== true || (await webhookInfo(token, fetcher)).url !== url) {
    throw new Error('Telegram webhook registration not confirmed');
  }
}

/** Stop our own webhook only. Another application's URL is never deleted. */
export async function removeUserBotWebhookIfOwned(
  token: string, botId: string, fetcher: typeof fetch = fetch
): Promise<boolean> {
  const url = userBotWebhookUrl(botId);
  if ((await webhookInfo(token, fetcher)).url !== url) return true;
  const deleted = await userBotTelegramCall(token, 'deleteWebhook', { drop_pending_updates: false }, fetcher);
  return deleted === true && (await webhookInfo(token, fetcher)).url === '';
}
