import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { BOT_TOKEN_PATTERN, decryptBotToken, encryptBotToken, requireEncryptionKey } from './bot-security';

const sampleToken = '123456789:' + 'AbC_def-1234567890'.repeat(2);
test('validates Telegram bot token format', () => {
  assert.equal(BOT_TOKEN_PATTERN.test(sampleToken), true);
  assert.equal(BOT_TOKEN_PATTERN.test('not-a-bot-token'), false);
});
test('encrypts and decrypts without leaking cleartext', () => {
  const key = randomBytes(32);
  const encrypted = encryptBotToken(sampleToken, key);
  assert.equal(encrypted.includes(Buffer.from(sampleToken)), false);
  assert.equal(decryptBotToken(encrypted, key), sampleToken);
  const tampered = Buffer.from(encrypted);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptBotToken(tampered, key));
  assert.throws(() => decryptBotToken(encrypted, randomBytes(32)));
});
test('rejects invalid encryption key', () => {
  const key = randomBytes(32);
  assert.deepEqual(requireEncryptionKey(key.toString('base64')), key);
  assert.throws(() => requireEncryptionKey('abc'));
});
