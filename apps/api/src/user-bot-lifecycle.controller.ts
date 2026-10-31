import {
  ConflictException, Controller, ForbiddenException, Headers, HttpException, HttpStatus,
  NotFoundException, Param, Post
} from '@nestjs/common';
import { pool, verifiedUserId } from './auth-db';
import { validUuid } from './bot-config';
import { botConnectTestOwners } from './bot-connect-config';
import { enforceBotConnectRateLimit } from './connect-rate-limit';
import { ownerBotToken } from './user-bot-credential';
import { ForeignWebhookError, registerUserBotWebhook, removeUserBotWebhookIfOwned, userBotWebhookSecret } from './user-bot-telegram';
import { verifyTelegramBotToken } from './telegram-verify';
import { probeUserBotLedgerWrite } from './user-bot-update-ledger';

type BotRow = { id: string; telegram_bot_id: string; username: string; status: string; welcome_message: string };

function deliveryEnabled(): void {
  if (process.env.USER_BOT_DELIVERY_ENABLED !== 'true') {
    throw new HttpException('Bot activation is not enabled', HttpStatus.SERVICE_UNAVAILABLE);
  }
}

async function ownedBot(botId: string, authorization: string | undefined): Promise<{ ownerId: string; bot: BotRow }> {
  const ownerId = await verifiedUserId(authorization);
  if (!botConnectTestOwners(process.env).has(ownerId.toLowerCase())) {
    throw new ForbiddenException('Bot activation is limited to approved test accounts');
  }
  if (!validUuid(botId)) throw new NotFoundException('Bot not found');
  const result = await pool().query<BotRow>(
    'select id, telegram_bot_id, username, status, welcome_message from public.base_bots where id=$1 and owner_id=$2',
    [botId, ownerId]
  );
  if (!result.rows[0]) throw new NotFoundException('Bot not found');
  return { ownerId, bot: result.rows[0] };
}

@Controller('bots')
export class UserBotLifecycleController {
  @Post(':botId/activate')
  async activate(@Headers('authorization') authorization: string | undefined, @Param('botId') botId: string) {
    deliveryEnabled();
    const { ownerId, bot } = await ownedBot(botId, authorization);
    if (bot.status === 'active') return { id: bot.id, status: 'active' };
    if (bot.status !== 'inactive') throw new ConflictException('Bot cannot be activated in its current state');
    const configured = await pool().query<{ ready: boolean }>(
      `select (length(trim($2::text)) > 0 or
        exists(select 1 from public.base_commands where bot_id=$1 and length(trim(response_text)) > 0) or
        exists(select 1 from public.base_reply_rules where bot_id=$1 and enabled and length(trim(response_text)) > 0)) as ready`,
      [bot.id, bot.welcome_message]
    );
    if (!configured.rows[0]?.ready) {
      throw new ConflictException('Configure a welcome message, command, or keyword reply before activation');
    }
    await enforceBotConnectRateLimit(ownerId);
    await probeUserBotLedgerWrite(bot.id);

    let token: string;
    try { token = await ownerBotToken(botId, ownerId); }
    catch { throw new HttpException('Bot credential unavailable', HttpStatus.SERVICE_UNAVAILABLE); }
    const verification = await verifyTelegramBotToken(token);
    if (!verification.ok) {
      throw new HttpException(
        verification.outcome === 'provider_failure' ? 'Telegram validation unavailable' : 'Bot token needs reconnection',
        verification.outcome === 'provider_failure' ? HttpStatus.BAD_GATEWAY : HttpStatus.CONFLICT
      );
    }
    if (String(verification.bot.id) !== String(bot.telegram_bot_id) ||
        verification.bot.username.toLowerCase() !== bot.username.toLowerCase()) {
      throw new ConflictException('Bot token does not match this bot');
    }

    const secret = userBotWebhookSecret(bot.id, process.env.USER_BOT_WEBHOOK_SECRET_KEY);
    try {
      await registerUserBotWebhook(token, bot.id, secret);
    } catch (error) {
      if (error instanceof ForeignWebhookError) throw new ConflictException('This bot already has another Telegram webhook');
      throw new HttpException('Telegram webhook registration unavailable', HttpStatus.BAD_GATEWAY);
    }
    const changed = await pool().query<{ id: string }>(
      "update public.base_bots set status='active' where id=$1 and owner_id=$2 and status='inactive' returning id",
      [bot.id, ownerId]
    );
    if (!changed.rows[0]) {
      throw new ConflictException('Bot activation state changed; refresh the dashboard');
    }
    return { id: bot.id, status: 'active' };
  }

  @Post(':botId/deactivate')
  async deactivate(@Headers('authorization') authorization: string | undefined, @Param('botId') botId: string) {
    deliveryEnabled();
    const { ownerId, bot } = await ownedBot(botId, authorization);
    // Stop replies in our webhook before contacting Telegram. If Telegram is
    // unavailable, the endpoint is still safe and cleanup can be retried.
    if (bot.status === 'active') {
      await pool().query("update public.base_bots set status='inactive' where id=$1 and owner_id=$2 and status='active'", [bot.id, ownerId]);
    }
    if (bot.status !== 'active' && bot.status !== 'inactive') {
      throw new ConflictException('Bot cannot be deactivated in its current state');
    }
    let cleanupPending = false;
    try {
      const token = await ownerBotToken(bot.id, ownerId);
      cleanupPending = !(await removeUserBotWebhookIfOwned(token, bot.id));
    } catch {
      cleanupPending = true;
    }
    return { id: bot.id, status: 'inactive', webhookCleanupPending: cleanupPending };
  }
}
