import assert from 'node:assert/strict';
import { test } from 'node:test';
import { botRegistrationValues } from './bot-registration';

const ownerA = '00000000-0000-4000-8000-000000000001';
const ownerB = '00000000-0000-4000-8000-000000000002';

test('creates distinct owner-scoped registration arguments for separate users', () => {
  const telegram = { id: 550055, username: 'MyTestBot', first_name: 'Test' };
  const a = botRegistrationValues(ownerA, telegram);
  const b = botRegistrationValues(ownerB, telegram);
  assert.deepEqual(a, [ownerA, 550055, 'MyTestBot', 'Test']);
  assert.deepEqual(b, [ownerB, 550055, 'MyTestBot', 'Test']);
  assert.notEqual(a[0], b[0]);
});

test('rejects fake owner IDs and bot identifiers', () => {
  const bot = { id: 550055, username: 'MyTestBot' };
  for (const id of ['', 'not-verified', ownerA + "' OR 1=1"]) {
    assert.throws(() => botRegistrationValues(id, bot));
  }
  for (const id of [0, -4, 5.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => botRegistrationValues(ownerA, { ...bot, id }));
  }
  assert.throws(() => botRegistrationValues(ownerA, { ...bot, username: 'bad' }));
});

test('bounds upstream Telegram display name', () => {
  const args = botRegistrationValues(ownerA, { id: 1234, username: 'MyTestBot', first_name: 'X'.repeat(1000) });
  assert.equal(args[3].length, 255);
});
