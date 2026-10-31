import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { assertBotConnectConfigured, botConnectTestOwners } from './bot-connect-config';

const ownerA = '00000000-0000-4000-8000-000000000001';
const ownerB = '00000000-0000-4000-8000-000000000002';

const configured: NodeJS.ProcessEnv = {
  BOT_CONNECT_ENABLED: 'true',
  SUPABASE_URL: 'https://gtzqirfwghijuzhvrnha.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  BOT_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  BOT_CONNECT_IP_HMAC_KEY: randomBytes(32).toString('base64'),
  BOT_CONNECT_TEST_USER_IDS: `${ownerA},${ownerB}`
};

test('disabled user-bot connections require no connection-only secrets', () => {
  assert.doesNotThrow(() => assertBotConnectConfigured({ BOT_CONNECT_ENABLED: 'false' }));
});

test('enabled user-bot connections require all Base-specific guards', () => {
  assert.doesNotThrow(() => assertBotConnectConfigured(configured));
  for (const missing of [
    'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY',
    'BOT_TOKEN_ENCRYPTION_KEY', 'BOT_CONNECT_IP_HMAC_KEY', 'BOT_CONNECT_TEST_USER_IDS'
  ]) {
    assert.throws(() => assertBotConnectConfigured({ ...configured, [missing]: undefined }));
  }
  assert.throws(() => assertBotConnectConfigured({ ...configured, SUPABASE_URL: 'https://other-project.supabase.co' }));
});

test('staging bot connection accepts only two distinct test owners', () => {
  const allowed = botConnectTestOwners(configured);
  assert.equal(allowed.has(ownerA), true);
  assert.equal(allowed.has(ownerB), true);
  assert.equal(allowed.has('00000000-0000-4000-8000-000000000003'), false);
  for (const ids of [ownerA, `${ownerA},${ownerA}`, `${ownerA},bad`, `${ownerA},${ownerB},${ownerA}`]) {
    assert.throws(() => botConnectTestOwners({ BOT_CONNECT_TEST_USER_IDS: ids }));
  }
});
