import {useState} from 'react';
import {centralDirectoryWarning} from './centralDirectory';
import type {State} from './money';
import {people,personLabels,type PersonKind} from './people';
type DirectoryProps={state:State,busy:boolean,onSave:(s:State,text:string)=>Promise<boolean>,initialType?:PersonKind,initialEmployeeId?:string};
export default function PeopleDirectory({state,initialType='customer'}:DirectoryProps){
 const [kind,Kind]=useState<PersonKind>(initialType),[query,Query]=useState('');
 const rows=people(state).filter(p=>p.kind===kind&&[p.code,p.name,p.phone,p.details].join(' ').toLowerCase().includes(query.toLowerCase()));
 return <section className="card pad"><h2>ทะเบียนกลาง PUROnGCustomer</h2><p>เพิ่ม แก้ไข และลบข้อมูลลูกค้า พนักงาน และร้านที่ Customer เท่านั้น</p><a href="https://customer.airfriendservice.com/" target="_blank" rel="noreferrer">เปิด Customer ↗</a>{centralDirectoryWarning&&<p className="error" role="alert">{centralDirectoryWarning}</p>}<div className="people-page-links">{(['customer','creditor','employee'] as PersonKind[]).map(k=><button key={k} aria-pressed={kind===k} onClick={()=>Kind(k)}>{personLabels[k]}</button>)}</div><label>ค้นหารายชื่อ<input value={query} onChange={e=>Query(e.target.value)}/></label><div className="table-wrap"><table><thead><tr><th>รหัส</th><th>ชื่อ</th><th>ตำแหน่ง / รายละเอียด</th><th>โทรศัพท์</th><th>สถานะ</th></tr></thead><tbody>{rows.map(p=><tr key={p.id}><td>{p.code}</td><td>{p.name}</td><td>{p.details||'—'}</td><td>{p.phone||'—'}</td><td>{p.active?'ใช้งาน':'ปิดใช้งาน'}</td></tr>)}</tbody></table>{!rows.length&&<p className="empty">ไม่มีรายชื่อจากฐานกลาง</p>}</div></section>
}
