import test from 'node:test';import assert from 'node:assert/strict';
import {outstandingAttendance} from '../src/lib/after-school/carryover';
const h=['班別','學號','日期','類型','出席'];
test('all earlier unchecked records in current academic year remain outstanding until original checkbox checked',()=>{
 const values=[h,['1A',8,'21/10','功課班',false],['1A',15,'26/10','功課班',true],['1A',23,'28/10','功課班',false],['1A',9,'27/10','功課班',false],['1A',10,'2025-10-21','功課班',false]];
 const first=outstandingAttendance(values,'2026-10-27',2026);assert.equal(first.errors.length,0);assert.deepEqual(first.rows.map(r=>r.number),['08']);
 assert.equal(first.rows[0].makeupFrom,'2026-10-21');
 assert.ok(outstandingAttendance(values,'2026-10-28',2026).rows.some(r=>r.number==='08'));
 values[1][4]=true;assert.ok(!outstandingAttendance(values,'2026-10-28',2026).rows.some(r=>r.number==='08'));
});
