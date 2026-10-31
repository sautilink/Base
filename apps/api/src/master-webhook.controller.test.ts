import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MasterWebhookController } from './master-webhook.controller';

const controller = new MasterWebhookController();
const dummyToken = '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn';
const dummySecret = 'exampleMasterWebhookSecret_32Letters';

async function withEnv(
  next: Record<string, string | undefined>,
  run: () => Promise<void>
): Promise<void> {
  const original = Object.fromEntries(Object.keys(next).map(key => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await run();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('disabled master endpoint hides its existence', async () => {
  await withEnv({ MASTER_BOT_ENABLED: 'false' }, async () => {
    await assert.rejects(controller.accept(undefined, { update_id: 1 }), error =>
      typeof error === 'object' && error !== null && 'getStatus' in error &&
      (error as { getStatus: () => number }).getStatus() === 404
    );
  });
});

test('invalid or absent webhook secret is rejected before database and Telegram', async () => {
  await withEnv({
    MASTER_BOT_ENABLED: 'true',
    TELEGRAM_WEBHOOK_SECRET: dummySecret,
    BOT_TOKEN: dummyToken
  }, async () => {
    for (const secret of [undefined, 'wrong-secret']) {
      await assert.rejects(controller.accept(secret, { update_id: 1 }), error =>
        typeof error === 'object' && error !== null && 'getStatus' in error &&
        (error as { getStatus: () => number }).getStatus() === 401
      );
    }
  });
});

test('unconfigured token fails closed before attempting database claim', async () => {
  await withEnv({
    MASTER_BOT_ENABLED: 'true',
    TELEGRAM_WEBHOOK_SECRET: dummySecret,
    BOT_TOKEN: undefined
  }, async () => {
    await assert.rejects(controller.accept(dummySecret, { update_id: 1 }), error =>
      typeof error === 'object' && error !== null && 'getStatus' in error &&
      (error as { getStatus: () => number }).getStatus() === 503
    );
  });
});

test('invalid Telegram update ID is refused before database or outbound send', async () => {
  await withEnv({
    MASTER_BOT_ENABLED: 'true',
    TELEGRAM_WEBHOOK_SECRET: dummySecret,
    BOT_TOKEN: dummyToken
  }, async () => {
    await assert.rejects(controller.accept(dummySecret, { update_id: -42 }), error =>
      typeof error === 'object' && error !== null && 'getStatus' in error &&
      (error as { getStatus: () => number }).getStatus() === 400
    );
  });
});
