import test from 'node:test';
import assert from 'node:assert/strict';
import { routeRequest } from '../migration-staging/staging-router.mjs';
const worker={fetch:(request,env,ctx)=>routeRequest(request,env,ctx,async()=>new Response('app',{status:404}))};
const auth='Basic '+Buffer.from('user:pass').toString('base64');
const database='postgresql://stage-user:stage-pass@stage.neon.tech/db?sslmode=require';
test('authenticated static assets reach the asset binding', async()=>{
 let hit=false;
 const env={STAGING_BASIC_AUTH:'user:pass',STAGING_DATABASE_URL:database,ASSETS:{fetch:async()=>{hit=true;return new Response('asset',{status:200})}}};
 const res=await worker.fetch(new Request('https://example.test/_next/static/css/test.css',{headers:{authorization:auth}}),env,{});
 assert.equal(hit,true);assert.equal(res.status,200);assert.equal(await res.text(),'asset');
});
test('unauthenticated static assets are blocked',async()=>{
 let hit=false;
 const env={STAGING_BASIC_AUTH:'user:pass',STAGING_DATABASE_URL:database,ASSETS:{fetch:async()=>{hit=true;return new Response('asset')}}};
 const res=await worker.fetch(new Request('https://example.test/_next/static/css/test.css'),env,{});
 assert.equal(res.status,401);assert.equal(hit,false);
});
test('unreviewed announcement mutation stops before the application',async()=>{
 let hit=false;const env={STAGING_BASIC_AUTH:'user:pass',STAGING_DATABASE_URL:database,ASSETS:{fetch:async()=>new Response('asset')}};
 const res=await routeRequest(new Request('https://example.test/api/announcements',{method:'POST',headers:{authorization:auth}}),env,{},async()=>{hit=true;return new Response('app')});
 assert.equal(res.status,403);assert.equal(hit,false);
});
test('approved todo creation reaches application after authentication',async()=>{
 let hit=false;const env={STAGING_BASIC_AUTH:'user:pass',STAGING_DATABASE_URL:database,ASSETS:{fetch:async()=>new Response('asset')}};
 const res=await routeRequest(new Request('https://example.test/api/todos',{method:'POST',headers:{authorization:auth}}),env,{},async()=>{hit=true;return new Response('app',{status:201})});
 assert.equal(res.status,201);assert.equal(hit,true);
});
test('encoded dynamic route chunks and the logo use assets without reaching the application', async () => {
  const paths = [];
  const env = { STAGING_BASIC_AUTH: 'user:pass', STAGING_DATABASE_URL: database, ASSETS: { fetch: async request => {
    paths.push(new URL(request.url).pathname);
    return new Response('asset');
  }}};
  for (const path of ['/_next/static/chunks/%5Btype%5D/page.js','/_next/image?url=%2Flogo.png','/favicon.ico']) {
    const result = await routeRequest(new Request('https://example.test'+path,{headers:{authorization:auth}}),env,{},()=>assert.fail('application reached'));
    assert.equal(result.status,200);
  }
  assert.deepEqual(paths,['/_next/static/chunks/%5Btype%5D/page.js','/logo.png','/logo.png']);
});
