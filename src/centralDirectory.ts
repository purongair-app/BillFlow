import type {State} from './money';
const endpoint='https://customer.airfriendservice.com/api/directory';
type Hub={id:string,code:string,updatedAt:string,data:Record<string,string>,externalId:string|null};
let baseline=new Map<string,{row:any,hub:Hub,kind:'customers'|'personnel'}>();
export let centralDirectoryWarning='';
let localSnapshot=new Map<string,string>();
let authoritative=false;
let shopSnapshot='';
const shopValue=(s:State)=>JSON.stringify([s.business,s.businessDetails,s.businessAssets?.logo]);
async function request(token:string,body?:any){const r=await fetch(endpoint+(body?'':'?system=billflow'),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify({system:'billflow',...body})}:{}),signal:AbortSignal.timeout(20000)});const j=await r.json();if(!r.ok)throw Error(j.error||'เชื่อมฐานกลางไม่สำเร็จ');return j}
const name=(d:Record<string,string>)=>d.organization||[d.firstName,d.lastName].filter(Boolean).join(' ');
function toHub(row:any,kind:string){const names=String(row.name||'').trim().split(/\s+/);if(kind==='personnel')return {firstName:names.shift()||'',lastName:names.join(' ')||'(ไม่ระบุ)',personnelType:row.personnelType||'พนักงาน',employmentYear:row.employmentYear||(/AFS-\d{2}[123]\d{3}/.test(row.code)?'25'+row.code.slice(4,6):String(new Date().getFullYear()+543)),...(row.startDate?{startDate:row.startDate}:{}),position:row.position||'',phone:row.phone||'',email:row.email||'',enabled:row.active?'1':'0',address:row.address||''};const type=row.customerType||(row.code?.startsWith('CTM-2')?'บริษัท':row.code?.startsWith('CTM-3')?'หน่วยงาน':'ทั่วไป');return {type,relationship:row.kind==='creditor'?'คู่ค้า':'ลูกค้า',...(row.kind==='creditor'?{creditorType:row.code?.startsWith('VC-')?'บริษัท/ร้านค้า':'บริการ/ค่าใช้จ่าย'}:{}),...(type==='ทั่วไป'?{firstName:names.shift()||'',lastName:names.join(' ')}:{organization:row.name}),notes:row.note||''}}
function fromHub(h:Hub,old:any,kind:string){const d=h.data,id=old?.id||h.externalId||h.id;if(kind==='personnel')return {...old,id,code:h.code,name:name(d),position:d.position||'',active:d.enabled!=='0',personnelType:d.personnelType,employmentYear:d.employmentYear,startDate:d.startDate||'',phone:d.phone||'',email:d.email||'',address:d.address||[d.houseNo,d.soi,d.road,d.subdistrict,d.district,d.province,d.postalCode].filter(Boolean).join(' ')};return {...old,id,code:h.code,name:name(d),kind:d.relationship==='คู่ค้า'?'creditor':'customer',customerType:d.type,note:d.notes||'',active:old?.active!==false}}
export async function readCentralDirectory(state:State,token:string,_owner:boolean):Promise<State>{
 centralDirectoryWarning='';baseline=new Map();localSnapshot=new Map();authoritative=false;shopSnapshot=shopValue(state);
 for(const [kind,key] of [['customers','contacts'],['personnel','employees']] as const)for(const row of (state as any)[key]||[])localSnapshot.set(kind+':'+row.id,JSON.stringify(toHub(row,kind)));
 try{const data=await request(token),next=structuredClone(state);
  for(const [kind,key] of [['customers','contacts'],['personnel','employees']] as const){
   if(!Array.isArray(data[kind]))throw Error('รูปแบบข้อมูลกลางไม่ถูกต้อง');
   (next as any)[key]=data[kind].map((hub:Hub)=>{const old=((state as any)[key]||[]).find((r:any)=>r.id===hub.externalId||r.id===hub.id);const row=fromHub(hub,old,kind);baseline.set(kind+':'+row.id,{row:structuredClone(row),hub,kind});return row});
  }if(data.shop&&typeof data.shop==='object'){const d=data.shop;next.business=d.name||'ร้านของฉัน';next.businessDetails={establishmentName:d.name||'',taxId:String(d.taxId||'').replace(/\D/g,''),address:d.address||'',subdistrict:d.subdistrict||'',district:d.district||'',province:d.province||'',postalCode:d.postalCode||'',shopPhone:d.shopPhone||'',mobilePhone:d.phone||'',mobilePhone2:d.phone2||'',email:d.email||''};next.businessAssets={...next.businessAssets};if(d.logo)next.businessAssets.logo=d.logo;else delete next.businessAssets.logo}shopSnapshot=shopValue(next);authoritative=true;return next;
 }catch(e){centralDirectoryWarning='ฐานกลางยังไม่พร้อม: '+String(e);return state}
}
export async function writeCentralDirectory(state:State,_token:string):Promise<State>{
 if(shopSnapshot&&shopValue(state)!==shopSnapshot)throw Error('แก้ไขข้อมูลร้านได้ที่ PUROnGCustomer เท่านั้น');
 for(const [kind,key] of [['customers','contacts'],['personnel','employees']] as const){
  const rows:any[]=(state as any)[key]||[],known=[...baseline].filter(([,b])=>b.kind===kind);
  const expected=authoritative?new Map(known.map(([id,b])=>[id,JSON.stringify(toHub(b.row,kind))])):new Map([...localSnapshot].filter(([id])=>id.startsWith(kind+':')));
  if(rows.length!==expected.size||rows.some(row=>expected.get(kind+':'+row.id)!==JSON.stringify(toHub(row,kind))))throw Error('เพิ่ม แก้ไข หรือลบรายชื่อได้ที่ PUROnGCustomer เท่านั้น');
 }return structuredClone(state);
}
