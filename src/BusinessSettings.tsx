import {useEffect,useRef,useState} from 'react';
import type {State} from './money';
import {businessImagePolicy,prepareBusinessImage,validateBusinessAssets,type BusinessAssetKind,type BusinessAssets} from './businessAssets';
export default function BusinessSettings({state,busy,editable,onSave}:{state:State,busy:boolean,editable:boolean,onSave:(next:State,text:string)=>Promise<boolean>}){
 const [name,SetName]=useState(state.business),[assets,SetAssets]=useState<BusinessAssets>({...state.businessAssets}),[processing,SetProcessing]=useState(false),[error,SetError]=useState(''),[success,SetSuccess]=useState('');
 const generation=useRef(0);
 useEffect(()=>()=>{generation.current++},[]);
 const locked=busy||processing||!editable;
 async function choose(file:File|undefined,kind:BusinessAssetKind){
  if(!file||locked)return;const version=++generation.current;SetProcessing(true);SetError('');SetSuccess('');
  try{const image=await prepareBusinessImage(file,kind);if(generation.current===version)SetAssets(previous=>({...previous,[kind]:image}));}
  catch(e){if(generation.current===version)SetError(e instanceof Error?e.message:'เตรียมรูปไม่สำเร็จ');}
  finally{if(generation.current===version)SetProcessing(false)}
 }
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(locked)return;SetError('');SetSuccess('');
  try{validateBusinessAssets(assets);if(!name.trim())throw Error('กรุณากรอกชื่อกิจการ');const next={...state,business:name.trim(),businessAssets:{...assets}};if(await onSave(next,'แก้ไขชื่อกิจการและรูปแนบร้านค้า'))SetSuccess('บันทึกข้อมูลร้านค้าเรียบร้อยแล้ว');}
  catch(e){SetError(e instanceof Error?e.message:'บันทึกข้อมูลร้านค้าไม่สำเร็จ')}
 }
 return <form className="pad shop-settings-form" onSubmit={submit}>
 <style>{'.shop-settings-form fieldset{border:0;padding:0;margin:0;min-width:0}.shop-settings-form .shop-image-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:18px 0}.shop-image-card{border:1px solid #dce7e0;border-radius:12px;padding:18px;min-width:0;background:#fbfdfb}.shop-image-card:first-child{grid-column:1/-1}.shop-image-preview{display:flex;align-items:center;justify-content:center;min-height:140px;border:1px solid #e4eae6;border-radius:10px;background:#fff;margin:12px 0;overflow:hidden;padding:10px}.shop-image-preview img{display:block;max-width:100%;max-height:180px;width:auto;height:auto;object-fit:contain}.shop-image-preview span{font-size:12px;color:#8a9c91}.shop-image-actions{display:flex;gap:10px;flex-wrap:wrap}.shop-image-actions .shop-pick{display:inline-flex;flex-direction:row;align-items:center;justify-content:center;position:relative;cursor:pointer;border:1px solid #dce7e0;border-radius:8px;padding:9px 13px;background:#fff;font-size:12px}.shop-pick:focus-within{outline:2px solid #14785b;outline-offset:2px}.shop-file-input{position:absolute;width:1px;height:1px;padding:0;margin:-1px;opacity:0;overflow:hidden;clip-path:inset(50%)}.shop-settings-form fieldset:disabled .shop-pick{opacity:.5;cursor:default}.shop-save-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:14px 0}.shop-settings-form .shop-hint{font-size:12px;line-height:1.7}.shop-image-card small{font-size:11px;line-height:1.7}@media(max-width:650px){.shop-settings-form .shop-image-grid{grid-template-columns:minmax(0,1fr)}.shop-image-card{padding:14px}.shop-image-actions button,.shop-image-actions .shop-pick{min-height:44px}}'}</style>
 <fieldset disabled={locked}><label>ชื่อกิจการ<input name="business" value={name} required maxLength={2000} onChange={event=>{SetName(event.target.value);SetSuccess('')}}/></label>
 <div className="shop-image-grid">{(Object.keys(businessImagePolicy) as BusinessAssetKind[]).map(kind=>{const policy=businessImagePolicy[kind];return <section key={kind} className="shop-image-card"><h3>{policy.label}</h3><small>{policy.hint}</small><div className="shop-image-preview">{assets[kind]?<img src={assets[kind]} alt={policy.label+' '+name}/>:<span>ยังไม่ได้แนบ{policy.label}</span>}</div><div className="shop-image-actions"><label className="shop-pick">{assets[kind]?'เปลี่ยนรูป':'เลือกรูป'}<input className="shop-file-input" aria-label={'เลือก'+policy.label} type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{const file=event.target.files?.[0];event.target.value='';void choose(file,kind)}}/></label><button type="button" data-settings-change="true" disabled={!assets[kind]} onClick={()=>{generation.current++;SetAssets(previous=>{const next={...previous};delete next[kind];return next});SetSuccess('');SetError('')}}>นำรูปออก</button></div>{kind==='paymentQr'&&<small>แนบภาพ QR ของร้านที่ถูกต้อง และทดลองสแกนก่อนนำไปใช้รับชำระเงิน</small>}</section>})}</div>
 <p className="shop-hint">รูปจะคงสัดส่วนเดิมโดยไม่ครอบตัด • กดบันทึกข้อมูลเพื่อยืนยันการเปลี่ยนแปลง</p><div className="shop-save-row"><button type="submit" className="primary">{busy?'กำลังบันทึก…':'บันทึกข้อมูลร้านค้า'}</button></div></fieldset>
 {processing&&<p role="status">กำลังเตรียมรูป กรุณารอสักครู่…</p>}{error&&<p className="error" role="alert">{error}</p>}{success&&<p role="status">{success}</p>}{!editable&&<p className="muted">เฉพาะเจ้าของร้านที่สามารถแก้ไขข้อมูลส่วนนี้ได้</p>}
 </form>;
}
