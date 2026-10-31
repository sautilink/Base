import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicClientConfig } from './public-config.controller';

const valid = {
  SUPABASE_URL: 'https://gtzqirfwghijuzhvrnha.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fake_key_for_tests',
  BOT_CONNECT_ENABLED: 'false',
  MASTER_BOT_ENABLED: 'false'
};

test('client configuration includes only browser-safe fields', () => {
  const config = publicClientConfig({ ...valid, DATABASE_URL: 'not-for-browsers', BOT_TOKEN_ENCRYPTION_KEY: 'also-private', BOT_TOKEN: 'private' });
  assert.deepEqual(Object.keys(config).sort(), [
    'botConnectEnabled', 'masterBotEnabled', 'supabasePublishableKey', 'supabaseUrl'
  ]);
  assert.equal(config.botConnectEnabled, false);
  assert.equal(config.masterBotEnabled, false);
  assert.ok(!JSON.stringify(config).includes('not-for-browsers'));
});

test('wrong project and secret keys fail closed', () => {
  assert.throws(() => publicClientConfig({ ...valid, SUPABASE_URL: 'https://other.supabase.co' }));
  assert.throws(() => publicClientConfig({ ...valid, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_never_public' }));
  assert.throws(() => publicClientConfig({ ...valid, SUPABASE_PUBLISHABLE_KEY: undefined }));
});

test('flags reflect only explicit true', () => {
  assert.equal(publicClientConfig({ ...valid, BOT_CONNECT_ENABLED: 'TRUE' }).botConnectEnabled, false);
  assert.equal(publicClientConfig({ ...valid, BOT_CONNECT_ENABLED: 'true' }).botConnectEnabled, true);
});
