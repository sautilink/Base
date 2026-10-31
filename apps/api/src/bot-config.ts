export type CommandInput = { command: string; responseText: string };
export type ReplyRuleInput = { keyword: string; responseText: string; enabled: boolean };

export class InvalidBotConfig extends Error {
  constructor(message: string) { super(message); this.name = 'InvalidBotConfig'; }
}

export function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function textField(body: unknown, key: string, max: number, allowEmpty = false): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InvalidBotConfig('Invalid request body');
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== 'string') throw new InvalidBotConfig(key + ' must be a string');
  const result = value.trim();
  if ((!allowEmpty && !result) || result.length > max) {
    throw new InvalidBotConfig(key + ' must contain ' + (allowEmpty ? '0' : '1') + ' to ' + max + ' characters');
  }
  return result;
}

export function parseCommand(body: unknown): CommandInput {
  const raw = textField(body, 'command', 33).replace(/^\//, '').toLowerCase();
  if (!/^[a-z0-9_]{1,32}$/.test(raw)) throw new InvalidBotConfig('Command must use 1-32 lowercase letters, numbers or underscores');
  return { command: raw, responseText: textField(body, 'responseText', 4000) };
}

export function parseReplyRule(body: unknown): ReplyRuleInput {
  const keyword = textField(body, 'keyword', 128).toLowerCase();
  const responseText = textField(body, 'responseText', 4000);
  const enabled = (body as Record<string, unknown>).enabled;
  if (enabled !== undefined && typeof enabled !== 'boolean') throw new InvalidBotConfig('enabled must be a boolean');
  return { keyword, responseText, enabled: enabled === undefined ? true : enabled };
}

export function parseWelcome(body: unknown): string {
  return textField(body, 'message', 4000, true);
}

export function parseEnabled(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof (body as Record<string, unknown>).enabled !== 'boolean') {
    throw new InvalidBotConfig('enabled must be a boolean');
  }
  return (body as { enabled: boolean }).enabled;
}
