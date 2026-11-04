import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyTelegramBotToken } from './telegram-verify';

const fakeToken = '123456789:' + 'AbC_def-1234567890'.repeat(2);
const reply = (status: number, body: unknown) =>
  async () => new Response(JSON.stringify(body), { status });

test('classifies rejected Telegram credentials without revealing the token', async () => {
  for (const status of [401, 404]) {
    const result = await verifyTelegramBotToken(fakeToken, reply(status, { ok: false }) as typeof fetch);
    assert.deepEqual(result, {
      ok: false, outcome: 'invalid_token', status: 400, message: 'Invalid bot token'
    });
    assert.equal(JSON.stringify(result).includes(fakeToken), false);
  }
  const encoded = await verifyTelegramBotToken(fakeToken, reply(200, { ok: false, error_code: 401 }) as typeof fetch);
  assert.equal(encoded.ok, false);
  if (!encoded.ok) assert.equal(encoded.outcome, 'invalid_token');
});

test('handles Telegram network failures, throttling and malformed responses as unavailable', async () => {
  const cases: Array<typeof fetch> = [
    async () => { throw new Error('failed request with ' + fakeToken); },
    reply(429, { ok: false }) as typeof fetch,
    reply(503, { ok: false }) as typeof fetch,
    reply(200, { ok: false, error_code: 429 }) as typeof fetch,
    async () => new Response('{', { status: 200 })
  ];
  for (const fetcher of cases) {
    const result = await verifyTelegramBotToken(fakeToken, fetcher);
    assert.deepEqual(result, {
      ok: false, outcome: 'provider_failure', status: 502, message: 'Telegram validation unavailable'
    });
    assert.equal(JSON.stringify(result).includes(fakeToken), false);
  }
});

test('accepts only a verified separate bot identity with a bounded network request', async () => {
  let calls = 0;
  const result = await verifyTelegramBotToken(fakeToken, async (url, options) => {
    calls++;
    assert.equal(String(url), `https://api.telegram.org/bot${fakeToken}/getMe`);
    assert.equal(options?.method, 'POST');
    assert.equal(options?.redirect, 'error');
    assert.ok(options?.signal instanceof AbortSignal);
    return new Response(JSON.stringify({ ok: true, result: {
      id: 12345, is_bot: true, username: 'SampleSupportBot', first_name: 'Sample'
    } }), { status: 200 });
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { ok: true, bot: { id: 12345, username: 'SampleSupportBot', first_name: 'Sample' } });
  assert.equal(JSON.stringify(result).includes(fakeToken), false);

  const invalid = await verifyTelegramBotToken(fakeToken, reply(200, {
    ok: true, result: { id: 12345, is_bot: false, username: 'Person' }
  }) as typeof fetch);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.outcome, 'invalid_bot');

  const malformed = await verifyTelegramBotToken(fakeToken, reply(200, {
    ok: true, result: { id: 12345, is_bot: true, username: 99 }
  }) as typeof fetch);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.outcome, 'invalid_bot');

  const badUsername = await verifyTelegramBotToken(fakeToken, reply(200, {
    ok: true, result: { id: 12345, is_bot: true, username: 'bad' }
  }) as typeof fetch);
  assert.equal(badUsername.ok, false);
  if (!badUsername.ok) assert.equal(badUsername.outcome, 'invalid_bot');

  const master = await verifyTelegramBotToken(fakeToken, reply(200, {
    ok: true, result: { id: 12345, is_bot: true, username: 'SautiLinkBaseBot' }
  }) as typeof fetch);
  assert.equal(master.ok, false);
  if (!master.ok) assert.equal(master.outcome, 'master_bot');
});
