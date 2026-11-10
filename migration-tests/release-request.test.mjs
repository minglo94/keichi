import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseDatabase } from '../migration-staging/release-request.mjs';

const host = 'portal.example.test';
const env = {
  DAZHI_RELEASE_HOSTNAME: host,
  AUTH_URL: 'https://' + host,
  AUTH_SECRET: 'synthetic',
  AUTH_GOOGLE_ID: 'synthetic',
  AUTH_GOOGLE_SECRET: 'synthetic',
  DATABASE_URL: 'postgresql://synthetic:synthetic@synthetic.neon.tech/example?sslmode=require',
};

test('release requires the canonical HTTPS hostname and authenticated TLS database', () => {
  assert.equal(releaseDatabase(new Request('https://' + host), env), env.DATABASE_URL);
  for (const url of ['http://' + host, 'https://preview.example.test', 'https://' + host + ':8443']) {
    assert.equal(releaseDatabase(new Request(url), env), null);
  }
  for (const invalid of [
    { AUTH_URL: 'https://preview.example.test' }, { AUTH_GOOGLE_SECRET: '' },
    { DATABASE_URL: 'not-a-url' }, { DATABASE_URL: env.DATABASE_URL.replace('require', 'disable') },
    { DATABASE_URL: env.DATABASE_URL.replace('synthetic.neon.tech', 'example.test') },
  ]) {
    assert.equal(releaseDatabase(new Request('https://' + host), { ...env, ...invalid }), null);
  }
});
