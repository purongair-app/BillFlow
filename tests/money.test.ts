import test from 'node:test';
import assert from 'node:assert/strict';
import {people,savePerson,togglePerson,deletePerson} from '../src/people.ts';
test('unified directory creates each type and retains old unclassified contacts',()=>{
 let s=initialState();s.contacts=[{id:'old',code:'CT001',name:'รายชื่อเดิม',note:'เดิม',active:true}];
 for(const kind of ['customer','creditor','employee'] as const)s=savePerson(s,{kind,code:'',name:'ชื่อ '+kind,details:'รายละเอียด'});
 assert.deepEqual(people(s).map(p=>p.kind).sort(),['creditor','customer','employee','unclassified']);
 const employee=people(s).find(p=>p.kind==='employee')!;assert.equal(s.employees![0].position,'รายละเอียด');
 s=togglePerson(s,employee);assert.equal(s.employees![0].active,false);s=deletePerson(s,employee);assert.equal(s.employees!.length,0);
 const legacy=people(s).find(p=>p.id==='old')!;s=savePerson(s,{kind:'creditor',code:legacy.code,name:legacy.name,details:legacy.details},legacy);assert.equal(s.contacts![0].kind,'creditor');assert.equal(s.contacts![0].id,'old');validateState(s);
});
test('unified directory edits and changes unused types without duplication, preserving linked history',()=>{
 let s=savePerson(initialState(),{kind:'customer',code:'CUSTOM1',name:'ลูกค้า',details:'เดิม'});
 const person=people(s)[0];s=savePerson(s,{kind:'employee',code:person.code,name:'พนักงาน',details:'ช่าง'},person);assert.equal(s.contacts!.length,0);assert.equal(s.employees!.length,1);assert.equal(s.employees![0].id,person.id);
 s.entries=[entry({recipient:'พนักงาน',recipientEmployeeId:person.id})];
 const employee=people(s)[0];assert.throws(()=>savePerson(s,{kind:'creditor',code:employee.code,name:employee.name,details:''},employee));assert.throws(()=>deletePerson(s,employee));
 s=savePerson(s,{kind:'employee',code:employee.code,name:'ชื่อใหม่',details:'หัวหน้าช่าง'},employee);assert.equal(s.entries[0].recipient,'พนักงาน');assert.equal(s.entries[0].recipientEmployeeId,person.id);validateState(s);
});
import {contactsForKind} from '../src/contacts.ts';
test('customer and creditor directories stay separate from legacy contacts and employees',()=>{
 const s=initialState();s.contacts=[{id:'c',code:'CT001',name:'สมชาย',note:'',active:true,kind:'customer'},{id:'v',code:'CR001',name:'สมชาย',note:'',active:true,kind:'creditor'},{id:'old',code:'CT002',name:'รายชื่อเดิม',note:'',active:true}];
 s.employees=[{id:'e',code:'EMP001',name:'สมชาย',position:'ช่าง',active:true}];validateState(s);
 assert.deepEqual(contactsForKind(s.contacts,'customer').map(c=>c.id),['c']);assert.deepEqual(contactsForKind(s.contacts,'creditor').map(c=>c.id),['v']);
 assert.equal(resolveContact('สมชาย',s.contacts,undefined,'customer').id,'c');assert.equal(resolveContact('สมชาย',s.contacts,undefined,'creditor').id,'v');
 assert.throws(()=>resolveContact('CR001 · สมชาย',s.contacts!,undefined,'customer'));
 assert.equal(nextContactCode(s,'creditor'),'CR002');
 s.entries=[entry({contact:'รายชื่อเดิม',contactId:'old'})];s.contacts[2].kind='creditor';validateState(s);assert.equal(s.entries[0].contactId,'old');assert.equal(s.entries[0].contact,'รายชื่อเดิม');
 assert.deepEqual(resolveContact('CT002 · รายชื่อเดิม',s.contacts,s.entries[0],'customer'),{name:'รายชื่อเดิม',id:'old'});
 s.contacts[2].kind='invalid' as any;assert.throws(()=>validateState(s));
});

