import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, Headers,
  NotFoundException, Param, Patch, Post
} from '@nestjs/common';
import { pool, verifiedUserId } from './auth-db';
import {
  InvalidBotConfig, parseCommand, parseEnabled, parseReplyRule, parseWelcome, validUuid
} from './bot-config';

function requireId(id: string): string {
  if (!validUuid(id)) throw new BadRequestException('Invalid bot or item ID');
  return id;
}

function validate<T>(parse: () => T): T {
  try { return parse(); }
  catch (error) {
    if (error instanceof InvalidBotConfig) throw new BadRequestException(error.message);
    throw error;
  }
}

function notFound(): never {
  throw new NotFoundException('Bot or item not found');
}

function databaseError(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    throw new ConflictException('A command or keyword with this name already exists');
  }
  throw error;
}

@Controller('bots')
export class BotConfigController {
  // SELECT verifies bot ownership before reading commands/rules. The API's
  // server DB role is privileged, so never rely on the browser's Supabase RLS.
  @Get(':botId/config')
  async config(@Headers('authorization') authorization: string | undefined, @Param('botId') botId: string) {
    const ownerId = await verifiedUserId(authorization);
    requireId(botId);
    const bot = await pool().query<{ id: string; username: string; display_name: string; status: string; welcome_message: string }>(
      'select id, username, display_name, status, welcome_message from public.base_bots where id=$1 and owner_id=$2',
      [botId, ownerId]
    );
    if (!bot.rows[0]) notFound();
    const [commands, rules] = await Promise.all([
      pool().query<{ id: string; command: string; response_text: string }>(
        'select id, command, response_text from public.base_commands where bot_id=$1 order by command limit 100',
        [botId]
      ),
      pool().query<{ id: string; keyword: string; response_text: string; enabled: boolean }>(
        'select id, keyword, response_text, enabled from public.base_reply_rules where bot_id=$1 order by keyword limit 100',
        [botId]
      )
    ]);
    return { bot: bot.rows[0], commands: commands.rows, rules: rules.rows };
  }

  @Patch(':botId/welcome')
  async welcome(@Headers('authorization') authorization: string | undefined,
    @Param('botId') botId: string, @Body() body: unknown) {
    const ownerId = await verifiedUserId(authorization);
    requireId(botId);
    const message = validate(() => parseWelcome(body));
    const result = await pool().query<{ welcome_message: string }>(
      'update public.base_bots set welcome_message=$3 where id=$1 and owner_id=$2 returning welcome_message',
      [botId, ownerId, message]
    );
    return result.rows[0] ?? notFound();
  }

  @Post(':botId/commands')
  async createCommand(@Headers('authorization') authorization: string | undefined,
    @Param('botId') botId: string, @Body() body: unknown) {
    const ownerId = await verifiedUserId(authorization);
    requireId(botId);
    const data = validate(() => parseCommand(body));
    try {
      const result = await pool().query<{ id: string; command: string; response_text: string }>(
        `insert into public.base_commands(bot_id, command, response_text)
        select id, $3, $4 from public.base_bots where id=$1 and owner_id=$2
        returning id, command, response_text`,
        [botId, ownerId, data.command, data.responseText]
      );
      return result.rows[0] ?? notFound();
    } catch (error) { databaseError(error); }
  }

  @Patch(':botId/commands/:itemId')
  async updateCommand(@Headers('authorization') authorization: string | undefined,
    @Param('botId') botId: string, @Param('itemId') itemId: string, @Body() body: unknown) {
    const ownerId = await verifiedUserId(authorization);
    requireId(botId); requireId(itemId);
    const data = validate(() => parseCommand(body));
    try {
      const result = await pool().query<{ id: string; command: string; response_text: string }>(
        `update public.base_commands set command=$4, response_text=$5
        where id=$3 and bot_id=$1 and exists
          (select 1 from public.base_bots where id=$1 and owner_id=$2)
        returning id, command, response_text`,
        [botId, ownerId, itemId, data.command, data.responseText]
      );
      return result.rows[0] ?? notFound();
    } catch (error) { databaseError(error); }
  }

