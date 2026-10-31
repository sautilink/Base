import { pool } from './auth-db';
import { BOT_TOKEN_PATTERN, decryptBotToken, requireEncryptionKey } from './bot-security';

type Credential = { token_ciphertext: Buffer; key_version: number };

async function tokenFromQuery(sql: string, values: string[]): Promise<string> {
  const result = await pool().query<Credential>(sql, values);
  const credential = result.rows[0];
  if (!credential || credential.key_version !== 1 || !Buffer.isBuffer(credential.token_ciphertext)) {
    throw new Error('Bot credential unavailable');
  }
  let token: string;
  try {
    token = decryptBotToken(credential.token_ciphertext, requireEncryptionKey(process.env.BOT_TOKEN_ENCRYPTION_KEY));
  } catch {
    throw new Error('Bot credential unavailable');
  }
  if (!BOT_TOKEN_PATTERN.test(token)) throw new Error('Bot credential unavailable');
  return token;
}

export function ownerBotToken(botId: string, ownerId: string): Promise<string> {
  return tokenFromQuery(
    'select token_ciphertext, key_version from base_private.owner_bot_credential($1::uuid,$2::uuid)',
    [botId, ownerId]
  );
}

export function activeBotToken(botId: string): Promise<string> {
  return tokenFromQuery(
    'select token_ciphertext, key_version from base_private.active_bot_credential($1::uuid)',
    [botId]
  );
}
