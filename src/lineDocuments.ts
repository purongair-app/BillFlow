import type {WithholdingTax} from './withholding.ts';
import {validateBillDetails,type BillDetails} from './billDetails.ts';
import {validateState,type State,type Entry,type Debt,today} from './money.ts';
import {nextDocumentNo} from './accounting.ts';
export type DocumentData={billDetails?:BillDetails|null,documentType?:string,documentNo?:string,date?:string,due?:string,title?:string,contact?:string,amount?:number|null,transactionTime?:string,transferRef?:string,senderName?:string,senderBank?:string,senderAccount?:string,receiverName?:string,receiverBank?:string,receiverAccount?:string,warnings?:string[]};
export type LineDocument={id:string,file_id:string,mime:string,file_size:number,status:string,extracted:DocumentData,last_error?:string,created_at:string,confirmed_target?:string,duplicate_of?:string};
export type ImportFields={billDetails?:BillDetails|null,withholding?:WithholdingTax|null,paymentMethod:string,expenseAccountType:string,documentType:string,type:string,date:string,due:string,title:string,contact:string,amount:string,account:string,to:string,category:string,documentNo:string,transferRef:string,transactionTime:string,debtId:string,senderName:string,senderBank:string,senderAccount:string,receiverName:string,receiverBank:string,receiverAccount:string};
export function suggestImport(s:State,d:LineDocument):ImportFields{
 const x=d.extracted||{};const match=(number?:string)=>{if(!number||!/^[\d\s-]+$/.test(number))return '';const digits=number.replace(/\D/g,'');if(digits.length<10)return '';const matches=s.accounts.filter(a=>a.accountNumber?.replace(/\D/g,'')===digits);return matches.length===1?matches[0].id:'';};
 const sender=match(x.senderAccount),receiver=match(x.receiverAccount);const invoice=x.documentType==='invoice';
 return {paymentMethod:'',expenseAccountType:'shop',billDetails:x.billDetails?structuredClone(x.billDetails):undefined,documentType:x.documentType||'other',type:invoice?'receivable':sender&&receiver&&sender!==receiver?'transfer':receiver?'income':sender?'expense':'',date:x.date||today(),due:x.due||x.date||today(),title:x.title||'',contact:x.contact||'',amount:typeof x.amount==='number'?String(x.amount/100):'',account:sender||receiver||'',to:sender&&receiver?receiver:'',category:'อื่น ๆ',documentNo:x.documentNo||'',transferRef:x.transferRef||'',transactionTime:x.transactionTime||'',debtId:'',senderName:x.senderName||'',senderBank:x.senderBank||'',senderAccount:x.senderAccount||'',receiverName:x.receiverName||'',receiverBank:x.receiverBank||'',receiverAccount:x.receiverAccount||''};
}
export function importLineDocument(s:State,doc:LineDocument,f:ImportFields){
 if(!['ready','needs_key','failed'].includes(doc.status)||!doc.file_size)throw Error('เอกสารยังไม่พร้อมหรือถูกยืนยันไปแล้ว');
 const amount=Math.round(Number(f.amount)*100);if(!Number.isSafeInteger(amount)||amount<=0)throw Error('กรุณาระบุยอดเงินให้ถูกต้อง');
 validateBillDetails(f.billDetails,amount,f.type);
 if(!f.title.trim())throw Error('กรุณาระบุรายละเอียดรายการ');
 const n=structuredClone(s),file={id:doc.file_id,name:'LINE-'+doc.id+'.'+(doc.mime==='image/png'?'png':doc.mime==='image/webp'?'webp':'jpg'),mime:doc.mime,size:doc.file_size};
 if(n.entries.some(e=>e.id===doc.id)||n.debts.some(e=>e.id===doc.id))throw Error('เอกสารนี้บันทึกแล้ว');
 const isDebt=['receivable','payable'].includes(f.type);
 if(f.documentType==='invoice'&&!isDebt)throw Error('ใบแจ้งหนี้ต้องบันทึกเป็นลูกหนี้หรือเจ้าหนี้ ยังไม่ใช่หลักฐานรับ–จ่ายเงิน');
 if(isDebt){
  if(!f.contact.trim())throw Error('กรุณาระบุชื่อลูกค้าหรือเจ้าหนี้');
  if(f.documentNo.trim()&&n.debts.some(d=>d.type===f.type&&d.billReference?.trim().toUpperCase()===f.documentNo.trim().toUpperCase()))throw Error('เลขบิลนี้มีในรายการหนี้แล้ว กรุณาตรวจรายการเดิม');
  const debt:Debt={billDetails:f.billDetails,id:doc.id,type:f.type as Debt['type'],name:f.contact.trim(),title:f.title.trim(),amount,due:f.due,billReference:f.documentNo.trim(),file};n.debts.push(debt);
 }else{
  if(!['income','expense','transfer'].includes(f.type))throw Error('กรุณาเลือกประเภทรายการ');
  if(!f.account)throw Error('กรุณาเลือกบัญชีของร้าน');
  const x=doc.extracted||{};if(f.paymentMethod&&!['cash','bank','card','other'].includes(f.paymentMethod))throw Error('กรุณาระบุวิธีชำระตามหลักฐาน');const entry:Entry={billDetails:f.billDetails,withholding:f.withholding,...(f.type==='expense'?{expenseAccountType:f.expenseAccountType as Entry['expenseAccountType']} : {}),id:doc.id,type:f.type as Entry['type'],date:f.date,title:f.title.trim(),amount,account:f.account,...(f.type==='transfer'?{to:f.to}:{}),category:f.type==='transfer'?'โอนภายใน':f.category,contact:f.contact.trim(),note:'นำเข้าจากรูปในกลุ่ม LINE • ตรวจยืนยันโดยเจ้าของ',documentNo:f.documentNo.trim()||nextDocumentNo(n,f.type as Entry['type'],f.date),file,transferRef:f.transferRef.trim(),transactionTime:f.transactionTime,slipReview:'reviewed',paymentMethod:(f.paymentMethod||undefined) as Entry['paymentMethod']};
  for(const k of ['senderName','senderBank','senderAccount','receiverName','receiverBank','receiverAccount'] as const)if(f[k])entry[k]=f[k].trim();
  if(f.debtId){const debt=n.debts.find(d=>d.id===f.debtId);if(!debt||entry.type!==(debt.type==='receivable'?'income':'expense'))throw Error('รายการหนี้ที่เลือกไม่ตรงกับการชำระ');entry.debtId=debt.id;}
  n.entries.push(entry);
 }
 validateState(n);return {state:n,target:isDebt?'debt':'entry'} as const;
}
