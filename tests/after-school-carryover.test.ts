import test from 'node:test';import assert from 'node:assert/strict';
import { missedAttendance, mergeMakeup } from '../src/lib/after-school/carryover';
const header=['班別','學號','日期','類型','出席'];
test('unchecked/blank previous-day rows become makeup, checked rows and other dates do not',()=>{
 const r=missedAttendance([header,['1A',8,'26/10','功課班',false],['1A',15,'26/10','功課班',true],['2F',23,'26/10','正向班',''],['1A',9,'27/10','功課班',false]],'2026-10-26',2026);
 assert.equal(r.errors.length,0);assert.deepEqual(r.rows.map(x=>x.number),['23','08']);
});
test('attendance column must exist and invalid checkbox data blocks rather than silently marking absent',()=>{
 assert.ok(missedAttendance([['班別','學號','日期','類型']], '2026-10-26',2026).errors.length);
 assert.ok(missedAttendance([header,['1A',8,'26/10','功課班','unknown']], '2026-10-26',2026).errors.length);
});
test('merge deduplicates students, records original day and rejects different class types',()=>{
 const row={className:'1A',number:'08',type:'TOOL_UP' as const};
 assert.equal(mergeMakeup([row],[row],'2026-10-26').rows.length,1);
 assert.equal(mergeMakeup([],[row],'2026-10-26').rows[0].makeupFrom,'2026-10-26');
 assert.ok(mergeMakeup([{...row,type:'POSITIVE'}],[row],'2026-10-26').errors.length);
});
