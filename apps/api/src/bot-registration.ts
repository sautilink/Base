/** Trusted Supabase-verified owner ID is passed by the server, never accepted from a body. */
export type TelegramVerifiedBot = {
  id: number;
  username: string;
  first_name?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Produces only positional, parameterized INSERT values.
 * There is intentionally no owner_id, bot_id or status in a client payload.
 */
export function botRegistrationValues(ownerId: string, telegram: TelegramVerifiedBot):
  [string, number, string, string] {
  if (!UUID.test(ownerId)) throw new Error('Unverified owner identifier');
  if (!Number.isSafeInteger(telegram.id) || telegram.id <= 0) throw new Error('Invalid Telegram bot ID');
  if (!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(telegram.username)) {
    throw new Error('Invalid Telegram bot username');
  }
  const displayName = typeof telegram.first_name === 'string'
    ? telegram.first_name.slice(0, 255)
    : telegram.username;
  return [ownerId, telegram.id, telegram.username, displayName];
}
