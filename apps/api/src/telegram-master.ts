import { timingSafeEqual } from 'node:crypto';

export type MasterButton = { text: string; url: string };
export type MasterReply = { chatId: number; text: string; buttons?: MasterButton[] } | null;

type TelegramUpdate = {
  update_id?: unknown;
  message?: {
    chat?: { id?: unknown; type?: unknown };
    text?: unknown;
  };
};

const BOTFATHER_URL = 'https://t.me/BotFather';
const MASTER_USERNAME = 'sautilinkbasebot';
const TRUSTED_DASHBOARD_HOSTS = new Set([
  'base.sautilink.com',
  'feat-phase-1-foundation-sautilink-base-web.dr-charles-services.workers.dev'
]);

export function verifyTelegramSecret(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected || expected.length < 16) return false;
  const received = Buffer.from(provided, 'utf8');
  const configured = Buffer.from(expected, 'utf8');
  if (received.length !== configured.length) return false;
  return timingSafeEqual(received, configured);
}

/** Never publish an environment-supplied redirect to an unreviewed domain. */
export function trustedDashboardLink(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !TRUSTED_DASHBOARD_HOSTS.has(url.hostname.toLowerCase())) return null;
    if (url.username || url.password || url.port || url.search || url.hash) return null;
    if (url.pathname !== '/' && url.pathname !== '/dashboard' && url.pathname !== '/dashboard/') return null;
    return url.origin + '/dashboard';
  } catch {
    return null;
  }
}

export function masterReply(body: unknown, dashboardUrl?: string): MasterReply {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const update = body as TelegramUpdate;
  const message = update.message;
  if (!message || message.chat?.type !== 'private' || typeof message.text !== 'string') return null;
  const chatId = message.chat.id;
  if (typeof chatId !== 'number' || !Number.isSafeInteger(chatId) || chatId <= 0) return null;
  const text = message.text.trim();
  if (!text || text.length > 4096) return null;
  const commandToken = text.split(/\s+/)[0];
  const parsed = /^\/([a-z0-9_]{1,32})(?:@([a-z0-9_]{5,32}))?$/i.exec(commandToken);
  if (!parsed) return null;
  const [, command, mentionedUsername] = parsed;
  if (mentionedUsername && mentionedUsername.toLowerCase() !== MASTER_USERNAME) return null;

  const dashboard = trustedDashboardLink(dashboardUrl);
  const buttons: MasterButton[] = [{ text: 'Create bot with BotFather', url: BOTFATHER_URL }];
  if (dashboard) buttons.push({ text: 'Open SautiLink Base dashboard', url: dashboard });

  switch (command.toLowerCase()) {
    case 'start':
      return {
        chatId,
        text: [
          'Welcome to SautiLink Base!',
          'Build smarter Telegram bots. For free.',
          '',
          '1. Create your bot using @BotFather.',
          '2. Connect it through the secure SautiLink Base dashboard.',
          '3. Configure its commands and automatic replies.',
          '',
          'Never send a BotFather token in a Telegram chat.',
          'Type /help to see available commands.'
        ].join('\n'),
        buttons
      };
    case 'help':
      return {
        chatId,
        text: [
          'SautiLink Base commands:',
          '/start — How SautiLink Base works',
          '/createbot — Create a bot safely',
          '/dashboard — Open bot management',
          '/help — This menu',
          '',
          'SautiLink Base is free.'
        ].join('\n'),
        buttons
      };
    case 'createbot':
      return {
        chatId,
        text: [
          'Create your bot using @BotFather:',
          '1. Open @BotFather in Telegram.',
          '2. Send /newbot and follow the steps.',
          '3. Keep the token private.',
          '4. Connect your new bot on the SautiLink Base dashboard.',
          '',
          'Never paste your bot token in this chat.'
        ].join('\n'),
        buttons
      };
    case 'dashboard':
      return dashboard
        ? { chatId, text: 'Manage your bots securely using the SautiLink Base dashboard.', buttons: [{ text: 'Open dashboard', url: dashboard }] }
        : { chatId, text: 'The SautiLink Base dashboard is being prepared. Please check back after launch.' };
    default:
      return null;
  }
}