import {accountDeletionReason,removeAccount} from '../src/banking.ts';
test('account deletion preserves entries, balances, and the last account',()=>{
 const s=initialState();s.entries=[entry({type:'transfer',to:'bank',amount:10000})];
 for(const id of ['cash','bank']){assert.ok(accountDeletionReason(s,id));assert.throws(()=>removeAccount(s,id));}
 s.entries=[];s.accounts[1].opening=10000;assert.throws(()=>removeAccount(s,'bank'));
 s.accounts[1].opening=0;const n=removeAccount(s,'bank');validateState(n);assert.equal(n.accounts.length,1);assert.equal(s.accounts.length,2);assert.throws(()=>removeAccount(n,'cash'));assert.throws(()=>removeAccount(s,'missing'));
});
import {upsertDebt} from '../src/debts.ts';
import {initialState,balance,remaining,validateState,type Entry} from '../src/money.ts';
function entry(overrides:Partial<Entry>={}):Entry{return {id:crypto.randomUUID(),type:'income',date:'2026-10-29',title:'ค่าล้างแอร์',amount:120050,account:'cash',category:'ค่าบริการ',contact:'',note:'',...overrides};}
test('debt bill references and source rename survive JSON roundtrip with customer links',()=>{
 const s=initialState();s.contacts=[{id:'c1',code:'CT001',name:'ลูกค้า ก',note:'',active:true}];s.documentSources=[{id:'source1',name:'PUROnGAIR'}];
 s.debts=upsertDebt(s,{id:'d1',type:'receivable',name:'ลูกค้า ก',contactId:'c1',billReference:'INV-2569/001',documentSourceId:'source1',title:'ติดตั้งแอร์',amount:500000,due:'2026-11-01'});
 const restored=JSON.parse(JSON.stringify(s));validateState(restored);assert.equal(restored.debts[0].billReference,'INV-2569/001');
 restored.documentSources[0].name='โปรแกรมร้านแอร์';validateState(restored);assert.equal(restored.debts[0].documentSourceId,'source1');
 assert.equal(contactUsageCount(restored,'c1'),1);restored.contacts=[];assert.throws(()=>validateState(restored));
});
test('editing a partly paid debt retains payments and blocks reductions below paid total or type changes',()=>{
 const s=initialState();s.debts=[{id:'d1',type:'receivable',name:'ลูกค้า',title:'ติดตั้งแอร์',amount:500000,due:'2026-11-01'}];s.entries=[entry({amount:100000,debtId:'d1'})];
 s.debts=upsertDebt(s,{...s.debts[0],amount:450000,billReference:'INV-2'});assert.equal(s.debts.length,1);assert.equal(remaining(s,s.debts[0]),350000);assert.equal(s.entries[0].debtId,'d1');
 assert.throws(()=>upsertDebt(s,{...s.debts[0],amount:99999}));assert.throws(()=>upsertDebt(s,{...s.debts[0],type:'payable'}));
 s.debts=upsertDebt(s,{...s.debts[0],amount:100000});assert.equal(remaining(s,s.debts[0]),0);
});
test('legacy debts remain valid while invalid source references and duplicate source names are rejected',()=>{
 const s=initialState();s.debts=[{id:'d1',type:'payable',name:'ร้านอะไหล่',title:'อะไหล่',amount:50000,due:'2026-11-01'}];delete s.documentSources;validateState(s);
 s.debts[0].documentSourceId='missing';assert.throws(()=>validateState(s));delete s.debts[0].documentSourceId;
 s.documentSources=[{id:'s1',name:'POS'},{id:'s2',name:'pos'}];assert.throws(()=>validateState(s));
});
test('cash transfer preserves total and is not income',()=>{const s=initialState();s.accounts[0].opening=100000;s.entries=[entry(),entry({type:'expense',amount:20050}),entry({type:'transfer',amount:50000,to:'bank'})];validateState(s);assert.equal(balance(s,'cash'),150000);assert.equal(balance(s,'bank'),50000);assert.equal(balance(s,'cash')+balance(s,'bank'),200000);s.entries=s.entries.filter(e=>e.type!=='transfer');assert.equal(balance(s,'cash'),200000);assert.equal(balance(s,'bank'),0);});
test('partial debt payments and overpayment rejection',()=>{const s=initialState();s.debts=[{id:'d1',type:'receivable',name:'ลูกค้า',title:'ติดตั้งแอร์',amount:100000,due:'2026-11-01'}];s.entries=[entry({amount:35000,debtId:'d1'})];validateState(s);assert.equal(remaining(s,s.debts[0]),65000);s.entries.push(entry({amount:65000,debtId:'d1'}));validateState(s);assert.equal(remaining(s,s.debts[0]),0);s.entries.push(entry({amount:1,debtId:'d1'}));assert.throws(()=>validateState(s));});
test('invalid ledger rejects same-account transfer, fractional cents and impossible dates',()=>{for(const data of [{type:'transfer' as const,to:'cash'},{amount:10.1},{date:'2026-02-30'},{account:'other'}]){const s=initialState();s.entries=[entry(data)];assert.throws(()=>validateState(s));}});
test('payment type must match debt type',()=>{const s=initialState();s.debts=[{id:'d',type:'payable',name:'ร้าน',title:'อะไหล่',amount:10000,due:'2026-11-01'}];s.entries=[entry({amount:1000,debtId:'d'})];assert.throws(()=>validateState(s));});

