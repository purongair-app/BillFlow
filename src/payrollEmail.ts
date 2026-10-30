import type {PayrollSlip} from './payroll.ts';
import type {PayrollPdfOptions} from './payrollPdf.ts';
import {dateLabel} from './money.ts';
export function payrollEmployeeEmail(value:string){
 const email=value.trim();
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||/[\r\n,;<>]/.test(email))throw Error('ยังไม่มีอีเมลพนักงานที่ถูกต้อง กรุณาเพิ่มอีเมลในทะเบียนพนักงานก่อน');
 return email;
}
export function payrollEmailDraft(p:PayrollSlip,business:string,options:PayrollPdfOptions,email:string,filename:string){
 const recipient=payrollEmployeeEmail(email);
 const title=options.kind==='receipt'?'ใบรับเงินเดือน / หลักฐานงวดจ่าย':'ใบแจ้งรายละเอียดเงินเดือน / ค่าแรง';
 const subject=title+' '+(p.form?.documentNo||p.id)+' • '+business;
 const body=['เรียน '+p.employeeName,'',business+' ขอส่ง'+title,'รอบ '+dateLabel(p.periodStart)+' – '+dateLabel(p.periodEnd),'รหัสพนักงาน '+p.employeeCode,'','เอกสาร PDF: '+filename,'กรุณาตรวจสอบไฟล์แนบประกอบอีเมลฉบับนี้','',business].join('\r\n');
 return 'mailto:'+encodeURIComponent(recipient)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
}

export function employeeDocumentEmail(employee:{email?:string,loginEmail?:string,userId?:string}|undefined,accounts:{id:string,email:string,confirmed:boolean}[]=[]){
 if(employee?.email?.trim())return employee.email.trim();
 if(employee?.userId){const matches=accounts.filter(a=>a.id===employee.userId&&a.confirmed);return matches.length&&new Set(matches.map(a=>a.email.trim().toLowerCase())).size===1?matches[0].email.trim():'';}
 return employee?.loginEmail?.trim()||'';
}

export function payrollDocumentEmployee<T extends {id:string,code:string,name:string}>(slip:{employeeId:string,employeeCode:string,employeeName:string},employees:T[]):T|undefined{
 const code=slip.employeeCode.trim();
 const name=(value:string)=>value.trim().replace(/^(นางสาว|นาง|นาย|เด็กหญิง|เด็กชาย|ด\.ญ\.|ด\.ช\.)\s*/,'').replace(/\s+/g,'');
 const matches=employees.filter(e=>e.code.trim()===code&&name(e.name)===name(slip.employeeName));
 if(!code||!name(slip.employeeName)||matches.length!==1)return undefined;
 return matches[0];
}
