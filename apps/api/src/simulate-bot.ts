export type SimulatedReply = {
  matchType: 'welcome' | 'command' | 'keyword' | 'none';
  matchedValue: string | null;
  responseText: string | null;
};

export type BotReplyConfiguration = {
  username: string;
  welcome_message: string;
  commands: ReadonlyArray<{ command: string; response_text: string }>;
  rules: ReadonlyArray<{ keyword: string; response_text: string; enabled: boolean }>;
};

const NO_REPLY: SimulatedReply = { matchType: 'none', matchedValue: null, responseText: null };

function escapePattern(value: string): string {
  const special = new Set(['\\', '.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']']);
  return Array.from(value, ch => special.has(ch) ? '\\' + ch : ch).join('');
}

function keywordMatches(text: string, keyword: string): boolean {
  if (!keyword.trim()) return false;
  const pattern = new RegExp(
    '(^|[^\\p{L}\\p{N}_])' + escapePattern(keyword.trim()) + '(?=$|[^\\p{L}\\p{N}_])',
    'iu'
  );
  return pattern.test(text);
}

export function simulateBotMessage(message: string, config: BotReplyConfiguration): SimulatedReply {
  const input = message.trim();
  if (!input || input.length > 4096) return NO_REPLY;

  // Telegram supports both /command and /command@BotUsername, plus /start payloads.
  if (input.startsWith('/')) {
    const parsed = /^\/([a-z0-9_]{1,32})(?:@([a-z0-9_]{5,32}))?(?=\s|$)/i.exec(input);
    if (!parsed) return NO_REPLY;
    const [, command, mentionedBot] = parsed;
    if (mentionedBot && mentionedBot.toLowerCase() !== config.username.toLowerCase()) return NO_REPLY;

    if (command.toLowerCase() === 'start' && config.welcome_message.trim()) {
      return { matchType: 'welcome', matchedValue: '/start', responseText: config.welcome_message };
    }
    const configured = config.commands.find(item => item.command.toLowerCase() === command.toLowerCase());
    if (configured?.response_text.trim()) {
      return { matchType: 'command', matchedValue: '/' + configured.command, responseText: configured.response_text };
    }
    return NO_REPLY;
  }

  // Longest keyword wins, then alphabetical order so rules are deterministic.
  const matches = config.rules
    .filter(rule => rule.enabled && rule.response_text.trim() && keywordMatches(input, rule.keyword))
    .sort((a, b) => b.keyword.length - a.keyword.length || a.keyword.localeCompare(b.keyword));
  if (matches.length === 0) return NO_REPLY;
  return {
    matchType: 'keyword',
    matchedValue: matches[0].keyword,
    responseText: matches[0].response_text
  };
}
