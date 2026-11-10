import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractUpdateId } from './master-update-ledger';

test('accepts only safe Telegram update identifiers', () => {
  assert.equal(extractUpdateId({ update_id: 0 }), 0);
  assert.equal(extractUpdateId({ update_id: 4939 }), 4939);
  assert.equal(extractUpdateId({ update_id: -1 }), null);
  assert.equal(extractUpdateId({ update_id: 1.5 }), null);
  assert.equal(extractUpdateId({ update_id: '23' }), null);
  assert.equal(extractUpdateId({ update_id: Number.MAX_SAFE_INTEGER + 1 }), null);
  assert.equal(extractUpdateId(null), null);
});
