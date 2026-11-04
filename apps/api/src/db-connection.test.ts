import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASE_PROJECT_REF, BASE_SESSION_POOLER, parseBaseDatabaseConnection } from './db-connection';

const allowed = 'postgresql://base_api_login.' + BASE_PROJECT_REF +
  ':dummyPass123@' + BASE_SESSION_POOLER + ':5432/postgres';

test('only accepts a dedicated Base Session Pooler connection', () => {
  const config = parseBaseDatabaseConnection(allowed);
  assert.equal(config.host, BASE_SESSION_POOLER);
  assert.equal(config.user, 'base_api_login.' + BASE_PROJECT_REF);
  assert.equal(config.database, 'postgres');
  assert.equal(config.port, 5432);
});

test('rejects admin, another project, direct, unsafe SSL and transaction pooler DSNs', () => {
  assert.throws(() => parseBaseDatabaseConnection(undefined));
  assert.throws(() => parseBaseDatabaseConnection(allowed.replace('base_api_login.', 'postgres.')));
  assert.throws(() => parseBaseDatabaseConnection(allowed.replace(BASE_PROJECT_REF, 'differentproject')));
  assert.throws(() => parseBaseDatabaseConnection(allowed.replace(BASE_SESSION_POOLER, 'db.' + BASE_PROJECT_REF + '.supabase.co')));
  assert.throws(() => parseBaseDatabaseConnection(allowed.replace(':5432/', ':6543/')));
  assert.throws(() => parseBaseDatabaseConnection(allowed + '?sslmode=disable'));
  assert.throws(() => parseBaseDatabaseConnection('postgresql://user:pass@example.com:5432/postgres'));
});

test('URL encoding of private password is decoded for pg, not echoed or committed', () => {
  const config = parseBaseDatabaseConnection(allowed.replace('dummyPass123', 'dummy%40Pass'));
  assert.equal(config.password, 'dummy@Pass');
});
