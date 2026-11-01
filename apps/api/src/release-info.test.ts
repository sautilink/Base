import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseReleaseInfo, safeBaseReleaseRevision } from './release-info';

test('only an exact public Git SHA may appear in an API release response', () => {
  const sha = '9'.repeat(40);
  assert.equal(safeBaseReleaseRevision(sha), sha);
  for (const value of [undefined, '', 'deadbeef', 'G'.repeat(40),
    'a'.repeat(40) + 'secret', 'https://api.invalid/password', 'a'.repeat(41)]) {
    assert.equal(safeBaseReleaseRevision(value), null);
  }
});

test('release metadata contains no runtime secret values', () => {
  const info = baseReleaseInfo({ RENDER_GIT_COMMIT: '2'.repeat(40) });
  assert.deepEqual(Object.keys(info).sort(), ['revision', 'service']);
  assert.equal(info.revision, '2'.repeat(40));
});