import {cashbook,expenseGroups,nextDocumentNo,makeCsv} from '../src/accounting.ts';
test('monthly cashbook reconciles opening, internal transfers, and closing by account',()=>{const s=initialState();s.accounts[0].opening=100000;s.accounts[1].opening=50000;s.entries=[entry({id:'prior-income',date:'2026-09-30',amount:10000}),entry({id:'prior-expense',date:'2026-09-30',type:'expense',amount:5000,account:'bank'}),entry({id:'prior-transfer',date:'2026-09-30',type:'transfer',amount:20000,to:'bank'}),entry({id:'current-income',date:'2026-10-01',amount:50000}),entry({id:'current-expense',date:'2026-10-02',type:'expense',amount:10000,account:'bank'}),entry({id:'current-transfer',date:'2026-10-03',type:'transfer',amount:30000,to:'bank'}),entry({id:'future',date:'2026-11-01',type:'expense',amount:7000,account:'bank'})];validateState(s);const all=cashbook(s,'2026-10'),cash=cashbook(s,'2026-10','cash'),bank=cashbook(s,'2026-10','bank');assert.deepEqual([all.opening,all.incoming,all.outgoing,all.closing],[155000,50000,10000,195000]);assert.deepEqual([cash.opening,cash.incoming,cash.outgoing,cash.closing],[90000,50000,30000,110000]);assert.deepEqual([bank.opening,bank.incoming,bank.outgoing,bank.closing],[65000,30000,10000,85000]);assert.equal(cash.closing+bank.closing,all.closing);assert.equal(all.rows.find(r=>r.entry.type==='transfer')!.incoming,0);});
test('fuel, meals, and utilities require relevant detail while old records remain compatible',()=>{for(const [expenseKind,fields] of [['fuel',{vehicle:'กข 1234',claimant:'ช่าง ก'}],['meal',{beneficiary:'ทีมติดตั้ง',claimant:'ช่าง ข'}],['electricity',{property:'สำนักงาน 1'}],['water',{property:'บ้านพัก 2'}]] as const){const s=initialState();s.entries=[entry({type:'expense',expenseKind})];assert.throws(()=>validateState(s));Object.assign(s.entries[0],fields);validateState(s);}validateState(initialState());const old=initialState();old.entries=[entry({type:'expense'})];validateState(old);});
test('expense detail summary separates vehicles, claimants, and beneficiaries',()=>{const s=initialState();s.entries=[entry({type:'expense',expenseKind:'fuel',amount:10000,vehicle:'กข 111',claimant:'ก'}),entry({type:'expense',expenseKind:'fuel',amount:5000,vehicle:'กข 111',claimant:'ก'}),entry({type:'expense',expenseKind:'fuel',amount:7000,vehicle:'กข 222',claimant:'ข'}),entry({type:'expense',expenseKind:'meal',amount:8000,claimant:'ก',beneficiary:'ทีม 1'})];validateState(s);const groups=expenseGroups(cashbook(s,'2026-10').rows);assert.equal(groups.length,3);assert.equal(groups.find(g=>g.detail.includes('111'))!.total,15000);assert.equal(groups.find(g=>g.beneficiary==='ทีม 1')!.total,8000);assert.equal(groups.reduce((n,g)=>n+g.total,0),30000);});
test('document sequence uses Buddhist year and prevents duplicate documents',()=>{const s=initialState();s.entries=[entry({documentNo:'PV-256910-0007',type:'expense'})];assert.equal(nextDocumentNo(s,'expense','2026-10-29'),'PV-256910-0008');assert.equal(nextDocumentNo(s,'income','2026-10-29'),'RV-256910-0001');s.entries.push(entry({documentNo:'pv-256910-0007'}));assert.throws(()=>validateState(s),/เลขที่เอกสารซ้ำ/);});
test('CSV escapes formulas in text while preserving negative numeric balances',()=>{const csv=makeCsv([['  =SUM(A1)',-25.5,'+cmd','normal']]);assert.match(csv,/"'  =SUM\(A1\)"/);assert.match(csv,/"-25.5"/);assert.doesNotMatch(csv,/"'-25.5"/);assert.match(csv,/"'\+cmd"/);});

