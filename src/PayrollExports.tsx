import GmailPayrollSend from './GmailPayrollSend';
import {PdfEngineLoadError} from './pdfEngine';
import {useEffect,useRef,useState} from 'react';
import {Download,Mail,Printer,X} from 'lucide-react';
import type {Employee} from './money';
import type {PayrollSlip} from './payroll';
import {dateLabel,money} from './money';
import {type PayrollPdfOptions,createPayrollPdf} from './payrollPdf';
import {payrollEmployeeEmail,payrollEmailDraft,employeeDocumentEmail} from './payrollEmail';
import {listLinkableAccounts,logUsage,type LinkableAccount} from './backend';
type Mode='download'|'email'|'print';
export default function PayrollExports({slip,business,copy,owner,busy,employee,onEditEmployee}:{slip:PayrollSlip,business:string,copy:'shop'|'employee',owner:boolean,busy:boolean,employee:Employee|undefined,onEditEmployee:()=>void}){
 const [accounts,Accounts]=useState<LinkableAccount[]>([]),[emailLoading,EmailLoading]=useState(false),[emailError,EmailError]=useState(''),[needsReload,NeedsReload]=useState(false),[opened,Opened]=useState(false),[mode,ModeState]=useState<Mode>('download'),[options,Options]=useState<PayrollPdfOptions>({kind:'payslip',copy}),[working,Working]=useState(false),[error,ErrorText]=useState(''),[message,Message]=useState(''),[confirmed,Confirmed]=useState(false),[prepared,Prepared]=useState<{url:string,filename:string,pdf:Blob,mailto?:string}|null>(null);
 const inFlight=useRef(false),fileUrl=useRef(''),payments=slip.payments.filter(x=>!x.voidDate);
 const employeeEmail=employeeDocumentEmail(employee,accounts);
 useEffect(()=>{let alive=true;resetFile();Message('');Confirmed(false);EmailError('');if(!opened||mode!=='email'||!owner||employee?.email?.trim()||!employee?.userId){EmailLoading(false);return;}EmailLoading(true);listLinkableAccounts().then(rows=>{if(alive)Accounts(rows)}).catch(()=>{if(alive)EmailError('โหลดอีเมลบัญชีที่เชื่อมไว้ไม่สำเร็จ กรุณาปิดแล้วเปิดหน้าส่งอีเมลใหม่')}).finally(()=>{if(alive)EmailLoading(false)});return()=>{alive=false}},[opened,mode,owner,employee?.email,employee?.loginEmail,employee?.userId]);
 useEffect(()=>()=>{if(fileUrl.current)URL.revokeObjectURL(fileUrl.current)},[]);
 function resetFile(){if(fileUrl.current)URL.revokeObjectURL(fileUrl.current);fileUrl.current='';Prepared(null);}
 function open(kind:Mode){NeedsReload(false);resetFile();Options({kind:'payslip',copy:kind==='email'?'employee':copy,paymentId:payments.at(-1)?.id});ModeState(kind);ErrorText('');Message('');Confirmed(false);Opened(true);}
 function change(next:PayrollPdfOptions){resetFile();Options(next);Confirmed(false);ErrorText('');Message('');}
 async function run(e:React.FormEvent){
 e.preventDefault();if(inFlight.current||working)return;inFlight.current=true;Working(true);ErrorText('');NeedsReload(false);let printWindow:Window|null=null;
 try{
 if(mode==='email'){if(!owner||slip.status!=='approved')throw Error('ส่งอีเมลได้เฉพาะเงินเดือนที่อนุมัติแล้ว');payrollEmployeeEmail(employeeEmail);if(!confirmed)throw Error('กรุณาตรวจสอบอีเมลผู้รับและยืนยันก่อน');}
 if(mode==='print'){printWindow=window.open('about:blank','_blank');if(printWindow)printWindow.opener=null;}
 const pdf=await createPayrollPdf(slip,business,options),url=URL.createObjectURL(pdf.blob);fileUrl.current=url;
 Prepared({url,filename:pdf.filename,pdf:pdf.blob,mailto:mode==='email'?payrollEmailDraft(slip,business,options,employeeEmail,pdf.filename):undefined});
 if(mode==='print'){if(printWindow&&!printWindow.closed)printWindow.location.replace(url);Message('เปิด PDF แล้ว กดพิมพ์ในหน้าต่าง PDF ได้');}
 else if(mode==='download'){const a=document.createElement('a');a.href=url;a.download=pdf.filename;a.click();Message('สร้าง PDF แล้ว เปิดไฟล์ที่ดาวน์โหลดเพื่อพิมพ์ได้');}
 else Message('PDF พร้อมแล้ว เชื่อม Gmail ของร้านด้านล่างเพื่อส่งพร้อมไฟล์แนบ หรือเลือกเปิดร่างอีเมลเองได้');
 void logUsage('export',mode==='email'?'payroll-email-draft':'payroll-pdf');
 }catch(e){NeedsReload(e instanceof PdfEngineLoadError);if(printWindow&&!printWindow.closed)printWindow.close();ErrorText(e instanceof Error?e.message:'สร้าง PDF ไม่สำเร็จ');}finally{Working(false);inFlight.current=false;}
 }
 return <><button disabled={busy} onClick={()=>open('print')}><Printer size={16}/> พิมพ์ / PDF</button><button disabled={busy} onClick={()=>open('download')}><Download size={16}/> ใบรับเงิน / ดาวน์โหลด PDF</button>{owner&&<button disabled={busy||slip.status!=='approved'} title={slip.status==='approved'?'เตรียม PDF และเปิดอีเมลถึงพนักงาน':'กรุณาอนุมัติเงินเดือนก่อนส่งอีเมล'} onClick={()=>open('email')}><Mail size={16}/> ส่ง PDF ทางอีเมลพนักงาน</button>}{owner&&slip.status!=='approved'&&<small role="status" style={{flexBasis:'100%',color:'#725c2a',lineHeight:1.6}}>{slip.status==='draft'?'กรุณาอนุมัติเงินเดือนก่อนส่งอีเมลพนักงาน':'เอกสารนี้ถูกยกเลิกแล้ว ไม่สามารถส่งอีเมล'} • ดาวน์โหลด PDF ได้ตามปกติ</small>}
 {opened&&<div className="modal-overlay payroll-export-overlay"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="payroll-export-title"><div className="section-head"><h2 id="payroll-export-title">{mode==='email'?'เตรียม PDF ส่งอีเมลพนักงาน':mode==='print'?'พิมพ์เอกสารเงินเดือน PDF':'สร้างไฟล์เงินเดือน PDF'}</h2><button aria-label="ปิด" disabled={working} onClick={()=>Opened(false)}><X/></button></div><form className="modal-form" onSubmit={run}><b>{slip.employeeCode} · {slip.employeeName}</b><p>รอบ {dateLabel(slip.periodStart)} – {dateLabel(slip.periodEnd)}</p>
 <label>ประเภทเอกสาร<select disabled={working||!!prepared} value={options.kind} onChange={e=>change({...options,kind:e.target.value as PayrollPdfOptions['kind']})}><option value="payslip">ใบแจ้งรายละเอียดเงินเดือน</option>{payments.length>0&&slip.status==='approved'&&<option value="receipt">ใบรับเงินเดือน / หลักฐานงวดจ่าย</option>}</select></label>
 {options.kind==='receipt'&&<label>รายการจ่ายที่ออกใบรับเงิน<select disabled={working||!!prepared} required value={options.paymentId} onChange={e=>change({...options,paymentId:e.target.value})}>{payments.map(x=><option key={x.id} value={x.id}>{dateLabel(x.date)} • {money(x.amount)} บาท • {x.reference||'ไม่มีเลขอ้างอิง'}</option>)}</select></label>}
 <label>สำเนาเอกสาร<select disabled={working||!!prepared||mode==='email'} value={options.copy} onChange={e=>change({...options,copy:e.target.value as PayrollPdfOptions['copy']})}><option value="employee">สำเนาพนักงาน</option><option value="shop">สำเนาร้าน</option></select></label>
 {mode==='email'&&<><label>อีเมลพนักงาน<input type="email" readOnly value={employeeEmail} placeholder={emailLoading?'กำลังดึงอีเมลบัญชีที่เชื่อมไว้…':'ยังไม่มีอีเมลในทะเบียนพนักงาน'}/></label><small>ดึงจากอีเมลรับเอกสารในทะเบียนพนักงาน หรืออีเมลบัญชีที่เชื่อมไว้</small>{emailError&&<p className="error" role="alert">{emailError}</p>}<button type="button" disabled={working||!employee} onClick={onEditEmployee}>{employeeEmail?'แก้ไขอีเมลพนักงาน':'เพิ่มอีเมลในข้อมูลพนักงาน'}</button>{!employee&&<p className="error">ยังไม่พบพนักงานที่เชื่อมกับสลิปนี้ กรุณาตรวจทะเบียนพนักงาน</p>}<div className="payroll-import-message">เตรียม PDF แล้วเลือกเชื่อม Gmail ของร้านเพื่อส่งพร้อมไฟล์แนบ ระบบจะเปิดให้ Google ยืนยันสิทธิ์ก่อน หรือเปิดร่างในโปรแกรมอีเมลและแนบไฟล์เองได้</div><label className="check-row"><input type="checkbox" required checked={confirmed} disabled={working||!!prepared} onChange={e=>Confirmed(e.target.checked)}/> ตรวจสอบแล้วว่าอีเมลนี้เป็นของ {slip.employeeName}</label></>}
 {error&&<div className="error" role="alert">{error}{needsReload&&<button type="button" onClick={()=>{const url=new URL(window.location.href);url.searchParams.set('_refresh',String(Date.now()));window.location.replace(url.href);}}>โหลดเว็บเวอร์ชันล่าสุด</button>}</div>}{message&&<p className="payroll-import-message" role="status">{message}</p>}
 {prepared&&<div style={{display:'flex',gap:12,flexWrap:'wrap'}}><a href={prepared.url} download={prepared.filename}>ดาวน์โหลด PDF{mode==='email'?' เพื่อแนบอีเมล':''}</a>{prepared.mailto&&<a href={prepared.mailto}>เปิดร่างอีเมลเองถึง {employeeEmail}</a>}{mode==='print'&&<a href={prepared.url} target="_blank" rel="noopener noreferrer">เปิด PDF เพื่อพิมพ์</a>}</div>}
 {prepared?.mailto&&mode==='email'&&<GmailPayrollSend key={prepared.url} pdf={prepared.pdf} filename={prepared.filename} mailto={prepared.mailto} disabled={working||!owner||!confirmed||slip.status!=='approved'} onSent={()=>{void logUsage('export','payroll-gmail-sent')}}/>}
 <div className="modal-actions"><button type="button" disabled={working} onClick={()=>Opened(false)}>ปิด</button><button className="primary" disabled={working||!!prepared||mode==='email'&&(!employeeEmail.trim()||!confirmed)}>{working?'กำลังสร้าง PDF…':mode==='email'?'เตรียม PDF และร่างอีเมล':mode==='print'?'เปิด PDF เพื่อพิมพ์':'ดาวน์โหลด PDF'}</button></div></form></section></div>}</>;
}
