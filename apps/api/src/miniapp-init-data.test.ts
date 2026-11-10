import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { verifyMiniAppInitData } from './miniapp-init-data';
import { MiniAppController } from './miniapp.controller';

const token = '123456789:' + 'A'.repeat(35);
const now = 1_783_000_000_000;

function signedData(overrides: Record<string, string> = {}): string {
  const fields = {
    auth_date: String(Math.floor(now / 1000) - 20),
    query_id: 'AAHtest',
    user: JSON.stringify({ id: 123456789, first_name: 'Test User' }),
    ...overrides
  };
  const check = Object.entries(fields).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

test('accepts fresh Telegram-signed initData and rejects altered or duplicate fields', () => {
  const raw = signedData();
  assert.equal(verifyMiniAppInitData(raw, token, now), true);
  const altered = new URLSearchParams(raw);
  altered.set('user', JSON.stringify({ id: 999999 }));
  assert.equal(verifyMiniAppInitData(altered.toString(), token, now), false);
  assert.equal(verifyMiniAppInitData(raw + '&user=%7B%7D', token, now), false);
  assert.equal(verifyMiniAppInitData(raw, '123456789:' + 'B'.repeat(35), now), false);
});

test('requires a real user and rejects stale or future signatures', () => {
  assert.equal(verifyMiniAppInitData(signedData({ auth_date: String(Math.floor(now / 1000) - 601) }), token, now), false);
  assert.equal(verifyMiniAppInitData(signedData({ auth_date: String(Math.floor(now / 1000) + 61) }), token, now), false);
  assert.equal(verifyMiniAppInitData(signedData({ user: JSON.stringify({ id: -1 }) }), token, now), false);
  assert.equal(verifyMiniAppInitData(signedData({ user: JSON.stringify({ id: 42, is_bot: true }) }), token, now), false);
  assert.equal(verifyMiniAppInitData('', token, now), false);
  assert.equal(verifyMiniAppInitData(signedData(), undefined, now), false);
});

test('verification endpoint grants no Base account identity and fails closed', () => {
  const oldEnabled = process.env.MASTER_BOT_ENABLED;
  const oldToken = process.env.BOT_TOKEN;
  const controller = new MiniAppController();
  try {
    process.env.MASTER_BOT_ENABLED = 'true';
    process.env.BOT_TOKEN = token;
    assert.deepEqual(controller.verify({ initData: signedData({ auth_date: String(Math.floor(Date.now() / 1000)) }) }),
      { verified: true });
    assert.throws(() => controller.verify({ initData: 'user=forged' }), error =>
      typeof error === 'object' && error !== null && 'getStatus' in error &&
      (error as { getStatus: () => number }).getStatus() === 401);
    process.env.MASTER_BOT_ENABLED = 'false';
    assert.throws(() => controller.verify({ initData: signedData() }), error =>
      typeof error === 'object' && error !== null && 'getStatus' in error &&
      (error as { getStatus: () => number }).getStatus() === 404);
  } finally {
    if (oldEnabled === undefined) delete process.env.MASTER_BOT_ENABLED;
    else process.env.MASTER_BOT_ENABLED = oldEnabled;
    if (oldToken === undefined) delete process.env.BOT_TOKEN;
    else process.env.BOT_TOKEN = oldToken;
  }
});
