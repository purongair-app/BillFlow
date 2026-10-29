export const roleLabels={manager:'ผู้จัดการ',shop_admin:'แอดมินร้าน',employee:'พนักงานทั่วไป'};
export type MemberRole=keyof typeof roleLabels;
export const menuOptions=[['overview','ภาพรวม'],['entries','รายการรับ–จ่าย'],['cashbook','สมุดบัญชี'],['accounts','บัญชีเงิน'],['people','รายชื่อ / ผู้ติดต่อ'],['debts','ลูกหนี้ / เจ้าหนี้'],['budgets','รายจ่ายประจำ'],['reports','รายงาน']] as const;
export const editableMenus=['entries','accounts','people','debts','budgets'];
export type Access={owner:boolean,workspaceOwner:string,menus:string[],editMenus:string[]};
export type Member={role:MemberRole,id:string,email:string,name:string,menus:string[],editMenus:string[],enabled:boolean,updatedAt:string};
export const noAccess:Access={owner:false,workspaceOwner:'',menus:[],editMenus:[]};
export const canView=(a:Access,menu:string)=>a.owner||a.menus.includes(menu);
export const canEdit=(a:Access,menu:string)=>a.owner||a.editMenus.includes(menu);
export function validateMenuSelection(menus:string[],edit:string[]){if(new Set(menus).size!==menus.length||menus.some(m=>!menuOptions.some(x=>x[0]===m))||edit.some(m=>!editableMenus.includes(m)||!menus.includes(m)))throw Error('สิทธิ์เมนูไม่ถูกต้อง');}
export function canSaveChanges(access:Access,previous:Record<string,unknown>,next:Record<string,unknown>){if(access.owner)return true;const rights:Record<string,string>={accounts:'accounts',accountHolders:'accounts',entries:'entries',debts:'debts',documentSources:'debts',contacts:'people',employees:'people',budgets:'budgets',recurringExpenses:'budgets'};return Object.keys({...previous,...next}).filter(k=>k!=='audit').every(k=>JSON.stringify(previous[k]??[])===JSON.stringify(next[k]??[])||!!rights[k]&&canEdit(access,rights[k]));}

export type Applicant={id:string,email:string,name:string,registeredAt:string,confirmed:boolean};
