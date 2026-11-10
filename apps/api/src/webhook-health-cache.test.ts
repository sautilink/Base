import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invalidateWebhookHealth, readWebhookHealthCache, rememberWebhookHealth } from './webhook-health-cache';

const botId = '3d45cfeb-6c0d-42ee-aec7-849e60e66ef0';
const report = { ownership: 'base' as const, pendingUpdates: 4, lastErrorAt: null };

test('sanitized webhook health is cached briefly, expires and can be invalidated', () => {
  invalidateWebhookHealth(botId);
  assert.equal(readWebhookHealthCache(botId, 1000), null);
  rememberWebhookHealth(botId, report, 1000);
  assert.deepEqual(readWebhookHealthCache(botId, 10999), report);
  assert.equal(readWebhookHealthCache(botId, 11000), null);
  rememberWebhookHealth(botId, report, 2000);
  invalidateWebhookHealth(botId);
  assert.equal(readWebhookHealthCache(botId, 2001), null);
});

test('cached health is copied so callers cannot alter later responses', () => {
  invalidateWebhookHealth(botId);
  rememberWebhookHealth(botId, report, 1000);
  const result = readWebhookHealthCache(botId, 1001)!;
  result.pendingUpdates = 100;
  assert.equal(readWebhookHealthCache(botId, 1002)?.pendingUpdates, 4);
  invalidateWebhookHealth(botId);
});
