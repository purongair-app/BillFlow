import {useEffect,useId,useRef,useState,type InputHTMLAttributes,type ChangeEvent} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight} from 'lucide-react';
import {thaiToday,thaiDateInput,parseThaiDate,thaiMonthLabel} from './thaiDate';
type Props=InputHTMLAttributes<HTMLInputElement>;
// Keeps existing form names and onChange ISO contracts; only the visible field uses พ.ศ.
export default function ThaiDateInput(props:Props){
 if(props.type==='date'||props.type==='month')return <DateField {...props}/>;
 if(props.type==='time')return <input {...props} type="text" inputMode="numeric" placeholder="ชั่วโมง:นาที (เวลาไทย)" pattern="([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?" title="เวลาไทย 24 ชั่วโมง เช่น 14:30"/>;
 return <input {...props}/>;
}
function DateField({type='date',name,value,defaultValue,onChange,onBlur,min,max,required,disabled,readOnly,placeholder,id,...rest}:Props){
 const monthOnly=type==='month',controlled=value!==undefined;
 const [internal,Internal]=useState(String(defaultValue||''));
 const iso=controlled?String(value||''):internal;
 const [text,Text]=useState(()=>thaiDateInput(iso,monthOnly));
 const [open,Open]=useState(false),[shown,Shown]=useState((iso||thaiToday()).slice(0,7));
 const input=useRef<HTMLInputElement>(null),container=useRef<HTMLSpanElement>(null),generated=useId(),fieldId=id||generated;
 const calendarId=generated+'-calendar';
 function validation(draft:string){const parsed=parseThaiDate(draft,monthOnly);return !draft?'':!parsed?'กรอก'+(monthOnly?'เดือน/ปี พ.ศ.':'วัน/เดือน/ปี พ.ศ.')+' ให้ถูกต้อง เช่น '+(monthOnly?'10/2569':'30/10/2569'):min&&parsed<String(min)?'ต้องไม่ก่อน '+thaiDateInput(String(min),monthOnly):max&&parsed>String(max)?'ต้องไม่หลัง '+thaiDateInput(String(max),monthOnly):'';}
 useEffect(()=>{Text(thaiDateInput(iso,monthOnly));input.current?.setCustomValidity('');},[iso,monthOnly]);
 useEffect(()=>{if(!open)return;function outside(e:PointerEvent){if(!container.current?.contains(e.target as Node))Open(false)}document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)},[open]);
 useEffect(()=>{input.current?.setCustomValidity(validation(text));},[min,max]);
 function commit(next:string,event:ChangeEvent<HTMLInputElement>){if(!controlled)Internal(next);if(next)Shown(next.slice(0,7));onChange?.({...event,target:{...event.target,value:next,name:name||''},currentTarget:{...event.currentTarget,value:next,name:name||''}} as ChangeEvent<HTMLInputElement>);}
 function select(next:string){const draft=thaiDateInput(next,monthOnly);if(validation(draft))return;Text(draft);input.current?.setCustomValidity('');commit(next,{target:input.current,currentTarget:input.current} as ChangeEvent<HTMLInputElement>);Open(false);input.current?.focus();}
 const [year,month]=shown.split('-').map(Number),days=new Date(Date.UTC(year,month,0)).getUTCDate(),offset=new Date(shown+'-01T00:00:00Z').getUTCDay();
 function move(delta:number){const d=new Date(shown+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+delta);const next=d.toISOString().slice(0,7);if(Number(next.slice(0,4))>=1&&Number(next.slice(0,4))<=9456)Shown(next);}
 return <span className="thai-date-control" ref={container} onKeyDown={e=>{if(e.key==='Escape'){Open(false);e.stopPropagation()}}}>
  <span className="thai-date-entry"><input {...rest} id={fieldId} ref={input} type="text" lang="th" inputMode="numeric" value={text} name={undefined} required={required} disabled={disabled} readOnly={readOnly} placeholder={placeholder||(monthOnly?'เดือน/ปี พ.ศ.':'วัน/เดือน/ปี พ.ศ.')} title={monthOnly?'เดือน/ปี พ.ศ. เช่น 10/2569':'วัน/เดือน/ปี พ.ศ. เช่น 30/10/2569'} maxLength={monthOnly?7:10} onChange={e=>{const draft=e.target.value;Text(draft);const message=validation(draft);e.target.setCustomValidity(message);const parsed=parseThaiDate(draft,monthOnly);if(!draft)commit('',e);else if(parsed&&!message)commit(parsed,e)}} onBlur={e=>{const parsed=parseThaiDate(text,monthOnly);if(parsed&&!validation(text))Text(thaiDateInput(parsed,monthOnly));onBlur?.(e)}}/>
  <button type="button" disabled={disabled||readOnly} aria-label={'เปิดปฏิทิน พ.ศ. '+(rest['aria-label']||'')} aria-expanded={open} aria-controls={calendarId} onClick={()=>{Shown((iso||thaiToday()).slice(0,7));Open(!open)}}><CalendarDays size={18}/></button></span>
  {name&&<input type="hidden" name={name} value={iso} disabled={disabled}/>}
  {open&&<span id={calendarId} className="thai-calendar" role="dialog" aria-label="ปฏิทิน พ.ศ."><span className="thai-calendar-head"><button type="button" aria-label="เดือนก่อน" onClick={()=>move(-1)}><ChevronLeft size={16}/></button><span>{thaiMonthLabel(shown)}</span><button type="button" aria-label="เดือนถัดไป" onClick={()=>move(1)}><ChevronRight size={16}/></button></span><span className="thai-calendar-period"><select aria-label="เลือกเดือนปฏิทิน" value={month} onChange={e=>Shown(`${year}-${e.target.value.padStart(2,'0')}`)}>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>{thaiMonthLabel(`${year}-${String(i+1).padStart(2,'0')}`).split(' ')[0]}</option>)}</select><input key={year} aria-label="ปี พ.ศ. ในปฏิทิน" type="number" min="544" max="9999" defaultValue={year+543} onBlur={e=>{const be=Number(e.target.value);if(be>=544&&be<=9999)Shown(`${String(be-543).padStart(4,'0')}-${String(month).padStart(2,'0')}`);else e.target.value=String(year+543)}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/></span>
  {monthOnly?<button type="button" onClick={()=>select(shown)}>เลือก {thaiMonthLabel(shown)}</button>:<span className="thai-calendar-grid">{['อา','จ','อ','พ','พฤ','ศ','ส'].map(day=><b key={day}>{day}</b>)}{Array.from({length:offset},(_,i)=><span key={'blank'+i}/>)}{Array.from({length:days},(_,i)=>{const date=shown+'-'+String(i+1).padStart(2,'0');return <button type="button" key={date} disabled={!!validation(thaiDateInput(date))} className={date===iso?'primary':''} aria-label={thaiDateInput(date)} onClick={()=>select(date)}>{i+1}</button>})}</span>}<button type="button" disabled={!!validation(thaiDateInput(thaiToday(),monthOnly))} onClick={()=>select(monthOnly?thaiToday().slice(0,7):thaiToday())}>{monthOnly?'เดือนนี้':'วันนี้'}</button></span>}
 </span>;
}
