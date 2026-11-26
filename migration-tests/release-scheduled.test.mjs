import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runAfterSchoolSchedule } from '../migration-staging/release-scheduled.mjs';
import { makeScopedProxy, stagingAuthScope } from '../src/lib/staging-prisma-scope.mjs';

const env = {
  DAZHI_RELEASE_HOSTNAME: 'portal.example.test',
  AUTH_URL: 'https://portal.example.test',
  AUTH_SECRET: 'synthetic',
  AUTH_GOOGLE_ID: 'synthetic',
  AUTH_GOOGLE_SECRET: 'synthetic',
  DATABASE_URL: 'postgresql://test:test@synthetic.neon.tech/example?sslmode=require',
  DAZHI_ENABLE_SCHEDULED_JOBS: 'true',
  AFTERSCHOOL_CRON_SECRET: 'synthetic-cron-secret-at-least-32-characters',
};
const controller = { cron: '* * * * *', scheduledTime: Date.UTC(2026, 10, 26, 0, 15) };

test('minute trigger dispatches the protected route in the production database scope', async () => {
  const context = {};
  const prisma = makeScopedProxy(connection => ({ connection }), () => ({ connection: 'fallback' }));
  let calls = 0;
  await runAfterSchoolSchedule({
    async fetch(request, bindings, ctx) {
      calls++;
      assert.equal(request.url, env.AUTH_URL + '/api/cron/after-school');
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.get('authorization'), 'Bearer ' + env.AFTERSCHOOL_CRON_SECRET);
      assert.equal(bindings, env);
      assert.equal(ctx, context);
      await Promise.resolve();
      assert.equal(prisma.connection, env.DATABASE_URL);
      assert.equal(stagingAuthScope(), undefined);
      return Response.json({ status: 'NOT_DUE', preparationDate: '2026-11-26' });
    },
  }, controller, env, context);
  assert.equal(calls, 1);
  assert.equal(prisma.connection, 'fallback');
});

test('invalid release bindings and short secrets cannot invoke the application', async () => {
  for (const override of [
    { DAZHI_ENABLE_SCHEDULED_JOBS: 'false' },
    { AUTH_URL: 'https://preview.example.test' },
    { DATABASE_URL: 'invalid' },
    { AFTERSCHOOL_CRON_SECRET: 'short' },
  ]) {
    let called = false;
    await assert.rejects(runAfterSchoolSchedule({ fetch() { called = true; } }, controller, { ...env, ...override }, {}));
    assert.equal(called, false);
  }
});

test('HTTP and preparation failures fail the scheduled invocation for monitoring', async () => {
  for (const response of [
    new Response('private diagnostic', { status: 503 }),
    Response.json({ status: 'PREPARATION_FAILED', preparationError: 'private diagnostic' }),
    Response.json({ status: 'APPROVER_REVOKED' }),
    Response.json({ error: 'private diagnostic' }),
  ]) {
    await assert.rejects(
      runAfterSchoolSchedule({ fetch: async () => response }, controller, env, {}),
      error => !error.message.includes('private diagnostic'),
    );
  }
});

test('disabled and idle results are preserved without forcing a run', async () => {
  for (const status of ['DISABLED', 'WEEKEND', 'NOT_DUE', 'NO_RUN', 'EMPTY']) {
    await runAfterSchoolSchedule({ fetch: async () => Response.json({ status }) }, controller, env, {});
  }
});

test('both release configurations retain the minute trigger and execution logs', () => {
  for (const path of ['../wrangler.jsonc', '../migration-staging/wrangler.release.jsonc']) {
    const config = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
    assert.deepEqual(config.triggers.crons, ['* * * * *']);
    assert.equal(config.observability.enabled, true);
  }
});
