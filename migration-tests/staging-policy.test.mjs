import test from 'node:test';
import assert from 'node:assert/strict';
import { permittedInStaging } from '../migration-staging/staging-policy.mjs';
const request=(path,method='GET')=>new Request('https://example.test'+path,{method});
test('permits the synthetic login and vetted todo and document workflows',()=>{
 for(const [method,path] of [['POST','/api/auth/callback/credentials'],['POST','/api/auth/signout'],['POST','/api/todos'],['PATCH','/api/todos/synthetic-id'],['DELETE','/api/todos/synthetic-id'],['POST','/api/timetable/common-free'],['POST','/api/quotation/generate'],['POST','/api/activity-docs/generate'],['PUT','/api/teacher/blackboard/schedule']]) assert.equal(permittedInStaging(request(path,method)),true,method+' '+path);
});
test('blocks unreviewed mutations, announcements, external OAuth and scheduled work',()=>{
 for(const [method,path] of [['POST','/api/announcements'],['POST','/api/cron/after-school'],['GET','/api/cron/after-school'],['GET','/api/oauth/callback'],['GET','/api/auth/callback/google'],['POST','/api/unknown'],['POST','/teacher/unknown'],['PATCH','/api/todos/id/unknown'],['GET','/_next/image'],['GET','/%61pi/oauth/callback'],['GET','/api%2Fcron/after-school']]) assert.equal(permittedInStaging(request(path,method)),false,method+' '+path);
});
test('allows normal read-only pages and API reads',()=>{
 for(const path of ['/login','/teacher','/api/auth/session','/api/users','/api/todos','/_next/static/test.js']) assert.equal(permittedInStaging(request(path)),true,path);
});

test('Google login opens only the two exact method/path pairs when configured', () => {
  assert.equal(permittedInStaging(request('/api/auth/signin/google','POST'), true), true);
  assert.equal(permittedInStaging(request('/api/auth/callback/google'), true), true);
  assert.equal(permittedInStaging(request('/api/auth/signin/google','POST')), false);
  assert.equal(permittedInStaging(request('/api/auth/signin/google'), true), false);
  assert.equal(permittedInStaging(request('/api/auth/callback/google','POST'), true), false);
  assert.equal(permittedInStaging(request('/api/oauth/callback'), true), false);
});
