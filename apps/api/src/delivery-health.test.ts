import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDeliveryHealth, type DeliveryHealthRow } from './delivery-health';

const summary: DeliveryHealthRow = {
  sent_24h: '8',
  ignored_24h: '2',
  unknown_7d: '1',
  processing_7d: '3',
  stale_processing_7d: '2',
  last_update_at: new Date('2026-11-01T00:00:00.000Z')
};

test('formats server-only diagnostic aggregate without leaking update identities', () => {
  const result = formatDeliveryHealth(summary);
  assert.deepEqual(result, {
    sent24h: 8, ignored24h: 2, unknown7d: 1,
    processing7d: 3, staleProcessing7d: 2,
    lastUpdateAt: '2026-11-01T00:00:00.000Z',
    needsReview: true
  });
  assert.equal('updateId' in result, false);
  assert.equal('token' in result, false);
});

test('unknown or stale processing needs human review, never an automatic resend', () => {
  assert.equal(formatDeliveryHealth({ ...summary, unknown_7d: 0, stale_processing_7d: 0 }).needsReview, false);
  assert.equal(formatDeliveryHealth({ ...summary, unknown_7d: 1, stale_processing_7d: 0 }).needsReview, true);
  assert.equal(formatDeliveryHealth({ ...summary, unknown_7d: 0, stale_processing_7d: 1 }).needsReview, true);
  assert.equal(formatDeliveryHealth({ ...summary, last_update_at: null }).lastUpdateAt, null);
});

test('rejects inconsistent, negative or unsafe database counts', () => {
  assert.throws(() => formatDeliveryHealth({ ...summary, sent_24h: '-1' }));
  assert.throws(() => formatDeliveryHealth({ ...summary, ignored_24h: '9007199254740992' }));
  assert.throws(() => formatDeliveryHealth({ ...summary, stale_processing_7d: 4 }));
  assert.throws(() => formatDeliveryHealth({ ...summary, last_update_at: 'not-a-date' }));
});
