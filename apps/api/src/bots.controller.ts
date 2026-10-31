import { Body, Controller, Headers, HttpException, HttpStatus, Post } from '@nestjs/common';
import { BOT_TOKEN_PATTERN, encryptBotToken, requireEncryptionKey } from './bot-security';
import { pool, verifiedUserId } from './auth-db';
import { enforceBotConnectRateLimit } from './connect-rate-limit';

type ConnectPayload = { token?: unknown };
type TelegramMe = { ok: boolean; result?: { id: number; is_bot: boolean; username?: string; first_name?: string } };

@Controller('bots')
export class BotsController {
  @Post('connect')
  async connect(@Headers('authorization') authorization: string | undefined, @Body() body: ConnectPayload) {
    // Staging is intentionally closed until IP throttling, audit logging and
    // multi-tenant authorization tests have passed. Telegram tokens must not
    // reach getMe while this gate is disabled.
    if (process.env.BOT_CONNECT_ENABLED !== 'true') {
      throw new HttpException('Bot connections are not enabled on this staging environment', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const ownerId = await verifiedUserId(authorization);
    if (!body || typeof body.token !== 'string' || !BOT_TOKEN_PATTERN.test(body.token)) {
      throw new HttpException('Invalid bot token format', HttpStatus.BAD_REQUEST);
    }
    const token = body.token;
    // Consume a durable attempt before calling Telegram to avoid an unbounded getMe oracle.
    await enforceBotConnectRateLimit(ownerId);
    const key = requireEncryptionKey(process.env.BOT_TOKEN_ENCRYPTION_KEY); // Fail closed before using a sensitive token.
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
    const tokenCiphertext = encryptBotToken(token, key);
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
