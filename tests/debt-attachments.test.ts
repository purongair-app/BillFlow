import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,validateState} from '../src/money.ts';
import {upsertDebt} from '../src/debts.ts';
const debt=()=>({id:'debt-1',type:'receivable' as const,name:'ลูกค้า',title:'ใบแจ้งหนี้',amount:10000,due:'2026-10-30'});
const attachment={id:'00000000-0000-4000-8000-000000000001',name:'invoice.png',mime:'image/png',size:1000};
test('debt attachments survive updates and can be removed without changing balances',()=>{
 const s=initialState();s.debts=upsertDebt(s,{...debt(),file:attachment});
 s.debts=upsertDebt(s,{...s.debts[0],title:'แก้ไขรายละเอียด'});
 assert.deepEqual(s.debts[0].file,attachment);assert.equal(s.entries.length,0);
 s.debts=upsertDebt(s,{...s.debts[0],file:undefined});assert.equal(s.debts[0].file,undefined);assert.doesNotThrow(()=>validateState(s));
});
test('old debts remain valid; invalid attachment references and unsupported files are rejected',()=>{
 const s=initialState();s.debts=[debt()];assert.doesNotThrow(()=>validateState(s));
 for(const file of [{...attachment,id:'https://example.com/file'}, {...attachment,mime:'text/html'}, {...attachment,size:5242881},{...attachment,previewId:'bad'}]){
 s.debts=[{...debt(),file}];assert.throws(()=>validateState(s),/เอกสารแนบ/);
 }
});
