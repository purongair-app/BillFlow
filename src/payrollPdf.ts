import {loadPdfDependencies} from './pdfEngine.ts';
import type {PayrollSlip} from './payroll.ts';
import {payrollDocumentView} from './payrollDocumentView.ts';
import {payrollWageNotice,thaiBaht,payrollLineDetail} from './payrollDocument.ts';
import {money,dateLabel} from './money.ts';
export type PayrollPdfOptions={kind:'payslip'|'receipt',copy:'shop'|'employee',paymentId?:string};
export function payrollPdfInfo(p:PayrollSlip,options:PayrollPdfOptions){const payment=options.kind==='receipt'?p.payments.find(x=>x.id===options.paymentId&&!x.voidDate):undefined;if(options.kind==='receipt'&&(p.status!=='approved'||!payment))throw Error('ใบรับเงินต้องเลือกรายการจ่ายจริงที่ยังไม่คืนรายการ');const number=(p.form?.documentNo||p.id)+(payment?'-R'+String(p.payments.indexOf(payment)+1).padStart(3,'0'):'');return {payment,number,title:payment?'ใบรับเงินเดือน / หลักฐานการจ่าย':'ใบแจ้งรายละเอียดเงินเดือน / ค่าแรง',filename:'Payroll-'+number.replace(/[^a-zA-Z0-9ก-๙._-]/g,'-').slice(0,90)+'-'+options.copy+'.pdf'};}
export function payrollPdfDefinition(p:PayrollSlip,business:string,options:PayrollPdfOptions):any{
 const {payment,number,title}=payrollPdfInfo(p,options),f=p.form,v=payrollDocumentView(p);
 const ink='#243e29',green='#e3eedc',muted='#607069';
 const cell=(text:unknown,extra:any={})=>({text:String(text??''),margin:[4,3,4,3],...extra});
 const amount=(n:number)=>cell(money(n),{alignment:'right'});
 const heading=(text:string,extra:any={})=>cell(text,{bold:true,alignment:'center',fillColor:green,...extra});
 const lines={paddingTop:()=>0,paddingBottom:()=>0,paddingLeft:()=>0,paddingRight:()=>0,hLineColor:()=>ink,vLineColor:()=>ink,hLineWidth:()=>0.5,vLineWidth:()=>0.5};
 const rows:any[]=[[heading('รายการรายได้'),heading('จำนวน × อัตรา'),heading('จำนวนเงิน'),heading('รายการหัก'),heading('จำนวน × อัตรา'),heading('จำนวนเงิน')]];
 for(let i=0;i<v.length;i++){const a=v.earnings[i],d=p.deductions[i];rows.push([cell(a?.name||' '),cell(a?payrollLineDetail(a):'',{alignment:'center',fontSize:8}),a?amount(a.amount):cell(''),cell(d?.name||''),cell(d?payrollLineDetail(d):'',{alignment:'center',fontSize:8}),d?amount(d.amount):cell('')]);}
 rows.push([{...heading('+ รวมรายได้ +'),colSpan:2},{},amount(v.gross),{...heading('− รวมรายการหัก −'),colSpan:2},{},amount(v.deductions)]);
 rows.push([{...heading('รวมรายได้สุทธิ'),colSpan:2},{},{...amount(v.net),bold:true,fillColor:green},{...cell(thaiBaht(v.net),{bold:true,fillColor:green}),colSpan:3},{},{}]);
 const meta=v.identity.map(row=>row.map((text,i)=>cell(text,{bold:i%2===0})));
 const attendance=v.attendance.map(row=>row.map((text,i)=>cell(text,{bold:i%2===1,fontSize:8})));
 const content:any[]=[
 {columns:[{width:'*',stack:[{text:business,bold:true,fontSize:17,alignment:'center',margin:[0,7,0,8]},{text:title,fontSize:11,alignment:'center',color:muted}]},{width:145,table:{widths:['*'],body:[[{text:'เอกสารออกเป็นชุด',bold:true,alignment:'center',margin:[0,4,0,4]}],[{text:options.copy==='employee'?'สำเนาพนักงาน':'สำเนาร้าน',alignment:'center',margin:[0,4,0,4]}],[{text:'เลขที่  '+number,bold:true,alignment:'center',margin:[0,4,0,4]}]]},layout:lines}],columnGap:20,margin:[0,0,0,20]},
 ...(v.notice?[{text:v.notice,color:'#a03a25',bold:true,margin:[0,0,0,8]}]:[]),
 {table:{widths:[62,82,60,'*',40,68],body:meta},layout:{...lines,hLineWidth:(i:number)=>i===0?0.5:0,vLineWidth:(i:number)=>i===0||i===6?0.5:0}},
 {table:{widths:[78,65,37,28,59,30,39,'*'],body:attendance},layout:{...lines,hLineWidth:(i:number)=>i===2?0.5:0.2,vLineWidth:(i:number)=>i===0||i===8?0.5:0}},
 {table:{headerRows:1,widths:['*',60,62,'*',60,62],body:rows},layout:{...lines,hLineWidth:(i:number)=>i===0||i===1||i>=rows.length-2?0.5:0,vLineWidth:(i:number)=>i===0||i===3||i===6?0.5:0},margin:[0,0,0,10]}
 ];
 if(payment)content.push({unbreakable:true,stack:[{text:'ยอดรับเงินจริงงวดนี้ '+money(payment.amount)+' บาท',bold:true,fontSize:12},{text:thaiBaht(payment.amount)},{text:'วันที่จ่าย '+dateLabel(payment.date)+' • '+({cash:'เงินสด',bank:'โอนธนาคาร',card:'บัตร',other:'อื่น ๆ'}[payment.method])},{text:'อ้างอิงการจ่าย '+(payment.reference||'—')},...(payment.note?[{text:'หมายเหตุงวดจ่าย '+payment.note}]:[])],margin:[0,2,0,10]});
 content.push({table:{widths:['*','*'],body:v.summary.map((row,i)=>row.map(text=>cell(text,{bold:i===0||i===1,fontSize:8.5})))},layout:{paddingTop:()=>0,paddingBottom:()=>0,hLineWidth:(i:number)=>i===0?0.7:0,vLineWidth:()=>0,hLineColor:()=>ink},margin:[0,0,0,8]},
 ...(p.note?[{text:'หมายเหตุ: '+p.note,fontSize:8,color:muted,margin:[0,0,0,5]}]:[]),
 {unbreakable:true,stack:[{columns:[{width:'*',stack:[]},{width:170,stack:[{text:'ลงชื่อ ________________________',alignment:'center',fontSize:8,color:muted},{text:f?.managerName||'________________________',alignment:'center',margin:[0,8,0,0]},{text:f?.managerPosition||'ผู้จัดการ / ผู้อนุมัติ',bold:true,alignment:'center',margin:[0,6,0,0]}]},{width:170,stack:[{text:'ลงชื่อ ________________________',alignment:'center',fontSize:8,color:muted},{text:p.employeeName,alignment:'center',margin:[0,8,0,0]},{text:'พนักงาน / ผู้รับเงิน',bold:true,alignment:'center',margin:[0,6,0,0]}]}],margin:[0,20,0,15]},
 {text:payrollWageNotice,alignment:'center',fontSize:8,color:muted,margin:[0,6,0,8]},
 ...(f?.footer&&f.footer.trim()!==payrollWageNotice?[{text:f.footer,alignment:'center',fontSize:8,color:muted}]:[]),
 {text:payment?'หลักฐานอ้างอิงตามรายการจ่ายที่บันทึกในระบบ โปรดตรวจการรับเงินและลงชื่อให้ครบ':v.disclaimer,alignment:'center',fontSize:7,color:muted,margin:[0,6,0,0]}]});
 return {pageSize:'A4',pageMargins:[36,30,36,32],defaultStyle:{font:'Sarabun',fontSize:9,lineHeight:1.1},info:{title:title+' '+number,author:business,creator:'PUROnGBillFlow'},footer:(current:number,total:number)=>({text:`PUROnGBillFlow • by PUROnGAIR     ${current} / ${total}`,font:'Sarabun',fontSize:7,alignment:'center',color:muted}),content};
}
export async function createPayrollPdf(p:PayrollSlip,business:string,options:PayrollPdfOptions){const [{default:pdfMake},{payrollFonts}]=await loadPdfDependencies(()=>Promise.all([import('pdfmake/build/pdfmake'),import('./payrollFonts')]));if(Object.values(payrollFonts).some(font=>!/^[A-Za-z0-9+/]+={0,2}$/.test(font)))throw Error('ไฟล์ฟอนต์ PDF ไม่สมบูรณ์ กรุณาโหลดหน้าเว็บใหม่');pdfMake.vfs=payrollFonts;pdfMake.fonts={Sarabun:{normal:'Sarabun-Regular.ttf',bold:'Sarabun-Bold.ttf',italics:'Sarabun-Regular.ttf',bolditalics:'Sarabun-Bold.ttf'}};const definition=payrollPdfDefinition(p,business,options);const blob=await new Promise<Blob>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('สร้าง PDF ใช้เวลานานเกินไป กรุณาลองใหม่ หรือใช้ปุ่ม พิมพ์ / PDF')),25000);try{pdfMake.createPdf(definition).getBlob((blob:Blob)=>{clearTimeout(timer);resolve(blob);});}catch(e){clearTimeout(timer);reject(e);}});return {blob,...payrollPdfInfo(p,options)};}
