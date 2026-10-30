import NationalIdInput from './NationalIdInput';
import BankNameInput from './BankNameInput';
import type {EmployeeDetails} from './employeeDetails';
export default function EmployeeContactFields({value,onChange,disabled=false,bankNames=[]}:{bankNames?:string[],value:EmployeeDetails,onChange:(value:EmployeeDetails)=>void,disabled?:boolean}){
 return <>
  <fieldset className="entry-details-fieldset employee-contact-fields"><legend>ข้อมูลส่วนบุคคล</legend><div className="form-grid">
   <label>เลขบัตรประชาชน<NationalIdInput aria-label="เลขบัตรประชาชนพนักงาน" value={value.nationalId} onChange={nationalId=>onChange({...value,nationalId})} disabled={disabled}/><small>ตัวเลข 13 หลัก ระบบเว้นวรรคและขีดให้อัตโนมัติ</small></label>
   <label>วันเดือนปีเกิด<input aria-label="วันเดือนปีเกิดพนักงาน" type="date" lang="th-TH" value={value.birthDate} onChange={e=>onChange({...value,birthDate:e.target.value})} disabled={disabled}/>{value.birthDate&&Number.isFinite(Date.parse(value.birthDate))&&<small>{new Date(value.birthDate+'T12:00:00Z').toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'})}</small>}</label>
  </div></fieldset>
  <fieldset className="entry-details-fieldset employee-contact-fields"><legend>ข้อมูลติดต่อ</legend>
   <label>ที่อยู่<textarea aria-label="ที่อยู่พนักงาน" value={value.address} onChange={e=>onChange({...value,address:e.target.value})} maxLength={1000} rows={3} disabled={disabled} placeholder="บ้านเลขที่ หมู่ ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"/></label>
   <div className="form-grid">
    <label>เบอร์โทรศัพท์<input aria-label="เบอร์โทรศัพท์พนักงาน" type="tel" inputMode="tel" value={value.phone} onChange={e=>onChange({...value,phone:e.target.value})} maxLength={40} disabled={disabled} placeholder="เช่น 081-234-5678"/></label>
    <label>อีเมลรับเอกสาร<input aria-label="อีเมลรับเอกสารพนักงาน" type="email" value={value.email} onChange={e=>onChange({...value,email:e.target.value})} maxLength={254} disabled={disabled} placeholder="เช่น employee@example.com"/><small>ใช้รับ PDF เงินเดือน ไม่จำเป็นต้องเป็นอีเมลเข้าสู่ระบบ</small></label>
   </div>
  </fieldset>
  <fieldset className="entry-details-fieldset employee-contact-fields"><legend>บัญชีรับเงินพนักงาน</legend><div className="form-grid">
   <label>ธนาคารที่รับเงิน<BankNameInput options={bankNames} aria-label="ธนาคารพนักงาน" value={value.bankName} onChange={e=>onChange({...value,bankName:e.target.value})} maxLength={100} required={!!value.bankAccountNumber.trim()} disabled={disabled} placeholder="เลือกหรือพิมพ์ชื่อธนาคาร"/></label>
   <label>เลขที่บัญชี<input aria-label="เลขที่บัญชีพนักงาน" type="text" inputMode="numeric" value={value.bankAccountNumber} onChange={e=>onChange({...value,bankAccountNumber:e.target.value})} maxLength={50} disabled={disabled} placeholder="เก็บเลขศูนย์นำหน้าได้"/></label>
  </div><label>ชื่อเจ้าของบัญชี<input aria-label="ชื่อเจ้าของบัญชีพนักงาน" value={value.bankAccountName} onChange={e=>onChange({...value,bankAccountName:e.target.value})} maxLength={150} required={!!value.bankAccountNumber.trim()} disabled={disabled}/></label>
  <small>บัญชีนี้เป็นบัญชีรับเงินของพนักงาน ส่วนบัญชีเงินของร้านเลือกแยกตอนบันทึกจ่ายเงินเดือน</small></fieldset>
 </>;
}
