import { randomInt } from 'node:crypto';
import { pool } from './auth-db';
import { BOT_TOKEN_PATTERN } from './bot-security';
import { trustedDashboardLink } from './telegram-master';

// Isolated STAGING endpoint only. Do not infer this from incoming Host or
// forward headers: a misconfigured server must never register an arbitrary URL.
export const STAGING_MASTER_WEBHOOK_URL = 'https://sautilink-base-api-staging.onrender.com/telegram/master';
const TELEGRAM_MASTER_USERNAME = 'sautilinkbasebot';
type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;
type TelegramResult = { ok?: boolean; result?: unknown };

function validateRegistrationConfig(env: NodeJS.ProcessEnv): { token: string; secret: string } {
  if (env.MASTER_BOT_ENABLED !== 'true' || env.MASTER_BOT_REGISTER_WEBHOOK !== 'true') {
    throw new Error('Explicit master webhook activation gates have not been enabled');
  }
  const token = env.BOT_TOKEN;
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !BOT_TOKEN_PATTERN.test(token)) throw new Error('Invalid or missing master bot token');
  if (!secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw new Error('Invalid master webhook secret');
  if (!trustedDashboardLink(env.BASE_DASHBOARD_URL)) {
    throw new Error('Master dashboard URL has not been approved');
  }
  return { token, secret };
}

/** Temporary, rolled-back insert+update under the actual restricted Render DB login. */
export async function probeMasterLedgerWrite(): Promise<void> {
  let client;
  try { client = await pool().connect(); }
  catch { throw new Error('Master update ledger connection is unavailable'); }
  try {
    await client.query('BEGIN');
    const updateId = 8_000_000_000_000_000 + randomInt(1, 1_000_000_000);
    const inserted = await client.query(
      "insert into base_private.master_update_ledger(update_id,status) values($1,'processing') on conflict(update_id) do nothing returning update_id",
      [updateId]
    );
    if (inserted.rowCount !== 1) throw new Error('Ledger probe update ID collision');
    const changed = await client.query(
      "update base_private.master_update_ledger set status='sent' where update_id=$1",
      [updateId]
    );
    if (changed.rowCount !== 1) throw new Error('Ledger probe could not update state');
  } catch {
    throw new Error('Master update ledger write probe did not pass');
  } finally {
    // Rollback is mandatory: the test creates no persistent Telegram update.
    try { await client.query('ROLLBACK'); }
    finally { client.release(); }
  }
}

async function telegramCall(
  fetcher: Fetcher, token: string, method: string, body?: Record<string, unknown>
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
    // Never include the failed request URL: it contains the Telegram token.
    throw new Error('Telegram master ' + method + ' request failed');
  }
  if (!response.ok) throw new Error('Telegram master ' + method + ' was rejected');
  let result: TelegramResult;
  try { result = await response.json() as TelegramResult; }
  catch { throw new Error('Telegram master ' + method + ' returned invalid JSON'); }
  if (result?.ok !== true) throw new Error('Telegram master ' + method + ' returned an error');
  return result.result;
}

/**
 * Runs ONLY after both explicit environment flags are enabled.
 * Refuses to hijack an existing webhook at a different destination.
 * Uses one Telegram connection and never drops queued messages.
 */
export async function registerMasterWebhook(
  env: NodeJS.ProcessEnv,
  fetcher: Fetcher = fetch,
  checkLedger: () => Promise<void> = probeMasterLedgerWrite
): Promise<void> {
  const { token, secret } = validateRegistrationConfig(env);
  await checkLedger();

  const me = await telegramCall(fetcher, token, 'getMe') as {
    id?: unknown; is_bot?: unknown; username?: unknown
  } | null;
  if (!me || me.is_bot !== true || typeof me.id !== 'number' ||
      !Number.isSafeInteger(me.id) || typeof me.username !== 'string' ||
      me.username.toLowerCase() !== TELEGRAM_MASTER_USERNAME) {
    throw new Error('BotFather token does not belong to the SautiLink Base master bot');
  }

  const info = await telegramCall(fetcher, token, 'getWebhookInfo') as { url?: unknown } | null;
  if (!info || typeof info.url !== 'string') {
    throw new Error('Telegram master webhook status could not be checked');
  }
  if (info.url !== '' && info.url !== STAGING_MASTER_WEBHOOK_URL) {
    throw new Error('Master bot already uses another webhook; refused to overwrite');
  }
  const registered = await telegramCall(fetcher, token, 'setWebhook', {
    url: STAGING_MASTER_WEBHOOK_URL,
    secret_token: secret,
    allowed_updates: ['message'],
    max_connections: 1,
    drop_pending_updates: false
  });
  if (registered !== true) throw new Error('Telegram master webhook registration was not confirmed');
}
