import {thaiMonthLabel} from './thaiDate.ts';
import {loadPdfDependencies} from './pdfEngine.ts';
import {selectedSso,validateSso,type SsoSubmission} from './ssoSubmission.ts';
import {ssoTotals} from './ssoReport.ts';
import {money,dateLabel} from './money.ts';
import {thaiBaht} from './payrollDocument.ts';
export function ssoPdfDefinition(f:SsoSubmission):any{f=selectedSso(f);
 const errors=validateSso(f);if(errors.length)throw Error(errors.join('\n'));const totals=ssoTotals(f);
 const period=thaiMonthLabel(f.month),muted='#607069',ink='#214b3b';
 const cell=(v:unknown,extra:any={})=>({text:String(v??''),margin:[4,4,4,4],...extra}),amount=(v:number)=>cell(money(v),{alignment:'right'}),head=(v:string)=>cell(v,{bold:true,fillColor:'#e6efea'});
 const identity=[{text:f.business,bold:true,fontSize:15,margin:[0,8,0,8]},{text:`เลขที่บัญชีนายจ้าง ${f.account}     ลำดับที่สาขา ${f.branch}`},{text:`ชื่อสาขา ${f.branchName||'—'}`},{text:`งวดค่าจ้าง ${period}     วันที่จัดทำ ${dateLabel(f.date)}`,margin:[0,3,0,8]}];
 const signature={unbreakable:true,stack:[{text:'ข้าพเจ้ารับรองว่าข้อมูลข้างต้นถูกต้องครบถ้วนตามรายการที่จัดทำ',margin:[0,16,0,12]},{text:'ลงชื่อ ........................................................ นายจ้าง / ผู้รับมอบอำนาจ',alignment:'right'},{text:'('+(f.signer||'........................................................')+')',alignment:'right',margin:[0,4,0,4]},{text:'ตำแหน่ง '+(f.position||'........................................................'),alignment:'right'},{text:'วันที่ '+dateLabel(f.date),alignment:'right',margin:[0,4,0,10]}]};
 const body:any[]=[[head('รายการ'),head('จำนวนเงิน (บาท)')],[cell('1. เงินค่าจ้างทั้งสิ้น'),amount(totals.wage)],[cell('2. เงินสมทบผู้ประกันตน'),amount(totals.employee)],[cell('3. เงินสมทบนายจ้าง'),amount(totals.employer)],[head('4. รวมเงินสมทบที่นำส่งทั้งสิ้น'),{...amount(totals.total),bold:true,fillColor:'#e6efea'}],[cell('5. จำนวนผู้ประกันตน'),cell(totals.count+' คน',{alignment:'right'})]];
 const detail:any[]=[[{text:`${f.business}\nบัญชีนายจ้าง ${f.account} สาขา ${f.branch} | งวด ${period}`,bold:true,colSpan:5,margin:[3,5,3,5]},{},{},{},{}],[head('ลำดับ'),head('เลขประจำตัวประชาชน / เลขบัตรประกันสังคม'),head('คำนำหน้า–ชื่อ–นามสกุล'),head('ค่าจ้างที่จ่ายจริง (บาท)'),head('เงินสมทบ\nผู้ประกันตน (บาท)')],...f.rows.map((r,i)=>[cell(i+1),cell(r.nationalId),cell([r.title,r.firstName,r.lastName].join(' ')),amount(Math.round(Number(r.wage)*100)),amount(Math.round(Number(r.contribution)*100))]),[{...head('รวม'),colSpan:3},{},{},amount(totals.wage),amount(totals.employee)]];
 return {pageSize:'A4',pageMargins:[36,32,36,42],defaultStyle:{font:'Sarabun',fontSize:10,lineHeight:1.15},info:{title:`สรุปข้อมูล สปส.1-10 ${f.account} ${thaiMonthLabel(f.month)}`,author:f.business,creator:'PUROnGBillFlow'},footer:(page:number,pages:number)=>({text:`ฉบับตรวจสอบก่อนนำส่ง • ยังไม่ใช่หลักฐานการยื่นหรือชำระเงิน | ${page} / ${pages}`,font:'Sarabun',fontSize:8,color:muted,alignment:'center',margin:[30,8,30,0]}),content:[
 {text:'สรุปข้อมูลสำหรับ สปส.1-10 ส่วนที่ 1',fontSize:16,bold:true,color:ink,alignment:'center'},{text:'ฉบับตรวจสอบก่อนนำส่ง',fontSize:10,color:muted,alignment:'center'},...identity,
 {text:'ที่ตั้ง '+(f.address||'—')},{text:`รหัสไปรษณีย์ ${f.postalCode||'—'}     โทรศัพท์ ${f.phone||'—'}`},{text:'อีเมล '+(f.email||'—'),margin:[0,0,0,10]},
 {text:`อัตราผู้ประกันตน ${f.employeeRate}%     อัตรานายจ้าง ${f.employerRate}%`,margin:[0,0,0,8]},
 {table:{headerRows:1,widths:['*',140],body},layout:'lightHorizontalLines'},
 {text:thaiBaht(totals.total),alignment:'right',bold:true,margin:[0,8,0,8]},
 {text:totals.overridden?'เงินสมทบนายจ้างใช้ยอดที่ระบุเองในแบบนำส่ง':'เงินสมทบนายจ้างตามอัตราที่ระบุ หากอัตราทั้งสองฝ่ายเท่ากัน ใช้ยอดเท่ากับส่วนพนักงานที่กรอก',color:muted,fontSize:9},signature,
 {text:'รายละเอียดสำหรับ สปส.1-10 ส่วนที่ 2',fontSize:16,bold:true,color:ink,alignment:'center',pageBreak:'before'},{text:'ฉบับตรวจสอบก่อนนำส่ง',fontSize:10,color:muted,alignment:'center',margin:[0,0,0,10]},
 {table:{headerRows:2,widths:[32,110,'*',76,91],dontBreakRows:true,body:detail},layout:'lightHorizontalLines'},
 {text:'สำหรับผู้ประกันตนต่างด้าว ใช้เลขที่บัตรประกันสังคมในช่องเลขประจำตัว\nตรวจรายชื่อ ค่าจ้าง และเงินสมทบกับไฟล์ Excel ก่อนนำส่ง เอกสารนี้ไม่มีเลขธุรกรรมหรือสถานะรับยื่นจากสำนักงานประกันสังคม',fontSize:9,color:muted,margin:[0,12,0,0]},structuredClone(signature)]};
}
export async function createSsoPdf(f:SsoSubmission){const definition=ssoPdfDefinition(f);const [{default:pdfMake},{payrollFonts}]=await loadPdfDependencies(()=>Promise.all([import('pdfmake/build/pdfmake'),import('./payrollFonts')]));pdfMake.vfs=payrollFonts;pdfMake.fonts={Sarabun:{normal:'Sarabun-Regular.ttf',bold:'Sarabun-Bold.ttf',italics:'Sarabun-Regular.ttf',bolditalics:'Sarabun-Bold.ttf'}};const blob=await new Promise<Blob>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('สร้าง PDF ใช้เวลานานเกินไป กรุณาลองอีกครั้ง')),25000);try{pdfMake.createPdf(definition).getBlob((blob:Blob)=>{clearTimeout(timer);resolve(blob);});}catch(e){clearTimeout(timer);reject(e);}});return {blob,filename:`SSO-review-${f.account}-${f.branch}-${f.month}.pdf`};}
