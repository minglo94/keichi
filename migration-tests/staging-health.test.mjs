import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseErrorCategory, databaseHealthSummary } from '../migration-staging/staging-health.mjs';

test('returns only PostgreSQL version and public table count from the staging health query', async () => {
  let receivedSql = '';
  const prisma = { $queryRaw: async (strings) => {
    const sql = strings.join('?');
    receivedSql += `${sql};`;
    if (/SELECT 1 AS ok/i.test(sql)) return [{ ok: 1 }];
    if (/current_setting/i.test(sql)) return [{ server_version_num: 180006 }];
    return [{ public_tables: 78 }];
  } };
  const result = await databaseHealthSummary(prisma);
  assert.deepEqual(result, { database: 'ok', major: 18, tables: 78 });
  assert.match(receivedSql, /server_version_num/);
  assert.match(receivedSql, /SELECT 1 AS ok/);
  assert.match(receivedSql, /information_schema\.tables/);
  assert.doesNotMatch(JSON.stringify(result), /email|student|user/i);
});

test('labels the failing read-only probe without leaking its database message', async () => {
  let count = 0;
  const prisma = { $queryRaw: async (strings) => {
    count += 1;
    if (count === 1) return [{ ok: 1 }];
    throw Object.assign(new Error('safe wrapper'), { meta: { message: 'permission denied for private_table' } });
  } };
  await assert.rejects(databaseHealthSummary(prisma), (error) => {
    assert.equal(error.name, 'DatabaseHealthProbeError');
    assert.equal(error.probeStep, 'server_version');
    assert.equal(databaseErrorCategory(error), 'permission_denied');
    assert.doesNotMatch(error.message, /private_table/);
    return true;
  });
});

test('classifies database failures without returning their messages', () => {
  assert.equal(databaseErrorCategory({ meta: { message: 'permission denied for table "User"' } }), 'permission_denied');
  assert.equal(databaseErrorCategory({ meta: { message: 'relation does not exist' } }), 'schema_error');
  assert.equal(databaseErrorCategory({ message: 'connect timeout to private-host.example' }), 'connection_error');
  assert.equal(databaseErrorCategory({ message: 'opaque database failure containing private details' }), 'database_query_error');
});
