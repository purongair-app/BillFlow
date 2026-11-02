import {WEATHER_LOCATIONS} from './weatherLandmarks.ts';
export const provinces=Object.keys(WEATHER_LOCATIONS);
export type WeatherDay={date:string,code:number,min:number,max:number,sunrise:number,sunset:number};
export type Forecast={province:string,updatedAt:number,time:number,temperature:number,humidity:number,wind:number,code:number,days:WeatherDay[]};
export const weatherKey=(province:string)=>'billflow-weather-v4:'+province;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
export function parseForecast(data:any,province:string,updatedAt=Date.now()):Forecast{
 const c=data?.current,d=data?.daily;
 if(!c||![c.time,c.temperature_2m,c.relative_humidity_2m,c.wind_speed_10m,c.weather_code].every(finite)||!Array.isArray(d?.time)||d.time.length<7)throw Error('ข้อมูลอากาศไม่ครบ');
 const days=d.time.map((time:unknown,i:number)=>{
  const values=[time,d.weather_code?.[i],d.temperature_2m_min?.[i],d.temperature_2m_max?.[i],d.sunrise?.[i],d.sunset?.[i]];
  if(!values.every(finite))throw Error('ข้อมูลพยากรณ์ไม่ครบ');
  return {date:new Date((time as number)*1000+7*3600000).toISOString().slice(0,10),code:values[1],min:values[2],max:values[3],sunrise:values[4]*1000,sunset:values[5]*1000};
 });
 return {province,updatedAt,time:c.time*1000,temperature:c.temperature_2m,humidity:c.relative_humidity_2m,wind:c.wind_speed_10m,code:c.weather_code,days};
}
export async function fetchForecast(province:string,signal:AbortSignal):Promise<Forecast>{
 const location=WEATHER_LOCATIONS[province];if(!location)throw Error('ไม่พบจังหวัด');
 const query=new URLSearchParams({latitude:String(location[0]),longitude:String(location[1]),current:'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',daily:'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset',timezone:'Asia/Bangkok',timeformat:'unixtime',forecast_days:'7',wind_speed_unit:'kmh'});
 const response=await fetch('https://api.open-meteo.com/v1/forecast?'+query,{signal});
 if(!response.ok)throw Error('เชื่อมต่อแหล่งอากาศไม่สำเร็จ');
 return parseForecast(await response.json(),province);
}
export function savedForecast(province:string):Forecast|null{
 try{const saved=JSON.parse(localStorage.getItem(weatherKey(province))||'null');
 if(saved?.province===province&&[saved.updatedAt,saved.time,saved.temperature,saved.humidity,saved.wind,saved.code].every(finite)&&Array.isArray(saved.days)&&saved.days.length>=7&&saved.days.every((d:any)=>typeof d.date==='string'&&[d.min,d.max,d.code,d.sunrise,d.sunset].every(finite)))return saved;
 }catch{}return null;
}
export function weatherKind(code:number){
 if(code>=95)return 'thunder';if([71,73,75,77,85,86].includes(code))return 'snow';
 if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return 'rain';
 if([45,48].includes(code))return 'fog';if([1,2,3].includes(code))return 'clouds';return code===0?'sun':'neutral';
}
export function weatherLabel(code:number){
 if(code>=95)return 'ฝนฟ้าคะนอง';if([65,67,82].includes(code))return 'ฝนตกหนัก';
 return ({thunder:'ฝนฟ้าคะนอง',sun:'ท้องฟ้าโปร่ง',clouds:code===3?'มีเมฆมาก':'มีเมฆบางส่วน',rain:'ฝนตก',fog:'มีหมอก',snow:'หิมะ / ฝนปนหิมะ',neutral:'ยังไม่มีข้อมูลอากาศ'})[weatherKind(code)];
}
export function weatherPeriod(now:number,days:WeatherDay[]){
 const date=new Date(now+7*3600000).toISOString().slice(0,10),today=days.find(day=>day.date===date);
 const hour=new Date(now+7*3600000).getUTCHours();
 const sunrise=today?.sunrise??Date.parse(date+'T06:00:00+07:00'),sunset=today?.sunset??Date.parse(date+'T18:00:00+07:00');
 const light=now<sunrise||now>=sunset+40*60000?'night':now>=sunset-75*60000?'evening':'day';
 return {light,label:hour<5?'ตอนดึก':now<sunrise?'ยามเช้ามืด':now>=sunset+40*60000?'ตอนค่ำ':light==='evening'?'ตอนเย็น':hour<11?'ตอนเช้า':hour<13?'ตอนเที่ยง':'ตอนบ่าย'};
}
