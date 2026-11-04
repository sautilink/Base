import { HttpStatus } from '@nestjs/common';
import type { TelegramVerifiedBot } from './bot-registration';
import { TELEGRAM_BOT_USERNAME_PATTERN } from './bot-registration';

type FailureOutcome = 'invalid_token' | 'provider_failure' | 'invalid_bot' | 'master_bot';
type Verification =
  | { ok: true; bot: TelegramVerifiedBot }
  | { ok: false; outcome: FailureOutcome; status: HttpStatus; message: string };
type TelegramMe = {
  ok?: boolean;
  error_code?: number;
  result?: { id?: unknown; is_bot?: unknown; username?: unknown; first_name?: unknown };
};

const invalidToken = (): Verification => ({
  ok: false, outcome: 'invalid_token', status: HttpStatus.BAD_REQUEST, message: 'Invalid bot token'
});
const unavailable = (): Verification => ({
  ok: false, outcome: 'provider_failure', status: HttpStatus.BAD_GATEWAY, message: 'Telegram validation unavailable'
});

/** Return only a safe outcome and verified public bot identity; never expose the token or upstream body. */
export async function verifyTelegramBotToken(token: string, fetcher: typeof fetch = fetch): Promise<Verification> {
  let response: Response;
  try {
    response = await fetcher(`https://api.telegram.org/bot${token}/getMe`, {
      method: 'POST', signal: AbortSignal.timeout(7000), redirect: 'error'
    });
  } catch {
    return unavailable();
  }
  if (response.status === 401 || response.status === 404) return invalidToken();
  if (!response.ok) return unavailable();

  let data: TelegramMe;
  try { data = await response.json() as TelegramMe; }
  catch { return unavailable(); }
  if (data?.ok === false) {
    return data.error_code === 401 || data.error_code === 404 ? invalidToken() : unavailable();
  }
  const bot = data?.result;
  if (data?.ok !== true || bot?.is_bot !== true ||
      typeof bot.username !== 'string' || !TELEGRAM_BOT_USERNAME_PATTERN.test(bot.username) ||
      typeof bot.id !== 'number' ||
      !Number.isSafeInteger(bot.id) || bot.id <= 0) {
    return { ok: false, outcome: 'invalid_bot', status: HttpStatus.BAD_REQUEST, message: 'Telegram did not verify a bot' };
  }
  if (bot.username.toLowerCase() === 'sautilinkbasebot') {
    return {
      ok: false, outcome: 'master_bot', status: HttpStatus.BAD_REQUEST,
      message: 'This is the @SautiLinkBaseBot platform bot. Create a separate test bot with @BotFather and use its token.'
    };
  }
  return { ok: true, bot: {
    id: bot.id, username: bot.username,
    first_name: typeof bot.first_name === 'string' ? bot.first_name : undefined
  } };
}
