import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { decryptBotToken } from './bot-security';
import { replaceOwnerBotCredential, validateReplacementToken } from './bot-token-rotation';

const botId = '3d45cfeb-6c0d-42ee-aec7-849e60e66ef0';
const ownerId = '038733d0-df70-4f4d-b029-54b8747ca90d';
const bot = { telegram_bot_id: '123456789', username: 'SampleSupportBot' };
const token = '123456789:' + 'R'.repeat(35);

function mockTelegram(id = 123456789, username = 'SampleSupportBot', initialUrl = '') {
  const calls: string[] = [];
  const fetcher: typeof fetch = async url => {
    const method = String(url).split('/').at(-1)!;
    calls.push(method);
    if (method === 'getMe') return new Response(JSON.stringify({
      ok: true, result: { id, username, is_bot: true }
    }), { status: 200 });
    if (method === 'getWebhookInfo') return new Response(JSON.stringify({
      ok: true, result: { url: initialUrl }
    }), { status: 200 });
    throw new Error('Unexpected Telegram method');
  };
  return { fetcher, calls };
}

test('validates bot identity and accepts empty or own webhook only', async () => {
  for (const url of ['', 'https://sautilink-base-api-staging.onrender.com/telegram/bots/' + botId]) {
    const mock = mockTelegram(123456789, 'samplesupportbot', url);
    assert.deepEqual(await validateReplacementToken(botId, bot, token, mock.fetcher), { ok: true });
    assert.deepEqual(mock.calls, ['getMe', 'getWebhookInfo']);
  }
});

test('rejects other bot identities and foreign webhook without modifying anything', async () => {
  const mismatched = mockTelegram(42);
  assert.deepEqual(await validateReplacementToken(botId, bot, token, mismatched.fetcher), {
    ok: false, status: 409, message: 'Replacement token belongs to a different bot'
  });
  assert.deepEqual(mismatched.calls, ['getMe']);
  const foreign = mockTelegram(123456789, bot.username, 'https://elsewhere.example/webhook');
  assert.deepEqual(await validateReplacementToken(botId, bot, token, foreign.fetcher), {
    ok: false, status: 409, message: 'This bot already has another Telegram webhook'
  });
});

test('bad token and upstream errors never disclose token-bearing provider details', async () => {
  const invalid = mockTelegram();
  assert.equal((await validateReplacementToken(botId, bot, 'bad', invalid.fetcher)).ok, false);
  assert.equal(invalid.calls.length, 0);
  const failing: typeof fetch = async () => { throw new Error('leaked URL with ' + token); };
  const result = await validateReplacementToken(botId, bot, token, failing);
  assert.deepEqual(result, { ok: false, status: 502, message: 'Telegram validation unavailable' });
  assert.equal(JSON.stringify(result).includes(token), false);
});

test('encrypted credential replacement is owner-scoped, and the token never becomes a SQL string', async () => {
  const previous = process.env.BOT_TOKEN_ENCRYPTION_KEY;
  const key = randomBytes(32);
  process.env.BOT_TOKEN_ENCRYPTION_KEY = key.toString('base64');
  try {
    let queries = 0;
    assert.equal(await replaceOwnerBotCredential(botId, ownerId, token, async (sql, values) => {
      queries++;
      assert.equal(sql.includes(token), false);
      assert.match(sql, /base_private\\.rotate_owner_bot_credential/);
      assert.equal(values[0], botId);
      assert.equal(values[1], ownerId);
      assert.ok(Buffer.isBuffer(values[2]));
      assert.equal(decryptBotToken(values[2] as Buffer, key), token);
      return { rows: [{ rotated: true }] };
    }), true);
    assert.equal(queries, 1);
    assert.equal(await replaceOwnerBotCredential(botId, ownerId, token,
      async () => ({ rows: [{ rotated: false }] })), false);
  } finally {
    if (previous === undefined) delete process.env.BOT_TOKEN_ENCRYPTION_KEY;
    else process.env.BOT_TOKEN_ENCRYPTION_KEY = previous;
  }
});