import {employeeValue,resolveEmployee,nextEmployeeCode,employeeUsageCount} from '../src/employees.ts';
test('employee directory accepts old ledgers and rejects duplicate codes or missing references',()=>{const s=initialState();delete s.employees;validateState(s);s.employees=[{id:'p1',code:'EMP001',name:'กิม',position:'ช่าง',active:true}];assert.equal(nextEmployeeCode(s),'EMP002');s.entries=[entry({payer:'กิม',payerEmployeeId:'p1'})];validateState(s);assert.equal(employeeUsageCount(s,'p1'),1);s.employees.push({...s.employees[0],id:'p2',code:'emp001'});assert.throws(()=>validateState(s));s.employees=[];assert.throws(()=>validateState(s));});
test('employee selection distinguishes same names and preserves historical names after rename and archive',()=>{const people=[{id:'p1',code:'EMP001',name:'กิม',position:'ช่าง',active:true},{id:'p2',code:'EMP002',name:'กิม',position:'บัญชี',active:true}];assert.deepEqual(resolveEmployee('EMP002 · กิม',people,undefined,'payer'),{name:'กิม',id:'p2'});assert.deepEqual(resolveEmployee('กิม',people,undefined,'payer'),{name:'กิม'});const old=entry({payer:'กิม',payerEmployeeId:'p1'});people[0]={...people[0],name:'กิม ใหม่',active:false};assert.equal(employeeValue(old,'payer',people),'EMP001 · กิม');assert.deepEqual(resolveEmployee('EMP001 · กิม',people,old,'payer'),{name:'กิม',id:'p1'});assert.throws(()=>resolveEmployee('EMP001 · กิม ใหม่',people,undefined,'payer'));assert.deepEqual(resolveEmployee('ร้านอะไหล่',people,undefined,'recipient'),{name:'ร้านอะไหล่'});});

import {contactValue,resolveContact,nextContactCode,contactUsageCount} from '../src/contacts.ts';
test('saved contacts preserve history across rename and archive, with safe reference validation',()=>{const s=initialState();delete s.contacts;validateState(s);s.contacts=[{id:'c1',code:'CT001',name:'ร้านตัวอย่าง',note:'คู่ค้า',active:true}];assert.equal(nextContactCode(s),'CT002');assert.deepEqual(resolveContact('CT001 · ร้านตัวอย่าง',s.contacts),{name:'ร้านตัวอย่าง',id:'c1'});s.entries=[entry({contact:'ร้านตัวอย่าง',contactId:'c1'})];validateState(s);assert.equal(contactUsageCount(s,'c1'),1);s.contacts[0].name='ชื่อใหม่';s.contacts[0].active=false;assert.equal(contactValue(s.entries[0],s.contacts),'CT001 · ร้านตัวอย่าง');assert.deepEqual(resolveContact('CT001 · ร้านตัวอย่าง',s.contacts,s.entries[0]),{name:'ร้านตัวอย่าง',id:'c1'});assert.throws(()=>resolveContact('CT001 · ชื่อใหม่',s.contacts||[]));s.contacts=[];assert.throws(()=>validateState(s));});
test('saved contacts reject duplicate codes and resolve duplicate names only with their code',()=>{const s=initialState();s.contacts=[{id:'c1',code:'CT001',name:'ชื่อซ้ำ',note:'',active:true},{id:'c2',code:'CT002',name:'ชื่อซ้ำ',note:'',active:true}];validateState(s);assert.deepEqual(resolveContact('ชื่อซ้ำ',s.contacts),{name:'ชื่อซ้ำ'});assert.deepEqual(resolveContact('CT002 · ชื่อซ้ำ',s.contacts),{name:'ชื่อซ้ำ',id:'c2'});s.contacts[1].code='ct001';assert.throws(()=>validateState(s));});

import {notificationText,verifySignature,sha256} from '../supabase/functions/billflow-line/messages.ts';
test('LINE test contains only a fixed sample message and financial messages use integer satang',()=>{const sample=notificationText({id:'t',action:'test',entry:{title:'ข้อมูลห้ามรั่ว',amount:99999},business:'กิจการลับ',accounts:[]});assert.match(sample,/ทดสอบระบบ BillFlow/);assert.doesNotMatch(sample,/ข้อมูลห้ามรั่ว|กิจการลับ|999/);const text=notificationText({id:'n',action:'create',entry:{type:'transfer',amount:12345,title:'ฝากเงิน\nปลอมบรรทัด',date:'2026-10-29',account:'cash',to:'bank'},business:'กิจการตัวอย่าง',accounts:[{id:'cash',name:'เงินสด'},{id:'bank',name:'ธนาคาร'}]});assert.match(text,/123.45 บาท/);assert.match(text,/เงินสด → ธนาคาร/);assert.match(text,/ฝากเงิน ปลอมบรรทัด/);assert.throws(()=>notificationText({id:'bad',action:'create',entry:{amount:0.1},business:'',accounts:[]}));});
test('LINE webhook validates raw-body HMAC and rejects forged or altered messages',async()=>{const raw=JSON.stringify({events:[]}),secret='sample-secret';const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw))).toString('base64');assert.equal(await verifySignature(raw,signature,secret),true);assert.equal(await verifySignature(raw+' ',signature,secret),false);assert.equal(await verifySignature(raw,signature,'wrong'),false);assert.equal(await verifySignature(raw,'not-base64',secret),false);assert.equal((await sha256('PAIR-CODE')).length,64);});

