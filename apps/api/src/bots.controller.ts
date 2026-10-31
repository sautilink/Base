import { Body, Controller, Headers, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import { BOT_TOKEN_PATTERN, encryptBotToken, requireEncryptionKey } from './bot-security';
import { pool, verifiedUserId } from './auth-db';
import { enforceBotConnectRateLimit } from './connect-rate-limit';
import { botRegistrationValues } from './bot-registration';
import { botConnectTestOwners } from './bot-connect-config';
import { verifyTelegramBotToken } from './telegram-verify';
import {
  beginBotConnectAudit, completeBotConnectAudit, enforceBotConnectIpLimit, hashedClientIp
} from './connect-abuse';

type ConnectPayload = { token?: unknown };

@Controller('bots')
export class BotsController {
  @Post('connect')
  async connect(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: ConnectPayload,
    @Req() request: { ip?: string }
  ) {
    // The restricted test gate requires a two-owner allowlist at startup.
    // No getMe calls or token processing happen when disabled.
    if (process.env.BOT_CONNECT_ENABLED !== 'true') {
      throw new HttpException('Bot connections are not enabled on this staging environment', HttpStatus.SERVICE_UNAVAILABLE);
    }
    // request.ip is computed by Express with exactly one trusted ingress
    // proxy on Render; never use user-controlled forwarding headers directly.
    // Hash the address, never store it in logs or database plaintext. Limit
    // unauthenticated requests before contacting Supabase Auth.
    const ipDigest = hashedClientIp(request.ip, process.env.BOT_CONNECT_IP_HMAC_KEY);
    await enforceBotConnectIpLimit(ipDigest);
    const ownerId = await verifiedUserId(authorization);
    if (!botConnectTestOwners(process.env).has(ownerId.toLowerCase())) {
      throw new HttpException('Bot connections are limited to approved test accounts', HttpStatus.FORBIDDEN);
    }
    // Both quotas are enforced BEFORE Telegram getMe or any bot secret storage.
    await enforceBotConnectRateLimit(ownerId);

    const auditId = await beginBotConnectAudit(ownerId, ipDigest);
    const proposedToken = body?.token;
    if (typeof proposedToken !== 'string' || !BOT_TOKEN_PATTERN.test(proposedToken)) {
      await completeBotConnectAudit(auditId, 'invalid_format');
      throw new HttpException('Invalid bot token format', HttpStatus.BAD_REQUEST);
    }
    const token = proposedToken;
    if (token === process.env.BOT_TOKEN) {
      await completeBotConnectAudit(auditId, 'master_bot');
      throw new HttpException('This is the @SautiLinkBaseBot platform bot. Create a separate test bot with @BotFather and use its token.', HttpStatus.BAD_REQUEST);
    }
    // Fail closed before using a sensitive token.
    const key = requireEncryptionKey(process.env.BOT_TOKEN_ENCRYPTION_KEY);

    const verification = await verifyTelegramBotToken(token);
    if (!verification.ok) {
      await completeBotConnectAudit(auditId, verification.outcome);
      throw new HttpException(verification.message, verification.status);
    }
    const bot = verification.bot;

    const tokenCiphertext = encryptBotToken(token, key);
    const client = await pool().connect();
    let discardConnection = false;
    try {
      await client.query('BEGIN');
      const created = await client.query<{ id: string }>(
        `insert into public.base_bots (owner_id, telegram_bot_id, username, display_name)
         values ($1,$2,$3,$4) returning id`,
        botRegistrationValues(ownerId, bot)
      );
      const botId = created.rows[0].id;
      await client.query(
        'insert into base_private.bot_credentials(bot_id, token_ciphertext, key_version) values ($1,$2,1)',
        [botId, tokenCiphertext]
      );
      // Commit registration, encrypted secret and audit outcome atomically.
      await client.query(
        "update base_private.bot_connect_audit set outcome='connected', telegram_bot_id=$2 where id=$1 and outcome='received'",
        [auditId, bot.id]
      );
      await client.query('COMMIT');
      return { id: botId, username: bot.username, status: 'inactive' };
    } catch (error) {
      try { await client.query('ROLLBACK'); }
      catch { discardConnection = true; }
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        await completeBotConnectAudit(auditId, 'already_connected', bot.id);
        throw new HttpException('This Telegram bot is already connected', HttpStatus.CONFLICT);
      }
      await completeBotConnectAudit(auditId, 'storage_error');
      throw new HttpException('Unable to connect bot', HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      client.release(discardConnection ? new Error('Transaction rollback failed') : undefined);
    }
  }
}
