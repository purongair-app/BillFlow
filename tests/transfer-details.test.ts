import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,validateState,balance,type Entry} from '../src/money.ts';
import {transferDetailsFromForm} from '../src/transferDetails.ts';
function form(values:Record<string,string>){const f=new FormData();for(const [k,v] of Object.entries(values))f.set(k,v);return f;}
test('cash deposits link the depositor and retain bank evidence without increasing total money',()=>{
 const s=initialState();s.accounts=[{id:'cash',name:'เงินสด',kind:'cash',opening:2000000},{id:'bank',name:'SCB',kind:'bank',bankName:'ไทยพาณิชย์',accountHolder:'ร้านตัวอย่าง',accountNumber:'12348261',opening:0}];s.employees=[{id:'emp-a',code:'EMP001',name:'ผู้ฝากตัวอย่าง',position:'พนักงาน',active:true}];
 const details=transferDetailsFromForm(form({account:'cash',to:'bank',payer:'EMP001 · ผู้ฝากตัวอย่าง',senderBank:'',receiverBank:'ไทยพาณิชย์'}),s);
 const e:Entry={...details,id:'deposit-a',type:'transfer',date:'2026-10-30',amount:1200000,account:'cash',to:'bank',title:'โอนระหว่างบัญชี',category:'โอนภายใน',contact:'',note:'ฝากผ่านตู้',file:{id:'00000000-0000-4000-8000-000000000001',name:'deposit.jpg',mime:'image/jpeg'},slipReview:'pending'};s.entries=[e];validateState(s);
 assert.equal(e.payerEmployeeId,'emp-a');assert.equal(e.payer,'ผู้ฝากตัวอย่าง');assert.equal(e.receiverBank,'ไทยพาณิชย์');assert.equal(e.receiverAccount,'12348261');assert.equal(e.senderBank,'');assert.equal(balance(s,'cash'),800000);assert.equal(balance(s,'bank'),1200000);assert.equal(balance(s,'cash')+balance(s,'bank'),2000000);
 const edited={...e,...transferDetailsFromForm(form({account:'cash',to:'bank',payer:'',senderBank:'',receiverBank:'SCB จุดฝาก'}),s,e)};s.entries=[edited];validateState(s);assert.equal(edited.payer,'');assert.equal(edited.payerEmployeeId,undefined);assert.deepEqual(edited.file,e.file);assert.equal(edited.receiverBank,'SCB จุดฝาก');
});
test('changing transfer accounts refreshes bank-party snapshots and allows a typed depositor',()=>{
 const s=initialState();s.accounts=[{id:'a',name:'A',kind:'bank',bankName:'กรุงไทย',accountHolder:'ร้าน ก',accountNumber:'1111',opening:0},{id:'b',name:'B',kind:'bank',bankName:'SCB',accountHolder:'ร้าน ข',accountNumber:'2222',opening:0}];
 const old={id:'old',type:'transfer',account:'a',to:'b',senderName:'ชื่อปิดบางส่วน',senderAccount:'xxx1111',receiverName:'เดิม',receiverAccount:'xxx2222'} as Entry;
 const kept=transferDetailsFromForm(form({account:'a',to:'b',payer:'ผู้ฝากภายนอก',senderBank:'กรุงไทย',receiverBank:'SCB'}),s,old);assert.equal(kept.payer,'ผู้ฝากภายนอก');assert.equal(kept.senderName,'ชื่อปิดบางส่วน');assert.equal(kept.receiverAccount,'xxx2222');
 const swapped=transferDetailsFromForm(form({account:'b',to:'a',payer:'ผู้ฝากภายนอก',senderBank:'SCB',receiverBank:'กรุงไทย'}),s,old);assert.equal(swapped.senderAccount,'2222');assert.equal(swapped.receiverAccount,'1111');assert.equal(swapped.receiverName,'ร้าน ก');
});