import {accountStatement,bankDefaults,accountLabel} from '../src/banking.ts';
import {lineMessages,receiptPaths,notificationText as bankNotificationText} from '../supabase/functions/billflow-line/messages.bank.pending.ts';
test('multiple bank accounts reconcile receipts, supplier payments and internal transfers independently',()=>{const s=initialState();s.accounts=[{id:'a',name:'บัญชีรับบริการ',opening:100000,kind:'bank',bankName:'ธนาคาร ก',accountNumber:'111-00001'},{id:'b',name:'บัญชีจ่ายสินค้า',opening:200000,kind:'bank',bankName:'ธนาคาร ข',accountNumber:'222-00002'}];s.entries=[entry({id:'in',account:'a',amount:500000,transactionTime:'17:22',senderName:'ลูกค้าตัวอย่าง',receiverBank:'ธนาคาร ก',transferRef:'REF-A'}),entry({id:'out',type:'expense',account:'b',amount:14500,transactionTime:'13:17'}),entry({id:'tr',type:'transfer',account:'a',to:'b',amount:50000})];validateState(s);const a=accountStatement(s,'a'),b=accountStatement(s,'b');assert.deepEqual([a.incoming,a.outgoing,a.closing],[500000,50000,550000]);assert.deepEqual([b.incoming,b.outgoing,b.closing],[50000,14500,235500]);assert.equal(a.closing, balance(s,'a'));assert.equal(b.closing,balance(s,'b'));assert.match(accountLabel(s.accounts[0]),/ธนาคาร ก/);assert.doesNotMatch(accountLabel(s.accounts[0]),/111-00001/);const def=bankDefaults('income',s.accounts[0]);assert.equal(def.senderBank,'');assert.equal(def.receiverBank,'ธนาคาร ก');assert.equal(bankDefaults('expense',s.accounts[1]).senderBank,'ธนาคาร ข');});
test('slip time, duplicate references and optional legacy account details validate safely',()=>{const s=initialState();validateState(s);s.entries=[entry({transactionTime:'25:99'})];assert.throws(()=>validateState(s),/เวลาโอน/);s.entries=[entry({transferRef:'ref123',senderBank:'ธนาคาร ก'}),entry({transferRef:'REF123',senderBank:'ธนาคาร ก'})];assert.throws(()=>validateState(s),/อ้างอิงการโอนซ้ำ/);s.entries[1].senderBank='ธนาคาร ข';validateState(s);s.entries[1].file={id:'00000000-0000-4000-8000-000000000001',name:'slip.png',mime:'image/png',previewId:'../other-owner'};assert.throws(()=>validateState(s));});
test('LINE bank receipts include time, parties and masked accounts; image messages stay owner-scoped',()=>{const q={id:'q',action:'create',owner:'00000000-0000-4000-8000-000000000010',business:'ร้านตัวอย่าง',accounts:[{id:'bank',name:'บัญชีรับบริการ',bankName:'ธนาคาร ก',accountNumber:'1234567890'}],entry:{id:'entry-one',type:'income',date:'2026-10-29',transactionTime:'17:22',title:'ค่าบริการ',amount:500000,account:'bank',contact:'ลูกค้าตัวอย่าง',senderName:'ผู้โอนตัวอย่าง',senderBank:'ธนาคาร ข',senderAccount:'9876543210',transferRef:'REF999',file:{id:'00000000-0000-4000-8000-000000000001',name:'slip.png',mime:'image/png',previewId:'00000000-0000-4000-8000-000000000002'},slipReview:'pending'}};const text=bankNotificationText(q);assert.match(text,/17:22/);assert.match(text,/ลูกค้าตัวอย่าง/);assert.match(text,/ผู้โอนตัวอย่าง/);assert.match(text,/5,000.00/);assert.match(text,/•••• 7890/);assert.doesNotMatch(text,/1234567890|9876543210/);assert.equal(receiptPaths(q)?.original,q.owner+'/'+q.entry.file.id);assert.equal(lineMessages(q,{original:'https://example.com/original',preview:'https://example.com/preview'}).length,2);assert.equal(lineMessages({...q,action:'delete'}).length,1);assert.equal(receiptPaths({...q,owner:'../other'}),null);assert.equal(receiptPaths({...q,entry:{...q.entry,file:{...q.entry.file,mime:'application/pdf',name:'bill.pdf'}}}),null);assert.throws(()=>lineMessages(q,{original:'http://unsafe',preview:'https://example.com/p'}));});

