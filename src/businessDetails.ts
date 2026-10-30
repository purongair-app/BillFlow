import type {State} from './money.ts';
export type BusinessDetails={establishmentName?:string,address?:string,subdistrict?:string,district?:string,province?:string,postalCode?:string,shopPhone?:string,mobilePhone?:string};
export const businessDetailFields=[['address','บ้านเลขที่ / หมู่ / อาคาร / ซอย / ถนน',1000],['subdistrict','ตำบล / แขวง',150],['district','อำเภอ / เขต',150],['province','จังหวัด',150],['postalCode','รหัสไปรษณีย์',5],['shopPhone','เบอร์โทรร้าน',50],['mobilePhone','โทรศัพท์มือถือ',50]] as const;
export function businessNames(s:Pick<State,'business'|'businessDetails'>){
 const legacy='ร้านเพื่อนแอร์ เซอร์วิส โดยนายนิอาแซ ปุโรง';
 return {business:!s.businessDetails&&s.business.trim()===legacy?'ร้านเพื่อนแอร์ เซอร์วิส':s.business,establishmentName:s.businessDetails?.establishmentName??s.business};
}
export function businessAddress(d:BusinessDetails={}){return [d.address,d.subdistrict&&'ตำบล/แขวง '+d.subdistrict,d.district&&'อำเภอ/เขต '+d.district,d.province&&'จังหวัด '+d.province].filter(Boolean).join(' ');}
export function ssoBusinessDetails(s:Pick<State,'business'|'businessDetails'>){const d=s.businessDetails||{};return {business:businessNames(s).establishmentName.trim()||s.business,address:businessAddress(d),postalCode:d.postalCode||'',phone:d.shopPhone||d.mobilePhone||''};}
export function validateBusinessDetails(value:unknown):asserts value is BusinessDetails|undefined{
 if(value===undefined)return;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('ข้อมูลสถานประกอบการไม่ถูกต้อง');
 const limits:Record<string,number>={establishmentName:2000,...Object.fromEntries(businessDetailFields.map(([k,,limit])=>[k,limit]))};
 for(const [key,v] of Object.entries(value))if(!Object.hasOwn(limits,key)||typeof v!=='string'||v.length>limits[key])throw Error('กรุณาตรวจสอบข้อมูลร้านและความยาวข้อความ');
 const d=value as BusinessDetails;if(d.postalCode&&!/^\d{5}$/.test(d.postalCode))throw Error('รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก');
 for(const p of [d.shopPhone,d.mobilePhone])if(p&&!/^[+\d][\d\s()+.\-#]{2,49}$/.test(p))throw Error('กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง');
}
