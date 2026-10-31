import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import {
  ForeignWebhookError, privateTextMessage, registerUserBotWebhook,
  removeUserBotWebhookIfOwned, userBotTelegramCall, userBotWebhookSecret, userBotWebhookUrl
} from './user-bot-telegram';

const botId = '3d45cfeb-6c0d-42ee-aec7-849e60e66ef0';
const token = '123456789:' + 'C'.repeat(35);

test('derives a stable, bot-specific Telegram webhook secret and a fixed staging URL', () => {
  const key = randomBytes(32).toString('base64');
  const a = userBotWebhookSecret(botId, key);
  assert.equal(a, userBotWebhookSecret(botId.toUpperCase(), key));
  assert.notEqual(a, userBotWebhookSecret('3d45cfeb-6c0d-42ee-aec7-849e60e66ef1', key));
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(userBotWebhookUrl(botId), 'https://sautilink-base-api-staging.onrender.com/telegram/bots/' + botId);
  assert.throws(() => userBotWebhookUrl('../master'));
  assert.throws(() => userBotWebhookSecret(botId, 'short'));
});

test('only private human text messages can produce a reply', () => {
  const message = { message: { chat: { id: 456, type: 'private' }, text: ' /start ' } };
  assert.deepEqual(privateTextMessage(message), { chatId: 456, text: '/start' });
  assert.equal(privateTextMessage({ message: { ...message.message, chat: { id: 456, type: 'group' } } }), null);
  assert.equal(privateTextMessage({ message: { ...message.message, from: { is_bot: true } } }), null);
  assert.equal(privateTextMessage({ message: { ...message.message, text: 'x'.repeat(4097) } }), null);
  assert.equal(privateTextMessage({ callback_query: { data: '/start' } }), null);
});

test('Telegram call sends bounded JSON without exposing token-bearing errors', async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push(String(url));
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal instanceof AbortSignal);
    return new Response(JSON.stringify({ ok: true, result: { url: '' } }), { status: 200 });
  };
  assert.deepEqual(await userBotTelegramCall(token, 'getWebhookInfo', undefined, fetcher), { url: '' });
  assert.equal(calls.length, 1);
  const failures: Array<typeof fetch> = [
    async () => { throw new Error('failed ' + token); },
    async () => new Response(JSON.stringify({ ok: false }), { status: 429 }),
    async () => new Response('{', { status: 200 })
  ];
  for (const fail of failures) {
    await assert.rejects(userBotTelegramCall(token, 'sendMessage', { chat_id: 456, text: 'Hi' }, fail), error =>
      error instanceof Error && error.message === 'Telegram bot request unavailable' && !error.message.includes(token));
  }
});

test('registration refuses a foreign webhook and verifies the reviewed destination', async () => {
  let currentUrl = 'https://another-app.example/telegram';
  const methods: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const method = String(url).split('/').at(-1)!;
    methods.push(method);
    if (method === 'getWebhookInfo') {
      return new Response(JSON.stringify({ ok: true, result: { url: currentUrl } }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (method === 'setWebhook') {
      assert.equal(body.url, userBotWebhookUrl(botId));
      assert.deepEqual(body.allowed_updates, ['message']);
      assert.equal(body.drop_pending_updates, false);
      assert.equal(body.max_connections, 1);
      currentUrl = String(body.url);
    } else if (method === 'deleteWebhook') {
      assert.equal(body.drop_pending_updates, false);
      currentUrl = '';
    }
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  await assert.rejects(registerUserBotWebhook(token, botId, 'synthetic_secret', fetcher), ForeignWebhookError);
  assert.deepEqual(methods, ['getWebhookInfo']);
  assert.equal(await removeUserBotWebhookIfOwned(token, botId, fetcher), true);
  assert.deepEqual(methods, ['getWebhookInfo', 'getWebhookInfo']);

  currentUrl = '';
  await registerUserBotWebhook(token, botId, 'synthetic_secret', fetcher);
  assert.equal(currentUrl, userBotWebhookUrl(botId));
  assert.deepEqual(methods.slice(-3), ['getWebhookInfo', 'setWebhook', 'getWebhookInfo']);
  assert.equal(await removeUserBotWebhookIfOwned(token, botId, fetcher), true);
  assert.equal(currentUrl, '');
  assert.deepEqual(methods.slice(-3), ['getWebhookInfo', 'deleteWebhook', 'getWebhookInfo']);
});
