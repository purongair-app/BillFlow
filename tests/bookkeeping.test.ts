import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,validateState,type Entry} from '../src/money.ts';
import {bookState,chartOfAccounts,postings,trialBalance,generalLedger,profitAndLoss,positionStatement,partyBalances,type Journal,type Allocation} from '../src/bookkeeping.ts';
const entry=(override:Partial<Entry>={}):Entry=>({id:'e1',date:'2026-10-29',type:'income',title:'ค่าบริการ',amount:10000,account:'cash',category:'ค่าบริการ',contact:'ลูกค้า ก',note:'',...override});
const allocation=(code:string):Allocation=>({code,department:'ทีมแอร์',project:'JOB001',reference:'INV001',source:'ระบบขาย',note:'รายละเอียดอ้างอิง'});
const journal=(override:Partial<Journal>={}):Journal=>({id:'j1',no:'JV001',date:'2026-10-28',kind:'sales',memo:'ขายบริการเชื่อ',reference:'INV001',source:'ระบบขาย',contact:'ลูกค้า ก',lines:[{code:'110000',debit:10700,credit:0,detail:'ลูกหนี้'},{code:'410000',debit:0,credit:10000,detail:'บริการ'},{code:'212000',debit:0,credit:700,detail:'ภาษีขาย'}],...override});
test('chart covers five groups and retains stable bank codes after initialization',()=>{
 const s=initialState(),chart=chartOfAccounts(s);assert.deepEqual([...new Set(chart.map(a=>a.group))].sort(),['asset','equity','expense','income','liability']);assert.equal(new Set(chart.map(a=>a.code)).size,chart.length);assert.ok(chart.every(a=>/^\d{6}$/.test(a.code)));
 s.bookkeeping=bookState(s);const code=chart.find(a=>a.cashAccountId==='bank')!.code;s.accounts.unshift({id:'new',name:'ธนาคารเพิ่ม',opening:0});assert.equal(chartOfAccounts(s).find(a=>a.cashAccountId==='bank')!.code,code);s.bookkeeping=bookState(s);validateState(s);
});
test('cash receipts, owner drawings and internal transfers balance without inflating profit',()=>{
 const s=initialState();s.accounts[0].opening=5000;s.entries=[entry(),entry({id:'e2',type:'expense',amount:2000,expenseAccountType:'owner'}),entry({id:'e3',type:'transfer',to:'bank',amount:3000})];s.bookkeeping=bookState(s);validateState(s);
 for(const j of postings(s))assert.equal(j.lines.reduce((n,l)=>n+l.debit,0),j.lines.reduce((n,l)=>n+l.credit,0));assert.equal(profitAndLoss(s,'2026-10-01','2026-10-31').profit,10000);assert.equal(positionStatement(s,'2026-10-31').difference,0);
 const bank=chartOfAccounts(s).find(a=>a.cashAccountId==='bank')!;assert.equal(generalLedger(s,bank.code,'2026-10-01','2026-10-31').closing,3000);assert.equal(postings(s).filter(j=>j.kind==='transfer').length,1);
});
test('credit sale with output VAT and cash settlement clears receivable exactly once',()=>{
 const s=initialState();s.entries=[entry({amount:10700})];s.bookkeeping=bookState(s);s.bookkeeping.allocations.e1=allocation('110000');s.bookkeeping.journals=[journal()];validateState(s);
 assert.equal(partyBalances(s,'2026-10-31')[0].amount,0);assert.equal(profitAndLoss(s,'2026-10-01','2026-10-31').income,10000);assert.equal(trialBalance(s,'2026-10-31').find(a=>a.code==='212000')!.balanceCredit,700);assert.equal(positionStatement(s,'2026-10-31').difference,0);
 const source=postings(s).find(j=>j.entryId==='e1')!;assert.equal(source.reference,'INV001');assert.equal(source.lines[0].project,'JOB001');assert.equal(source.source,'ระบบขาย');
});
test('credit inventory purchase and input VAT settle supplier without expensing stock twice',()=>{
 const s=initialState();s.entries=[entry({type:'expense',amount:10700,contact:'ผู้ขาย ก'})];s.bookkeeping=bookState(s);s.bookkeeping.allocations.e1=allocation('210000');s.bookkeeping.journals=[journal({kind:'purchase',contact:'ผู้ขาย ก',memo:'ซื้ออะไหล่เชื่อ',lines:[{code:'112000',debit:10000,credit:0,detail:'อะไหล่'},{code:'113000',debit:700,credit:0,detail:'ภาษีซื้อ'},{code:'210000',debit:0,credit:10700,detail:'เจ้าหนี้'}]})];validateState(s);
 assert.equal(partyBalances(s,'2026-10-31','210000')[0].amount,0);assert.equal(profitAndLoss(s,'2026-10-01','2026-10-31').expense,0);assert.equal(trialBalance(s,'2026-10-31').find(a=>a.code==='112000')!.balanceDebit,10000);assert.equal(positionStatement(s,'2026-10-31').difference,0);
});
test('journal rejects imbalance, fractional satang, duplicate documents and manual cash movements',()=>{
 const s=initialState();s.bookkeeping=bookState(s);s.bookkeeping.journals=[journal()];validateState(s);
 const broken=structuredClone(s);broken.bookkeeping!.journals[0].lines[0].debit=10699;assert.throws(()=>validateState(broken));broken.bookkeeping!.journals[0].lines[0].debit=10700.5;assert.throws(()=>validateState(broken));
 const dup=structuredClone(s);dup.bookkeeping!.journals.push({...journal(),id:'j2'});assert.throws(()=>validateState(dup));
 const cash=structuredClone(s);cash.bookkeeping!.journals[0].lines[0].code=chartOfAccounts(s).find(a=>a.cashAccountId==='cash')!.code;assert.throws(()=>validateState(cash));
});
test('journal reversal preserves original source and cancels balances without duplicate reversals',()=>{
 const s=initialState();s.bookkeeping=bookState(s);const original=journal();s.bookkeeping.journals=[original,{...original,id:'reverse',no:'RV001',date:'2026-10-29',kind:'adjustment',reversalOf:original.id,lines:original.lines.map(l=>({...l,debit:l.credit,credit:l.debit}))}];validateState(s);assert.equal(profitAndLoss(s,'2026-10-01','2026-10-31').profit,0);assert.ok(trialBalance(s,'2026-10-31').every(a=>a.balanceDebit===0&&a.balanceCredit===0));
 s.bookkeeping.journals.push({...s.bookkeeping.journals[1],id:'again',no:'RV002'});assert.throws(()=>validateState(s));
});
test('opening debit and overdraft reconcile to trial balance and month-end carry forward',()=>{
 const s=initialState();s.accounts[0].opening=10000;s.accounts[1].opening=-2500;s.entries=[entry({date:'2026-09-30'})];s.bookkeeping=bookState(s);validateState(s);const cash=chartOfAccounts(s).find(a=>a.cashAccountId==='cash')!;assert.equal(generalLedger(s,cash.code,'2026-10-01','2026-10-31').opening,20000);assert.equal(positionStatement(s,'2026-10-31').difference,0);
 s.bookkeeping.openingDate='2026-10-01';assert.throws(()=>validateState(s));
});
test('closing entries move accumulated profit to equity while period profit remains visible',()=>{
 const s=initialState();s.entries=[entry()];s.bookkeeping=bookState(s);s.bookkeeping.journals=[journal({kind:'closing',date:'2026-10-31',memo:'ปิดรายได้',lines:[{code:'410000',debit:10000,credit:0,detail:'ปิดรายได้'},{code:'320000',debit:0,credit:10000,detail:'กำไรสะสม'}]})];validateState(s);assert.equal(profitAndLoss(s,'2026-10-01','2026-10-31').profit,10000);assert.equal(positionStatement(s,'2026-10-31').unclosed,0);assert.equal(positionStatement(s,'2026-10-31').equity,10000);
});

