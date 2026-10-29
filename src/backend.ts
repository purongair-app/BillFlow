import {clientInfo,type UsageEvent} from './usage';
import {resetErrors} from './reset';
import type {Access,Member,MemberRole,Applicant} from './permissions';
import {createClient} from '@supabase/supabase-js';
import {initialState,validateState,type State} from './money';
import {connection} from './config';
import {createReceiptImages} from './receiptImages';
const url=import.meta.env.VITE_SUPABASE_URL||connection.url;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||connection.publishableKey;
export const configured=Boolean(url&&key);
export const emailActionsReady=import.meta.env.VITE_AUTH_EMAIL_READY==='true'||connection.authEmailConfigured;
export const supabase=configured?createClient(url,key,{global:{headers:{'x-client-info':clientInfo()}},auth:{storageKey:'billflow-auth',autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}}):null;
let activeAccess:Access|null=null;
export async function readLedger(){if(!supabase)throw Error('ระบบกำลังเตรียมเปิดใช้งาน');const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)throw Error('กรุณาเข้าสู่ระบบอีกครั้ง');const {data,error}=await supabase.rpc('billflow_access_context');if(error)throw Error('โหลดสิทธิ์และข้อมูลบัญชีไม่สำเร็จ กรุณาลองใหม่');activeAccess=data.access;return {state:(data.payload||initialState()) as State,revision:data.revision as number,email:user.email||'',userId:user.id,access:data.access as Access};}
export async function readAccess(){const {data,error}=await supabase!.rpc('billflow_access_only');if(error)throw Error('ตรวจสิทธิ์ไม่สำเร็จ');activeAccess=data;return data as Access;}
export async function listMembers(){const {data,error}=await supabase!.rpc('billflow_manage_members_v2',{p_action:'list'});if(error)throw Error('เฉพาะเจ้าของเท่านั้นที่ดูสิทธิ์ได้');return data as Member[];}
export async function saveMember(m:{email:string,name:string,menus:string[],editMenus:string[],enabled:boolean,role:MemberRole}){const {data,error}=await supabase!.rpc('billflow_manage_members_v2',{p_action:'save',p_email:m.email,p_name:m.name,p_menus:m.menus,p_edit:m.editMenus,p_enabled:m.enabled,p_role:m.role});if(error){if(error.message.includes('ACCOUNT_NOT_FOUND'))throw Error('ไม่พบบัญชีอีเมลที่ยืนยันแล้ว กรุณาให้พนักงานสมัครและยืนยันอีเมลก่อน');if(error.message.includes('CANNOT_CHANGE_OWNER'))throw Error('เจ้าของมีสิทธิ์ครบเสมอ ไม่สามารถลดสิทธิ์เจ้าของได้');throw Error('บันทึกสิทธิ์ไม่สำเร็จ กรุณาตรวจอีเมล ชื่อ และเมนู');}return data as Member[];}
export async function writeLedger(state:State,revision:number){validateState(state);const {data,error}=await supabase!.rpc('billflow_save_workspace',{new_payload:state,expected_revision:revision});if(error){if(error.message.includes('CONFLICT'))throw Error('ข้อมูลเปลี่ยนจากอุปกรณ์อื่น กรุณาโหลดข้อมูลใหม่ก่อนบันทึก');if(error.message.includes('READ_ONLY')||error.message.includes('MENU_FORBIDDEN'))throw Error('ไม่มีสิทธิ์แก้ไขข้อมูลเมนูนี้ กรุณาติดต่อเจ้าของ');throw Error('บันทึกข้อมูลไม่ได้ กรุณาลองใหม่หรือติดต่อเจ้าของระบบ');}return {revision:data as number};}
export async function uploadFile(file:File){if(!supabase)throw Error('กรุณาเข้าสู่ระบบ');if(file.size>5*1024*1024||!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type))throw Error('รองรับ JPG, PNG, WEBP, PDF ขนาดไม่เกิน 5 MB');const {data:{user}}=await supabase.auth.getUser();if(!user)throw Error('กรุณาเข้าสู่ระบบ');const id=crypto.randomUUID();const {error}=await supabase.storage.from('billflow-receipts').upload((activeAccess?.workspaceOwner||user.id)+'/'+id,file,{contentType:file.type,upsert:false});if(error)throw Error('แนบเอกสารไม่สำเร็จ กรุณาลองใหม่');const result:{id:string,name:string,mime:string,size:number,previewId?:string,lineImageId?:string}={id,name:file.name,mime:file.type,size:file.size};if(file.type.startsWith('image/')){try{const images=await createReceiptImages(file);if(images.preview){const previewId=crypto.randomUUID();const {error}=await supabase.storage.from('billflow-receipts').upload((activeAccess?.workspaceOwner||user.id)+'/'+previewId,images.preview,{contentType:'image/jpeg',upsert:false});if(!error)result.previewId=previewId;}if(images.converted){const lineImageId=crypto.randomUUID();const {error}=await supabase.storage.from('billflow-receipts').upload((activeAccess?.workspaceOwner||user.id)+'/'+lineImageId,images.converted,{contentType:'image/jpeg',upsert:false});if(!error)result.lineImageId=lineImageId;}}catch{/* Original receipt remains available even when a thumbnail cannot be made. */}}void logUsage('attachment.upload');return result;}
export async function fileUrl(id:string){const {data:{user}}=await supabase!.auth.getUser();if(!user)throw Error('กรุณาเข้าสู่ระบบ');const {data,error}=await supabase!.storage.from('billflow-receipts').createSignedUrl((activeAccess?.workspaceOwner||user.id)+'/'+id,300);if(error)throw Error('เปิดเอกสารไม่สำเร็จ');void logUsage('attachment.read');return data.signedUrl;}
export async function signOut(){await logUsage('logout');const {error}=await supabase!.auth.signOut();if(error)throw Error('ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง');}
export async function lineRequest(action:string,body:Record<string,unknown>={}){if(!supabase)throw Error('กรุณาเข้าสู่ระบบ');const {data,error}=await supabase.functions.invoke('billflow-line',{body:{...body,action}});if(error){let message='เชื่อมการแจ้งเตือน LINE ไม่สำเร็จ กรุณาลองใหม่';try{const j=await error.context?.json();if(j?.error)message=j.error;}catch{}throw Error(message);}if(data?.error)throw Error(data.error);if(!['status','inbox'].includes(action))void logUsage('line.action');return data;}

