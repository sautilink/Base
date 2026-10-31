import { requireEncryptionKey } from './bot-security';
import { hashedClientIp } from './connect-abuse';
import { publicClientConfig } from './public-config.controller';

/** Fail the staging startup before accepting bot tokens if a required guard is missing. */
export function assertBotConnectConfigured(env: NodeJS.ProcessEnv): void {
  if (env.BOT_CONNECT_ENABLED !== 'true') return;
  publicClientConfig(env);
  requireEncryptionKey(env.BOT_TOKEN_ENCRYPTION_KEY);
  // Validate the dedicated HMAC key without storing or logging the probe digest.
  hashedClientIp('127.0.0.1', env.BOT_CONNECT_IP_HMAC_KEY);
}
