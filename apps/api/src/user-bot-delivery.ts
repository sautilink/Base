import { ServiceUnavailableException } from '@nestjs/common';
import { pool } from './auth-db';
import { simulateBotMessage, type BotReplyConfiguration } from './simulate-bot';
import { activeBotToken } from './user-bot-credential';
import { privateTextMessage, userBotTelegramCall } from './user-bot-telegram';
import { claimUserBotUpdate, completeUserBotUpdate } from './user-bot-update-ledger';
import {loadBuilder} from './builder-db';
import {menuReply,type RichReply} from './content-config';
import {privateMenuCallback,sendRichReply} from './content-delivery';
import { audienceCommand, audienceMessageTime, audienceVisitorKey, privateAudienceSender, type AudienceObservation } from './audience';
import { encryptDestination } from './broadcast-config';
import { recordSupport, supportEnabled, supportInput, type SupportInput, type SupportResult } from './support-inbox';

type Bot = { id: string; username: string; status: string; welcome_message: string };
type Rules = Pick<BotReplyConfiguration, 'commands' | 'rules' | 'contents' | 'menus'>;

export type DeliveryAdapter = {
  loadBot: (botId: string) => Promise<Bot | null>;
  loadRules: (botId: string) => Promise<Rules>;
  activeToken: (botId: string) => Promise<string>;
  claim: (botId: string, updateId: number, observation?: AudienceObservation) => Promise<boolean>;
  claimSupport?: (botId: string, updateId: number, observation: AudienceObservation, input: SupportInput) =>
    Promise<{ claimed: boolean; support: SupportResult }>;
  visitorKey?: (botId: string, chatId: number) => string;
  destination?: (botId: string, visitorKey: string, chatId: number) => Buffer;
  complete: (botId: string, updateId: number, status: 'sent' | 'ignored' | 'unknown') => Promise<void>;
  send: (token: string, chatId: number, text: string, reply?:RichReply) => Promise<void>;
  answer?: (token:string,queryId:string)=>Promise<void>;
};

const liveAdapter: DeliveryAdapter = {
  async loadBot(botId) {
    const result = await pool().query<Bot>(
      'select id, username, status, welcome_message from public.base_bots where id=$1', [botId]
    );
    return result.rows[0] ?? null;
  },
  async loadRules(botId) {
    const [commands, rules] = await Promise.all([
      pool().query<{ command: string; response_text: string }>(
        'select command, response_text, content_id from public.base_commands where bot_id=$1 order by command limit 100', [botId]
      ),
      pool().query<{ keyword: string; response_text: string; enabled: boolean }>(
        'select keyword, response_text, enabled from public.base_reply_rules where bot_id=$1 order by keyword limit 100', [botId]
      )
    ]);
    return { commands: commands.rows, rules: rules.rows, ...await loadBuilder(botId) };
  },
  activeToken: activeBotToken,
  claim: claimUserBotUpdate,
  async claimSupport(botId, updateId, observation, input) {
    let support: SupportResult = { consumed: false };
    const claimed = await claimUserBotUpdate(botId, updateId, observation, undefined, async db => {
      support = await recordSupport(db, botId, updateId, input);
    }).catch(() => { throw new ServiceUnavailableException('Support processing unavailable'); });
    return { claimed, support };
  },
  visitorKey: (botId, chatId) => audienceVisitorKey(botId, chatId, process.env.USER_BOT_WEBHOOK_SECRET_KEY),
  destination: (botId, visitorKey, chatId) => encryptDestination(botId,visitorKey,chatId,process.env.BOT_TOKEN_ENCRYPTION_KEY),
  complete: completeUserBotUpdate,
  send:sendRichReply,
  async answer(token,queryId){await userBotTelegramCall(token,'answerCallbackQuery',{callback_query_id:queryId});}
};

/** At-most-once delivery. DB failures before claim propagate so Telegram retries. */
export async function handleUserBotUpdate(
  botId: string, updateId: number, body: unknown, adapter: DeliveryAdapter = liveAdapter
): Promise<{ ok: true; inactive?: true; duplicate?: true }> {
  const bot = await adapter.loadBot(botId);
  if (!bot || bot.status !== 'active') return { ok: true, inactive: true };
  const message = privateTextMessage(body);
  const callback=privateMenuCallback(body);
  let reply:RichReply|null=null;
  let responseText: string | null = null;
  if (message || callback) {
    const rules = await adapter.loadRules(botId);
    reply=callback?menuReply(callback.id,rules.menus??[],rules.contents??[]):simulateBotMessage(message!.text, { ...bot, ...rules });
    responseText=reply?.responseText??null;
  }
  const action = message ? audienceCommand(message.text, bot.username) : null;
  const actionAt = action ? audienceMessageTime(body) : null;
  if (action && (!privateAudienceSender(body) || actionAt === null)) {
    reply = null; responseText = null;
  }
  let token = responseText || reply?.content || callback ? await adapter.activeToken(botId) : null;
  const sender = message ? privateAudienceSender(body) : callback?.chatId;
  const observation: AudienceObservation | undefined = sender && adapter.visitorKey ? {
    visitorKey: adapter.visitorKey(botId, sender),
    kind: callback ? 'menu' : 'message',
    action: actionAt !== null ? action : null,
    actionAt
  } : undefined;
  if (observation?.action === 'subscribe' && adapter.destination && sender) {
    observation.destination = adapter.destination(botId,observation.visitorKey,sender);
  }
  const input = message && adapter.claimSupport && supportEnabled(botId) ? supportInput(body, message.text, bot.username) : null;
  const claim = input && observation && adapter.claimSupport
    ? await adapter.claimSupport(botId, updateId, observation, input)
    : { claimed: await adapter.claim(botId, updateId, observation), support: undefined };
  const { claimed } = claim;
  if (!claimed) return { ok: true, duplicate: true };
  if (claim.support?.consumed) {
    reply = null;
    responseText = claim.support.reply ?? null;
    if (responseText && !token) {
      try { token = await adapter.activeToken(botId); }
      catch { await adapter.complete(botId, updateId, 'unknown'); return { ok: true }; }
    }
  }
  if(callback&&token&&adapter.answer){try{await adapter.answer(token,callback.queryId);}catch{/* Callback acknowledgement cannot authorize or replay a send. */}}
  if ((!message&&!callback) || (!responseText&&!reply?.content) || !token) {
    await adapter.complete(botId, updateId, 'ignored');
    return { ok: true };
  }
  // Pause may have happened after the first status read or while the
  // Telegram update was being prepared. Recheck just before send, after
  // claiming the update, so ordinary in-flight work respects a pause.
  // This narrows the race, but does not claim cancellation of an already
  // in-flight Telegram sendMessage request.
  let latest: Bot | null;
  try { latest = await adapter.loadBot(botId); }
  catch {
    // A claimed update cannot safely be retried. A second DB read may fail
    // after the claim was committed but before a send was attempted. Mark
    // this as an operational incident instead of leaving a processing row
    // when the database is still available for a status update.
    await adapter.complete(botId, updateId, 'unknown');
    return { ok: true };
  }
  if (!latest || latest.status !== 'active') {
    await adapter.complete(botId, updateId, 'ignored');
    return { ok: true, inactive: true };
  }
  let delivered = false;
  try {
    await adapter.send(token, (message??callback)!.chatId, responseText??'', reply??undefined);
    delivered = true;
  } catch {
    // A timeout may occur after Telegram sent the reply. Never retry an
    // already claimed update or log the token-bearing request URL.
  }
  await adapter.complete(botId, updateId, delivered ? 'sent' : 'unknown');
  return { ok: true };
}
