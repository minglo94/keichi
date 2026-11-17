import test from 'node:test';
import assert from 'node:assert/strict';
import { readTemplateAsset } from '../src/lib/template-assets.mjs';
test('reads the packaged template through an asset binding',async()=>{
 let path; const result=await readTemplateAsset('quotation.docx',{fetch:async url=>{path=new URL(url).pathname;return new Response(new Uint8Array([0x50,0x4b]))}},()=>{throw Error('must not read local')});
 assert.equal(path,'/templates/quotation.docx');assert.deepEqual([...result],[0x50,0x4b]);
});
test('rejects missing asset instead of accepting HTML as a template',async()=>{
 await assert.rejects(()=>readTemplateAsset('quotation.docx',{fetch:async()=>new Response('missing',{status:404})},()=>{}));
});
test('retains local template access when no asset binding exists',async()=>{
 let path;const result=await readTemplateAsset('quotation.docx',null,p=>{path=p;return Buffer.from('local')});
 assert.equal(path,'quotation.docx');assert.equal(result.toString(),'local');
});
test('rejects directory traversal',async()=>{await assert.rejects(()=>readTemplateAsset('../secret',null,()=>{}));});
test('reads Unicode spreadsheet template names safely',async()=>{
 let path; await readTemplateAsset('出席紀錄.xlsx',{fetch:async url=>{path=decodeURIComponent(new URL(url).pathname);return new Response('ok')}},()=>{});
 assert.equal(path,'/templates/出席紀錄.xlsx');
});
test('accepts the FAD8 template filename',async()=>{
 let path; await readTemplateAsset('FAD8(25-26).xlsx',{fetch:async url=>{path=decodeURIComponent(new URL(url).pathname);return new Response('ok')}},()=>{});
 assert.equal(path,'/templates/FAD8(25-26).xlsx');
});
