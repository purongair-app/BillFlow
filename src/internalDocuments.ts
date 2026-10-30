import {type State,money,dateLabel,remaining} from './money.ts';
import {billKindLabels,billSign} from './billDetails.ts';
import {netAmount,withholdingAmount} from './withholding.ts';
import {accountLabel} from './banking.ts';
import {thaiBaht} from './payrollDocument.ts';
import {businessNames} from './businessDetails.ts';
export type InternalPaper='full'|'half';
export type InternalDocument={key:string,number:string,reference:string,date:string,dateTitle:string,title:string,party:string,kind:string,lines:{label:string,amount:number}[],gross:number,net:number,vatLabel:string,vat:number,withholding:number,payment:string,attachments:string[],note:string,balance?:number};
export function internalDocuments(s:State,rights:{entries:boolean,debts:boolean}):InternalDocument[]{
 const entries=rights.entries?s.entries.map(e=>({key:'entry:'+e.id,number:'INT-'+e.id,reference:e.documentNo||e.transferRef||'—',date:e.date,dateTitle:'วันที่รายการ',title:e.title,party:e.contact||e.recipient||e.payer||'—',kind:({income:'รายรับ',expense:'รายจ่าย',transfer:'โอนระหว่างบัญชี'})[e.type],lines:e.billDetails?.lines.map(l=>({label:billKindLabels[l.kind]+': '+l.description+(l.quantity!==null?' (จำนวน '+l.quantity+')':''),amount:billSign(l)*l.amount}))||[{label:e.title,amount:e.amount}],gross:e.amount,net:netAmount(e),vatLabel:e.billDetails?.vatMode==='included'?'VAT (รวมในยอดแล้ว)':'VAT (เพิ่มจากรายการ)',vat:e.billDetails?.vat||0,withholding:withholdingAmount(e),payment:accountLabel(s.accounts.find(a=>a.id===e.account))+(e.type==='transfer'?' → '+accountLabel(s.accounts.find(a=>a.id===e.to)):'')+(e.transferRef?' • อ้างอิง '+e.transferRef:''),attachments:[...(e.file?[e.file.name]:[]),...(e.withholding?.certificateNo?['หัก ณ ที่จ่าย '+e.withholding.certificateNo]:[])],note:e.note})) : [];
 const debts=rights.debts?s.debts.map(d=>({key:'debt:'+d.id,number:'INT-DEBT-'+d.id,reference:d.billReference||'—',date:d.due,dateTitle:'ครบกำหนด',title:d.title,party:d.name,kind:d.type==='receivable'?'บิลลูกหนี้':'บิลเจ้าหนี้',lines:d.billDetails?.lines.map(l=>({label:billKindLabels[l.kind]+': '+l.description+(l.quantity!==null?' (จำนวน '+l.quantity+')':''),amount:billSign(l)*l.amount}))||[{label:d.title,amount:d.amount}],gross:d.amount,net:d.amount,vatLabel:d.billDetails?.vatMode==='included'?'VAT (รวมในยอดแล้ว)':'VAT (เพิ่มจากรายการ)',vat:d.billDetails?.vat||0,withholding:0,payment:'เอกสารตั้งหนี้ • ยังไม่ใช่หลักฐานรับหรือจ่ายเงิน',attachments:[...(d.file?[d.file.name]:[]),...(d.documentSourceId?['จาก '+(s.documentSources?.find(x=>x.id===d.documentSourceId)?.name||'—')]:[])],note:'',balance:remaining(s,d)})):[];
 return [...entries,...debts].sort((a,b)=>b.date.localeCompare(a.date)||a.key.localeCompare(b.key));
}
export function internalPdfDefinition(doc:InternalDocument,s:State,paper:InternalPaper):any{
 if(!['full','half'].includes(paper))throw Error('กรุณาเลือกขนาดกระดาษ');
 const half=paper==='half',green='#137454',gray='#62736c',fontSize=half?9:11;
 const rows=doc.lines.map((l,i)=>[{text:String(i+1)},l.label,{text:money(l.amount),alignment:'right'}]);
 const summary=[['ยอดตามเอกสาร',money(doc.gross)],...(doc.vat?[[doc.vatLabel,money(doc.vat)]]:[]),...(doc.withholding?[['หัก ณ ที่จ่าย',money(doc.withholding)]]:[]),[doc.balance!==undefined?'ยอดตั้งหนี้':'ยอดสุทธิ',money(doc.net)],...(doc.balance!==undefined?[['ยอดคงเหลือ',money(doc.balance)]]:[])];
 return {pageSize:'A4',pageMargins:[28,half?43:60,28,half?447:45],defaultStyle:{font:'Sarabun',fontSize,lineHeight:1.05},info:{title:'บิลบันทึกภายใน '+doc.number,author:s.business},header:(page:number,total:number)=>({stack:[{text:(page===1?'บิลบันทึกภายใน':'บิลบันทึกภายใน (ต่อ)')+' • '+businessNames(s).business,bold:true,font:'Sarabun',fontSize:half?13:18,color:green,margin:[28,12,28,0]},{text:doc.number+` • ${page}/${total}`,font:'Sarabun',fontSize:7,color:gray,margin:[28,2,28,0]}]}),...(!half?{footer:(page:number,total:number)=>({text:`เอกสารภายใน ไม่ใช่ใบกำกับภาษี • ${page}/${total}`,font:'Sarabun',fontSize:7,color:gray,margin:[28,12,28,0]})}:{}),...(half?{background:()=>({canvas:[{type:'line',x1:20,y1:420.945,x2:575.28,y2:420.945,lineWidth:0.5,lineColor:'#b8c6bf',dash:{length:4}}]})}:{}),content:[
 {columns:[{text:doc.kind+' • '+doc.dateTitle+' '+dateLabel(doc.date)},{text:'อ้างอิง '+doc.reference,alignment:'right'}],margin:[0,0,0,5]},
 {text:'ผู้เกี่ยวข้อง: '+doc.party,margin:[0,0,0,5]},
 {text:doc.title,bold:true,margin:[0,0,0,6]},
 {table:{headerRows:1,widths:[half?24:32,'*',half?76:90],body:[['ลำดับ','รายการ / รายละเอียด','จำนวนเงิน (บาท)'].map(text=>({text,bold:true,color:'white',fillColor:green})),...rows]},layout:'lightHorizontalLines',margin:[0,0,0,7]},
 {columns:[{width:'*',stack:[{text:'บัญชี / การชำระ: '+doc.payment},...(doc.attachments.length?[{text:'เอกสารแนบ / อ้างอิง: '+doc.attachments.join(' • '),margin:[0,4,0,0]}]:[]),...(doc.note?[{text:'หมายเหตุ: '+doc.note,margin:[0,4,0,0]}]:[])]},{width:200,table:{widths:['*',65],body:summary.map((r,i)=>r.map((text,j)=>({text,alignment:j?'right':'left',bold:i===summary.length-1,fillColor:i===summary.length-1?'#edf5f0':undefined})))},layout:'noBorders'}],columnGap:12,margin:[0,0,0,6]},
 {text:thaiBaht(doc.net),bold:true,margin:[0,0,0,8]},
 {unbreakable:true,columns:['ผู้จัดทำ','ผู้ตรวจสอบ','ผู้อนุมัติ'].map(text=>({stack:[{text:'ลงชื่อ __________________',fontSize:8},{text,margin:[0,4,0,0]}],alignment:'center'})),margin:[0,10,0,0]},
 ...(half?[{text:'เอกสารภายใน ไม่ใช่ใบกำกับภาษี',fontSize:7,color:gray,margin:[0,6,0,0]}]:[])
 ]};
}
