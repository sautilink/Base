import { Body, Controller, Headers, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import { BOT_TOKEN_PATTERN, encryptBotToken, requireEncryptionKey } from './bot-security';
import { pool, verifiedUserId } from './auth-db';
import { enforceBotConnectRateLimit } from './connect-rate-limit';
import {
  beginBotConnectAudit, completeBotConnectAudit, enforceBotConnectIpLimit, hashedClientIp
} from './connect-abuse';

type ConnectPayload = { token?: unknown };
type TelegramMe = { ok: boolean; result?: { id: number; is_bot: boolean; username?: string; first_name?: string } };

// The master bot is managed by the platform, not by ordinary bot owners.
const MASTER_BOT_USERNAME = 'sautilinkbasebot';

@Controller('bots')
export class BotsController {
  @Post('connect')
  async connect(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: ConnectPayload,
    @Req() request: { ip?: string }
  ) {
    // This gate stays OFF until isolated two-account tests and readiness gates pass.
    // In particular, no getMe calls or token processing happen when disabled.
    if (process.env.BOT_CONNECT_ENABLED !== 'true') {
      throw new HttpException('Bot connections are not enabled on this staging environment', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const ownerId = await verifiedUserId(authorization);

    // request.ip is computed by Express with exactly one trusted ingress
    // proxy on Render; never use user-controlled forwarding headers directly.
    // Hash the address, never store it in logs or database plaintext.
    const ipDigest = hashedClientIp(request.ip, process.env.BOT_CONNECT_IP_HMAC_KEY);
    // Both quotas are enforced BEFORE Telegram getMe or any bot secret storage.
    await enforceBotConnectRateLimit(ownerId);
    await enforceBotConnectIpLimit(ipDigest);

    const auditId = await beginBotConnectAudit(ownerId, ipDigest);
    const proposedToken = body?.token;
    if (typeof proposedToken !== 'string' || !BOT_TOKEN_PATTERN.test(proposedToken)) {
      await completeBotConnectAudit(auditId, 'invalid_format');
      throw new HttpException('Invalid bot token format', HttpStatus.BAD_REQUEST);
    }
    const token = proposedToken;
    if (token === process.env.BOT_TOKEN) {
      await completeBotConnectAudit(auditId, 'master_bot');
      throw new HttpException('This bot is reserved by SautiLink Base', HttpStatus.BAD_REQUEST);
    }
    // Fail closed before using a sensitive token.
    const key = requireEncryptionKey(process.env.BOT_TOKEN_ENCRYPTION_KEY);

    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        method: 'POST',
        signal: AbortSignal.timeout(7000),
        redirect: 'error'
      });
    } catch {
      await completeBotConnectAudit(auditId, 'provider_failure');
      throw new HttpException('Telegram validation unavailable', HttpStatus.BAD_GATEWAY);
    }
    if (response.status === 401 || response.status === 404) {
      await completeBotConnectAudit(auditId, 'invalid_token');
      throw new HttpException('Invalid bot token', HttpStatus.BAD_REQUEST);
    }
    if (!response.ok) {
      await completeBotConnectAudit(auditId, 'provider_failure');
      throw new HttpException('Telegram validation unavailable', HttpStatus.BAD_GATEWAY);
    }

    let data: TelegramMe;
    try { data = await response.json() as TelegramMe; }
    catch {
      await completeBotConnectAudit(auditId, 'provider_failure');
      throw new HttpException('Telegram validation unavailable', HttpStatus.BAD_GATEWAY);
    }
    if (!data.ok || !data.result?.is_bot || !data.result.username ||
        !Number.isSafeInteger(data.result.id) || data.result.id <= 0) {
      await completeBotConnectAudit(auditId, 'invalid_bot');
      throw new HttpException('Telegram did not verify a bot', HttpStatus.BAD_REQUEST);
    }
    if (data.result.username.toLowerCase() === MASTER_BOT_USERNAME) {
      await completeBotConnectAudit(auditId, 'master_bot');
      throw new HttpException('This bot is reserved by SautiLink Base', HttpStatus.BAD_REQUEST);
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
      // Commit registration, encrypted secret and audit outcome atomically.
      await client.query(
        "update base_private.bot_connect_audit set outcome='connected', telegram_bot_id=$2 where id=$1 and outcome='received'",
        [auditId, data.result.id]
      );
      await client.query('COMMIT');
      return { id: botId, username: data.result.username, status: 'inactive' };
    } catch (error) {
      try { await client.query('ROLLBACK'); }
      finally { client.release(); }
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        await completeBotConnectAudit(auditId, 'already_connected', data.result.id);
        throw new HttpException('This Telegram bot is already connected', HttpStatus.CONFLICT);
      }
      await completeBotConnectAudit(auditId, 'storage_error');
      throw new HttpException('Unable to connect bot', HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      // release is idempotent only if called once; successful transaction path only.
      if (!client.released) client.release();
    }
  }
}
