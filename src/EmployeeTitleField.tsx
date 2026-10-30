import {useId} from 'react';
export default function EmployeeTitleField({value,onChange,disabled=false}:{value:string,onChange:(value:string)=>void,disabled?:boolean}){
 const listId=useId();
 return <label>คำนำหน้าชื่อ<input list={listId} aria-label="คำนำหน้าพนักงาน" value={value} onChange={e=>onChange(e.target.value)} maxLength={50} disabled={disabled} placeholder="เลือกหรือพิมพ์คำนำหน้า"/><datalist id={listId}>{['นาย','นาง','นางสาว','เด็กชาย','เด็กหญิง','ไม่ระบุ'].map(title=><option key={title} value={title}/>)}</datalist></label>;
}
