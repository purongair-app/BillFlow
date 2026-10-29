import {netAmount,withholdingAmount} from './withholding';
import {Download,FileText,Pencil} from 'lucide-react';
import {type Entry,type State,money,dateLabel} from './money';
import {accountLabel,slipReviewLabels} from './banking';
import {expenseAccountLabels,expenseKindLabels,entryDetails,makeCsv} from './accounting';

type Props={rows:Entry[],state:State,month:string,onEdit:(entry:Entry)=>void,onInspect:(entry:Entry)=>void};
export default function ExpenseAudit({rows,state,month,onEdit,onInspect}:Props){
 const expenses=rows.filter(e=>e.type==='expense').slice().sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 const groups=([
  {key:'shop',label:expenseAccountLabels.shop},
  {key:'owner',label:expenseAccountLabels.owner},
  {key:'unclassified',label:'ยังไม่ระบุประเภทตัดบัญชี'},
 ] as const).map(g=>({...g,rows:expenses.filter(e=>(e.expenseAccountType||'unclassified')===g.key)}));
 const total=expenses.reduce((n,e)=>n+e.amount,0);
 const account=(e:Entry)=>accountLabel(state.accounts.find(a=>a.id===e.account));
 const evidence=(e:Entry)=>e.file?slipReviewLabels[e.slipReview||'pending']:'ไม่มีหลักฐานแนบ';
 function exportCsv(){
  const csv=makeCsv([['รายละเอียดตรวจสอบค่าใช้จ่าย',state.business,month],['วันที่','เลขเอกสาร','ประเภทตัดบัญชี','รายละเอียด','หมวดหมู่','รายละเอียดเพิ่มเติม','ผู้เบิก','ผู้จ่าย','ผู้รับเงิน','ในนาม / ผู้รับประโยชน์','คู่ค้า','บัญชีที่จ่ายจริง','จำนวนเงิน (บาท)','หลักฐาน / สถานะ','หมายเหตุ','หัก ณ ที่จ่าย (บาท)','จ่ายสุทธิ (บาท)','อัตราภาษี (%)','ฐานหักภาษี (บาท)','เลขหนังสือรับรอง'],...expenses.map(e=>[e.date,e.documentNo||'',e.expenseAccountType?expenseAccountLabels[e.expenseAccountType]:'ยังไม่ระบุ',e.title,e.expenseKind&&e.expenseKind!=='general'?expenseKindLabels[e.expenseKind]:e.category,entryDetails(e).join(' • '),e.claimant||'',e.payer||'',e.recipient||'',e.beneficiary||'',e.contact,account(e),e.amount/100,evidence(e),e.note,withholdingAmount(e)/100,netAmount(e)/100,e.withholding?.rate||'',e.withholding?e.withholding.base/100:'',e.withholding?.certificateNo||'']),['รวม',...Array(11).fill(''),total/100]]);
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='รายละเอียดค่าใช้จ่าย-'+month+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
 }
 return <section className="expense-audit" aria-label="ตารางตรวจสอบรายละเอียดค่าใช้จ่าย">
  <div className="section-head"><div><h2>ตารางตรวจสอบรายละเอียดค่าใช้จ่าย</h2><p>เดือน {dateLabel(month+'-01').replace(/^1\s/,'')} • ตามตัวกรองที่เลือก • เปิดรายละเอียดเพื่อตรวจหลักฐานหรือแก้ไขได้</p></div><button onClick={exportCsv}><Download size={16}/> ส่งออกตาราง CSV</button></div>
  {groups.map(g=><section className="card expense-breakdown" key={g.key} style={{marginBottom:16}}><div className="section-head"><h3>{g.label}</h3><b>{g.rows.length} รายการ • ฿ {money(g.rows.reduce((n,e)=>n+e.amount,0))}</b></div><div className="table-wrap"><table><thead><tr><th>วันที่ / เลขเอกสาร</th><th>รายการ / หมวดค่าใช้จ่าย</th><th>ผู้เบิก / ผู้จ่าย</th><th>ผู้รับเงิน / ผู้รับประโยชน์</th><th>บัญชีที่จ่ายจริง</th><th className="right">ยอดตามเอกสาร / จ่ายสุทธิ</th><th>หลักฐาน / ตรวจสอบ</th></tr></thead><tbody>{g.rows.map(e=><tr key={e.id}><td>{dateLabel(e.date)}<small>{e.documentNo||'ยังไม่ระบุเลขเอกสาร'}</small></td><td><b>{e.title}</b><small>{e.expenseKind&&e.expenseKind!=='general'?expenseKindLabels[e.expenseKind]:e.category}</small>{entryDetails(e).map(line=><small key={line}>{line}</small>)}{e.note&&<small>หมายเหตุ: {e.note}</small>}</td><td>{e.claimant||'ไม่ระบุผู้เบิก'}<small>ผู้จ่าย: {e.payer||'—'}</small></td><td>{e.recipient||'ไม่ระบุผู้รับเงิน'}<small>ในนาม: {e.beneficiary||'—'}</small>{e.contact&&<small>คู่ค้า: {e.contact}</small>}</td><td>{account(e)}</td><td className="right">฿ {money(e.amount)}{e.withholding&&<small>หัก {money(withholdingAmount(e))} • จ่ายจริง {money(netAmount(e))}</small>}</td><td><small>{evidence(e)}</small><div className="row-actions"><button onClick={()=>onInspect(e)} aria-label={'ดูรายละเอียดและหลักฐาน '+e.title}><FileText size={14}/> รายละเอียด / หลักฐาน</button><button onClick={()=>onEdit(e)} aria-label={'แก้ไขค่าใช้จ่าย '+e.title}><Pencil size={14}/> แก้ไข</button></div></td></tr>)}{!g.rows.length&&<tr><td colSpan={7} className="empty">ไม่มีค่าใช้จ่ายในกลุ่มนี้ตามตัวกรองที่เลือก</td></tr>}</tbody><tfoot><tr><td colSpan={5}>รวม{g.label}</td><td className="right">฿ {money(g.rows.reduce((n,e)=>n+e.amount,0))}<small>หักไว้ {money(g.rows.reduce((n,e)=>n+withholdingAmount(e),0))} • จ่ายจริง {money(g.rows.reduce((n,e)=>n+netAmount(e),0))}</small></td><td>{g.rows.length} รายการ</td></tr></tfoot></table></div></section>)}
  <div className="card pad"><b>รวมยอดตามเอกสารทั้ง 3 ตาราง: ฿ {money(total)}</b><p>ภาษีหักไว้ ฿ {money(expenses.reduce((n,e)=>n+withholdingAmount(e),0))} • จ่ายเงินจริง ฿ {money(expenses.reduce((n,e)=>n+netAmount(e),0))}</p><p>{expenses.length} รายการ • รวมบัญชีร้าน บัญชีส่วนตัวเจ้าของ และรายการยังไม่ระบุประเภท • รายการเดิมที่ยังไม่ระบุสามารถกดแก้ไขเพื่อจัดประเภทได้</p></div>
 </section>;
}
