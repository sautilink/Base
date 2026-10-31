import { pool } from './auth-db';
import { simulateBotMessage, type BotReplyConfiguration } from './simulate-bot';
import { activeBotToken } from './user-bot-credential';
import { privateTextMessage, userBotTelegramCall } from './user-bot-telegram';
import { claimUserBotUpdate, completeUserBotUpdate } from './user-bot-update-ledger';

type Bot = { id: string; username: string; status: string; welcome_message: string };
type Rules = Pick<BotReplyConfiguration, 'commands' | 'rules'>;

export type DeliveryAdapter = {
  loadBot: (botId: string) => Promise<Bot | null>;
  loadRules: (botId: string) => Promise<Rules>;
  activeToken: (botId: string) => Promise<string>;
  claim: (botId: string, updateId: number) => Promise<boolean>;
  complete: (botId: string, updateId: number, status: 'sent' | 'ignored' | 'unknown') => Promise<void>;
  send: (token: string, chatId: number, text: string) => Promise<void>;
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
        'select command, response_text from public.base_commands where bot_id=$1 order by command limit 100', [botId]
      ),
      pool().query<{ keyword: string; response_text: string; enabled: boolean }>(
        'select keyword, response_text, enabled from public.base_reply_rules where bot_id=$1 order by keyword limit 100', [botId]
      )
    ]);
    return { commands: commands.rows, rules: rules.rows };
  },
  activeToken: activeBotToken,
  claim: claimUserBotUpdate,
  complete: completeUserBotUpdate,
  async send(token, chatId, text) {
    await userBotTelegramCall(token, 'sendMessage', {
      chat_id: chatId, text, link_preview_options: { is_disabled: true }
    });
  }
};

/** At-most-once delivery. DB failures before claim propagate so Telegram retries. */
export async function handleUserBotUpdate(
  botId: string, updateId: number, body: unknown, adapter: DeliveryAdapter = liveAdapter
): Promise<{ ok: true; inactive?: true; duplicate?: true }> {
  const bot = await adapter.loadBot(botId);
  if (!bot || bot.status !== 'active') return { ok: true, inactive: true };
  const message = privateTextMessage(body);
  let responseText: string | null = null;
  if (message) {
    const rules = await adapter.loadRules(botId);
    responseText = simulateBotMessage(message.text, { ...bot, ...rules }).responseText;
  }
  const token = responseText ? await adapter.activeToken(botId) : null;
  const claimed = await adapter.claim(botId, updateId);
  if (!claimed) return { ok: true, duplicate: true };
  if (!message || !responseText || !token) {
    await adapter.complete(botId, updateId, 'ignored');
    return { ok: true };
  }
  let delivered = false;
  try {
    await adapter.send(token, message.chatId, responseText);
    delivered = true;
  } catch {
    // A timeout may occur after Telegram sent the reply. Never retry an
    // already claimed update or log the token-bearing request URL.
  }
  await adapter.complete(botId, updateId, delivered ? 'sent' : 'unknown');
  return { ok: true };
}
