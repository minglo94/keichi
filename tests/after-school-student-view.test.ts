import test from 'node:test';
import assert from 'node:assert/strict';
import { studentAfterSchoolBody } from '../src/lib/after-school/student-body';
test('student body is rebuilt from class numbers and never forwards stored names or notes',()=>{
 const rows=[{className:'1A',number:'08',type:'TOOL_UP',studentId:'private-id',name:'陳小明',note:'PRIVATE'},{className:'1A',number:'15',type:'TOOL_UP',name:'李小華'}];
 const body=studentAfterSchoolBody({date:'2026-10-26',participants:rows});
 assert.match(body,/1A #08、15/);
 for(const value of ['陳小明','李小華','PRIVATE','private-id'])assert.ok(!body.includes(value));
 assert.equal(rows[0].name,'陳小明');
});
test('invalid snapshots fail closed without falling back to named announcement text',()=>{
 for(const participants of [null,{},[{className:'陳小明',number:'08',type:'TOOL_UP'}],[{className:'1A',number:'08 李小華',type:'TOOL_UP'}]]){
  const body=studentAfterSchoolBody({date:'2026-10-26',participants});
  assert.match(body,/請向老師查詢/);assert.ok(!body.includes('李小華'));
 }
 assert.match(studentAfterSchoolBody({date:'2026-02-30',participants:[]}),/請向老師查詢/);
});
