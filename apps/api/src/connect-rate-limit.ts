import { HttpException, HttpStatus } from '@nestjs/common';
import { pool } from './auth-db';

export const BOT_CONNECT_WINDOW_MINUTES = 15;
export const MAX_BOT_CONNECT_ATTEMPTS = 5;

// Atomic, durable quota shared between all API instances.
// The private table is inaccessible to browser sessions and stores no bot tokens.
// An edge/network-level IP limiter is still required before public launch.
export async function enforceBotConnectRateLimit(ownerId: string): Promise<void> {
  const result = await pool().query<{ attempt_count: number }>(
    [
      'insert into base_private.bot_connect_limits as t',
      '(owner_id, window_started, attempt_count) values ($1, now(), 1)',
      'on conflict (owner_id) do update set',
      "window_started = case when t.window_started <= now() - interval '15 minutes'",
      'then now() else t.window_started end,',
      "attempt_count = case when t.window_started <= now() - interval '15 minutes'",
      'then 1 else least(t.attempt_count + 1, 6) end',
      'returning attempt_count'
    ].join(' '),
    [ownerId]
  );
  if (!result.rows[0] || result.rows[0].attempt_count > MAX_BOT_CONNECT_ATTEMPTS) {
    throw new HttpException(
      'Too many bot connection attempts. Try again later.',
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
}
