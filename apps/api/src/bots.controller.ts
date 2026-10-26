import { Body, Controller, Headers, HttpException, HttpStatus, Post } from '@nestjs/common';
import { createCipheriv, randomBytes } from 'node:crypto';
import { Pool } from 'pg';

const TOKEN_PATTERN = /^\d{5,15}:[A-Za-z0-9_-]{30,}$/;
type ConnectPayload = { token?: unknown };
type TelegramMe = { ok: boolean; result?: { id: number; is_bot: boolean; username?: string; first_name?: string } };

let database: Pool | undefined;
function pool(): Pool {
  if (!database) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
    database = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000, ssl: { rejectUnauthorized: true } });
  }
  return database;
}
function encryptionKey(): Buffer {
  const value = process.env.BOT_TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error('BOT_TOKEN_ENCRYPTION_KEY missing');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('BOT_TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as base64');
  return key;
}
async function verifiedUserId(authorization?: string): Promise<string> {
  if (!authorization?.startsWith('Bearer ')) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
  const token = authorization.slice(7).trim();
  if (!token || token.length > 8192) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error('Supabase Auth not configured');
  const response = await fetch(new URL('/auth/v1/user', url), {
    headers: { authorization: `Bearer ${token}`, apikey: publishableKey },
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
  const user = await response.json() as { id?: string };
  if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
  return user.id;
}

@Controller('bots')
export class BotsController {
  @Post('connect')
  async connect(@Headers('authorization') authorization: string | undefined, @Body() body: ConnectPayload) {
    const ownerId = await verifiedUserId(authorization);
    if (!body || typeof body.token !== 'string' || !TOKEN_PATTERN.test(body.token)) {
      throw new HttpException('Invalid bot token format', HttpStatus.BAD_REQUEST);
    }
    const token = body.token;
    const key = encryptionKey(); // Validate configuration before contacting Telegram.
    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        method: 'POST',
        signal: AbortSignal.timeout(7000),
        redirect: 'error'
      });
    } catch {
      throw new HttpException('Telegram validation unavailable', HttpStatus.BAD_GATEWAY);
    }
    if (response.status === 401 || response.status === 404) throw new HttpException('Invalid bot token', HttpStatus.BAD_REQUEST);
    if (!response.ok) throw new HttpException('Telegram validation unavailable', HttpStatus.BAD_GATEWAY);
    const data = await response.json() as TelegramMe;
    if (!data.ok || !data.result?.is_bot || !data.result.username || !Number.isSafeInteger(data.result.id)) {
      throw new HttpException('Telegram did not verify a bot', HttpStatus.BAD_REQUEST);
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const tokenCiphertext = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      const created = await client.query<{ id: string }>(
        `insert into public.base_bots (owner_id, telegram_bot_id, username, display_name)
         values ($1,$2,$3,$4) returning id`,
        [ownerId, data.result.id, data.result.username, data.result.first_name ?? data.result.username]
      );
      const botId = created.rows[0].id;
      await client.query(
        'insert into base_private.bot_credentials(bot_id, token_ciphertext, key_version) values ($1,$2,1)',
        [botId, tokenCiphertext]
      );
      await client.query('COMMIT');
      return { id: botId, username: data.result.username, status: 'inactive' };
    } catch (error) {
      await client.query('ROLLBACK');
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        throw new HttpException('This Telegram bot is already connected', HttpStatus.CONFLICT);
      }
      throw new HttpException('Unable to connect bot', HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      client.release();
    }
  }
}
