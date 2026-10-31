import { timingSafeEqual } from 'node:crypto';

export type MasterReply = { chatId: number; text: string } | null;
type TelegramUpdate = {
  update_id?: unknown;
  message?: {
    chat?: { id?: unknown; type?: unknown };
    text?: unknown;
  };
};

export function verifyTelegramSecret(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected || expected.length < 16 || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export function masterReply(body: unknown): MasterReply {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const update = body as TelegramUpdate;
  const message = update.message;
  if (!message || message.chat?.type !== 'private' || typeof message.text !== 'string') return null;
  const chatId = message.chat.id;
  if (typeof chatId !== 'number' || !Number.isSafeInteger(chatId) || chatId <= 0) return null;
  const keyword = message.text.trim().split(/\s+/)[0].split('@')[0].toLowerCase();
  switch (keyword) {
    case '/start':
      return { chatId, text: [
        'Welcome to SautiLink Base!',
        'Build smarter Telegram bots. For free.',
        '',
        '1. Open @BotFather and create your Telegram bot.',
        '2. Open the secure SautiLink Base web dashboard to connect it.',
        '3. Configure commands and replies.',
        '',
        'Never send your bot token in a Telegram message.',
        'Type /help for commands.'
      ].join('\n') };
    case '/help':
      return { chatId, text: [
        'SautiLink Base',
        '/start — Welcome and setup',
        '/createbot — How to create a Telegram bot',
        '/dashboard — Where to manage your bots',
        '/help — This menu',
        '',
        'All features are free.'
      ].join('\n') };
    case '/createbot':
      return { chatId, text: [
        'Create your bot with @BotFather:',
        '1. Open @BotFather in Telegram.',
        '2. Send /newbot and follow the steps.',
        '3. Keep the token private.',
        '4. Connect your bot through the secure SautiLink Base dashboard.',
        '',
        'Never paste your bot token in this chat.'
      ].join('\n') };
    case '/dashboard':
      return { chatId, text: 'Manage your Telegram bots at https://base.sautilink.com/dashboard when the dashboard goes live.' };
    default: return null;
  }
}
