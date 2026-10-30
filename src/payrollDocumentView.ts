import type {PayrollSlip} from './payroll.ts';
import {grossPay,totalDeductions,netPay,paidPay,outstandingPay,payrollStatus} from './payroll.ts';
import {periodDays} from './payrollDocument.ts';
import {money,dateLabel} from './money.ts';

// Shared content for the screen document and every PDF output.
export function payrollDocumentView(p:PayrollSlip){
 const f=p.form,payments=p.payments.filter(x=>!x.voidDate),dates=[...new Set(payments.map(x=>x.date))].sort(),methods=[...new Set(payments.map(x=>x.method))];
 const earnings=[{name:'ค่าแรง / เงินเดือน',amount:Math.round(p.units*p.rate),quantity:p.units,unitRate:p.rate},...p.earnings];
 return {earnings,length:Math.max(8,earnings.length,p.deductions.length),gross:grossPay(p),deductions:totalDeductions(p),net:netPay(p),
 notice:p.status==='draft'?'ฉบับร่าง — ยังไม่อนุมัติ / ไม่ใช่หลักฐานการรับเงิน':p.status==='cancelled'?'เอกสารยกเลิก — '+(p.cancelReason||''):'',
 identity:[['รหัสพนักงาน',p.employeeCode,'ชื่อพนักงาน',p.employeeName,'แผนก',f?.department||'—'],['ช่วงวันที่',dateLabel(p.periodStart),'ถึง',dateLabel(p.periodEnd),'ตำแหน่ง',p.position||'—']],
 attendance:[['รอบเดือนนี้',String(periodDays(p))+' วัน','วันหยุด',String(f?.restDays??'—'),'วันทำการ',f?String(periodDays(p)-f.restDays):'—','วันลา',String(f?.leaveDays??'—')],['อัตราจ้าง / เดือน',f?.monthlySalary?money(f.monthlySalary):p.basis==='monthly'?money(p.rate):'—','ขาดงาน',String(f?.absenceDays??'—'),'วันทำงานจริง',String(f?.workedDays??'—'),p.basis==='monthly'?'รายเดือน':p.basis==='daily'?'รายวัน':'รายชั่วโมง',money(p.rate)+' บาท']],
 summary:[['สำหรับเจ้าหน้าที่','สถานะ: '+payrollStatus(p)],['จ่ายแล้ว '+money(paidPay(p))+' บาท','คงเหลือ '+money(p.status==='cancelled'?0:outstandingPay(p))+' บาท'],['จ่ายโดย '+(methods.includes('cash')?'เงินสด ':'')+(methods.includes('bank')?'โอนเข้าบัญชี ':'')+(methods.some(x=>!['cash','bank'].includes(x))?'อื่น ๆ':'')+(!methods.length?'ยังไม่ได้จ่าย':''),'วันที่จ่าย: '+(dates.length?dates.map(dateLabel).join(' / '):'ยังไม่ได้จ่าย')],['กำหนดจ่าย: '+dateLabel(p.dueDate),'วันที่แจ้ง: '+(f?.issueDate?dateLabel(f.issueDate):'—')],['หลักประกัน / ยอดอ้างอิง: '+money(f?.guaranteeAmount||0)+' บาท','สมทบประกันสังคมนายจ้าง: '+money(p.employerSocial)+' บาท']],
 disclaimer:'ใบแจ้งเงินเดือนนี้ไม่ใช่หลักฐานว่าจ่ายเงินจริงแล้ว'};
}
