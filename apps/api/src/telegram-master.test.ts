import assert from 'node:assert/strict';
import { test } from 'node:test';
import { masterReply, verifyTelegramSecret } from './telegram-master';

const secret = 'valid_Telegram_webhook_secret_32';
test('rejects invalid webhook secrets with fail-closed comparison', () => {
  assert.equal(verifyTelegramSecret(secret, secret), true);
  assert.equal(verifyTelegramSecret('invalid', secret), false);
  assert.equal(verifyTelegramSecret(undefined, secret), false);
  assert.equal(verifyTelegramSecret(secret, undefined), false);
  assert.equal(verifyTelegramSecret('short', 'short'), false);
  assert.equal(verifyTelegramSecret('valid_Telegram_webhook_secret_33', secret), false);
});
test('handles Unicode secret length without throwing', () => {
  const secret = 'AaAaAaAaAaAaAaAa';
  assert.doesNotThrow(() => verifyTelegramSecret('é'.repeat(8), secret));
  assert.equal(verifyTelegramSecret('é'.repeat(8), secret), false);
  assert.equal(verifyTelegramSecret('a'.repeat(16), secret), false);
});

test('responds to help only in private chats', () => {
  const reply = masterReply({ update_id: 1, message: { chat: { id: 123456, type: 'private' }, text: '/help' } });
  assert.ok(reply);
  assert.equal(reply?.chatId, 123456);
  assert.match(reply?.text ?? '', /\/createbot/);
  assert.equal(masterReply({ message: { chat: { id: -123, type: 'group' }, text: '/start' } }), null);
  assert.equal(masterReply({ message: { chat: { id: 10, type: 'private' }, text: 'hi' } }), null);
  assert.equal(masterReply({ message: { chat: { id: '10', type: 'private' }, text: '/help' } }), null);
});
test('never asks users to paste Telegram bot tokens into chat', () => {
  const data = masterReply({ message: { chat: { id: 1, type: 'private' }, text: '/createbot' } });
  assert.match(data?.text ?? '', /Never paste your bot token in this chat/);
});
