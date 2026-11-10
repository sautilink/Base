import { BadRequestException, Body, ConflictException, Controller, Get, Header, Headers, HttpException, NotFoundException, Param, Post, ServiceUnavailableException } from '@nestjs/common';
import { pool } from './auth-db';
import { botAccess } from './bot-access';
import { validUuid } from './bot-config';
import { decryptDestination } from './broadcast-config';
import { supportEnabled } from './support-inbox';
import { activeBotToken } from './user-bot-credential';
import { userBotTelegramCall } from './user-bot-telegram';

export function parseSupportReply(body: unknown) {
  const data = body as { text?: unknown; requestId?: unknown; confirm?: unknown } | null;
  const value = typeof data?.text === 'string' ? data.text.trim() : '';
  if (data?.confirm !== true || typeof data.requestId !== 'string' || !validUuid(data.requestId) ||
      !value || value.length > 4096 || value.includes('\0')) {
    throw new BadRequestException('Review a reply of 1–4,096 characters before sending.');
  }
  return { text: value, requestId: data.requestId };
}

@Controller('bots/:botId/inbox')
export class SupportController {
  private async access(auth: string | undefined, botId: string) {
    const access = await botAccess(auth, botId, 'operate');
    if (!supportEnabled(botId)) throw new NotFoundException('Support inbox is unavailable');
    return access;
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Headers('authorization') auth: string | undefined, @Param('botId') botId: string) {
    await this.access(auth, botId);
    const result = await pool().query(`select id, updated_at, expires_at, closed_at
      from base_private.support_threads where bot_id=$1 and expires_at>now()
      order by updated_at desc, id desc limit 100`, [botId]);
    return { threads: result.rows };
  }

  @Get(':threadId')
  @Header('Cache-Control', 'no-store')
  async detail(@Headers('authorization') auth: string | undefined, @Param('botId') botId: string, @Param('threadId') threadId: string) {
    await this.access(auth, botId);
    if (!validUuid(threadId)) throw new BadRequestException('Invalid conversation');
    const result = await pool().query(`select t.id,t.closed_at,t.expires_at,
      coalesce(jsonb_agg(jsonb_build_object('id',m.id,'direction',m.direction,'text',m.body,'status',m.status,'created_at',m.created_at)
      order by m.created_at,m.id) filter (where m.id is not null),'[]'::jsonb) as messages
      from base_private.support_threads t left join base_private.support_messages m on m.thread_id=t.id
      where t.bot_id=$1 and t.id=$2 and t.expires_at>now() group by t.id`, [botId, threadId]);
    if (!result.rows[0]) throw new NotFoundException('Conversation not found');
    return result.rows[0];
  }

  @Post(':threadId/reply')
  @Header('Cache-Control', 'no-store')
  async reply(@Headers('authorization') auth: string | undefined, @Param('botId') botId: string,
    @Param('threadId') threadId: string, @Body() body: unknown) {
    const { actorId } = await this.access(auth, botId);
    if (!validUuid(threadId)) throw new BadRequestException('Invalid conversation');
    const input = parseSupportReply(body);
    const db = await pool().connect().catch(() => { throw new ServiceUnavailableException('Support reply unavailable'); });
    let discard = false;
    let chatId: number;
    let messageId: string;
    try {
      await db.query('begin');
      const thread = (await db.query<{ destination: Buffer | null; visitor_key: string }>(`select destination,visitor_key
        from base_private.support_threads where id=$1 and bot_id=$2 and expires_at>now() for update`, [threadId, botId])).rows[0];
      if (!thread) throw new NotFoundException('Conversation not found');
      const previous = (await db.query<{ status: string }>(`select status from base_private.support_messages
        where thread_id=$1 and request_id=$2`, [threadId, input.requestId])).rows[0];
      if (previous) {
        await db.query('commit');
        return { status: previous.status };
      }
      if (!thread.destination) throw new ConflictException('This conversation is closed.');
      chatId = decryptDestination(botId, thread.visitor_key, thread.destination, process.env.BOT_TOKEN_ENCRYPTION_KEY);
      const claim = (await db.query<{ id: string }>(`insert into base_private.support_messages(thread_id,direction,body,request_id,actor_id,status)
        select $1,'team',$2,$3,$4,'sending' where
        (select count(*) from base_private.support_messages where thread_id=$1 and direction='team') < 40
        returning id`, [threadId, input.text, input.requestId, actorId])).rows[0];
      if (!claim) throw new ConflictException('This conversation has reached the reply limit.');
      messageId = claim.id;
      await db.query('update base_private.support_threads set updated_at=now() where id=$1', [threadId]);
      await db.query('commit');
    } catch (error) {
      try { await db.query('rollback'); } catch { discard = true; }
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Support reply unavailable');
    } finally { db.release(discard ? new Error('Support transaction rollback failed') : undefined); }

    // A committed send claim is never replayed, even after a timeout or crash.
    let status = 'unknown';
    try {
      const token = await activeBotToken(botId);
      await userBotTelegramCall(token, 'sendMessage', { chat_id: chatId, text: input.text, link_preview_options: { is_disabled: true } });
      status = 'accepted';
    } catch { /* A failed response may follow an accepted Telegram send. */ }
    await pool().query('update base_private.support_messages set status=$2 where id=$1', [messageId, status])
      .catch(() => { throw new ServiceUnavailableException('Reply status could not be confirmed'); });
    return { status };
  }
}
