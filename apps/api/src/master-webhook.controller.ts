import {
  BadGatewayException, Controller, Headers, NotFoundException, Post,
  Body, UnauthorizedException
} from '@nestjs/common';
import { BOT_TOKEN_PATTERN } from './bot-security';
import { masterReply, verifyTelegramSecret } from './telegram-master';

// Deliberately disabled unless an operator explicitly configures all secrets.
// This is the master onboarding bot only: no user bot tokens are accessed here.
@Controller('telegram')
export class MasterWebhookController {
  @Post('master')
  async accept(@Headers('x-telegram-bot-api-secret-token') provided: string | undefined, @Body() body: unknown) {
    if (process.env.MASTER_BOT_ENABLED !== 'true') throw new NotFoundException();
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!verifyTelegramSecret(provided, secret)) throw new UnauthorizedException();
    const botToken = process.env.BOT_TOKEN;
    if (!botToken || !BOT_TOKEN_PATTERN.test(botToken)) {
      throw new BadGatewayException('Master bot is not configured');
    }
    const reply = masterReply(body);
    if (!reply) return { ok: true };
    let response: Response;
    try {
      response = await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: reply.chatId,
          text: reply.text,
          disable_web_page_preview: true
        }),
        signal: AbortSignal.timeout(7000),
        redirect: 'error'
      });
    } catch {
      // Do not leak the token-bearing Telegram URL through an unhandled fetch error.
      throw new BadGatewayException('Telegram is unavailable');
    }
    if (!response.ok) throw new BadGatewayException('Telegram message could not be delivered');
    return { ok: true };
  }
}
