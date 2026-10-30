import type {State} from './money.ts';
export type BusinessDetails={establishmentName?:string,taxId?:string,address?:string,subdistrict?:string,district?:string,province?:string,postalCode?:string,shopPhone?:string,mobilePhone?:string,mobilePhone2?:string,email?:string};
export const businessDetailFields=[['taxId','เลขประจำตัวผู้เสียภาษี',13],['address','บ้านเลขที่ / หมู่ / อาคาร / ซอย / ถนน',1000],['subdistrict','ตำบล / แขวง',150],['district','อำเภอ / เขต',150],['province','จังหวัด',150],['postalCode','รหัสไปรษณีย์',5],['shopPhone','เบอร์โทรร้าน',50],['mobilePhone','เบอร์โทรศัพท์ 1',50],['mobilePhone2','เบอร์โทรศัพท์ 2',50],['email','อีเมลร้าน',254]] as const;
export function businessNames(s:Pick<State,'business'|'businessDetails'>){
 const legacy='ร้านเพื่อนแอร์ เซอร์วิส โดยนายนิอาแซ ปุโรง';
 return {business:!s.businessDetails&&s.business.trim()===legacy?'ร้านเพื่อนแอร์ เซอร์วิส':s.business,establishmentName:s.businessDetails?.establishmentName??s.business};
}
export function businessAddress(d:BusinessDetails={}){return [d.address&&'บ้านเลขที่ / หมู่ / อาคาร / ซอย / ถนน '+d.address,d.subdistrict&&'ตำบล/แขวง '+d.subdistrict,d.district&&'อำเภอ/เขต '+d.district,d.province&&'จังหวัด '+d.province].filter(Boolean).join(' ');}
export function ssoBusinessDetails(s:Pick<State,'business'|'businessDetails'>){const d=s.businessDetails||{};return {business:businessNames(s).establishmentName.trim()||s.business,address:businessAddress(d),postalCode:d.postalCode||'',email:d.email||'',phone:d.shopPhone||formatBusinessPhone(d.mobilePhone||'')||formatBusinessPhone(d.mobilePhone2||'')};}
export function validateBusinessDetails(value:unknown):asserts value is BusinessDetails|undefined{
 if(value===undefined)return;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('ข้อมูลสถานประกอบการไม่ถูกต้อง');
 const limits:Record<string,number>={establishmentName:2000,...Object.fromEntries(businessDetailFields.map(([k,,limit])=>[k,limit]))};
 for(const [key,v] of Object.entries(value))if(!Object.hasOwn(limits,key)||typeof v!=='string'||v.length>limits[key])throw Error('กรุณาตรวจสอบข้อมูลร้านและความยาวข้อความ');
 const d=value as BusinessDetails;if(d.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))throw Error('กรุณากรอกอีเมลร้านให้ถูกต้อง');if(d.taxId&&!/^[0-9]{13}$/.test(d.taxId))throw Error('เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก');if(d.postalCode&&!/^\d{5}$/.test(d.postalCode))throw Error('รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก');
 for(const p of [d.mobilePhone,d.mobilePhone2])if(p&&!/^(?:[0-9]{10}|[0-9]{3}-[0-9]{3}-[0-9]{4})$/.test(p))throw Error('เบอร์โทรศัพท์ 1 และ 2 ต้องมีตัวเลข 10 หลัก เช่น 088-788-0256');
}

export function formatBusinessPhone(value:string){const digits=value.replace(/[^0-9]/g,'').slice(0,10);return [digits.slice(0,3),digits.slice(3,6),digits.slice(6,10)].filter(Boolean).join('-');}

