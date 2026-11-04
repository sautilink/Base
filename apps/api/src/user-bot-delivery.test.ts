import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleUserBotUpdate, type DeliveryAdapter } from './user-bot-delivery';

const botId = '3d45cfeb-6c0d-42ee-aec7-849e60e66ef0';
const message = { update_id: 77, message: { chat: { id: 123, type: 'private' }, text: '/start' } };

function fixture(status = 'active') {
  const claimed = new Set<number>();
  const sends: Array<{ chatId: number; text: string }> = [];
  const completed: string[] = [];
  const adapter: DeliveryAdapter = {
    async loadBot() { return { id: botId, username: 'SampleSupportBot', status, welcome_message: 'Welcome!' }; },
    async loadRules() { return { commands: [], rules: [] }; },
    async activeToken() { return 'synthetic-token'; },
    async claim(_botId, updateId) {
      if (claimed.has(updateId)) return false;
      claimed.add(updateId);
      return true;
    },
    async complete(_botId, _updateId, state) { completed.push(state); },
    async send(_token, chatId, text) { sends.push({ chatId, text }); }
  };
  return { adapter, sends, completed, claimed };
}

test('sends one configured private reply and deduplicates a repeated Telegram update', async () => {
  const f = fixture();
  assert.deepEqual(await handleUserBotUpdate(botId, 77, message, f.adapter), { ok: true });
  assert.deepEqual(await handleUserBotUpdate(botId, 77, message, f.adapter), { ok: true, duplicate: true });
  assert.deepEqual(f.sends, [{ chatId: 123, text: 'Welcome!' }]);
  assert.deepEqual(f.completed, ['sent']);
});

test('ignores inactive bots and non-private updates without sending messages', async () => {
  const inactive = fixture('inactive');
  assert.deepEqual(await handleUserBotUpdate(botId, 78, message, inactive.adapter), { ok: true, inactive: true });
  assert.equal(inactive.claimed.size, 0);

  const group = fixture();
  const body = { update_id: 79, message: { chat: { id: -123, type: 'group' }, text: '/start' } };
  assert.deepEqual(await handleUserBotUpdate(botId, 79, body, group.adapter), { ok: true });
  assert.deepEqual(group.completed, ['ignored']);
  assert.equal(group.sends.length, 0);
});

test('retries database failures before claim and never resends after an ambiguous send', async () => {
  const before = fixture();
  before.adapter.loadRules = async () => { throw new Error('database unavailable'); };
  await assert.rejects(handleUserBotUpdate(botId, 80, message, before.adapter));
  assert.equal(before.claimed.size, 0);

  const after = fixture();
  after.adapter.send = async () => { throw new Error('ambiguous Telegram timeout'); };
  assert.deepEqual(await handleUserBotUpdate(botId, 81, message, after.adapter), { ok: true });
  assert.deepEqual(await handleUserBotUpdate(botId, 81, message, after.adapter), { ok: true, duplicate: true });
  assert.deepEqual(after.completed, ['unknown']);
});


test('pause detected during update preparation blocks Telegram sends', async () => {
  const f = fixture();
  let reads = 0;
  f.adapter.loadBot = async () => ({
    id: botId, username: 'SampleSupportBot',
    status: ++reads === 1 ? 'active' : 'inactive',
    welcome_message: 'Welcome!'
  });
  assert.deepEqual(await handleUserBotUpdate(botId, 82, message, f.adapter), { ok: true, inactive: true });
  assert.equal(reads, 2);
  assert.equal(f.sends.length, 0);
  assert.deepEqual(f.completed, ['ignored']);
  assert.ok(f.claimed.has(82));
});

test('a bot that stays active passes the just-before-send status check', async () => {
  const f = fixture();
  let reads = 0;
  const original = f.adapter.loadBot;
  f.adapter.loadBot = async id => { reads++; return original(id); };
  assert.deepEqual(await handleUserBotUpdate(botId, 83, message, f.adapter), { ok: true });
  assert.equal(reads, 2);
  assert.equal(f.sends.length, 1);
  assert.deepEqual(f.completed, ['sent']);
});

test('post-claim database lookup failure records an unknown incident without sending', async () => {
  const f = fixture();
  let reads = 0;
  f.adapter.loadBot = async () => {
    if (++reads === 2) throw new Error('transient database outage after claim');
    return { id: botId, username: 'SampleSupportBot', status: 'active', welcome_message: 'Welcome!' };
  };
  assert.deepEqual(await handleUserBotUpdate(botId, 84, message, f.adapter), { ok: true });
  assert.deepEqual(f.completed, ['unknown']);
  assert.equal(f.sends.length, 0);
  assert.ok(f.claimed.has(84));
});

test('post-claim incident update failure propagates to operator monitoring, never sends', async () => {
  const f = fixture();
  let reads = 0;
  f.adapter.loadBot = async () => {
    if (++reads === 2) throw new Error('transient database outage after claim');
    return { id: botId, username: 'SampleSupportBot', status: 'active', welcome_message: 'Welcome!' };
  };
  f.adapter.complete = async () => { throw new Error('database status write unavailable'); };
  await assert.rejects(handleUserBotUpdate(botId, 85, message, f.adapter), /database status write unavailable/);
  assert.equal(f.sends.length, 0);
  assert.ok(f.claimed.has(85));
});
