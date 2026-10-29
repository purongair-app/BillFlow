import {useState} from 'react';
import type {State} from './money';
import {money} from './money';
import type {LineDocument} from './lineDocuments';
import PayrollEditorFields from './PayrollEditorFields';
import {suggestPayrollImport,importPayrollDocument,payrollImportDifferences} from './payrollImport';
export default function LinePayrollReview({state,doc,onSave,onDone,onOther}:{state:State,doc:LineDocument,onSave:(s:State,text:string,info?:{id:string,target:string})=>Promise<boolean>,onDone:()=>Promise<void>,onOther:()=>void}){const [suggestion]=useState(()=>suggestPayrollImport(state,doc)),[slip,Slip]=useState(suggestion.slip),[busy,Busy]=useState(false),[error,ErrorText]=useState('');const differences=payrollImportDifferences(slip,doc.extracted.payroll),raw=doc.extracted.payroll;

 const [issues,Issues]=useState<{label:string,message:string,field:HTMLElement}[]>([]);
 const checkFields=(form:HTMLFormElement)=>{
 const found:{label:string,message:string,field:HTMLElement}[]=[];
 for(const field of Array.from(form.elements)){
 if(!(field instanceof HTMLInputElement||field instanceof HTMLSelectElement||field instanceof HTMLTextAreaElement))continue;
 field.removeAttribute('aria-invalid');
 if(!field.validity.valid){const label=field.getAttribute('aria-label')||field.closest('label')?.childNodes[0]?.textContent?.trim()||'ช่องข้อมูล';
 const message=field.validity.valueMissing?'กรุณากรอกหรือเลือกข้อมูล':field.validity.rangeOverflow?'ค่าเกินจำนวนสูงสุดที่กำหนด':field.validity.rangeUnderflow?'ค่าต่ำกว่าจำนวนขั้นต่ำที่กำหนด':field.validity.stepMismatch?'จำนวนไม่ตรงช่วงที่กำหนด กรุณาตรวจทศนิยม':field.validationMessage;
 field.setAttribute('aria-invalid','true');found.push({label,message,field});}
 }
 Issues(found);if(found.length){found[0].field.scrollIntoView({block:'center',behavior:'smooth'});found[0].field.focus();}return !found.length;
 };
 return <form className="payroll-import-review" noValidate onInput={e=>{const f=e.target;if(f instanceof HTMLElement)f.removeAttribute("aria-invalid");Issues([]);ErrorText("");}} onSubmit={async e=>{e.preventDefault();if(busy)return;if(!checkFields(e.currentTarget))return;if(raw&&differences.length){ErrorText(differences.join(' • '));return;}Busy(true);ErrorText('');try{const result=importPayrollDocument(state,doc,slip);if(await onSave(result.state,'นำเข้าร่างเงินเดือนจาก LINE '+slip.form?.documentNo,{id:doc.id,target:'payroll'}))await onDone();else ErrorText('บันทึกไม่สำเร็จ กรุณาตรวจข้อความแจ้งจากระบบและลองใหม่');}catch(e){ErrorText(e instanceof Error?e.message:'บันทึกไม่สำเร็จ');}finally{Busy(false);}}}><div className="payroll-import-message"><b>{raw?'ตรวจพบเอกสารเงินเดือน / ค่าแรง':'ตรวจเอกสารเงินเดือน / ค่าแรง'}</b><p>{raw?'อ่านเข้าช่องให้แล้ว กรุณาเทียบกับรูปต้นฉบับ':'ยังไม่มีผลอ่านเงินเดือนสำหรับรูปนี้ สามารถกรอกข้อมูลจากรูปด้วยตนเองได้'} • บันทึกเป็นร่างเงินเดือน ยังไม่อนุมัติและไม่ตัดยอดบัญชี</p><p>พนักงานที่อ่านได้: {suggestion.employeeHint||'อ่านชื่อไม่ชัด'}</p><button type="button" disabled={busy} onClick={onOther}>เอกสารนี้ไม่ใช่เงินเดือน — เปลี่ยนประเภท</button></div>{suggestion.warnings.map((w,i)=><p className="payroll-hint document-warning" role="alert" key={i}>{w}</p>)}<div className="payroll-import-totals">ยอดจากรูป: รายได้รวม {raw?.gross!==null&&raw?.gross!==undefined?money(raw.gross):'อ่านไม่ได้'} • หักรวม {raw?.totalDeductions!==null&&raw?.totalDeductions!==undefined?money(raw.totalDeductions):'อ่านไม่ได้'} • สุทธิ {raw?.net!==null&&raw?.net!==undefined?money(raw.net):'อ่านไม่ได้'} บาท</div><div className="payroll-validation-summary" role="alert">{issues.length>0&&<><b>บันทึกไม่ได้ กรุณาแก้ {issues.length} ช่อง</b>{issues.map((x,i)=><p key={i}><button type="button" onClick={()=>{x.field.scrollIntoView({block:'center',behavior:'smooth'});x.field.focus();}}>{x.label}: {x.message} — ไปที่ช่องนี้</button></p>)}</>}</div><PayrollEditorFields slip={slip} state={state} onChange={Slip}/>{differences.map((w,i)=><p className="error" key={i}>{w}</p>)}<label className="check-row"><input type="checkbox" required/> ตรวจพนักงาน รอบวันที่ รายได้ รายการหัก และยอดสุทธิเทียบรูปแล้ว</label>{error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'กำลังบันทึก…':'ยืนยันนำเข้าเป็นร่างเงินเดือน'}</button></form>;
}
