import type {Account,Entry,State} from './money.ts';
import {cashflow} from './accounting.ts';
export const accountKinds={cash:'เงินสด',bank:'บัญชีธนาคาร',promptpay:'พร้อมเพย์',other:'อื่น ๆ'};
export const slipReviewLabels={pending:'รอตรวจสลิป',reviewed:'ตรวจแล้วโดยผู้บันทึก',needs_check:'ต้องตรวจสอบเพิ่มเติม'};
export const bankEntryFields=['transactionTime','transferRef','senderName','senderBank','senderAccount','receiverName','receiverBank','receiverAccount'] as const;
export function accountKind(a?:Account){return a?.kind||(a?.id==='cash'?'cash':'bank');}
export function maskedAccount(v?:string){if(!v)return '';const tail=v.replace(/[\s-]/g,'').slice(-4);return '•••• '+tail;}
export function accountLabel(a?:Account){if(!a)return 'ไม่ระบุบัญชี';return [a.name,a.bankName,a.accountHolder,maskedAccount(a.accountNumber)].filter(Boolean).join(' • ');}
export function bankDefaults(type:Entry['type'],account?:Account,to?:Account){const own=(a?:Account)=>({Name:a?.accountHolder||'',Bank:a?.bankName||(accountKind(a)==='promptpay'?'พร้อมเพย์':''),Account:a?.accountNumber||''});const sender=type==='income'?own():own(account),receiver=type==='expense'?own():own(type==='transfer'?to:account);return {senderName:sender.Name,senderBank:sender.Bank,senderAccount:sender.Account,receiverName:receiver.Name,receiverBank:receiver.Bank,receiverAccount:receiver.Account};}
export function accountStatement(s:State,accountId:string){let running=s.accounts.find(a=>a.id===accountId)?.opening||0;const rows=s.entries.filter(e=>e.account===accountId||(e.type==='transfer'&&e.to===accountId)).sort((a,b)=>a.date.localeCompare(b.date)||(a.transactionTime||'').localeCompare(b.transactionTime||'')||(a.documentNo||'').localeCompare(b.documentNo||'')||a.id.localeCompare(b.id)).map(entry=>{const f=cashflow(entry,accountId);running+=f.incoming-f.outgoing;return {entry,...f,balance:running};});return {rows,incoming:rows.reduce((n,r)=>n+r.incoming,0),outgoing:rows.reduce((n,r)=>n+r.outgoing,0),closing:running};}
export function accountFromForm(f:FormData,previous?:Account):Account{const v=(name:string)=>String(f.get(name)||'').trim();const kind=(v('kind')||accountKind(previous)) as Account['kind'];return {...previous,id:previous?.id||crypto.randomUUID(),name:v('name'),opening:Math.round(Number(v('opening'))*100),kind,bankName:kind==='cash'?'':v('bankName'),accountHolder:kind==='cash'?'':v('accountHolder'),accountNumber:kind==='cash'?'':v('accountNumber')};}

export function accountDeletionReason(s:State,accountId:string){
 const account=s.accounts.find(a=>a.id===accountId);
 if(!account)return 'ไม่พบบัญชี';
 if(s.accounts.length<=1)return 'ต้องเหลือบัญชีอย่างน้อย 1 บัญชี';
 if(s.entries.some(e=>e.account===accountId||(e.type==='transfer'&&e.to===accountId)))return 'บัญชีนี้มีรายการเงินเข้า–ออกแล้ว จึงลบไม่ได้เพื่อเก็บประวัติ';
 if(account.opening!==0)return 'บัญชีนี้มียอดยกมา กรุณาตรวจสอบและปรับยอดก่อนลบ';
 return '';
}
export function removeAccount(s:State,accountId:string):State{
 const reason=accountDeletionReason(s,accountId);if(reason)throw Error(reason);
 return {...s,accounts:s.accounts.filter(a=>a.id!==accountId)};
}
