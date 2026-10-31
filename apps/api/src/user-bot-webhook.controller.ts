import {
  BadRequestException, Body, Controller, Headers, NotFoundException, Param, Post, UnauthorizedException
} from '@nestjs/common';
import { validUuid } from './bot-config';
import { verifyTelegramSecret } from './telegram-master';
import { userBotWebhookSecret } from './user-bot-telegram';
import { extractUpdateId } from './user-bot-update-ledger';
import { handleUserBotUpdate } from './user-bot-delivery';

@Controller('telegram/bots')
export class UserBotWebhookController {
  @Post(':botId')
  async accept(
    @Param('botId') botId: string,
    @Headers('x-telegram-bot-api-secret-token') provided: string | undefined,
    @Body() body: unknown
  ) {
    if (process.env.USER_BOT_DELIVERY_ENABLED !== 'true' || !validUuid(botId)) {
      throw new NotFoundException();
    }
    // The secret is derived from a server-only key and bot ID. Reject before
    // reading any bot or message data from the database.
    const expected = userBotWebhookSecret(botId, process.env.USER_BOT_WEBHOOK_SECRET_KEY);
    if (!verifyTelegramSecret(provided, expected)) throw new UnauthorizedException();

    const updateId = extractUpdateId(body);
    if (updateId === null) throw new BadRequestException('Invalid Telegram update');
    return handleUserBotUpdate(botId, updateId, body);
  }
}
