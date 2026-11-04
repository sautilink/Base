import { createHmac, timingSafeEqual } from 'node:crypto';
import { BOT_TOKEN_PATTERN } from './bot-security';

const MAX_AGE_SECONDS = 600;
const FUTURE_SKEW_SECONDS = 60;

/** Verify Telegram's raw initData. Never trust initDataUnsafe or log this value. */
export function verifyMiniAppInitData(raw: unknown, botToken: string | undefined, nowMs = Date.now()): boolean {
  if (typeof raw !== 'string' || !raw || raw.length > 8192 ||
      !botToken || !BOT_TOKEN_PATTERN.test(botToken)) return false;

  const params = new URLSearchParams(raw);
  const fields = new Map<string, string>();
  for (const [key, value] of params) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key) || fields.has(key)) return false;
    fields.set(key, value);
  }
  const hash = fields.get('hash');
  const authDateValue = fields.get('auth_date');
  const userValue = fields.get('user');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash) || !authDateValue ||
      !/^[0-9]{1,16}$/.test(authDateValue) || !userValue) return false;

  const authDate = Number(authDateValue);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(authDate) || authDate > nowSeconds + FUTURE_SKEW_SECONDS ||
      nowSeconds - authDate > MAX_AGE_SECONDS) return false;
  try {
    const user: unknown = JSON.parse(userValue);
    if (!user || typeof user !== 'object' || Array.isArray(user)) return false;
    const id = (user as { id?: unknown }).id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 ||
        (user as { is_bot?: unknown }).is_bot === true) return false;
  } catch { return false; }

  fields.delete('hash');
  const checkString = [...fields.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const actual = createHmac('sha256', secret).update(checkString).digest();
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
