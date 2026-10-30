// All human-facing dates use the Buddhist calendar and Bangkok time.
// Stored dates stay Gregorian ISO so sorting, calculations and integrations stay stable.
export const THAI_TIME_ZONE='Asia/Bangkok';
export const THAI_LOCALE='th-TH-u-ca-buddhist-nu-latn';
export function thaiToday(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn',{timeZone:THAI_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=(name:string)=>parts.find(p=>p.type===name)!.value;
 return `${part('year')}-${part('month')}-${part('day')}`;
}
export function validIsoDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number(value.slice(0,4))>0&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
export function thaiDateInput(value:string,monthOnly=false){
 if(!value)return '';
 const [year,month,day]=value.split('-');
 if(!validIsoDate(monthOnly?value+'-01':value))return '';
 return `${monthOnly?'':day+'/'}${month}/${String(Number(year)+543).padStart(4,'0')}`;
}
export function parseThaiDate(value:string,monthOnly=false):string|null{
 const digits=value.trim().replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-0x0e50));
 const match=digits.match(monthOnly?/^(\d{1,2})\/(\d{4})$/:/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
 if(!match)return null;
 const year=Number(match[monthOnly?2:3])-543,month=Number(match[monthOnly?1:2]),day=monthOnly?1:Number(match[1]);
 if(year<1||year>9456)return null;
 const iso=`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
 return validIsoDate(iso)?(monthOnly?iso.slice(0,7):iso):null;
}
export function thaiDateLabel(value:string,options:Intl.DateTimeFormatOptions={day:'numeric',month:'short',year:'numeric'}){
 if(!validIsoDate(value))return '—';
 return new Intl.DateTimeFormat(THAI_LOCALE,{...options,timeZone:THAI_TIME_ZONE,calendar:'buddhist'}).format(new Date(value+'T00:00:00Z'));
}
export function thaiMonthLabel(value:string){return thaiDateLabel(value+'-01',{month:'long',year:'numeric'});}
export function thaiDateTime(value:string|Date){const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(THAI_LOCALE,{timeZone:THAI_TIME_ZONE,calendar:'buddhist',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date):'—';}
export function thaiTime(value:string|Date){const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(THAI_LOCALE,{timeZone:THAI_TIME_ZONE,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date):'—';}
