import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { assertBotConnectConfigured } from './bot-connect-config';

const configured: NodeJS.ProcessEnv = {
  BOT_CONNECT_ENABLED: 'true',
  SUPABASE_URL: 'https://gtzqirfwghijuzhvrnha.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  BOT_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  BOT_CONNECT_IP_HMAC_KEY: randomBytes(32).toString('base64')
};

test('disabled user-bot connections require no connection-only secrets', () => {
  assert.doesNotThrow(() => assertBotConnectConfigured({ BOT_CONNECT_ENABLED: 'false' }));
});

test('enabled user-bot connections require all Base-specific guards', () => {
  assert.doesNotThrow(() => assertBotConnectConfigured(configured));
  for (const missing of [
    'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY',
    'BOT_TOKEN_ENCRYPTION_KEY', 'BOT_CONNECT_IP_HMAC_KEY'
  ]) {
    assert.throws(() => assertBotConnectConfigured({ ...configured, [missing]: undefined }));
  }
  assert.throws(() => assertBotConnectConfigured({ ...configured, SUPABASE_URL: 'https://other-project.supabase.co' }));
});
