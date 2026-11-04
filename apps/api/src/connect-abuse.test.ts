import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { hashedClientIp, MAX_BOT_CONNECT_IP_ATTEMPTS, BOT_CONNECT_IP_WINDOW_MINUTES } from './connect-abuse';

const key = randomBytes(32).toString('base64');
test('hashes valid IPs deterministically without storing them in plaintext', () => {
  const a = hashedClientIp('203.0.113.20', key);
  assert.equal(a.length, 32);
  assert.deepEqual(a, hashedClientIp('203.0.113.20', key));
  assert.notDeepEqual(a, hashedClientIp('203.0.113.21', key));
  assert.notDeepEqual(a, hashedClientIp('2001:db8::1', key));
  assert.equal(a.includes(Buffer.from('203.0.113.20')), false);
});
test('refuses spoofed, malformed and absent IP fields', () => {
  for (const ip of [
    undefined, '', 'not-an-ip', '1.2.3.4, 5.6.7.8', '1.2.3.4:1234', '127.0.0.1.evil.com'
  ]) assert.throws(() => hashedClientIp(ip, key));
});
test('refuses missing or malformed dedicated HMAC keys', () => {
  for (const bad of [undefined, '', 'fake-secret', 'a'.repeat(32), Buffer.from('short').toString('base64')]) {
    assert.throws(() => hashedClientIp('203.0.113.20', bad));
  }
});
test('IP attempt quota is 20 per 15-minute window', () => {
  assert.equal(MAX_BOT_CONNECT_IP_ATTEMPTS, 20);
  assert.equal(BOT_CONNECT_IP_WINDOW_MINUTES, 15);
});
