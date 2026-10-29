import type {Employee,Entry,State} from './money';
export const actorFields=['recipient','payer','claimant','beneficiary'] as const;
export type ActorField=typeof actorFields[number];
export function nextEmployeeCode(s:State){const codes=new Set((s.employees||[]).map(e=>e.code.toUpperCase()));let n=1;while(codes.has('EMP'+String(n).padStart(3,'0')))n++;return 'EMP'+String(n).padStart(3,'0');}
export function employeeValue(entry:Entry|undefined,field:ActorField,employees:Employee[]){const p=employees.find(p=>p.id===entry?.[`${field}EmployeeId`]);return p?`${p.code} · ${entry?.[field]||p.name}`:entry?.[field]||'';}
export function resolveEmployee(raw:string,employees:Employee[],previous:Entry|undefined,field:ActorField):{name:string,id?:string}{const value=raw.trim();if(previous?.[`${field}EmployeeId`]&&value===employeeValue(previous,field,employees))return {name:previous[field]||'',id:previous[`${field}EmployeeId`]};const exact=employees.find(p=>value===`${p.code} · ${p.name}`);if(exact){if(!exact.active)throw Error('พนักงานนี้ปิดใช้งานแล้ว กรุณาเลือกชื่ออื่น');return {name:exact.name,id:exact.id};}const names=employees.filter(p=>p.active&&p.name===value);if(names.length===1)return {name:names[0].name,id:names[0].id};return {name:value};}
export function employeeUsageCount(s:State,id:string){return s.entries.filter(e=>actorFields.some(f=>e[`${f}EmployeeId`]===id)).length+(s.payroll||[]).filter(p=>p.employeeId===id).length;}
export function employeeId(){return 'emp-'+Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');}
