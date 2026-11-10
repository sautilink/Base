import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { UserBotWebhookController } from './user-bot-webhook.controller';
import { userBotWebhookSecret } from './user-bot-telegram';

const botId = '3d45cfeb-6c0d-42ee-aec7-849e60e66ef0';
const key = randomBytes(32).toString('base64');
const controller = new UserBotWebhookController();

test('disabled user-bot webhook is hidden before database access', async () => {
  const old = process.env.USER_BOT_DELIVERY_ENABLED;
  try {
    process.env.USER_BOT_DELIVERY_ENABLED = 'false';
    await assert.rejects(controller.accept(botId, undefined, { update_id: 1 }), error =>
      typeof error === 'object' && error !== null && 'getStatus' in error &&
      (error as { getStatus: () => number }).getStatus() === 404);
  } finally {
    if (old === undefined) delete process.env.USER_BOT_DELIVERY_ENABLED;
    else process.env.USER_BOT_DELIVERY_ENABLED = old;
  }
});

test('missing or wrong webhook secret is rejected before database access', async () => {
  const oldFlag = process.env.USER_BOT_DELIVERY_ENABLED;
  const oldKey = process.env.USER_BOT_WEBHOOK_SECRET_KEY;
  try {
    process.env.USER_BOT_DELIVERY_ENABLED = 'true';
    process.env.USER_BOT_WEBHOOK_SECRET_KEY = key;
    for (const provided of [undefined, 'wrong']) {
      await assert.rejects(controller.accept(botId, provided, { update_id: 1 }), error =>
        typeof error === 'object' && error !== null && 'getStatus' in error &&
        (error as { getStatus: () => number }).getStatus() === 401);
    }
    await assert.rejects(controller.accept(botId, userBotWebhookSecret(botId, key), { update_id: -1 }), error =>
      typeof error === 'object' && error !== null && 'getStatus' in error &&
      (error as { getStatus: () => number }).getStatus() === 400);
  } finally {
    if (oldFlag === undefined) delete process.env.USER_BOT_DELIVERY_ENABLED;
    else process.env.USER_BOT_DELIVERY_ENABLED = oldFlag;
    if (oldKey === undefined) delete process.env.USER_BOT_WEBHOOK_SECRET_KEY;
    else process.env.USER_BOT_WEBHOOK_SECRET_KEY = oldKey;
  }
});
