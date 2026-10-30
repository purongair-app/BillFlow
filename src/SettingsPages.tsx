import {useEffect,useRef,useState,type ReactNode} from 'react';
type SettingsItem={id:string,title:string,description:string,content:ReactNode};
export default function SettingsPages({items,revision,busy}:{items:SettingsItem[],revision:number,busy:boolean}){
 const [selected,Select]=useState<string|null>(null),dirty=useRef(false);
 useEffect(()=>{dirty.current=false;},[revision]);
 const item=items.find(item=>item.id===selected);
 function back(){if(busy)return;if(dirty.current&&!confirm('หากมีข้อมูลที่ยังไม่ได้บันทึก การย้อนกลับจะยกเลิกข้อมูลนั้น ต้องการย้อนกลับหรือไม่?'))return;dirty.current=false;Select(null);}
 return <div className="settings-pages">{item?<><div className="settings-page-heading"><button type="button" disabled={busy} onClick={back}>← กลับหน้าตั้งค่า</button><h2>{item.title}</h2></div><div onChangeCapture={()=>{dirty.current=true;}} onClickCapture={event=>{if((event.target as HTMLElement).closest('[data-settings-change]'))dirty.current=true;}}>{item.content}</div></>:<section className="card"><div className="section-head"><h2>เลือกการตั้งค่า</h2></div><div className="settings-list pad">{items.map(item=><button type="button" className="settings-row" key={item.id} onClick={()=>{dirty.current=false;Select(item.id);}}><span><b>{item.title}</b><small>{item.description}</small></span><span aria-hidden="true">›</span></button>)}</div></section>}</div>;
}
