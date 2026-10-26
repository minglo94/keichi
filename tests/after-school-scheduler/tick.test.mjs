import test from 'node:test';import assert from 'node:assert/strict';
import {tick} from '../../src/lib/after-school/scheduler.ts';
function reset(){globalThis.scheduleFixture={runs:{},prepared:[],delivered:[],fail:false};return globalThis.scheduleFixture;}
test('Friday 16:00 prepares Monday once and Monday 06:00 refreshes once before reminders',async()=>{
 const f=reset();await tick({now:new Date('2026-10-23T16:00:00+08:00')});assert.deepEqual(f.prepared,['2026-10-26']);
 await tick({now:new Date('2026-10-23T16:01:00+08:00')});assert.equal(f.prepared.length,1);
 await tick({now:new Date('2026-10-26T05:59:59+08:00')});assert.equal(f.prepared.length,1);
 await tick({now:new Date('2026-10-26T06:00:00+08:00')});assert.equal(f.prepared.length,2);
 await tick({now:new Date('2026-10-26T06:01:00+08:00')});assert.equal(f.prepared.length,2);
 await tick({now:new Date('2026-10-26T08:15:00+08:00')});assert.equal(f.prepared.length,2);assert.equal(f.delivered.at(-1),'2026-10-26');
});
test('Monday 16:00 prepares Tuesday and source failure is visible',async()=>{
 let f=reset();await tick({now:new Date('2026-10-26T16:00:00+08:00')});assert.deepEqual(f.prepared,['2026-10-27']);
 f=reset();f.fail=true;const result=await tick({now:new Date('2026-10-26T16:00:00+08:00')});assert.equal(result.status,'PREPARATION_FAILED');assert.equal(result.preparationDate,'2026-10-27');
});
test('weekend missed-run recovery targets Monday',async()=>{const f=reset();await tick({now:new Date('2026-10-24T09:00:00+08:00')});assert.deepEqual(f.prepared,['2026-10-26']);});
