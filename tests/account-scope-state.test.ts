import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,remaining,validateState,balance,type Entry} from '../src/money.ts';
import {accountStatement} from '../src/banking.ts';
const transfer=(id:string,account:string,to:string,amount:number):Entry=>({id,type:'transfer',date:'2026-10-30',title:'โอนระหว่างบัญชี',account,to,amount,category:'โอนระหว่างบัญชี',contact:'',note:'',scopedReadOnly:true,scopedTransfer:true});
test('masked transfers retain account balances and statement totals without exposing a counterpart',()=>{
 const s=initialState();s.accounts=[{id:'cash',name:'Cash',opening:1000}];s.entries=[transfer('in','__restricted__','cash',500),transfer('out','cash','__restricted__',200)];
 validateState(s);assert.equal(balance(s,'cash'),1300);const book=accountStatement(s,'cash');assert.equal(book.incoming,500);assert.equal(book.outgoing,200);assert.equal(book.closing,1300);
 const invalid=structuredClone(s);delete invalid.entries[0].scopedTransfer;assert.throws(()=>validateState(invalid));
});
test('no-account projection renders as empty data rather than invented balances',()=>{const s=initialState();s.accounts=[];validateState(s);assert.equal(s.accounts.reduce((total,a)=>total+balance(s,a.id),0),0);s.entries=[transfer('in','__restricted__','cash',100)];assert.throws(()=>validateState(s))});

 test('debt outstanding includes hidden-account payment totals without inventing bank entries',()=>{
 const s=initialState();s.accounts=[{id:'cash',name:'Cash',opening:0}];
 s.debts=[{id:'d1',type:'receivable',name:'Customer',title:'Invoice',amount:1000,due:'2026-11-30',scopedPaid:400}];
 s.entries=[{id:'paid-cash',type:'income',date:'2026-11-02',title:'Payment',amount:100,account:'cash',debtId:'d1',category:'ค่าบริการ',contact:'',note:''}];
 validateState(s);assert.equal(remaining(s,s.debts[0]),500);assert.equal(balance(s,'cash'),100);
 });
