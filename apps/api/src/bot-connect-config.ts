import { requireEncryptionKey } from './bot-security';
import { hashedClientIp } from './connect-abuse';
import { publicClientConfig } from './public-config.controller';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The public staging route may be enabled only for two named Base test accounts. */
export function botConnectTestOwners(env: NodeJS.ProcessEnv): ReadonlySet<string> {
  const ids = (env.BOT_CONNECT_TEST_USER_IDS ?? '').split(',').map(id => id.trim().toLowerCase());
  if (ids.length !== 2 || ids.some(id => !UUID.test(id)) || new Set(ids).size !== 2) {
    throw new Error('Exactly two distinct Base test account IDs are required for bot connection');
  }
  return new Set(ids);
}

/** Fail the staging startup before accepting bot tokens if a required guard is missing. */
export function assertBotConnectConfigured(env: NodeJS.ProcessEnv): void {
  if (env.BOT_CONNECT_ENABLED !== 'true') return;
  publicClientConfig(env);
  requireEncryptionKey(env.BOT_TOKEN_ENCRYPTION_KEY);
  botConnectTestOwners(env);
  // Validate the dedicated HMAC key without storing or logging the probe digest.
  hashedClientIp('127.0.0.1', env.BOT_CONNECT_IP_HMAC_KEY);
}
