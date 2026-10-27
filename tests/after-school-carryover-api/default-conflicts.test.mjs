import test from 'node:test';import assert from 'node:assert/strict';
import {previewDay,prepareDay} from '../../src/lib/after-school/service.ts';
import {setClash} from './deps.mjs';
const now=new Date('2026-10-27T17:00:00+08:00');
function reset(){globalThis.carryFixture={values:[['班別','學號','日期','類型','出席'],['1A',8,'28/10','功課班',false]],run:null,holidays:[]};}
test('manual and automatic preparation accept conflicts by default and persist priority note',async()=>{
 for(const automatic of [false,true]){
 reset();setClash();const p=await previewDay('2026-10-28',undefined,now);assert.equal(p.warnings.length,1);assert.match(p.body,/優先出席課後班/);
 globalThis.carryFixture.run={status:'READY',sourceHash:p.hash,lastError:null};
 const r=await prepareDay('2026-10-28','admin',{now,automatic,acceptConflicts:false});
 assert.equal(r.status,'READY');assert.match(globalThis.carryFixture.run.lastError,/課後班優先.*Choir/);
 }
});
test('source validation errors still fail',async()=>{
 reset();await assert.rejects(()=>prepareDay('2026-10-28','admin',{now,automatic:true,reader:async()=>[]}),/表頭/);
 assert.equal(globalThis.carryFixture.run.status,'FAILED');
});
