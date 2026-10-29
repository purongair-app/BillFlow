type DB=any;
const OWNER='978bc5a3-50bd-45e3-bef8-4aca3f5bfa44';
const APP='https://purongair-app.github.io/BillFlow/?inbox=1';
export async function receiveImage(db:DB,event:any,group:string){
 const message=String(event.message?.id||'');if(!/^\d{1,50}$/.test(message))return false;
 const {data,error}=await db.from('billflow_line_inbox').upsert({owner:OWNER,message_id:message,group_id:group},{onConflict:'owner,message_id',ignoreDuplicates:true}).select('id');
 if(error)throw Error('INBOX_INSERT');return !!data?.length;
}
export async function processInbox(db:DB,config:()=>Promise<any>){
 const {data:rows,error}=await db.rpc('billflow_inbox_claim');if(error)throw Error('INBOX_CLAIM');
 for(const row of rows||[]){let fileId=row.file_id;try{
  const c=await config();if(!c?.group_id||c.group_id!==row.group_id||row.owner!==OWNER){await db.from('billflow_line_inbox').update({status:'rejected',last_error:'กลุ่มปลายทางเปลี่ยน'}).eq('id',row.id);continue;}
  let bytes:Uint8Array,mime=row.mime;
  if(row.file_size){const {data,error}=await db.storage.from('billflow-receipts').download(OWNER+'/'+fileId);if(error)throw Error('FILE_DOWNLOAD');bytes=new Uint8Array(await data.arrayBuffer());}
  else{
   const res=await fetch('https://api-data.line.me/v2/bot/message/'+encodeURIComponent(row.message_id)+'/content',{headers:{Authorization:'Bearer '+c.token},signal:AbortSignal.timeout(15000)});
   if(!res.ok)throw Error('LINE_FILE_'+res.status);mime=(res.headers.get('content-type')||'').split(';')[0];if(!['image/jpeg','image/png','image/webp'].includes(mime))throw Error('FILE_TYPE');
   if(Number(res.headers.get('content-length'))>5242880)throw Error('FILE_SIZE');
   const reader=res.body!.getReader();const parts:Uint8Array[]=[];let size=0;while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>5242880){await reader.cancel();throw Error('FILE_SIZE');}parts.push(chunk.value);}bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}if(!bytes.length)throw Error('EMPTY_FILE');
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
   const {error:hashError}=await db.from('billflow_line_inbox').update({content_hash:hash}).eq('id',row.id).eq('status','processing');
   if(hashError){if(hashError.code!=='23505')throw Error('HASH_SAVE');const {data:duplicate}=await db.from('billflow_line_inbox').select('id').eq('owner',OWNER).eq('content_hash',hash).maybeSingle();await db.from('billflow_line_inbox').update({status:'duplicate',duplicate_of:duplicate?.id,last_error:'รูปนี้เคยรับเข้าระบบแล้ว'}).eq('id',row.id).eq('status','processing');continue;}
   const {error:uploadError}=await db.storage.from('billflow-receipts').upload(OWNER+'/'+fileId,bytes,{contentType:mime,upsert:true});if(uploadError)throw Error('FILE_SAVE');
   const {data:saved,error:saveError}=await db.from('billflow_line_inbox').update({mime,file_size:bytes.length}).eq('id',row.id).eq('status','processing').select('id');if(saveError)throw Error('FILE_METADATA');if(!saved?.length){await db.storage.from('billflow-receipts').remove([OWNER+'/'+fileId]);continue;}
  }
  await db.from('billflow_line_inbox').update({status:'needs_key',last_error:'รับรูปแล้ว • การอ่าน AI ยังไม่เปิดใช้งาน เปิดรูปและกรอกข้อมูลเพื่อตรวจยืนยันได้'}).eq('id',row.id).eq('status','processing');
 }catch(e){const code=e instanceof Error?e.message:'';const description=code==='FILE_SIZE'?'รูปเกิน 5 MB':code==='FILE_TYPE'?'รองรับรูป JPG, PNG, WEBP':code.startsWith('AI_')?'ตัวอ่าน AI ตอบกลับ '+code.slice(3)+' กรุณาตรวจ Key รุ่นโมเดลและโควตา':'รับหรืออ่านรูปไม่สำเร็จ กรุณาลองใหม่';await db.from('billflow_line_inbox').update({status:'failed',last_error:description,updated_at:new Date().toISOString()}).eq('id',row.id).eq('status','processing');}}
 return {processed:rows?.length||0};
}
export async function inboxAction(db:DB,action:string,input:any){
 if(action==='inbox'){const {data,error}=await db.from('billflow_line_inbox').select('id,file_id,mime,file_size,status,extracted,last_error,created_at,confirmed_target,duplicate_of').eq('owner',OWNER).order('created_at',{ascending:false}).limit(100);if(error)throw Error('INBOX_LIST');return {documents:data||[],ocrConfigured:false,model:'',ocrAwaitingConsent:true};}
 if(['inbox-retry','inbox-reject'].includes(action)){if(!/^[a-f0-9-]{36}$/.test(String(input.id)))return {error:'เอกสารไม่ถูกต้อง'};const {error}=await db.from('billflow_line_inbox').update(action==='inbox-retry'?{status:'pending',attempts:0,last_error:null}:{status:'rejected'}).eq('owner',OWNER).eq('id',input.id).in('status',action==='inbox-retry'?['needs_key','failed']:['pending','ready','needs_key','failed']);if(error)throw Error('INBOX_UPDATE');return {ok:true};}
 return null;
}
export const receivedText='📥 BillFlow รับรูปแล้ว\nเอกสารจะอยู่ในกล่องรอตรวจ ยังไม่ปรับยอดเงิน\nเจ้าของเปิดตรวจและยืนยันได้ที่ '+APP;
