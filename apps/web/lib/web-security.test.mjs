import assert from 'node:assert/strict';
import { test } from 'node:test';
import nextConfig from '../next.config.mjs';

test('public Base routes forbid framing and browser MIME sniffing', async () => {
  const routes = await nextConfig.headers();
  const general = routes.find(route => route.source === '/:path*');
  assert.ok(general);
  const headers = Object.fromEntries(general.headers.map(({ key, value }) => [key, value]));
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(headers['Content-Security-Policy'], /object-src 'none'/);
  assert.ok(headers['Permissions-Policy'].includes('microphone=()'));
});

test('www Base redirect preserves path while canonicalizing the origin', async () => {
  const rules = await nextConfig.redirects();
  assert.ok(rules.some(rule => rule.has?.some(cond => cond.type === 'host' &&
    cond.value === 'www.base.sautilink.com') &&
    rule.destination === 'https://base.sautilink.com/:path*' && rule.permanent));
});
