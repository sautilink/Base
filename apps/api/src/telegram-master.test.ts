import assert from 'node:assert/strict';
import { test } from 'node:test';
import { masterReply, trustedDashboardLink, verifyTelegramSecret } from './telegram-master';

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

test('ignores commands addressed to another bot', () => {
  const message = (text: string) => ({ update_id: 13, message: { chat: { id: 6, type: 'private' }, text } });
  assert.equal(masterReply(message('/start@OtherRandomBot')), null);
  assert.equal(masterReply(message('/help@SautiLinkBaseBot'))?.chatId, 6);
  assert.equal(masterReply(message('/help!')), null);
  assert.equal(masterReply(message('/help')).buttons?.[0]?.url, 'https://t.me/BotFather');
});

test('only allows reviewed HTTPS dashboard destinations in buttons', () => {
  const preview = 'https://feat-phase-1-foundation-sautilink-base-web.dr-charles-services.workers.dev';
  assert.equal(trustedDashboardLink(preview), preview + '/dashboard');
  assert.equal(trustedDashboardLink('https://base.sautilink.com/dashboard'), 'https://base.sautilink.com/dashboard');
  assert.equal(trustedDashboardLink('https://base.sautilink.com.evil.com/'), null);
  assert.equal(trustedDashboardLink('http://base.sautilink.com/'), null);
  assert.equal(trustedDashboardLink('https://base.sautilink.com:444/'), null);
  assert.equal(trustedDashboardLink('https://example.com/'), null);
  const message = { message: { chat: { id: 8, type: 'private' }, text: '/dashboard' } };
  assert.match(masterReply(message)?.text ?? '', /being prepared/);
  const approved = masterReply(message, preview);
  assert.equal(approved?.buttons?.[0].url, preview + '/dashboard');
  const unapproved = masterReply(message, 'https://evil.com/');
  assert.equal(unapproved?.buttons, undefined);
});

test('does not treat non-text messages or large user input as commands', () => {
  assert.equal(masterReply({ message: { chat: { id: 9, type: 'private' }, text: '/help' + 'x'.repeat(4100) } }), null);
  assert.equal(masterReply({ message: { chat: { id: 9, type: 'private' }, caption: '/help' } }), null);
});
