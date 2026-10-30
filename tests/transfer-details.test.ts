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
 const edited={...e,...transferDetailsFromForm(form({account:'cash',to:'bank',payer:'',senderBank:'',receiverBank:'SCB จุดฝาก'}),s,e)};s.entries=[edited];validateState(s);assert.equal(edited.payer,'');assert.equal(edited.payerEmployeeId,undefined);assert.deepEqual(edited.file,e.file);assert.equal(edited.receiverBank,'ไทยพาณิชย์');
});
test('changing transfer accounts refreshes bank-party snapshots and allows a typed depositor',()=>{
 const s=initialState();s.accounts=[{id:'a',name:'A',kind:'bank',bankName:'กรุงไทย',accountHolder:'ร้าน ก',accountNumber:'1111',opening:0},{id:'b',name:'B',kind:'bank',bankName:'SCB',accountHolder:'ร้าน ข',accountNumber:'2222',opening:0}];
 const old={id:'old',type:'transfer',account:'a',to:'b',senderName:'ชื่อปิดบางส่วน',senderAccount:'xxx1111',receiverName:'เดิม',receiverAccount:'xxx2222'} as Entry;
 const kept=transferDetailsFromForm(form({account:'a',to:'b',payer:'ผู้ฝากภายนอก',senderBank:'กรุงไทย',receiverBank:'SCB'}),s,old);assert.equal(kept.payer,'ผู้ฝากภายนอก');assert.equal(kept.senderName,'ชื่อปิดบางส่วน');assert.equal(kept.receiverAccount,'xxx2222');
 const swapped=transferDetailsFromForm(form({account:'b',to:'a',payer:'ผู้ฝากภายนอก',senderBank:'SCB',receiverBank:'กรุงไทย'}),s,old);assert.equal(swapped.senderAccount,'2222');assert.equal(swapped.receiverAccount,'1111');assert.equal(swapped.receiverName,'ร้าน ก');
});

test('LINE transfers use the same account banks and depositor as manual transfers without debt fields',async()=>{
 const {importLineDocument,suggestImport}=await import('../src/lineDocuments.ts');const {bankNameOptions}=await import('../src/bankNames.ts');
 const s=initialState();s.accounts=[{id:'cash',name:'เงินสด',kind:'cash',opening:300000},{id:'bank',name:'ธนาคาร',kind:'bank',bankName:'กรุงไทย',accountHolder:'ร้านตัวอย่าง',accountNumber:'1234567890',opening:0}];s.employees=[{id:'emp-a',code:'EMP001',name:'ผู้ฝากตัวอย่าง',position:'พนักงาน',active:true}];
 const doc={id:'line-transfer',file_id:'00000000-0000-4000-8000-000000000001',mime:'image/jpeg',file_size:1000,status:'ready',created_at:'2026-10-30T00:00:00Z',extracted:{documentType:'slip',senderBank:'ธนาคาร OCR ที่ไม่ตรง',receiverBank:'ธนาคาร OCR ที่ไม่ตรง'}};
 const fields={...suggestImport(s,doc),type:'transfer',date:'2026-10-30',amount:'3000',account:'cash',to:'bank',title:'',contact:'ลูกค้าที่ไม่เกี่ยวข้อง',payer:'EMP001 · ผู้ฝากตัวอย่าง',note:'ฝากเงินผ่านตู้',transactionTime:'14:37',transferRef:'REF-TEST-001',referenceBank:'ธนาคารผู้ออกสลิป',debtId:'old-unrelated-bill',paymentMethod:''};
 const result=importLineDocument(s,doc,fields).state;const e=result.entries[0];const manual=transferDetailsFromForm(form({account:'cash',to:'bank',payer:'EMP001 · ผู้ฝากตัวอย่าง',transactionTime:'14:37',transferRef:'REF-TEST-001',referenceBank:'ธนาคารผู้ออกสลิป'}),s);
 for(const key of Object.keys(manual) as (keyof typeof manual)[])assert.equal(e[key],manual[key]);
 assert.equal(e.transactionTime,'14:37');assert.equal(e.transferRef,'REF-TEST-001');assert.equal(e.referenceBank,'ธนาคารผู้ออกสลิป');assert.equal(e.title,'โอนระหว่างบัญชี');assert.equal(e.contact,'');assert.equal(e.debtId,undefined);assert.equal(e.billDetails,undefined);assert.equal(e.withholding,undefined);assert.equal(e.file?.id,doc.file_id);assert.ok(bankNameOptions(result).includes('ธนาคารผู้ออกสลิป'));assert.equal(bankNameOptions(result).filter(name=>name==='กรุงไทย').length,1);assert.equal(e.note,'ฝากเงินผ่านตู้');assert.equal(balance(result,'cash'),0);assert.equal(balance(result,'bank'),300000);
});

test('legacy transfer edits retain reference metadata and explicit empty values clear it',()=>{
 const s=initialState();s.accounts=[{id:'a',name:'A',opening:0},{id:'b',name:'B',opening:0,bankName:'ธนาคารปลายทาง'}];
 const old={id:'old',type:'transfer',account:'a',to:'b',transactionTime:'19:25',transferRef:'REF-OLD',referenceBank:'ธนาคารเดิม'} as Entry;
 const kept=transferDetailsFromForm(form({account:'a',to:'b'}),s,old);assert.equal(kept.transactionTime,'19:25');assert.equal(kept.transferRef,'REF-OLD');assert.equal(kept.referenceBank,'ธนาคารเดิม');
 const cleared=transferDetailsFromForm(form({account:'a',to:'b',transferRef:'',referenceBank:''}),s,old);assert.equal(cleared.transferRef,'');assert.equal(cleared.referenceBank,'');
});
