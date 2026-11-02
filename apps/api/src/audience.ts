import { createHmac } from 'node:crypto';
import { requireEncryptionKey } from './bot-security';
import { validUuid } from './bot-config';

export type AudienceAction = 'subscribe' | 'unsubscribe';
export type AudienceObservation = {
  visitorKey: string;
  kind: 'message' | 'menu';
  action: AudienceAction | null;
  actionAt: number | null;
};

/** Bot-scoped pseudonym: never persist chat IDs, usernames, names or message text. */
export function audienceVisitorKey(botId: string, chatId: number, encodedKey: string | undefined): string {
  if (!validUuid(botId) || !Number.isSafeInteger(chatId) || chatId <= 0) throw new Error('Invalid audience identity');
  return createHmac('sha256', requireEncryptionKey(encodedKey))
    .update('sautilink-base:audience:v1\0' + botId.toLowerCase() + '\0' + chatId)
    .digest('hex');
}

export function audienceCommand(text: string, username: string): AudienceAction | null {
  const parsed = /^\/(subscribe|unsubscribe)(?:@([a-z0-9_]{5,32}))?\s*$/i.exec(text.trim());
  if (!parsed || (parsed[2] && parsed[2].toLowerCase() !== username.toLowerCase())) return null;
  return parsed[1].toLowerCase() as AudienceAction;
}

export function audienceConfirmation(action: AudienceAction): string {
  return action === 'subscribe'
    ? 'You have subscribed to updates from this bot. Send /unsubscribe at any time to opt out.'
    : 'You have unsubscribed from updates. You can still use this bot. Send /subscribe if you want to join again.';
}

export function audienceMessageTime(body: unknown, now = Date.now()): number | null {
  const date = (body as { message?: { date?: unknown } } | null)?.message?.date;
  return typeof date === 'number' && Number.isSafeInteger(date) && date > 0 && date <= Math.floor(now / 1000) + 300 ? date : null;
}

// Only use authenticated, Telegram-provided sender data for audience observation.
export function privateAudienceSender(body: unknown): number | null {
  const message = (body as { message?: { chat?: { id?: unknown; type?: unknown }; from?: { id?: unknown; is_bot?: unknown } } } | null)?.message;
  const id = message?.chat?.id;
  if (message?.chat?.type !== 'private' || typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 ||
      message.from?.id !== id || message.from.is_bot !== false) return null;
  return id;
}
