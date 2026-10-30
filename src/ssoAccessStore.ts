import {supabase,logUsage} from './backend';
export const defaultSsoUrl='https://www.sso.go.th/eservices/esv/index.jsp';
export type SsoAccessData={url:string,username:string,password:string};
export type SavedSsoAccess={saved:boolean,version:number,updatedAt?:string}&Partial<SsoAccessData>;
export function httpsSsoLink(value:string){try{const url=new URL(value.trim());return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}}
export function ssoAccessError(code:string){if(code.includes('CONFLICT'))return 'ข้อมูลเปลี่ยนจากอุปกรณ์อื่น กรุณากดโหลดข้อมูลที่บันทึกแล้วก่อนแก้ไขอีกครั้ง';if(code.includes('MENU_FORBIDDEN'))return 'ไม่มีสิทธิ์ใช้เมนูเงินเดือนและประกันสังคม';if(code.includes('INVALID_CREDENTIALS'))return 'กรุณาตรวจลิงก์ ชื่อผู้ใช้ และรหัสผ่าน';return 'บันทึกหรือโหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง';}
export async function ssoAccessStore(action:'read'|'save'|'delete',version?:number,values?:SsoAccessData):Promise<SavedSsoAccess>{
 if(!supabase)throw Error('กรุณาเข้าสู่ระบบ');
 if(action==='save'&&(!values||!httpsSsoLink(values.url)))throw Error('กรอกลิงก์ HTTPS ให้ถูกต้อง');
 const {data,error}=await supabase.rpc('billflow_sso_access',{p_action:action,...(action==='save'&&values?{p_url:httpsSsoLink(values.url),p_username:values.username.trim(),p_password:values.password}:{}),...(action!=='read'?{p_version:version}:{} )});
 if(error)throw Error(ssoAccessError(error.message));
 if(action!=='read')void logUsage(action==='save'?'sso.saved':'sso.deleted','sso-access');
 return data as SavedSsoAccess;
}