export async function confirmLineDocument(state:State,revision:number,id:string,target:string){
 validateState(state);const {data,error}=await supabase!.rpc('billflow_confirm_inbox',{p_id:id,p_target:target,new_payload:state,expected_revision:revision});
 if(error){if(error.message.includes('CONFLICT'))throw Error('ข้อมูลเปลี่ยนจากอุปกรณ์อื่น กรุณาโหลดหน้าใหม่ก่อนยืนยัน');if(error.message.includes('DRAFT_NOT_AVAILABLE')||error.message.includes('ALREADY_IMPORTED'))throw Error('เอกสารนี้ถูกยืนยันหรือเปลี่ยนสถานะแล้ว กรุณาโหลดใหม่');throw Error('ยืนยันเอกสารไม่สำเร็จ กรุณาตรวจสอบแล้วลองอีกครั้ง');}return {revision:data as number};
}

export async function listApplicants(){const {data,error}=await supabase!.rpc('billflow_list_applicants');if(error)throw Error('โหลดผู้สมัครรอกำหนดสิทธิ์ไม่สำเร็จ กรุณาลองใหม่');return data as Applicant[];}

export type SidebarProfile={name?:string,photo?:string};
export async function readProfile():Promise<SidebarProfile>{const {data,error}=await supabase!.rpc('billflow_my_profile');if(error)throw Error('โหลดรูปบัญชีไม่สำเร็จ');return data||{};}

export type LinkableAccount={id:string,email:string,name:string,confirmed:boolean};
export async function listLinkableAccounts():Promise<LinkableAccount[]>{
 const {data:{user},error}=await supabase!.auth.getUser();if(error||!user)throw Error('กรุณาเข้าสู่ระบบ');
 const own:LinkableAccount={id:user.id,email:user.email||'',name:user.user_metadata?.full_name||'',confirmed:!!user.email_confirmed_at};
 if(!activeAccess?.owner)return [own];
 const [members,applicants]=await Promise.all([listMembers(),listApplicants()]);
 return [own,...members.map(m=>({id:m.id,email:m.email,name:m.name,confirmed:true})),...applicants];
}

