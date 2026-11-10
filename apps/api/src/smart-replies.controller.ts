import { BadRequestException, Body, Controller, Get, Header, Headers, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { pool } from './auth-db';
import { botAccess } from './bot-access';
import { smartRepliesEnabled, smartReplyQuestionLimit, useSmartReply, type KnowledgeEntry } from './smart-replies';

function parseSettings(body: unknown) {
  const data = body as { entries?: unknown; telegramEnabled?: unknown } | null;
  if (!Array.isArray(data?.entries) || data.entries.length > 20 || typeof data.telegramEnabled !== 'boolean') {
    throw new BadRequestException('Enter up to 20 FAQs and choose whether to enable Telegram replies.');
  }
  const entries: KnowledgeEntry[] = data.entries.map(entry => {
    const question = typeof entry?.question === 'string' ? entry.question.trim() : '';
    const answer = typeof entry?.answer === 'string' ? entry.answer.trim() : '';
    if (!question || question.length > 160 || !answer || answer.length > 1200 || question.includes('\0') || answer.includes('\0')) {
      throw new BadRequestException('Each FAQ needs a question of up to 160 characters and an answer of up to 1,200.');
    }
    return { question, answer };
  });
  if (new Set(entries.map(entry => entry.question.toLowerCase())).size !== entries.length) {
    throw new BadRequestException('Each FAQ question must be distinct.');
  }
  if (data.telegramEnabled && (!entries.length || !process.env.OPENAI_API_KEY?.trim())) {
    throw new BadRequestException('Save at least one FAQ and configure OpenAI before enabling Telegram replies.');
  }
  return { entries, telegramEnabled: data.telegramEnabled };
}

@Controller('bots/:botId/smart-replies')
export class SmartRepliesController {
  private async access(auth: string | undefined, botId: string) {
    await botAccess(auth, botId, 'operate');
    if (!smartRepliesEnabled(botId)) throw new NotFoundException('Smart Replies are unavailable.');
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async settings(@Headers('authorization') auth: string | undefined, @Param('botId') botId: string) {
    await this.access(auth, botId);
    const result = await pool().query<{ entries: KnowledgeEntry[]; telegram_enabled: boolean; calls_today: number }>(`select entries,telegram_enabled,
      case when quota_day=(now() at time zone 'UTC')::date then calls else 0 end as calls_today
      from base_private.bot_knowledge where bot_id=$1`, [botId]);
    const row = result.rows[0];
    return {
      entries: row?.entries ?? [], telegramEnabled: row?.telegram_enabled ?? false,
      callsToday: row?.calls_today ?? 0, providerConfigured: !!process.env.OPENAI_API_KEY?.trim(),
    };
  }

  @Patch()
  async save(@Headers('authorization') auth: string | undefined, @Param('botId') botId: string, @Body() body: unknown) {
    await this.access(auth, botId);
    const settings = parseSettings(body);
    await pool().query(`insert into base_private.bot_knowledge(bot_id,entries,telegram_enabled)
      values($1,$2::jsonb,$3) on conflict(bot_id) do update
      set entries=excluded.entries,telegram_enabled=excluded.telegram_enabled`,
    [botId, JSON.stringify(settings.entries), settings.telegramEnabled]);
    return { saved: true };
  }

  @Post('preview')
  @Header('Cache-Control', 'no-store')
  async preview(@Headers('authorization') auth: string | undefined, @Param('botId') botId: string, @Body() body: unknown) {
    await this.access(auth, botId);
    const value = (body as { question?: unknown } | null)?.question;
    const question = typeof value === 'string' ? value.trim() : '';
    if (!question || question.length > smartReplyQuestionLimit || question.includes('\0')) {
      throw new BadRequestException('Enter a question of up to 600 characters.');
    }
    return { reply: await useSmartReply(botId, question, false) };
  }
}
