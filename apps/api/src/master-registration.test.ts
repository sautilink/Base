import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerMasterWebhook, STAGING_MASTER_WEBHOOK_URL } from './master-registration';

const token = '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn';
const env: NodeJS.ProcessEnv = {
  MASTER_BOT_ENABLED: 'true',
  MASTER_BOT_REGISTER_WEBHOOK: 'true',
  BOT_TOKEN: token,
  TELEGRAM_WEBHOOK_SECRET: 'AValidWebhookSecretWithMoreThan32Bytes_',
  BASE_DASHBOARD_URL: 'https://feat-phase-1-foundation-sautilink-base-web.dr-charles-services.workers.dev'
};
type TelegramCall = { method: string; body?: Record<string, unknown> };

function fakeTelegram(existing = '', username = 'SautiLinkBaseBot') {
  const calls: TelegramCall[] = [];
  const mock = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const address = String(input);
    assert.ok(address.startsWith('https://api.telegram.org/bot'));
    const method = address.split('/').at(-1) ?? '';
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ method, body });
    const result = method === 'getMe'
      ? { id: 123456789, is_bot: true, username }
      : method === 'getWebhookInfo'
        ? { url: existing }
        : true;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  };
  return { mock, calls };
}

test('master registration is inert unless BOTH explicit switches are on', async () => {
  for (const patch of [
    { MASTER_BOT_ENABLED: 'false' },
    { MASTER_BOT_REGISTER_WEBHOOK: 'false' }
  ]) {
    const { mock, calls } = fakeTelegram();
    await assert.rejects(registerMasterWebhook({ ...env, ...patch }, mock, async () => {}));
    assert.equal(calls.length, 0);
  }
});

test('bot identity and approved dashboard are required', async () => {
  const wrong = fakeTelegram('', 'AnotherBot');
  await assert.rejects(registerMasterWebhook(env, wrong.mock, async () => {}), /does not belong/);
  assert.deepEqual(wrong.calls.map(c => c.method), ['getMe']);
  const noDashboard = fakeTelegram();
  await assert.rejects(registerMasterWebhook({ ...env, BASE_DASHBOARD_URL: 'https://evil.example/' }, noDashboard.mock, async () => {}));
  assert.equal(noDashboard.calls.length, 0);
});

test('refuses existing webhook owned by another service', async () => {
  const { mock, calls } = fakeTelegram('https://some-other-service.example/telegram');
  await assert.rejects(registerMasterWebhook(env, mock, async () => {}), /another webhook/);
  assert.deepEqual(calls.map(c => c.method), ['getMe', 'getWebhookInfo']);
});

test('registers only the reviewed URL with Telegram secret and no dropped updates', async () => {
  const { mock, calls } = fakeTelegram();
  let checkedLedger = false;
  await registerMasterWebhook(env, mock, async () => { checkedLedger = true; });
  assert.equal(checkedLedger, true);
  assert.deepEqual(calls.map(c => c.method), ['getMe', 'getWebhookInfo', 'setWebhook']);
  assert.deepEqual(calls[2].body, {
    url: STAGING_MASTER_WEBHOOK_URL,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message'],
    max_connections: 1,
    drop_pending_updates: false
  });
});

test('cannot register if ledger write preflight fails', async () => {
  const { mock, calls } = fakeTelegram();
  await assert.rejects(registerMasterWebhook(env, mock, async () => {
    throw new Error('Permission denied');
  }));
  assert.equal(calls.length, 0);
});

test('rejects bad secrets and does not try Telegram', async () => {
  for (const secret of ['short', 'invalid secret with spaces 123456', '']) {
    const { mock, calls } = fakeTelegram();
    await assert.rejects(registerMasterWebhook({ ...env, TELEGRAM_WEBHOOK_SECRET: secret }, mock, async () => {}));
    assert.equal(calls.length, 0);
  }
});