  @Delete(':botId/commands/:itemId')
  async removeCommand(@Headers('authorization') authorization: string | undefined,
    @Param('botId') botId: string, @Param('itemId') itemId: string) {
    const ownerId = await verifiedUserId(authorization);
    requireId(botId); requireId(itemId);
    const result = await pool().query<{ id: string }>(
      `delete from public.base_commands
       where id=$3 and bot_id=$1 and exists
        (select 1 from public.base_bots where id=$1 and owner_id=$2)
       returning id`,
      [botId, ownerId, itemId]
    );
    if (!result.rows[0]) notFound();
    return { deleted: true };
  }

  @Post(':botId/rules')
  async createRule(@Headers('authorization') authorization: string | undefined,
    @Param('botId') botId: string, @Body() body: unknown) {
    const ownerId = await verifiedUserId(authorization);
    requireId(botId);
    const data = validate(() => parseReplyRule(body));
    try {
      const result = await pool().query<{ id: string; keyword: string; response_text: string; enabled: boolean }>(
        `insert into public.base_reply_rules(bot_id, keyword, response_text, enabled)
         select id, $3, $4, $5 from public.base_bots where id=$1 and owner_id=$2
         returning id, keyword, response_text, enabled`,
        [botId, ownerId, data.keyword, data.responseText, data.enabled]
      );
      return result.rows[0] ?? notFound();
    } catch (error) { databaseError(error); }
  }

  @Patch(':botId/rules/:itemId')
  async updateRule(@Headers('authorization') authorization: string | undefined,
    @Param('botId') botId: string, @Param('itemId') itemId: string, @Body() body: unknown) {
    const ownerId = await verifiedUserId(authorization);
    requireId(botId); requireId(itemId);
    const data = validate(() => parseReplyRule(body));
    try {
      const result = await pool().query<{ id: string; keyword: string; response_text: string; enabled: boolean }>(
        `update public.base_reply_rules set keyword=$4, response_text=$5, enabled=$6
         where id=$3 and bot_id=$1 and exists
          (select 1 from public.base_bots where id=$1 and owner_id=$2)
         returning id, keyword, response_text, enabled`,
        [botId, ownerId, itemId, data.keyword, data.responseText, data.enabled]
      );
      return result.rows[0] ?? notFound();
    } catch (error) { databaseError(error); }
  }

  @Patch(':botId/rules/:itemId/toggle')
  async toggleRule(@Headers('authorization') authorization: string | undefined,
    @Param('botId') botId: string, @Param('itemId') itemId: string, @Body() body: unknown) {
    const ownerId = await verifiedUserId(authorization);
    requireId(botId); requireId(itemId);
    const enabled = validate(() => parseEnabled(body));
    const result = await pool().query<{ id: string; enabled: boolean }>(
      `update public.base_reply_rules set enabled=$4
       where id=$3 and bot_id=$1 and exists
        (select 1 from public.base_bots where id=$1 and owner_id=$2)
       returning id, enabled`,
      [botId, ownerId, itemId, enabled]
    );
    return result.rows[0] ?? notFound();
  }

  @Delete(':botId/rules/:itemId')
  async removeRule(@Headers('authorization') authorization: string | undefined,
    @Param('botId') botId: string, @Param('itemId') itemId: string) {
    const ownerId = await verifiedUserId(authorization);
    requireId(botId); requireId(itemId);
    const result = await pool().query<{ id: string }>(
      `delete from public.base_reply_rules where id=$3 and bot_id=$1 and exists
       (select 1 from public.base_bots where id=$1 and owner_id=$2)
       returning id`,
      [botId, ownerId, itemId]
    );
    if (!result.rows[0]) notFound();
    return { deleted: true };
  }
}
