import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScopedProxy, runScoped, stagingAuthScope } from '../src/lib/staging-prisma-scope.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('parallel requests use separate clients while each request reuses its own',async()=>{
 let made=0;
 const proxy=makeScopedProxy(()=>{const id=++made;return {id, read(){return this.id}}},()=>{throw Error('fallback')});
 const result=await Promise.all([runScoped('a',async()=>{let a=proxy.read();await delay(8);return [a,proxy.read()]}),runScoped('b',async()=>{let b=proxy.read();await delay(1);return [b,proxy.read()]})]);
 assert.deepEqual(result,[[1,1],[2,2]]);
});
test('fallback is used outside staging scope',()=>{const proxy=makeScopedProxy(()=>{throw Error('no')},()=>({value:42}));assert.equal(proxy.value,42)});

test('Google configuration stays within the staging request that received it', async () => {
 const google = { clientId: 'synthetic', clientSecret: 'synthetic', email: 'test@example.invalid' };
 const results = await Promise.all([
  runScoped('a', async () => { await delay(8); return stagingAuthScope()?.google; }, google),
  runScoped('b', async () => { await delay(1); return stagingAuthScope()?.google; }),
 ]);
 assert.deepEqual(results, [google, undefined]);
 assert.equal(stagingAuthScope(), undefined);
});