import {normalizeExtraction} from '../supabase/functions/billflow-line/ocr.ts';
import {importLineDocument,suggestImport,type LineDocument} from '../src/lineDocuments.ts';
const inboxDocument=(extracted:LineDocument['extracted']={}):LineDocument=>({id:crypto.randomUUID(),file_id:crypto.randomUUID(),mime:'image/jpeg',file_size:1200,status:'ready',extracted,created_at:new Date().toISOString()});
test('invoice import creates a debt with evidence without changing bank balances',()=>{
 const s=initialState(),doc=inboxDocument({documentType:'invoice',documentNo:'INV-691008',date:'2026-10-16',title:'ล้างแอร์ 4 เครื่อง',contact:'ลูกค้าตัวอย่าง',amount:820000});
 const f=suggestImport(s,doc);assert.equal(f.type,'receivable');const result=importLineDocument(s,doc,f);assert.equal(result.target,'debt');assert.equal(result.state.debts[0].amount,820000);assert.equal(result.state.debts[0].file?.id,doc.file_id);assert.equal(balance(result.state,'bank'),0);assert.equal(result.state.entries.length,0);assert.equal(s.debts.length,0);
 assert.throws(()=>importLineDocument(s,doc,{...f,type:'income',account:'bank'}),/ใบแจ้งหนี้/);
 assert.throws(()=>importLineDocument(result.state,{...doc,id:crypto.randomUUID()},f),/เลขบิล/);
});
test('slips require explicit direction when masked or ambiguous, and can partially settle invoices',()=>{
 const s=initialState();s.accounts[1].accountNumber='9050392555';s.debts=[{id:'invoice',type:'receivable',name:'ลูกค้า',title:'งานล้างแอร์',amount:820000,due:'2026-10-31'}];
 const masked=inboxDocument({documentType:'slip',receiverAccount:'xxx-xxx-2555',amount:500000});assert.equal(suggestImport(s,masked).type,'');
 const doc=inboxDocument({documentType:'slip',date:'2026-10-29',title:'ชำระค่าบริการ',contact:'ลูกค้า',receiverAccount:'905-0-39255-5',amount:500000,transferRef:'SLIP-001'});const f=suggestImport(s,doc);assert.equal(f.type,'income');assert.equal(f.account,'bank');
 const result=importLineDocument(s,doc,{...f,debtId:'invoice'});assert.equal(balance(result.state,'bank'),500000);assert.equal(remaining(result.state,result.state.debts[0]),320000);assert.equal(result.state.entries[0].file?.id,doc.file_id);
 assert.throws(()=>importLineDocument(result.state,doc,f),/บันทึกแล้ว/);
 assert.throws(()=>importLineDocument(s,doc,{...f,amount:'9000',debtId:'invoice'}));
 assert.throws(()=>importLineDocument(s,{...doc,status:'confirmed'},f));
});
test('OCR output is constrained, preserves unknowns, and treats amount as baht exactly once',()=>{
 const x=normalizeExtraction({documentType:'invoice',amount:8200,date:'2026-02-30',due:'2026-10-31',transactionTime:'99:99',senderAccount:'x'.repeat(100),warnings:['โปรดตรวจยอด']});assert.equal(x.amount,820000);assert.equal(x.date,'');assert.equal(x.due,'2026-10-31');assert.equal(x.transactionTime,'');assert.equal(x.senderAccount.length,50);assert.equal(normalizeExtraction({amount:'8200',documentType:'income'}).amount,null);assert.equal(normalizeExtraction({documentType:'income'}).documentType,'other');
});

