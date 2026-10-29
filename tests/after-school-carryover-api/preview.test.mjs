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
test('older outstanding record remains due across intervening non-teaching days',async()=>{
 const f=reset();f.values=[header,['1A',8,'22/10','功課班',false]];f.holidays=['2026-10-22'];
 const result=await previewDay('2026-10-26',undefined,new Date('2026-10-26T06:00:00+08:00'));
 assert.equal(result.rows[0].makeupFrom,'2026-10-22');
});

test('06:00 rereads all current rows, including after-16:00 additions, then merges prior absence without duplicates',async()=>{
 const f=reset();
 const initial=await previewDay('2026-10-27',undefined,new Date('2026-10-26T16:00:00+08:00'));
 assert.deepEqual(initial.rows.map(r=>r.number),['15']);
 f.run={automaticPreparedAt:new Date('2026-10-26T16:00:00+08:00'),participants:initial.rows};
 // A new current-day row added after the initial preparation, independent of prior absence.
 f.values.push(['1A',23,'27/10','功課班',false]);
 f.values.push(['1A',8,'27/10','功課班',false]); // already included by absence: deduplicate.
 const morning=await previewDay('2026-10-27',undefined,new Date('2026-10-27T06:00:00+08:00'));
 assert.equal(morning.errors.length,0);
 assert.deepEqual(morning.rows.map(r=>r.number),['08','15','23']);
 assert.equal(morning.rows.filter(r=>r.number==='08').length,1);
 assert.equal(morning.rows.find(r=>r.number==='08').makeupFrom,'2026-10-26');
 assert.notEqual(morning.hash,initial.hash);
});

test('checking the original row stops its carryover at next morning, while other outstanding rows remain',async()=>{
 const f=reset();const morning=await previewDay('2026-10-27',undefined,new Date('2026-10-27T06:00:00+08:00'));
 assert.ok(morning.rows.some(r=>r.number==='08'));
 f.run={automaticPreparedAt:new Date('2026-10-27T06:00:00+08:00'),participants:morning.rows};
 f.values[1][4]=true;
 const next=await previewDay('2026-10-28',undefined,new Date('2026-10-28T06:00:00+08:00'));
 assert.ok(!next.rows.some(r=>r.number==='08'));assert.ok(next.rows.some(r=>r.number==='15'));
});
test('current holiday does not produce a carryover list',async()=>{
 const f=reset();f.holidays=['2026-10-25'];const p=await previewDay('2026-10-26',undefined,new Date('2026-10-26T06:00:00+08:00'));assert.equal(p.skipped,true);assert.equal(p.rows.length,0);
});
