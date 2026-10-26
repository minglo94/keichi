import test from 'node:test';import assert from 'node:assert/strict';
const {DELETE}=await import('../../src/app/api/announcements/[id]/route.ts');
const {announcementDeleteViews}=await import('../../src/lib/announcement-delete.ts');
const ann={id:'ann',authorId:'creator',committee:'ECA'};
function reset(id='creator',role='TEACHER',chairs=[],managed=false){globalThis.fixture={session:{user:{id,role:'ADMIN'}},user:{id,role},chairs,managed,announcement:ann,deleted:0};}
async function remove(){return DELETE(new Request('https://example.invalid/api/announcements/ann',{method:'DELETE'}),{params:Promise.resolve({id:'ann'})});}
test('DELETE accepts creator/admin/matching chair and denies ordinary teacher/other chair/student/revoked account',async()=>{
 for(const [id,role,chairs,status] of [['creator','TEACHER',[],200],['admin','ADMIN',[],200],['chair','TEACHER',['ECA'],200],['other','TEACHER',[],403],['chair','TEACHER',['IT'],403],['creator','STUDENT',[],403]]){
 reset(id,role,chairs);assert.equal((await remove()).status,status);assert.equal(globalThis.fixture.deleted,status===200?1:0);
 }
 reset();globalThis.fixture.user=null;assert.equal((await remove()).status,403);
 reset();globalThis.fixture.session=null;assert.equal((await remove()).status,401);
});
test('managed announcements remain protected and missing announcements return 404',async()=>{
 reset('admin','ADMIN',[],true);assert.equal((await remove()).status,409);assert.equal(globalThis.fixture.deleted,0);
 reset();globalThis.fixture.announcement=null;assert.equal((await remove()).status,404);
});
test('server UI capability mirrors DELETE and hides protected or forbidden actions',async()=>{
 reset('chair','TEACHER',['ECA']);assert.equal((await announcementDeleteViews([ann],'chair'))[0].canDelete,true);
 reset('chair','TEACHER',['IT']);assert.equal((await announcementDeleteViews([ann],'chair'))[0].canDelete,false);
 reset('admin','ADMIN',[],true);assert.equal((await announcementDeleteViews([ann],'admin'))[0].canDelete,false);
});
