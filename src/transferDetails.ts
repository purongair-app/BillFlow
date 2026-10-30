import type {Entry,State} from './money.ts';
import {bankDefaults} from './banking.ts';
import {resolveEmployee} from './employees.ts';
export function transferDetailsFromForm(f:FormData,s:State,previous?:Entry){
 const v=(key:string)=>String(f.get(key)||'').trim();
 const defaults=bankDefaults('transfer',s.accounts.find(a=>a.id===v('account')),s.accounts.find(a=>a.id===v('to')));
 const old=previous?.type==='transfer'?previous:undefined;
 const person=resolveEmployee(v('payer'),s.employees||[],old,'payer');
 return {transactionTime:f.has('transactionTime')?v('transactionTime'):old?.transactionTime||'',transferRef:f.has('transferRef')?v('transferRef'):old?.transferRef||'',referenceBank:f.has('referenceBank')?v('referenceBank'):old?.referenceBank||defaults.senderBank||defaults.receiverBank,payer:person.name,payerEmployeeId:person.id,senderBank:defaults.senderBank,receiverBank:defaults.receiverBank,
 senderName:old?.account===v('account')?old.senderName??defaults.senderName:defaults.senderName,
 senderAccount:old?.account===v('account')?old.senderAccount??defaults.senderAccount:defaults.senderAccount,
 receiverName:old?.to===v('to')?old.receiverName??defaults.receiverName:defaults.receiverName,
 receiverAccount:old?.to===v('to')?old.receiverAccount??defaults.receiverAccount:defaults.receiverAccount};
}
