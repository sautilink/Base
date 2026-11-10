import { BOT_TOKEN_PATTERN, encryptBotToken, requireEncryptionKey } from './bot-security';
import { pool } from './auth-db';
import { verifyTelegramBotToken } from './telegram-verify';
import { userBotTelegramCall, userBotWebhookUrl } from './user-bot-telegram';

type Identity = { telegram_bot_id: string; username: string };
export type ReplacementValidation =
  | { ok: true }
  | { ok: false; status: 400 | 409 | 502; message: string };

/** Never print or return a BotFather token, upstream URL or Telegram API body. */
export async function validateReplacementToken(
  botId: string, bot: Identity, token: string, fetcher: typeof fetch = fetch
): Promise<ReplacementValidation> {
  if (!BOT_TOKEN_PATTERN.test(token)) return { ok: false, status: 400, message: 'Invalid bot token format' };
  const verified = await verifyTelegramBotToken(token, fetcher);
  if (!verified.ok) {
    return {
      ok: false, status: verified.outcome === 'provider_failure' ? 502 : 400,
      message: verified.outcome === 'provider_failure' ? 'Telegram validation unavailable' : 'Invalid replacement bot token'
    };
  }
  if (String(verified.bot.id) !== bot.telegram_bot_id ||
      verified.bot.username.toLowerCase() !== bot.username.toLowerCase()) {
    return { ok: false, status: 409, message: 'Replacement token belongs to a different bot' };
  }
  let info: unknown;
  try { info = await userBotTelegramCall(token, 'getWebhookInfo', undefined, fetcher); }
  catch { return { ok: false, status: 502, message: 'Telegram webhook status unavailable' }; }
  if (!info || typeof info !== 'object' || Array.isArray(info) ||
      typeof (info as { url?: unknown }).url !== 'string') {
    return { ok: false, status: 502, message: 'Telegram webhook status unavailable' };
  }
  const url = (info as { url: string }).url;
  if (url !== '' && url !== userBotWebhookUrl(botId)) {
    return { ok: false, status: 409, message: 'This bot already has another Telegram webhook' };
  }
  return { ok: true };
}

/** Runs a private owner/status-checked SQL function; never grants direct credential UPDATE to the API role. */
export async function replaceOwnerBotCredential(
  botId: string, ownerId: string, token: string,
  query: (sql: string, values: unknown[]) => Promise<{ rows: Array<{ rotated: boolean }> }> =
    (sql, values) => pool().query(sql, values)
): Promise<boolean> {
  const ciphertext = encryptBotToken(token, requireEncryptionKey(process.env.BOT_TOKEN_ENCRYPTION_KEY));
  const result = await query(
    'select base_private.rotate_owner_bot_credential($1::uuid,$2::uuid,$3::bytea) as rotated',
    [botId, ownerId, ciphertext]
  );
  return result.rows[0]?.rotated === true;
}
