const deviceKey='purong-billflow-browser-device';
let currentDevice='';
export function deviceId(){if(currentDevice)return currentDevice;try{const stored=localStorage.getItem(deviceKey);if(stored&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(stored))return currentDevice=stored;}catch{}currentDevice=crypto.randomUUID();try{localStorage.setItem(deviceKey,currentDevice);}catch{}return currentDevice;}
export const clientInfo=()=>`PUROnGBillFlow/1 device=${deviceId()}`;
export type UsageEvent={id:string,occurred_at:string,actor_name:string,actor_email:string,actor_id:string|null,action:string,entity_type:string,entity_id:string,description:string,source:'database'|'browser'|'system',ip:string|null,ip_source:string,device_id:string|null,user_agent:string,details:{revision?:number,fields?:string[]}};
export function usageCsv(rows:UsageEvent[]){const cell=(v:unknown)=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return '\ufeff'+[['รหัสอ้างอิง','วันที่เวลา (ไทย)','ชื่อผู้ใช้','อีเมล','รายการที่ทำ','ประเภทข้อมูล','รหัสรายการ','IP เซสชัน','รหัสเบราว์เซอร์','ประเภทอุปกรณ์ (ประเมิน)','ระบบปฏิบัติการ','เบราว์เซอร์','ตัวระบุเบราว์เซอร์','แหล่งข้อมูล'],...rows.map(r=>[r.id,new Date(r.occurred_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}),r.actor_name,r.actor_email,r.description,r.entity_type,r.entity_id,r.ip,r.device_id,describeDevice(r.user_agent,r.source).label,describeDevice(r.user_agent,r.source).os,describeDevice(r.user_agent,r.source).browser,r.user_agent,r.source])].map(row=>row.map(cell).join(',')).join('\r\n');}

export type DeviceKind='desktop'|'mobile'|'tablet'|'automation'|'unknown';
export function describeDevice(userAgent='',source=''):{kind:DeviceKind,label:string,os:string,browser:string}{
 const ua=userAgent.trim();
 if(source==='system')return {kind:'automation',label:'ระบบอัตโนมัติ',os:'—',browser:'—'};
 if(!ua)return {kind:'unknown',label:'ไม่ทราบประเภท',os:'ไม่ทราบระบบ',browser:'ไม่ทราบเบราว์เซอร์'};
 const tablet=/iPad|Tablet|PlayBook|Kindle|Silk\//i.test(ua)||(/Android/i.test(ua)&&!/Mobile/i.test(ua));
 const mobile=/iPhone|iPod|Windows Phone|Mobi/i.test(ua);
 const kind:DeviceKind=tablet?'tablet':mobile?'mobile':/Windows NT|Macintosh|Mac OS X|X11|CrOS|Linux/i.test(ua)?'desktop':'unknown';
 const os=/Windows Phone/i.test(ua)?'Windows Phone':/iPad/i.test(ua)?'iPadOS':/iPhone|iPod/i.test(ua)?'iOS':/Android/i.test(ua)?'Android':/CrOS/i.test(ua)?'ChromeOS':/Windows NT/i.test(ua)?'Windows':/Macintosh|Mac OS X/i.test(ua)?'macOS':/Linux|X11/i.test(ua)?'Linux':'ไม่ทราบระบบ';
 const browser=/Edg(?:A|iOS)?\/|Edge\//i.test(ua)?'Microsoft Edge':/OPR\/|OPiOS\/|Opera/i.test(ua)?'Opera':/SamsungBrowser\//i.test(ua)?'Samsung Internet':/Firefox\/|FxiOS\//i.test(ua)?'Firefox':/Chrome\/|CriOS\//i.test(ua)?'Chrome':/Version\/.*Safari\//i.test(ua)?'Safari':/; wv\)|WebView/i.test(ua)?'WebView':'ไม่ทราบเบราว์เซอร์';
 return {kind,label:({desktop:'คอมพิวเตอร์',mobile:'มือถือ',tablet:'แท็บเล็ต',automation:'ระบบอัตโนมัติ',unknown:'ไม่ทราบประเภท'} as const)[kind],os,browser};
}
