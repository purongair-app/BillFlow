import type {PayrollSlip} from './payroll.ts';
export function socialDefaults(date:string){const year=Number(date.slice(0,4));return {minimum:165000,maximum:(year>=2032?23000:year>=2029?20000:year>=2026?17500:15000)*100,employeeRate:5,employerRate:5};}
export function calculateSocial(wage:number,minimum:number,maximum:number,employeeRate:number,employerRate:number){
 if(![wage,minimum,maximum].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12)||minimum>maximum||![employeeRate,employerRate].every(n=>Number.isFinite(n)&&n>=0&&n<=100))throw Error('กรุณาตรวจฐานค่าจ้างและอัตราประกันสังคม');
 const base=wage===0?0:Math.min(maximum,Math.max(minimum,wage));
 const contribution=(rate:number)=>Math.round(base*rate/10000)*100;
 return {base,employee:contribution(employeeRate),employer:contribution(employerRate)};
}
export function socialRemaining(slips:PayrollSlip[],current:PayrollSlip,employee:number,employer:number){
 const other=slips.filter(p=>p.id!==current.id&&p.employeeId===current.employeeId&&p.status==='approved'&&p.periodEnd.slice(0,7)===current.periodEnd.slice(0,7));
 const deducted=other.reduce((n,p)=>n+p.deductions.filter(l=>l.kind==='social').reduce((n,l)=>n+l.amount,0),0),contributed=other.reduce((n,p)=>n+p.employerSocial,0);
 return {deducted,contributed,employee:Math.max(0,employee-deducted),employer:Math.max(0,employer-contributed)};
}
export function applySocial(p:PayrollSlip,employee:number,employer:number):PayrollSlip{return {...p,deductions:[...p.deductions.filter(l=>l.kind!=='social'),{kind:'social',name:'ประกันสังคมพนักงาน',amount:employee}],employerSocial:employer};}
