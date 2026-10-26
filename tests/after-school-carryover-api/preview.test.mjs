import test from 'node:test';import assert from 'node:assert/strict';
import {previewDay} from '../../src/lib/after-school/service.ts';
const header=['班別','學號','日期','類型','出席'];
function reset(){globalThis.carryFixture={values:[header,['1A',8,'26/10','功課班',false],['1A',15,'26/10','功課班',true],['1A',15,'27/10','功課班',false]],run:null,holidays:[]};return globalThis.carryFixture;}
test('06:00 preview merges yesterday absence, records origin and freezes successful cutoff snapshot',async()=>{
 const f=reset();const before=await previewDay('2026-10-27',undefined,new Date('2026-10-26T16:00:00+08:00'));assert.equal(before.rows.length,1);assert.equal((await previewDay('2026-10-27',undefined,new Date('2026-10-27T05:59:59+08:00'))).rows.length,1);
 const morning=await previewDay('2026-10-27',undefined,new Date('2026-10-27T06:00:00+08:00'));assert.equal(morning.rows.length,2);assert.equal(morning.rows.find(r=>r.number==='08').makeupFrom,'2026-10-26');assert.equal(morning.attendanceChecked,true);assert.match(morning.body,/08 學生8/);
 f.run={automaticPreparedAt:new Date('2026-10-27T06:00:00+08:00'),participants:morning.rows};f.values[1][4]=true;
 const later=await previewDay('2026-10-27',undefined,new Date('2026-10-27T07:00:00+08:00'));assert.deepEqual(later.rows,morning.rows);
});
test('previous school day skips weekends and configured holidays',async()=>{
 const f=reset();f.values=[header,['1A',8,'22/10','功課班',false]];f.holidays=['2026-10-22'];
 const result=await previewDay('2026-10-26',undefined,new Date('2026-10-26T06:00:00+08:00'));
 assert.equal(result.rows[0].makeupFrom,'2026-10-22');
});