import {extractDocument} from '../supabase/functions/billflow-line/ocr.ts';
test('OCR request normalizes a returned invoice and propagates provider failures without recording payment',async()=>{
 const fixtureFetch:typeof fetch=async (url,options)=>{
  assert.match(String(url),/^https:\/\/generativelanguage.googleapis.com\/v1beta\/models\/gemini-/);
  const body=JSON.parse(String(options?.body));assert.equal(body.contents[0].parts[1].inlineData.mimeType,'image/jpeg');assert.equal(body.contents[0].parts[1].inlineData.data,'AQID');
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({documentType:'invoice',amount:8200,documentNo:'INV-691008',date:'2026-10-16',title:'งานล้างแอร์',contact:'ลูกค้าตัวอย่าง'})}]}}]}),{status:200});
 };
 const output=await extractDocument('test-key-only','gemini-3.8-flash',new Uint8Array([1,2,3]),'image/jpeg',fixtureFetch);assert.equal(output.documentType,'invoice');assert.equal(output.amount,820000);assert.equal(output.documentNo,'INV-691008');
 await assert.rejects(extractDocument('test-key-only','gemini-3.8-flash',new Uint8Array([1]),'image/jpeg',async()=>new Response('{}',{status:429})),/AI_429/);
 const s=initialState(),doc=inboxDocument({documentType:'slip',amount:10000,title:'ชำระเงิน',receiverName:'ชื่ออ่านผิด'}),f=suggestImport(s,doc);const result=importLineDocument(s,doc,{...f,type:'income',account:'bank',receiverName:'ชื่อที่ตรวจแล้ว'});assert.equal(result.state.entries[0].receiverName,'ชื่อที่ตรวจแล้ว');
});

import {parseOcrCredentials} from '../supabase/functions/billflow-line/ocr.ts';
test('API setup distinguishes key and model errors and does not restrict provider key punctuation',()=>{
 const key='QA.test-key_with-punctuation_0123456789';assert.deepEqual(parseOcrCredentials({key:'  '+key+'\n',model:' models/gemini-3.8-flash '}),{key,model:'gemini-3.8-flash'});
 assert.throws(()=>parseOcrCredentials({key:'BillFlow',model:'gemini-3.8-flash'}),/รูปแบบ API key/);
 assert.throws(()=>parseOcrCredentials({key:key+' hidden space',model:'gemini-3.8-flash'}),/รูปแบบ API key/);
 assert.throws(()=>parseOcrCredentials({key,model:'gemini 3.8 flash'}),/ชื่อโมเดล/);
});

test('OCR separates provider timeouts and accepts final JSON without internal reasoning',async()=>{
 await assert.rejects(extractDocument('qa-key','gemini-3.8-flash',new Uint8Array([1]),'image/jpeg',async()=>{throw new DOMException('Timed out','TimeoutError')}),/AI_TIMEOUT/);
 const result=await extractDocument('qa-key','gemini-3.8-flash',new Uint8Array([1]),'image/jpeg',async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{thought:true,text:'internal reasoning'},{text:'```json\n{"documentType":"invoice","amount":8200}\n```'}]}}]}),{status:200}));assert.equal(result.amount,820000);
 await assert.rejects(extractDocument('qa-key','gemini-3.8-flash',new Uint8Array([1]),'image/jpeg',async()=>new Response(JSON.stringify({candidates:[{finishReason:'MAX_TOKENS'}]}),{status:200})),/AI_TRUNCATED/);
});

import {canView,canEdit,canSaveChanges,validateMenuSelection,type Access} from '../src/permissions.ts';
test('menu visibility and editing stay separate and owner rights cannot be reduced',()=>{
 const staff:Access={owner:false,workspaceOwner:'shop',menus:['people','entries'],editMenus:['people']};assert.equal(canView(staff,'people'),true);assert.equal(canView(staff,'permissions'),false);assert.equal(canEdit(staff,'entries'),false);assert.equal(canEdit(staff,'people'),true);assert.equal(canView({...staff,owner:true,menus:[]},'settings'),true);
 validateMenuSelection(['people'],['people']);assert.throws(()=>validateMenuSelection(['settings'],[]));assert.throws(()=>validateMenuSelection(['entries'],['accounts']));
 assert.equal(canSaveChanges(staff,{contacts:[],entries:[]},{contacts:[{name:'พนักงาน'}],entries:[],audit:[{text:'edit'}]}),true);assert.equal(canSaveChanges(staff,{entries:[]},{entries:[{amount:100}]}),false);assert.equal(canSaveChanges(staff,{business:'ร้าน'},{business:'เปลี่ยนชื่อร้าน'}),false);assert.equal(canView({...staff,menus:[],editMenus:[]},'entries'),false);
});

