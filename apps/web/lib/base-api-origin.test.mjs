import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trustedBaseApiOrigin } from './base-api-origin.mjs';

const trusted = 'https://sautilink-base-api-staging.onrender.com';

test('accepts only the reviewed Base API origin', () => {
  assert.equal(trustedBaseApiOrigin(trusted), trusted);
  assert.equal(trustedBaseApiOrigin(trusted + '/'), trusted);
});

test('rejects token exfiltration via arbitrary HTTPS and deceptive hostnames', () => {
  for (const candidate of [
    undefined, '', 'http://sautilink-base-api-staging.onrender.com',
    'https://evil.example', 'https://sautilink-base-api-staging.onrender.com.evil.example',
    'https://user@sautilink-base-api-staging.onrender.com',
    trusted + '/bots', trusted + '/?token=1', trusted + '#fragment',
    trusted + ':443', ' ' + trusted
  ]) {
    assert.equal(trustedBaseApiOrigin(candidate), null, String(candidate));
  }
});
