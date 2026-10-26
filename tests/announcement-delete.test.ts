import test from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteAnnouncement } from '../src/lib/announcement-delete-policy';
const ann={authorId:'creator',committee:'ECA'};
const actor=(id:string,role:string,chairs:string[]=[])=>({id,role,chairedCommittees:new Set(chairs)});
test('creator, admin and matching committee chair can delete',()=>{
 assert.equal(canDeleteAnnouncement(ann,actor('creator','TEACHER')),true);
 assert.equal(canDeleteAnnouncement(ann,actor('admin','ADMIN')),true);
 assert.equal(canDeleteAnnouncement(ann,actor('chair','TEACHER',['ECA'])),true);
});
test('ordinary members, other chairs, students and revoked actors cannot delete',()=>{
 assert.equal(canDeleteAnnouncement(ann,actor('member','TEACHER')),false);
 assert.equal(canDeleteAnnouncement(ann,actor('chair','TEACHER',['IT'])),false);
 assert.equal(canDeleteAnnouncement(ann,actor('creator','STUDENT',['ECA'])),false);
 assert.equal(canDeleteAnnouncement(ann,null),false);
 assert.equal(canDeleteAnnouncement({...ann,committee:null},actor('chair','TEACHER',['ECA'])),false);
});
test('managed after-school announcements stay protected for every actor',()=>{
 for(const user of [actor('creator','TEACHER'),actor('admin','ADMIN'),actor('chair','TEACHER',['ECA'])])
  assert.equal(canDeleteAnnouncement(ann,user,true),false);
});