import {type RecurringExpense,nextOccurrence,isOccurrence,validateRecurring,daysUntil} from '../src/recurring.ts';
const recurring=(p:Partial<RecurringExpense>={}):RecurringExpense=>({id:'rent',title:'ค่าเช่าร้าน',frequency:'monthly',startDate:'2026-01-31',amount:800000,remindDays:[3,7,15,30],enabled:true,note:'',...p});
test('recurring expenses clamp month-end without moving the original day or leap-day anchor',()=>{
 const r=recurring();assert.equal(nextOccurrence(r,'2026-02-01'),'2026-02-28');assert.equal(nextOccurrence(r,'2026-03-01'),'2026-03-31');assert.equal(isOccurrence(r,'2026-03-28'),false);
 const tax=recurring({frequency:'yearly',startDate:'2024-02-29'});assert.equal(nextOccurrence(tax,'2025-01-01'),'2025-02-28');assert.equal(nextOccurrence(tax,'2028-01-01'),'2028-02-29');
 assert.equal(nextOccurrence(recurring({startDate:'2027-06-15'}),'2026-10-29'),'2027-06-15');
});
test('paid occurrence stops its reminders and the next monthly or yearly cycle still repeats',()=>{
 const r=recurring({paidThrough:'2026-10-31'});assert.equal(isOccurrence(r,'2026-10-31'),false);assert.equal(nextOccurrence(r,'2026-10-29'),'2026-11-30');assert.equal(isOccurrence(r,'2026-11-30'),true);
 assert.equal(nextOccurrence(recurring({frequency:'yearly',paidThrough:'2026-01-31'}),'2026-01-15'),'2027-01-31');assert.equal(daysUntil('2026-11-05','2026-10-29'),7);
});
test('recurring validation accepts unknown bill totals and rejects impossible dates and unsupported offsets',()=>{
 validateRecurring([recurring({amount:0})]);for(const p of [{startDate:'2026-02-30'},{remindDays:[]},{remindDays:[1]},{remindDays:[7,7]},{amount:-1},{amount:1.5},{paidThrough:'bad'}])assert.throws(()=>validateRecurring([recurring(p)]));assert.throws(()=>validateRecurring([recurring(),recurring()]));
 const s=initialState();s.recurringExpenses=[recurring()];validateState(s);assert.equal(s.entries.length,0);assert.equal(s.debts.length,0);
});
test('recurring reminders contain a clear estimated amount and due date, without posting transactions',()=>{
 const q={id:'notice',action:'reminder',entry:{title:'ค่าไฟ\nรายการปลอม',amount:19260,due:'2026-11-05',days:7,frequency:'monthly'},business:'ร้านตัวอย่าง',accounts:[]};const text=notificationText(q);assert.match(text,/อีก 7 วัน/);assert.match(text,/ยอดประมาณ: 192.60 บาท/);assert.match(text,/ค่าไฟ รายการปลอม/);assert.match(text,/recurring=1/);assert.match(notificationText({...q,entry:{...q.entry,amount:0}}),/รอยอดบิลจริง/);assert.throws(()=>notificationText({...q,entry:{...q.entry,days:1}}));
});

import {defaultRecurringNames,saveRecurringName,validateRecurringNames,occurrenceComplete} from '../src/recurring.ts';
test('recurring expense catalog supports add, rename, delete and rejects duplicate names',()=>{
 const added=saveRecurringName(defaultRecurringNames,' ค่าอินเทอร์เน็ต ');assert.equal(added.at(-1)!.name,'ค่าอินเทอร์เน็ต');assert.equal(defaultRecurringNames.length,6);
 const renamed=saveRecurringName(added,'ค่าประกันรถ',added.at(-1)!.id);assert.equal(renamed.at(-1)!.name,'ค่าประกันรถ');assert.throws(()=>saveRecurringName(renamed,'ค่าเช่าร้าน'));assert.throws(()=>saveRecurringName(renamed,'  '));validateRecurringNames(renamed.filter(x=>x.id!==renamed.at(-1)!.id));validateRecurringNames([]);
 const s=initialState();s.recurringExpenseNames=renamed;validateState(s);
});
test('repeat checkbox preserves legacy monthly/yearly schedules and limits unchecked schedules to one occurrence',()=>{
 const single=recurring({repeat:false,startDate:'2026-11-05'});assert.equal(isOccurrence(single,'2026-11-05'),true);assert.equal(isOccurrence(single,'2026-12-05'),false);assert.equal(isOccurrence(recurring({startDate:'2026-11-05'}),'2026-12-05'),true);assert.equal(isOccurrence({...single,repeat:true},'2026-12-05'),true);
 assert.equal(occurrenceComplete(single,'2026-11-06'),true);assert.equal(occurrenceComplete({...single,paidThrough:'2026-11-05'},'2026-11-01'),true);assert.equal(occurrenceComplete(single,'2026-11-01'),false);assert.equal(nextOccurrence(single,'2026-11-06'),'2026-11-05');
 assert.throws(()=>validateRecurring([{...single,repeat:'yes'}]));
 const text=notificationText({id:'single',action:'reminder',entry:{title:'ทดสอบ',amount:0,due:'2026-11-05',days:7,frequency:'monthly',schedule:single},business:'',accounts:[]});assert.match(text,/ครั้งเดียว/);
});
