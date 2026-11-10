import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulateBotMessage, type BotReplyConfiguration } from './simulate-bot';

const config: BotReplyConfiguration = {
  username: 'SautiDemoBot',
  welcome_message: 'Welcome!',
  commands: [
    { command: 'help', response_text: 'How can I help you?' },
    { command: 'start', response_text: 'Fallback start command' }
  ],
  rules: [
    { keyword: 'hello', response_text: 'Hello there!', enabled: true },
    { keyword: 'hello world', response_text: 'Hi world!', enabled: true },
    { keyword: 'disabled', response_text: 'Should never appear', enabled: false },
    { keyword: 'c++', response_text: 'Programming!', enabled: true }
  ]
};

test('selects welcome for /start with optional deep-link payload', () => {
  assert.deepEqual(simulateBotMessage('/start payload', config), {
    matchType: 'welcome', matchedValue: '/start', responseText: 'Welcome!'
  });
  assert.equal(simulateBotMessage('/start@SautiDemoBot', config).responseText, 'Welcome!');
});

test('responds only to commands addressed to this bot', () => {
  assert.equal(simulateBotMessage('/help', config).responseText, 'How can I help you?');
  assert.equal(simulateBotMessage('/HeLp@sautidemobot', config).matchType, 'command');
  assert.equal(simulateBotMessage('/help@AnotherBot', config).responseText, null);
  assert.equal(simulateBotMessage('/missing', config).responseText, null);
  assert.equal(simulateBotMessage('/help!', config).responseText, null);
});

test('chooses most specific whole-phrase keyword and ignores disabled rules', () => {
  assert.equal(simulateBotMessage('HELLO WORLD!', config).responseText, 'Hi world!');
  assert.equal(simulateBotMessage('Well, hello!', config).responseText, 'Hello there!');
  assert.equal(simulateBotMessage('shelloworld', config).responseText, null);
  assert.equal(simulateBotMessage('disabled', config).responseText, null);
});

test('escapes regex metacharacters in user-defined keywords', () => {
  assert.equal(simulateBotMessage('I like c++!', config).responseText, 'Programming!');
  assert.equal(simulateBotMessage('ccc', config).responseText, null);
});

test('does not invent responses to empty or oversized input', () => {
  assert.equal(simulateBotMessage('   ', config).responseText, null);
  assert.equal(simulateBotMessage('x'.repeat(4097), config).responseText, null);
  assert.equal(simulateBotMessage('hello', { ...config, rules: [] }).responseText, null);
});
