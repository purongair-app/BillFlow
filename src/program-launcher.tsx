'use client';
import './program-launcher.css';
import {useEffect,useRef,useState} from 'react';
import {AppWindow,ArrowUpRight,Check,Database,ReceiptText,Snowflake,X} from 'lucide-react';
const programs=[
 {id:'bill',name:'PUROnGBillFlow',description:'ระบบบริหารจัดการเอกสารการเงิน',url:'https://billflow.airfriendservice.com/',Icon:ReceiptText},
 {id:'air',name:'PUROnGAIR',description:'ระบบบริหารธุรกิจร้านแอร์บ้าน',url:'https://app.airfriendservice.com/',Icon:Snowflake},
 {id:'customer',name:'PUROnGCustomer',description:'ฐานข้อมูลลูกค้าและบุคลากรกลาง',url:'https://customer.airfriendservice.com/',Icon:Database},
];
export default function ProgramLauncher({current}:{current:'bill'|'air'|'customer'}){
 const [open,setOpen]=useState(false);const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('purong-open-programs',show);return()=>window.removeEventListener('purong-open-programs',show)},[]);
 useEffect(()=>{const dialog=ref.current;if(open&&!dialog?.open)dialog?.showModal();else if(!open&&dialog?.open)dialog.close()},[open]);
 return <><button type='button' className='suite-launch-button' aria-haspopup='dialog' aria-expanded={open} aria-controls='suite-launch-dialog' onClick={()=>setOpen(true)}>▦ สลับโปรแกรม</button>
 <dialog ref={ref} id='suite-launch-dialog' className='suite-launch-dialog' aria-labelledby='suite-launch-title' onClose={()=>setOpen(false)} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)setOpen(false)}}}>
 <div className='suite-launch-head'><div><h2 id='suite-launch-title'><AppWindow size={23}/>สลับโปรแกรม</h2><p>เลือกโปรแกรมที่ต้องการใช้งาน</p></div><button autoFocus type='button' aria-label='ปิดสลับโปรแกรม' onClick={()=>setOpen(false)}><X size={20}/></button></div>
 <div className='suite-launch-grid'>{programs.map(({id,name,description,url,Icon})=>id===current?<div className='suite-launch-card suite-launch-current' key={id} aria-current='page'><Icon size={26}/><div><b>{name}</b><p>{description}</p><small><Check size={14}/>กำลังใช้งาน</small></div></div>:<a className='suite-launch-card' href={url} key={id} target='_blank' rel='noopener noreferrer' onClick={()=>setOpen(false)} aria-label={'เปิด '+name+' ในแท็บใหม่'}><Icon size={26}/><div><b>{name}</b><p>{description}</p><small>เปิดโปรแกรม <ArrowUpRight size={14}/></small></div></a>)}</div>
 <p className='suite-launch-note'>เข้าสู่ระบบครั้งเดียวเพื่อสลับทั้ง 3 โปรแกรมในเบราว์เซอร์เดียวกัน โดยแต่ละโปรแกรมยังตรวจสิทธิ์การใช้งาน</p>
 </dialog></>;
}
