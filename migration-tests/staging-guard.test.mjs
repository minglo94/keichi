import test from 'node:test';
import assert from 'node:assert/strict';
import { authorized } from '../staging-guard.mjs';
const request = h => new Request('https://staging.invalid/private', {headers:h || {}});
test('fails closed without configured credentials', async () => {
 assert.equal(await authorized(request({authorization:'Basic dGVzdDp0ZXN0'}), {}), false);
});
test('denies missing or incorrect credentials', async () => {
 const env={STAGING_BASIC_AUTH:'user:secret'};
 assert.equal(await authorized(request(), env), false);
 assert.equal(await authorized(request({authorization:'Basic dXNlcjp3cm9uZw=='}), env), false);
});
test('accepts only the configured credentials', async () => {
 assert.equal(await authorized(request({authorization:'Basic dXNlcjpzZWNyZXQ='}), {STAGING_BASIC_AUTH:'user:secret'}), true);
});
