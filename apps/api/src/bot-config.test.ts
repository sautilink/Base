import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvalidBotConfig, parseCommand, parseEnabled, parseReplyRule, parseWelcome, validUuid } from './bot-config';

test('validates ids before querying records', () => {
  assert.ok(validUuid('e2f988c2-b398-4230-b62b-dfd6c9fd4ea9'));
  assert.equal(validUuid('hello'), false);
  assert.equal(validUuid("00000000-0000-0000-0000-000000000000' OR 1=1"), false);
});

test('normalizes command names and blocks invalid payloads', () => {
  assert.deepEqual(parseCommand({ command: '/Help', responseText: ' Welcome ' }), { command: 'help', responseText: 'Welcome' });
  assert.throws(() => parseCommand({ command: 'hello world', responseText: 'yes' }), InvalidBotConfig);
  assert.throws(() => parseCommand({ command: 'help', responseText: '' }), InvalidBotConfig);
  assert.throws(() => parseCommand({ command: 'a'.repeat(33), responseText: 'yes' }), InvalidBotConfig);
  assert.throws(() => parseCommand({ command: 'help', responseText: 'a'.repeat(4001) }), InvalidBotConfig);
  assert.throws(() => parseCommand(null), InvalidBotConfig);
});

test('validates keyword rules and enabled toggle', () => {
  assert.deepEqual(parseReplyRule({ keyword: ' Hello ', responseText: ' Hi ' }), { keyword: 'hello', responseText: 'Hi', enabled: true });
  assert.deepEqual(parseReplyRule({ keyword: 'hello', responseText: 'Hi', enabled: false }), { keyword: 'hello', responseText: 'Hi', enabled: false });
  assert.throws(() => parseReplyRule({ keyword: 'x', responseText: 'yes', enabled: 'false' }), InvalidBotConfig);
  assert.equal(parseEnabled({ enabled: false }), false);
  assert.throws(() => parseEnabled({ enabled: 'false' }), InvalidBotConfig);
});

test('welcome message may be cleared but not oversized', () => {
  assert.equal(parseWelcome({ message: ' Hello ' }), 'Hello');
  assert.equal(parseWelcome({ message: '  ' }), '');
  assert.throws(() => parseWelcome({ message: 'x'.repeat(4001) }), InvalidBotConfig);
});
