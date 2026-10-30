import {calculateSocial,socialDefaults} from './socialCalculator.ts';
import {ssoAmount,type SsoSubmission} from './ssoSubmission.ts';
export function ssoTotals(f:SsoSubmission){
 const wage=f.rows.reduce((n,r)=>n+ssoAmount(r.wage),0),employee=f.rows.reduce((n,r)=>n+ssoAmount(r.contribution),0);
 const d=socialDefaults(f.month+'-01');
 const suggestedEmployer=Number(f.employeeRate)===Number(f.employerRate)?employee:f.rows.reduce((n,r)=>n+calculateSocial(ssoAmount(r.wage),d.minimum,d.maximum,Number(f.employeeRate),Number(f.employerRate)).employer,0);
 const employer=f.employerAmount?.trim()?ssoAmount(f.employerAmount):suggestedEmployer;
 return {wage,employee,employer,suggestedEmployer,total:employee+employer,count:f.rows.length,overridden:!!f.employerAmount?.trim()};
}
