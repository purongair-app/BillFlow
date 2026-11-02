import {useEffect,useRef,useState} from 'react';
import {Sun,Moon,Cloud,CloudSun,CloudMoon,CloudRain,CloudLightning,CloudFog,Snowflake,Thermometer,Volume2,VolumeX,RefreshCw} from 'lucide-react';
import {WEATHER_LOCATIONS,WEATHER_BACKGROUNDS,WEATHER_SCENERY} from './weatherLandmarks';
import {fetchForecast,provinces,savedForecast,weatherKey,weatherKind,weatherLabel,weatherPeriod,type Forecast} from './weatherForecast';
import './weatherCard.css';
const realClock=()=>Date.now();
function WeatherIcon({code,night=false,size=24}:{code:number,night?:boolean,size?:number}){
 const kind=weatherKind(code),Icon=kind==='thunder'?CloudLightning:kind==='rain'?CloudRain:kind==='fog'?CloudFog:kind==='snow'?Snowflake:kind==='sun'?(night?Moon:Sun):kind==='clouds'?(code===3?Cloud:night?CloudMoon:CloudSun):Thermometer;
 return <Icon size={size} strokeWidth={1.7} aria-hidden="true"/>;
}
function WeatherSound({scene,province}:{scene:string,province:string}){
 const [enabled,setEnabled]=useState(false),[error,setError]=useState('');
 const audio=useRef<AudioContext|null>(null),intent=useRef(false),starting=useRef(false);
 const stop=()=>{const context=audio.current;audio.current=null;if(context)void context.close().catch(()=>{});};
 useEffect(()=>()=>{intent.current=false;stop();},[]);
 useEffect(()=>{
  if(!enabled||scene==='neutral'){stop();return;}
  let disposed=false,timer:ReturnType<typeof setInterval>|undefined;
  try{
   const context=audio.current||new AudioContext();audio.current=context;
   const buffer=context.createBuffer(1,context.sampleRate*6,context.sampleRate),samples=buffer.getChannelData(0);
   let last=0;for(let i=0;i<samples.length;i++){last=(last+.025*(Math.random()*2-1))/1.025;samples[i]=scene==='rain'?Math.random()*2-1:last*4;}
   const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
   source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=scene==='rain'?2200:scene==='thunder'?900:400;gain.gain.value=scene==='rain'?.028:scene==='thunder'?.045:.025;
   source.connect(filter);filter.connect(gain);gain.connect(context.destination);source.start();
   const thunder=()=>{if(disposed||document.hidden)return;const rumble=context.createBufferSource(),low=context.createBiquadFilter(),volume=context.createGain();rumble.buffer=buffer;low.type='lowpass';low.frequency.value=140;const t=context.currentTime;volume.gain.setValueAtTime(0,t);volume.gain.linearRampToValueAtTime(.24,t+.25);volume.gain.exponentialRampToValueAtTime(.001,t+3.5);rumble.connect(low);low.connect(volume);volume.connect(context.destination);rumble.start();rumble.stop(t+4);rumble.onended=()=>{rumble.disconnect();low.disconnect();volume.disconnect();};};
   if(scene==='thunder'){thunder();timer=setInterval(thunder,13000);}
   const sync=()=>{if(document.hidden)void context.suspend().catch(()=>{});else void context.resume().catch(()=>{if(!disposed)setError('กดปิดแล้วเปิดเสียงอีกครั้ง');});};
   sync();document.addEventListener('visibilitychange',sync);
   return()=>{disposed=true;if(timer)clearInterval(timer);document.removeEventListener('visibilitychange',sync);stop();};
  }catch{setError('อุปกรณ์นี้เปิดเสียงไม่ได้ กรุณาลองใหม่');setEnabled(false);intent.current=false;stop();}
 },[enabled,scene,province]);
 async function toggle(){
  if(starting.current)return;
  setError('');intent.current=!intent.current;
  if(!intent.current){setEnabled(false);stop();return;}
  starting.current=true;
  try{const context=new AudioContext();audio.current=context;await context.resume();if(intent.current)setEnabled(true);else stop();}
  catch{intent.current=false;setEnabled(false);stop();setError('เปิดเสียงไม่ได้ กรุณาลองอีกครั้ง');}
  finally{starting.current=false;}
 }
 return <div className="wx-sound"><button type="button" aria-pressed={enabled} onClick={()=>void toggle()} disabled={scene==='neutral'} title="เสียงบรรยากาศสังเคราะห์ตามสภาพอากาศ">{enabled?<Volume2 size={17}/>:<VolumeX size={17}/>}<span>{enabled?'ปิดเสียงอากาศ':'เปิดเสียงอากาศ'}</span></button>{error&&<small role="status">{error}</small>}</div>;
}
export default function WeatherCard({loader=fetchForecast,clock=realClock}:{loader?:typeof fetchForecast,clock?:()=>number}={}){
 const [city,setCity]=useState(()=>{try{const saved=localStorage.getItem('billflow-weather-province');if(saved&&provinces.includes(saved))return saved;}catch{}return 'นราธิวาส';});
 const [now,setNow]=useState(clock),[forecast,setForecast]=useState<Forecast|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[stale,setStale]=useState(false),[revision,refresh]=useState(0),[paused,setPaused]=useState(false),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const retry=()=>refresh(value=>value+1);
 useEffect(()=>{const timer=setInterval(()=>setNow(clock()),1000);return()=>clearInterval(timer);},[clock]);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),sync=()=>setReduced(media.matches);media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync);},[]);
 useEffect(()=>{
  let alive=true,controller:AbortController|null=null;
  try{localStorage.setItem('billflow-weather-province',city);}catch{}
  const cached=savedForecast(city);setForecast(cached);setStale(Boolean(cached));setError('');
  let running=false;
  async function update(){
   if(running)return;running=true;setBusy(true);controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),15000);
   try{const next=await loader(city,controller.signal);if(!alive)return;
    if(next.province!==city)throw Error('จังหวัดไม่ตรง');
    setForecast(next);setStale(false);setError('');try{localStorage.setItem(weatherKey(city),JSON.stringify(next));}catch{}
   }catch{if(alive){setStale(true);setError('เชื่อมต่อข้อมูลอากาศไม่ได้ กรุณาลองใหม่');}}
   finally{clearTimeout(timeout);running=false;if(alive)setBusy(false);}
  }
  void update();const timer=setInterval(()=>{if(!document.hidden)void update();},1800000);
  const visible=()=>{if(!document.hidden){setNow(clock());void update();}};
  document.addEventListener('visibilitychange',visible);
  return()=>{alive=false;controller?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[city,revision,loader,clock]);
 // Never show the previous province while a new request is pending.
 const data=forecast?.province===city?forecast:null;
 const period=weatherPeriod(now,data?.days||[]),scene=data?weatherKind(data.code):'neutral',night=period.light==='night';
 const dateText=new Intl.DateTimeFormat('th-TH-u-ca-buddhist',{timeZone:'Asia/Bangkok',dateStyle:'full'}).format(now);
 const timeText=new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(now);
 const today=new Date(now+7*3600000).toISOString().slice(0,10);
 const nextDays=data?.days.filter(day=>day.date>today).slice(0,6)||[];
 const latest=data?new Intl.DateTimeFormat('th-TH-u-ca-buddhist',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'}).format(data.updatedAt):'';
 return <section className={'wx-card wx-'+scene+((paused||reduced)?' wx-paused':'')} data-period={period.light} aria-label="พยากรณ์อากาศ วันที่ และเวลา" aria-busy={busy}>
  <div className="wx-scene" aria-hidden="true"><div className="wx-landscape" style={{backgroundImage:`url("${WEATHER_BACKGROUNDS[city]}"),url("${WEATHER_SCENERY[city]}")`}}/><div className="wx-shade"/><i className="wx-cloud wx-cloud-one"/><i className="wx-cloud wx-cloud-two"/><i className="wx-fog-layer"/><i className="wx-flash"/>{(scene==='rain'||scene==='thunder'||scene==='snow')&&Array.from({length:24},(_,i)=><i className={scene==='snow'?'wx-snow':'wx-drop'} key={i} style={{left:((i*43)%101)+'%',animationDelay:-(i*.37)+'s',animationDuration:scene==='snow'?(5+i%4)+'s':(.8+i%5*.16)+'s'}}/>)}</div>
  <div className="wx-content"><div className="wx-main"><div className="wx-current"><div className="wx-icon"><WeatherIcon code={data?.code??-1} night={night} size={58}/></div><strong className="wx-temperature">{data?Math.round(data.temperature):'—'}<span> °C</span></strong><div className="wx-description"><b>{data?weatherLabel(data.code)+' · '+period.label:busy?'กำลังโหลดสภาพอากาศ…':'ยังไม่มีข้อมูลอากาศ'}</b><p>ความชื้น {data?Math.round(data.humidity)+'%':'—'} · ลม {data?data.wind.toFixed(1)+' กม./ชม.':'—'}</p></div></div>
   <div className="wx-forecast" aria-label="พยากรณ์ล่วงหน้า 6 วัน">{nextDays.map(day=><div className="wx-day" key={day.date} title={day.date+' '+weatherLabel(day.code)}><span>{new Intl.DateTimeFormat('th-TH',{weekday:'short',timeZone:'Asia/Bangkok'}).format(new Date(day.date+'T12:00:00+07:00'))}</span><WeatherIcon code={day.code}/><span aria-label={'สูงสุด '+Math.round(day.max)+' ต่ำสุด '+Math.round(day.min)+' องศาเซลเซียส'}><b>{Math.round(day.max)}°</b><em>{Math.round(day.min)}°</em></span></div>)}{!nextDays.length&&<p className="wx-no-forecast">{busy?'กำลังโหลดพยากรณ์ 6 วัน…':'ยังไม่มีพยากรณ์ล่วงหน้า'}</p>}</div>
  </div><div className="wx-context"><div className="wx-datetime"><span>{dateText}</span><time dateTime={new Date(now).toISOString()}>{timeText}</time></div><label className="wx-location"><span>อากาศบริเวณตัวเมือง</span><select value={city} aria-label="จังหวัดสำหรับแสดงสภาพอากาศ" onChange={event=>{setCity(event.target.value);setForecast(null);setBusy(true);setError('');}}>{provinces.map(province=><option key={province}>{province}</option>)}</select></label><button className="wx-refresh" type="button" disabled={busy} onClick={retry}><RefreshCw size={16} className={busy?'wx-spinning':''}/>{busy?'กำลังอัปเดต…':'อัปเดตอากาศ'}</button></div></div>
  <div className="wx-bottom"><span className="wx-place">{city} · {WEATHER_LOCATIONS[city][3]}</span><span className="wx-disclaimer" title="ภาพทิวทัศน์ประกอบ">ข้อมูลพยากรณ์โดยประมาณ ·</span><button type="button" className="wx-motion-link" aria-pressed={paused||reduced} disabled={reduced} onClick={()=>setPaused(value=>!value)}>{reduced?'ลดการเคลื่อนไหวตามอุปกรณ์':paused?'เปิดภาพเคลื่อนไหว':'ปิดภาพเคลื่อนไหว'}</button><span aria-hidden="true">·</span><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a><WeatherSound scene={scene} province={city}/></div>
  {data&&<div className="wx-update" title={'เวลาอ้างอิงข้อมูล '+new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'}).format(data.time)}>อัปเดตล่าสุด {latest}</div>}
  <div className="wx-status" role="status" aria-live="polite">{busy&&<span>กำลังเชื่อมต่อข้อมูลอากาศ…</span>}{data&&(stale||now-data.updatedAt>2100000||now-data.time>7200000)&&<span className="wx-stale">แสดงข้อมูลอัปเดตครั้งล่าสุด ({latest}) {error?'เนื่องจากเชื่อมต่อไม่ได้':'ระหว่างรออัปเดต'}</span>}{error&&<span className="wx-error">{error} <button type="button" onClick={retry} disabled={busy}>ลองใหม่</button></span>}</div>
 </section>;
}
