import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { HttpException, HttpStatus } from '@nestjs/common';
import { pool } from './auth-db';

export const MAX_BOT_CONNECT_IP_ATTEMPTS = 20;
export const BOT_CONNECT_IP_WINDOW_MINUTES = 15;
export type BotConnectOutcome =
  'received' | 'invalid_format' | 'invalid_token' | 'provider_failure' |
  'invalid_bot' | 'master_bot' | 'already_connected' | 'storage_error' | 'connected';

/**
 * Only use Express req.ip with EXACTLY one trusted Render ingress proxy.
 * Ignore user-supplied X-Forwarded-For and CF-Connecting-IP in the controller.
 * Without a verified IP or a dedicated HMAC key, fail closed.
 */
export function hashedClientIp(ip: string | undefined, secret: string | undefined): Buffer {
  if (!ip || isIP(ip) === 0) {
    throw new HttpException('Client address unavailable', HttpStatus.SERVICE_UNAVAILABLE);
  }
  if (!secret || !/^[A-Za-z0-9+/]{43}=$/.test(secret)) {
    throw new HttpException('Bot connection protection unavailable', HttpStatus.SERVICE_UNAVAILABLE);
  }
  const key = Buffer.from(secret, 'base64');
  if (key.length !== 32 || key.toString('base64') !== secret) {
    throw new HttpException('Bot connection protection unavailable', HttpStatus.SERVICE_UNAVAILABLE);
  }
  // Keyed digest avoids storing raw client IPs and prevents offline lookup.
  return createHmac('sha256', key).update('sautilink-base:bot-connect-ip:v1\x00' + ip).digest();
}

/** Atomic fixed-window quota shared across all Render instances. */
export async function enforceBotConnectIpLimit(digest: Buffer): Promise<void> {
  if (digest.length !== 32) throw new Error('Invalid bot connection IP digest');
  const result = await pool().query<{ attempt_count: number }>(
    `insert into base_private.bot_connect_ip_limits as t
      (ip_digest, window_started, attempt_count) values ($1, now(), 1)
      on conflict(ip_digest) do update set
      window_started = case
        when t.window_started <= now() - interval '15 minutes'
        then now() else t.window_started end,
      attempt_count = case
        when t.window_started <= now() - interval '15 minutes'
        then 1 else least(t.attempt_count + 1, 21) end
      returning attempt_count`,
    [digest]
  );
  if (!result.rows[0] || result.rows[0].attempt_count > MAX_BOT_CONNECT_IP_ATTEMPTS) {
    throw new HttpException('Too many connection attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
  }
}

/** Audit event IDs stay server-side. No bot token, email, session, raw IP or body is ever stored. */
export async function beginBotConnectAudit(ownerId: string, digest: Buffer): Promise<string> {
  const result = await pool().query<{ id: string }>(
    `insert into base_private.bot_connect_audit(owner_id,ip_digest,outcome)
     values($1,$2,'received') returning id`,
    [ownerId, digest]
  );
  if (!result.rows[0]?.id) throw new Error('Bot connection audit unavailable');
  return result.rows[0].id;
}

export async function completeBotConnectAudit(
  auditId: string, outcome: Exclude<BotConnectOutcome, 'received'>,
  telegramBotId?: number, client?: { query: (sql: string, values: unknown[]) => Promise<unknown> }
): Promise<void> {
  const target = client ?? pool();
  await target.query(
    `update base_private.bot_connect_audit
     set outcome=$2, telegram_bot_id=$3
     where id=$1 and outcome='received'`,
    [auditId, outcome, telegramBotId ?? null]
  );
}