export async function beginSystemReset(){const {data,error}=await supabase!.rpc('billflow_begin_reset');if(error){throw Error(Object.entries(resetErrors).find(([k])=>error.message.includes(k))?.[1]||'ขอรหัสยืนยันไม่สำเร็จ');}const sent=await supabase!.auth.reauthenticate();if(sent.error)throw Error('ส่งรหัสทางอีเมลไม่สำเร็จ กรุณารอสักครู่แล้วลองใหม่ หรือตรวจการตั้งค่าอีเมล');void logUsage('reset.code_request');return data as {id:string,email:string,expiresAt:string,phrase:string};}
export async function confirmSystemReset(id:string,code:string,phrase:string){const {data,error}=await supabase!.rpc('billflow_confirm_reset',{p_id:id,p_code:code,p_phrase:phrase});if(error)throw Error(Object.entries(resetErrors).find(([k])=>error.message.includes(k))?.[1]||'ล้างข้อมูลไม่สำเร็จ');if(!data?.ok)throw Error(resetErrors[data?.code]||'ล้างข้อมูลไม่สำเร็จ');return data as {ok:true,revision:number,filesPending:number};}
export async function resetCleanupStatus(){const {data,error}=await supabase!.rpc('billflow_reset_cleanup_status');if(error)throw Error('ตรวจสถานะการล้างไฟล์ไม่สำเร็จ');return data as {pending:number,failed:boolean};}
export async function runResetCleanup(){const {error}=await supabase!.functions.invoke('billflow-reset-cleanup',{body:{}});if(error)throw Error('ระบบจะลองล้างไฟล์ที่เหลืออีกครั้งอัตโนมัติ');}

export type PreservedSetup={ownerEmail:string,pendingEmail:string,lineConfigured:boolean,lineEnabled:boolean,groupName:string,groupConnected:boolean,pairCodePending:boolean,webhookUrl:string,geminiConfigured:boolean,geminiModel:string,lineUpdatedAt:string|null};
export async function preservedSetup(){const {data,error}=await supabase!.rpc('billflow_preserved_setup');if(error)throw Error('โหลดค่าที่คงไว้ไม่สำเร็จ');return data as PreservedSetup;}
export async function requestOwnerEmailChange(email:string){const access=await readAccess();if(!access.owner)throw Error('เฉพาะเจ้าของร้านเท่านั้น');const {data,error}=await supabase!.auth.updateUser({email:email.trim().toLowerCase()},{emailRedirectTo:window.location.origin+'/BillFlow/'});if(error){if(error.code==='email_exists'||/already|registered|exists/i.test(error.message))throw Error('อีเมลนี้มีบัญชีอยู่แล้ว ช่องนี้ใช้เปลี่ยนอีเมลของบัญชีร้านเดิม กรุณาใช้อีเมลที่ยังไม่ได้สมัคร');throw Error('ส่งคำขอเปลี่ยนอีเมลไม่สำเร็จ กรุณาตรวจอีเมลแล้วลองอีกครั้ง');}void logUsage('account.email.request');return data.user;}

export async function logUsage(action:string,context=''){try{await supabase?.rpc('billflow_log_usage',{p_action:action,p_context:context});}catch{/* Mutation audit is recorded independently on the database server. */}}
export async function usageHistory(filters:{before?:string,from?:string,to?:string,search?:string,action?:string}){const {data,error}=await supabase!.rpc('billflow_usage_history',{p_before:filters.before||null,p_from:filters.from||null,p_to:filters.to||null,p_search:filters.search||'',p_action:filters.action||''});if(error)throw Error('โหลดประวัติไม่ได้ เฉพาะเจ้าของเท่านั้นที่ตรวจสอบได้');return data as {recordingStartedAt:string,events:UsageEvent[],nextBefore:string|null,hasMore:boolean};}
