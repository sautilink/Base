import {
  BadRequestException, Body, Controller, Headers, HttpException, HttpStatus,
  NotFoundException, Post, UnauthorizedException
} from '@nestjs/common';
import { BOT_TOKEN_PATTERN } from './bot-security';
import { masterReply, verifyTelegramSecret } from './telegram-master';
import { claimMasterUpdate, completeMasterUpdate, extractUpdateId } from './master-update-ledger';

// Off unless explicitly activated after deployment, credentials and telemetry checks.
// Telegram updates are de-duplicated before any sendMessage attempt.
@Controller('telegram')
export class MasterWebhookController {
  @Post('master')
  async accept(@Headers('x-telegram-bot-api-secret-token') provided: string | undefined, @Body() body: unknown) {
    if (process.env.MASTER_BOT_ENABLED !== 'true') throw new NotFoundException();
    if (!verifyTelegramSecret(provided, process.env.TELEGRAM_WEBHOOK_SECRET)) {
      throw new UnauthorizedException();
    }
    const botToken = process.env.BOT_TOKEN;
    if (!botToken || !BOT_TOKEN_PATTERN.test(botToken)) {
      throw new HttpException('Master bot unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const updateId = extractUpdateId(body);
    if (updateId === null) throw new BadRequestException('Invalid Telegram update');
    // A database failure must stop processing; Telegram may retry an unclaimed update.
    const claimed = await claimMasterUpdate(updateId);
    if (!claimed) return { ok: true, duplicate: true };

    const reply = masterReply(body);
    if (!reply) {
      await completeMasterUpdate(updateId, 'sent');
      return { ok: true };
    }

    let delivered = false;
    try {
      const response = await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: reply.chatId, text: reply.text, link_preview_options: { is_disabled: true } }),
        signal: AbortSignal.timeout(7000),
        redirect: 'error'
      });
      delivered = response.ok;
    } catch {
      // Once a send attempt is started, the outcome may be ambiguous.
      // Never blindly retry it or reveal the token-bearing URL in logs.
    }
    await completeMasterUpdate(updateId, delivered ? 'sent' : 'unknown');
    // Return a success to avoid Telegram retrying a potentially delivered message.
    // 'unknown' must be investigated and reconciled manually.
    return { ok: true };
  }
}
