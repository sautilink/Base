import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UserBotLifecycleController } from './user-bot-lifecycle.controller';

const controller = new UserBotLifecycleController();
const botId = '3d45cfeb-6c0d-42ee-aec7-849e60e66ef0';

test('activation and pause remain unavailable until the explicit delivery gate is on', async () => {
  const old = process.env.USER_BOT_DELIVERY_ENABLED;
  try {
    process.env.USER_BOT_DELIVERY_ENABLED = 'false';
    for (const action of ['activate', 'deactivate', 'deliveryHealth'] as const) {
      await assert.rejects(controller[action](undefined, botId), error =>
        typeof error === 'object' && error !== null && 'getStatus' in error &&
        (error as { getStatus: () => number }).getStatus() === 503);
    }
  } finally {
    if (old === undefined) delete process.env.USER_BOT_DELIVERY_ENABLED;
    else process.env.USER_BOT_DELIVERY_ENABLED = old;
  }
});
