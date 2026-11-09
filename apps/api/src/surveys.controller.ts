import { BadRequestException, Body, ConflictException, Controller, Get, Header, Headers, NotFoundException, Param, Post } from '@nestjs/common';
import { pool } from './auth-db';
import { botAccess, type BotPermission } from './bot-access';
import { validUuid } from './bot-config';
import { surveysEnabled } from './surveys';

function parseSurvey(body: unknown) {
  const data = body as { id?: unknown; question?: unknown; choices?: unknown; confirm?: unknown } | null;
  const question = typeof data?.question === 'string' ? data.question.trim() : '';
  const choices = Array.isArray(data?.choices) ? data.choices.map(choice => typeof choice === 'string' ? choice.trim() : '') : [];
  if (data?.confirm !== true || typeof data.id !== 'string' || !validUuid(data.id) ||
      !question || question.length > 240 || question.includes('\0') ||
      choices.length < 2 || choices.length > 6 ||
      choices.some(choice => !choice || choice.length > 60 || /[\r\n\0]/.test(choice)) ||
      new Set(choices.map(choice => choice.toLowerCase())).size !== choices.length) {
    throw new BadRequestException('Review a question and 2–6 distinct choices before publishing.');
  }
  return { id: data.id, question, choices };
}

@Controller('bots/:botId/surveys')
export class SurveysController {
  private async access(auth: string | undefined, botId: string, permission: BotPermission) {
    await botAccess(auth, botId, permission);
    if (!surveysEnabled(botId)) throw new NotFoundException('Surveys are unavailable');
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Headers('authorization') auth: string | undefined, @Param('botId') botId: string) {
    await this.access(auth, botId, 'read');
    const result = await pool().query(`select s.id,s.question,s.choices,s.published_at,s.expires_at,s.closed_at,
      coalesce((select jsonb_object_agg(counts.choice, counts.total) from (
        select v.choice,count(*)::int as total from base_private.bot_survey_votes v
          where v.survey_id=s.id group by v.choice
      ) counts),'{}'::jsonb) as totals
      from base_private.bot_surveys s where s.bot_id=$1 and s.expires_at>now()
      order by s.closed_at is not null, s.published_at desc limit 50`, [botId]);
    return { surveys: result.rows };
  }

  @Post()
  async publish(@Headers('authorization') auth: string | undefined, @Param('botId') botId: string, @Body() body: unknown) {
    await this.access(auth, botId, 'operate');
    const survey = parseSurvey(body);
    // Allow another publication after expiry even if the cleanup tick is late.
    await pool().query(`update base_private.bot_surveys set closed_at=now()
      where bot_id=$1 and closed_at is null and expires_at<=now()`, [botId]);
    const result = await pool().query(`insert into base_private.bot_surveys(id,bot_id,question,choices)
      values($1,$2,$3,$4) on conflict do nothing returning id`, [survey.id, botId, survey.question, survey.choices]);
    if (result.rowCount) return { id: survey.id };
    const existing = await pool().query(`select id from base_private.bot_surveys
      where id=$1 and bot_id=$2 and question=$3 and choices=$4`, [survey.id, botId, survey.question, survey.choices]);
    if (existing.rowCount) return { id: survey.id };
    throw new ConflictException('Close the current survey before publishing another.');
  }

  @Post(':surveyId/close')
  async close(@Headers('authorization') auth: string | undefined, @Param('botId') botId: string,
    @Param('surveyId') surveyId: string, @Body() body: unknown) {
    await this.access(auth, botId, 'operate');
    if (!validUuid(surveyId) || (body as { confirm?: unknown } | null)?.confirm !== true) {
      throw new BadRequestException('Confirm before closing this survey.');
    }
    const result = await pool().query(`update base_private.bot_surveys set closed_at=coalesce(closed_at,now())
      where id=$1 and bot_id=$2 and expires_at>now() returning id`, [surveyId, botId]);
    if (!result.rowCount) throw new NotFoundException('Survey not found');
    return { closed: true };
  }
}
