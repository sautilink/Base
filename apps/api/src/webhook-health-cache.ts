import type { WebhookHealth } from './user-bot-webhook-health';

// Restricted staging has one API instance; this is only an efficiency cache,
// not a cross-instance quota or a security boundary.
const TTL_MS = 10_000;
const MAX_ENTRIES = 64;
const cache = new Map<string, { expiresAt: number; value: Readonly<WebhookHealth> }>();

export function readWebhookHealthCache(botId: string, now = Date.now()): WebhookHealth | null {
  const entry = cache.get(botId);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(botId);
    return null;
  }
  return { ...entry.value };
}

export function rememberWebhookHealth(botId: string, health: WebhookHealth, now = Date.now()): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(botId, { expiresAt: now + TTL_MS, value: Object.freeze({ ...health }) });
}

export function invalidateWebhookHealth(botId: string): void {
  cache.delete(botId);
}
