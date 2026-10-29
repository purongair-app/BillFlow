import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,validateState,balance,remaining,type Entry} from '../src/money.ts';
import {cashbook,expenseGroups} from '../src/accounting.ts';
import {bookState,postings,trialBalance,partyBalances,positionStatement,profitAndLoss,cashFlowStatement} from '../src/bookkeeping.ts';
import {calculateWithholding,netAmount,withholdingFromForm,type WithholdingTax} from '../src/withholding.ts';
import {notificationText} from '../supabase/functions/billflow-line/messages.ts';
const wht=(extra:Partial<WithholdingTax>={}):WithholdingTax=>({rate:3,base:100000,amount:3000,certificateNo:'WHT001',certificateDate:'2026-10-29',payerTaxId:'',payeeTaxId:'',form:'pnd53',manual:false,note:'',...extra});
const entry=(extra:Partial<Entry>={}):Entry=>({id:'w1',date:'2026-10-29',type:'income',title:'บริการ',amount:100000,account:'cash',category:'ค่าบริการ',contact:'ลูกค้า',note:'',withholding:wht(),...extra});
test('withheld income keeps full income while bank balance receives net and tax credit is separate',()=>{
 const s=initialState();s.entries=[entry()];validateState(s);assert.equal(balance(s,'cash'),97000);assert.equal(cashbook(s,'2026-10').incoming,97000);assert.equal(profitAndLoss(s,'2026-10-01','2026-10-31').income,100000);const tax=trialBalance(s,'2026-10-31').find(a=>a.code==='114000')!;assert.equal(tax.balanceDebit,3000);assert.equal(positionStatement(s,'2026-10-31').difference,0);assert.equal(cashFlowStatement(s,'2026-10-01','2026-10-31').closing,97000);
 for(const j of postings(s))assert.equal(j.lines.reduce((n,l)=>n+l.debit,0),j.lines.reduce((n,l)=>n+l.credit,0));
});
test('withheld expense keeps gross cost, credits tax liability and pays only net cash',()=>{
 const s=initialState();s.entries=[entry({type:'expense'})];validateState(s);assert.equal(balance(s,'cash'),-97000);assert.equal(cashbook(s,'2026-10').outgoing,97000);assert.equal(profitAndLoss(s,'2026-10-01','2026-10-31').expense,100000);assert.equal(trialBalance(s,'2026-10-31').find(a=>a.code==='213000')!.balanceCredit,3000);const summary=expenseGroups(cashbook(s,'2026-10').rows)[0];assert.equal(summary.total,100000);assert.equal(summary.withheld,3000);assert.equal(summary.net,97000);assert.equal(positionStatement(s,'2026-10-31').difference,0);
});
test('tax base can exclude VAT and clearing receivable uses full settlement including tax withheld',()=>{
 const s=initialState();s.debts=[{id:'debt',type:'receivable',name:'ลูกค้า',title:'ค่าบริการ',amount:107000,due:'2026-10-31'}];s.entries=[entry({amount:107000,debtId:'debt'})];s.bookkeeping=bookState(s);s.bookkeeping.allocations.w1={code:'110000',department:'',project:'',reference:'INV1',source:'ใบแจ้งหนี้',note:''};s.bookkeeping.journals=[{id:'sale',no:'JV1',date:'2026-10-28',kind:'sales',memo:'บริการเชื่อ',reference:'INV1',source:'ใบแจ้งหนี้',contact:'ลูกค้า',lines:[{code:'110000',debit:107000,credit:0,detail:''},{code:'410000',debit:0,credit:100000,detail:''},{code:'212000',debit:0,credit:7000,detail:''}]}];validateState(s);assert.equal(netAmount(s.entries[0]),104000);assert.equal(remaining(s,s.debts[0]),0);assert.equal(partyBalances(s,'2026-10-31')[0].amount,0);assert.equal(profitAndLoss(s,'2026-10-01','2026-10-31').income,100000);assert.equal(positionStatement(s,'2026-10-31').difference,0);
});
test('supplier debt settles gross while withheld tax remittance does not expense the tax twice',()=>{
 const s=initialState();s.debts=[{id:'d',type:'payable',name:'คู่ค้า',title:'ค่าบริการ',amount:100000,due:'2026-10-31'}];s.entries=[entry({type:'expense',debtId:'d',contact:'คู่ค้า'}),entry({id:'remit',date:'2026-11-01',type:'expense',amount:3000,withholding:null,title:'นำส่งภาษีหัก ณ ที่จ่าย',contact:'กรมสรรพากร'})];s.bookkeeping=bookState(s);s.bookkeeping.allocations.w1={code:'210000',department:'',project:'',reference:'BILL1',source:'เจ้าหนี้',note:''};s.bookkeeping.allocations.remit={code:'213000',department:'',project:'',reference:'TAX1',source:'ใบเสร็จนำส่ง',note:''};s.bookkeeping.journals=[{id:'bill',no:'JV1',date:'2026-10-28',kind:'purchase',memo:'ตั้งหนี้บริการ',reference:'BILL1',source:'บิล',contact:'คู่ค้า',lines:[{code:'590000',debit:100000,credit:0,detail:''},{code:'210000',debit:0,credit:100000,detail:''}]}];validateState(s);assert.equal(remaining(s,s.debts[0]),0);assert.equal(partyBalances(s,'2026-11-30','210000')[0].amount,0);assert.equal(trialBalance(s,'2026-11-30').find(a=>a.code==='213000')!.balanceCredit,0);assert.equal(profitAndLoss(s,'2026-10-01','2026-11-30').expense,100000);assert.equal(balance(s,'cash'),-100000);
});
test('withholding uses precise satang rounding and validates manual certificate differences',()=>{
 assert.equal(calculateWithholding(125,2),3);assert.equal(calculateWithholding(101,3),3);assert.equal(calculateWithholding(100000000000000,100),100000000000000);assert.throws(()=>calculateWithholding(1000,3.001));
 const s=initialState();s.entries=[entry({withholding:wht({amount:3100})})];assert.throws(()=>validateState(s));s.entries=[entry({withholding:wht({amount:3100,manual:true,note:'ยอดตามหนังสือรับรอง'})})];validateState(s);s.entries[0].withholding!.note='';assert.throws(()=>validateState(s));
 s.entries=[entry({type:'transfer',to:'bank'})];assert.throws(()=>validateState(s));s.entries=[entry({withholding:wht({base:100001})})];assert.throws(()=>validateState(s));s.entries=[entry({withholding:wht({certificateDate:'2026-02-30'})})];assert.throws(()=>validateState(s));
});
test('older transactions retain original totals and explicit null removes withholding',()=>{
 const s=initialState();s.entries=[entry({withholding:undefined})];validateState(s);assert.equal(balance(s,'cash'),100000);s.entries[0].withholding=null;assert.equal(netAmount(s.entries[0]),100000);
 const f=new FormData();assert.equal(withholdingFromForm(f,100000,'income'),null);f.set('whtEnabled','1');f.set('whtRate','3');f.set('whtBase','1000');f.set('whtAmount','30');assert.equal(withholdingFromForm(f,100000,'income')!.amount,3000);
});
test('LINE transaction summaries separate document total, withholding and actual cash without sending messages',()=>{
 const e=entry();const text=notificationText({id:'test',action:'create',entry:{...e},business:'ทดสอบ',accounts:[{id:'cash',name:'เงินสด'}]});assert.ok(text.includes('1,000.00'));assert.ok(text.includes('30.00'));assert.ok(text.includes('รับจริง: 970.00'));assert.ok(text.includes('WHT001'));
});
