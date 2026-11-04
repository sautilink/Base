import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectUserBotWebhook } from './user-bot-webhook-health';
import { userBotWebhookUrl } from './user-bot-telegram';

const botId = '3d45cfeb-6c0d-42ee-aec7-849e60e66ef0';
const token = '123456789:' + 'H'.repeat(35);
function provider(result: Record<string, unknown>): typeof fetch {
  return async (url, init) => {
    assert.equal(init?.method, 'POST');
    assert.equal(String(url).endsWith('/getWebhookInfo'), true);
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  };
}

test('shows minimal Telegram webhook ownership and bounded diagnostics', async () => {
  const snapshot = await inspectUserBotWebhook(botId, token, provider({
    url: userBotWebhookUrl(botId), pending_update_count: 3,
    last_error_date: 1761955200, last_error_message: 'private upstream error',
    ip_address: '203.0.113.10', custom_certificate: false
  }));
  assert.deepEqual(snapshot, {
    ownership: 'base', pendingUpdates: 3, lastErrorAt: new Date(1761955200 * 1000).toISOString()
  });
  assert.equal(JSON.stringify(snapshot).includes(token), false);
  assert.equal(JSON.stringify(snapshot).includes('203.0.113'), false);
  assert.equal(JSON.stringify(snapshot).includes('private upstream'), false);
});

test('classifies an unconfigured and foreign webhook without exposing destinations', async () => {
  assert.deepEqual(await inspectUserBotWebhook(botId, token, provider({ url: '' })), {
    ownership: 'none', pendingUpdates: null, lastErrorAt: null
  });
  assert.deepEqual(await inspectUserBotWebhook(botId, token, provider({
    url: 'https://another.example/private?key=secret', pending_update_count: 1e40,
    last_error_date: -3
  })), { ownership: 'other', pendingUpdates: null, lastErrorAt: null });
});

test('invalid provider results and token-bearing errors are not returned as health', async () => {
  await assert.rejects(inspectUserBotWebhook(botId, token, provider({ pending_update_count: 2 })),
    /Telegram webhook status unavailable/);
  const fail: typeof fetch = async () => { throw Error('upstream included token: ' + token); };
  await assert.rejects(inspectUserBotWebhook(botId, token, fail),
    error => error instanceof Error && !error.message.includes(token));
});
