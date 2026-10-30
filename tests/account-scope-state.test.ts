import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,validateState,balance,type Entry} from '../src/money.ts';
import {accountStatement} from '../src/banking.ts';
const transfer=(id:string,account:string,to:string,amount:number):Entry=>({id,type:'transfer',date:'2026-10-30',title:'โอนระหว่างบัญชี',account,to,amount,category:'โอนระหว่างบัญชี',contact:'',note:'',scopedReadOnly:true,scopedTransfer:true});
test('masked transfers retain account balances and statement totals without exposing a counterpart',()=>{
 const s=initialState();s.accounts=[{id:'cash',name:'Cash',opening:1000}];s.entries=[transfer('in','__restricted__','cash',500),transfer('out','cash','__restricted__',200)];
 validateState(s);assert.equal(balance(s,'cash'),1300);const book=accountStatement(s,'cash');assert.equal(book.incoming,500);assert.equal(book.outgoing,200);assert.equal(book.closing,1300);
 const invalid=structuredClone(s);delete invalid.entries[0].scopedTransfer;assert.throws(()=>validateState(invalid));
});
test('no-account projection renders as empty data rather than invented balances',()=>{const s=initialState();s.accounts=[];validateState(s);assert.equal(s.accounts.reduce((total,a)=>total+balance(s,a.id),0),0);s.entries=[transfer('in','__restricted__','cash',100)];assert.throws(()=>validateState(s))});
