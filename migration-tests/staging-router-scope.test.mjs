import test from 'node:test';
import assert from 'node:assert/strict';
import { routeRequest } from '../migration-staging/staging-router.mjs';
import { stagingAuthScope } from '../src/lib/staging-prisma-scope.mjs';

const authHeader = `Basic ${Buffer.from('tester:secret').toString('base64')}`;
const request = (path, method = 'GET', authorized = true) => new Request(`https://stage.invalid${path}`, {
  method,
  headers: authorized ? { authorization: authHeader } : {},
});
const baseEnv = {
  STAGING_BASIC_AUTH: 'tester:secret',
  STAGING_DATABASE_URL: 'postgresql://stage-user:stage-pass@stage.neon.tech/db?sslmode=require',
};

test('fails closed when the staging database binding is absent', async () => {
  let reached = false;
  const response = await routeRequest(request('/teacher'), { STAGING_BASIC_AUTH: baseEnv.STAGING_BASIC_AUTH }, {}, async () => {
    reached = true;
    return new Response('application');
  });
  assert.equal(response.status, 503);
  assert.equal(reached, false);
});

test('runs application requests inside the staging database and Google identity scope', async () => {
  const env = {
    ...baseEnv,
    AUTH_GOOGLE_ID: 'staging-client-id',
    AUTH_GOOGLE_SECRET: 'staging-client-secret',
    STAGING_GOOGLE_EMAIL: 'teacher@example.test',
  };
  const response = await routeRequest(request('/api/auth/providers'), env, {}, async () => {
    const scope = stagingAuthScope();
    assert.equal(scope?.connectionString, env.STAGING_DATABASE_URL);
    assert.deepEqual(scope?.google, {
      clientId: 'staging-client-id',
      clientSecret: 'staging-client-secret',
      email: 'teacher@example.test',
    });
    return Response.json({ ok: true });
  });
  assert.equal(response.status, 200);
});

test('does not serve static assets before the staging authentication gate', async () => {
  let assetRead = false;
  const env = {
    ...baseEnv,
    ASSETS: { fetch: async () => { assetRead = true; return new Response('asset'); } },
  };
  const response = await routeRequest(request('/_next/static/app.js', 'GET', false), env, {}, async () => {
    assert.fail('application must not be reached');
  });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('www-authenticate'), 'Basic realm="Dazhi staging acceptance", charset="UTF-8"');
  assert.equal(assetRead, false);
});
