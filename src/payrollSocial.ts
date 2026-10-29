import type {PayrollSlip} from './payroll.ts';

export const employeeSocial=(p:PayrollSlip)=>p.deductions.filter(l=>l.kind==='social').reduce((sum,l)=>sum+l.amount,0);
export const totalSocial=(p:PayrollSlip)=>employeeSocial(p)+p.employerSocial;
export type SocialContributionRow={employeeId:string,employeeCode:string,employeeName:string,periods:number,employee:number,employer:number,total:number};
export function monthlySocialContributions(payroll:PayrollSlip[],month:string){
 const people=new Map<string,SocialContributionRow>();
 for(const p of payroll.filter(p=>p.status==='approved'&&p.periodEnd.slice(0,7)===month).sort((a,b)=>a.periodEnd.localeCompare(b.periodEnd)||a.periodStart.localeCompare(b.periodStart))){
  const row=people.get(p.employeeId)||{employeeId:p.employeeId,employeeCode:p.employeeCode,employeeName:p.employeeName,periods:0,employee:0,employer:0,total:0};
  row.employeeCode=p.employeeCode;row.employeeName=p.employeeName;row.periods++;row.employee+=employeeSocial(p);row.employer+=p.employerSocial;row.total=row.employee+row.employer;people.set(p.employeeId,row);
 }
 const rows=[...people.values()].sort((a,b)=>a.employeeCode.localeCompare(b.employeeCode,'th')||a.employeeName.localeCompare(b.employeeName,'th'));
 return {rows,employee:rows.reduce((sum,r)=>sum+r.employee,0),employer:rows.reduce((sum,r)=>sum+r.employer,0),total:rows.reduce((sum,r)=>sum+r.total,0)};
}
