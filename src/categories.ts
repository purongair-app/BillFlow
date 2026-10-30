import type {State} from './money.ts';
export function categoryUsage(s:State,name:string){return s.entries.filter(e=>e.category===name).length+s.budgets.filter(b=>b.category===name).length;}
export function saveCategory(s:State,value:string,old?:string):State{
 const name=value.trim();if(!name||name.length>150)throw Error('กรอกชื่อหมวดหมู่ไม่เกิน 150 ตัวอักษร');
 if(s.categories.some(c=>c!==old&&c.trim().toLowerCase()===name.toLowerCase()))throw Error('มีชื่อหมวดหมู่นี้แล้ว');
 if(old!==undefined&&!s.categories.includes(old))throw Error('ไม่พบหมวดหมู่ กรุณาโหลดข้อมูลใหม่');
 if(old!==undefined&&name!==old&&s.entries.some(e=>e.category===old&&e.payrollId))throw Error('หมวดหมู่นี้ใช้กับรายการเงินเดือน จึงต้องคงชื่อไว้สำหรับระบบเงินเดือน');
 return {...s,categories:old===undefined?[...s.categories,name]:s.categories.map(c=>c===old?name:c),entries:old===undefined?s.entries:s.entries.map(e=>e.category===old?{...e,category:name}:e),budgets:old===undefined?s.budgets:s.budgets.map(b=>b.category===old?{...b,category:name}:b)};
}
export function deleteCategory(s:State,name:string):State{
 if(categoryUsage(s,name))throw Error('หมวดหมู่นี้มีรายการรับ–จ่ายหรืองบประมาณอ้างอิงอยู่ จึงยังลบไม่ได้');
 return {...s,categories:s.categories.filter(c=>c!==name)};
}