import {cashFlowStatement,expenseDimensions} from '../src/bookkeeping.ts';
test('cash flow excludes internal transfers and separates operating, investing and financing',()=>{
 const s=initialState();s.accounts[0].opening=10000;s.entries=[entry(),entry({id:'buy',type:'expense',amount:3000}),entry({id:'draw',type:'expense',amount:1000,expenseAccountType:'owner'}),entry({id:'move',type:'transfer',to:'bank',amount:2000})];s.bookkeeping=bookState(s);s.bookkeeping.allocations.buy=allocation('120000');validateState(s);
 const f=cashFlowStatement(s,'2026-10-01','2026-10-31');assert.equal(f.operating,10000);assert.equal(f.investing,-3000);assert.equal(f.financing,-1000);assert.equal(f.closing,16000);assert.equal(f.rows.length,3);assert.equal(f.closing,trialBalance(s,'2026-10-31').filter(a=>a.cashAccountId).reduce((n,a)=>n+a.net,0));
});
test('expense dimensions retain team and project and exclude owner drawings',()=>{
 const s=initialState();s.entries=[entry({type:'expense'}),entry({id:'personal',type:'expense',expenseAccountType:'owner'})];s.bookkeeping=bookState(s);s.bookkeeping.allocations.e1=allocation('540000');const costs=expenseDimensions(s,'2026-10-01','2026-10-31');assert.equal(costs.length,1);assert.equal(costs[0].department,'ทีมแอร์');assert.equal(costs[0].project,'JOB001');assert.equal(costs[0].amount,10000);
});
