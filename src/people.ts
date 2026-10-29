import type {State,ContactKind} from './money.ts';
import {validateState} from './money.ts';
import {contactId,contactUsageCount,nextContactCode} from './contacts.ts';
import {employeeId,employeeUsageCount,nextEmployeeCode} from './employees.ts';
export type PersonKind=ContactKind|'employee';
export type Person={userId?:string,loginEmail?:string,photo?:string,id:string,code:string,name:string,details:string,active:boolean,kind:PersonKind|'unclassified'};
export const personLabels={customer:'ลูกค้า',creditor:'เจ้าหนี้',employee:'พนักงาน',unclassified:'ยังไม่ระบุประเภท'};
export function people(s:State):Person[]{return [...(s.contacts||[]).map(c=>({id:c.id,code:c.code,name:c.name,details:c.note,active:c.active,kind:c.kind||'unclassified' as const})),...(s.employees||[]).map(e=>({id:e.id,code:e.code,name:e.name,details:e.position,active:e.active,userId:e.userId,loginEmail:e.loginEmail,photo:e.photo,kind:'employee' as const}))];}
export function personUsage(s:State,p:Person){return p.kind==='employee'?employeeUsageCount(s,p.id):contactUsageCount(s,p.id);}
export function suggestedPersonCode(s:State,kind:PersonKind){return kind==='employee'?nextEmployeeCode(s):nextContactCode(s,kind);}
export function savePerson(s:State,input:{kind:PersonKind,code:string,name:string,details:string,userId?:string,loginEmail?:string,photo?:string},previous?:Person):State{
 const n=structuredClone(s),crosses=previous&&(previous.kind==='employee')!==(input.kind==='employee');
 if(crosses&&personUsage(s,previous))throw Error('รายชื่อนี้มีประวัติรายการแล้ว จึงย้ายระหว่างพนักงานกับลูกค้า / เจ้าหนี้ไม่ได้ ให้เพิ่มรายชื่ออีกประเภทเพื่อเก็บประวัติ');
 const id=previous?.id||(input.kind==='employee'?employeeId():contactId()),code=previous?.code||input.code.trim()||suggestedPersonCode(s,input.kind),name=input.name.trim(),details=input.details.trim(),active=previous?.active??true;
 if(people(s).some(p=>!(previous&&p.id===previous.id&&p.kind===previous.kind)&&p.code.toUpperCase()===code.toUpperCase()))throw Error('รหัสนี้มีอยู่แล้ว กรุณาใช้รหัสอื่น');
 if(crosses){if(previous.kind==='employee')n.employees=(n.employees||[]).filter(p=>p.id!==previous.id);else n.contacts=(n.contacts||[]).filter(p=>p.id!==previous.id);}
 if(input.kind==='employee'){const row={id,code,name,position:details,active,userId:(input.userId??previous?.userId)||undefined,loginEmail:(input.loginEmail??previous?.loginEmail)?.trim().toLowerCase()||undefined,photo:(input.photo??previous?.photo)||undefined};n.employees=(n.employees||[]).some(p=>p.id===id)?n.employees!.map(p=>p.id===id?row:p):[...(n.employees||[]),row];}
 else{const row={id,code,name,note:details,active,kind:input.kind};n.contacts=(n.contacts||[]).some(p=>p.id===id)?n.contacts!.map(p=>p.id===id?row:p):[...(n.contacts||[]),row];}
 validateState(n);return n;
}
export function togglePerson(s:State,p:Person):State{const n=structuredClone(s);if(p.kind==='employee')n.employees=(n.employees||[]).map(x=>x.id===p.id?{...x,active:!x.active}:x);else n.contacts=(n.contacts||[]).map(x=>x.id===p.id?{...x,active:!x.active}:x);return n;}
export function deletePerson(s:State,p:Person):State{if(personUsage(s,p))throw Error('มีรายการอ้างอิงแล้ว กรุณาปิดใช้งานแทน');const n=structuredClone(s);if(p.kind==='employee')n.employees=(n.employees||[]).filter(x=>x.id!==p.id);else n.contacts=(n.contacts||[]).filter(x=>x.id!==p.id);return n;}
