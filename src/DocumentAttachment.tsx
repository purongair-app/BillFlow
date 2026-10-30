import {useEffect,useState} from 'react';
import {fileUrl} from './backend';
import type {Entry} from './money';

export default function DocumentAttachment({saved,selected,onSelect,disabled=false,readOnly=false}:{saved?:Entry['file'],selected?:File|null,onSelect?:(file:File|null)=>void,disabled?:boolean,readOnly?:boolean}){
 const [removed,Removed]=useState(false),[url,Url]=useState(''),[error,ErrorText]=useState(''),[refresh,Refresh]=useState(0);
 const current=selected||(!removed?saved:undefined);
 useEffect(()=>{let alive=true;let local='';Url('');ErrorText('');
 if(selected){local=URL.createObjectURL(selected);Url(local);}
 else if(saved&&!removed)fileUrl(saved.id).then(u=>{if(alive)Url(u)}).catch(()=>{if(alive)ErrorText('โหลดเอกสารไม่สำเร็จ กรุณากดลองอีกครั้ง')});
 return()=>{alive=false;if(local)URL.revokeObjectURL(local)};
 },[selected,saved?.id,removed,refresh]);
 const image=current&&('type' in current?current.type:current.mime)?.startsWith('image/');
 return <fieldset className="entry-details-fieldset" style={{minWidth:0}}><legend>รูปเอกสาร / ไฟล์แนบ</legend>
 {!readOnly&&<><label>เลือกภาพเอกสารหรือไฟล์ PDF<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={disabled} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(f.type)||f.size<=0||f.size>5242880){ErrorText('รองรับ JPG, PNG, WebP และ PDF ขนาดไม่เกิน 5 MB');return;}ErrorText('');Removed(false);onSelect?.(f);}}/></label><small>แนบได้ 1 ไฟล์ต่อรายการ • เลือกรูปจากอุปกรณ์หรือถ่ายรูปผ่านเมนูของอุปกรณ์</small><input type="hidden" name="removeDebtFile" value={removed?'1':''}/></>}
 {current?<><p style={{overflowWrap:'anywhere'}}>{current.name}</p>{url&&image&&<img src={url} alt="ตัวอย่างเอกสารแนบ" style={{display:'block',maxWidth:'100%',maxHeight:320,objectFit:'contain',margin:'12px auto'}}/>}{url&&<a href={url} target="_blank" rel="noopener noreferrer">เปิดดูเอกสาร{!image?' PDF':''}</a>}{!url&&!error&&<p role="status">กำลังโหลดเอกสาร…</p>}{!readOnly&&<button type="button" disabled={disabled} onClick={()=>{onSelect?.(null);Removed(true);ErrorText('')}} style={{display:'block',marginTop:12}}>นำไฟล์แนบออก</button>}</>:<p className="muted">ยังไม่มีเอกสารแนบ</p>}
 {error&&<div role="alert" className="error">{error}{saved&&!selected&&!removed&&<button type="button" onClick={()=>Refresh(n=>n+1)}>ลองโหลดอีกครั้ง</button>}</div>}
 </fieldset>;
}
