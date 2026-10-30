import {payrollEmployeeEmail} from './payrollEmail.ts';
export const payrollGmailSender='airfriendnara@gmail.com';
export const gmailSendScope='https://www.googleapis.com/auth/gmail.send';
export const gmailEmailScope='https://www.googleapis.com/auth/userinfo.email';
export type GmailPayrollMessage={to:string,subject:string,text:string,filename:string,pdf:Blob};
export class GmailDeliveryUnknown extends Error{constructor(){super('ยังยืนยันผลการส่งไม่ได้ กรุณาตรวจกล่องส่งแล้วของ Gmail ก่อนส่งซ้ำ เพื่อป้องกันอีเมลซ้ำ');this.name='GmailDeliveryUnknown';}}
function base64(bytes:Uint8Array){let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);}
const utf8=(value:string)=>base64(new TextEncoder().encode(value));
const lines=(value:string)=>value.match(/.{1,76}/g)?.join('\r\n')||'';
function encodedHeader(value:string){const words:string[]=[];let chunk='';for(const char of value){if(new TextEncoder().encode(chunk+char).length>39){words.push('=?UTF-8?B?'+utf8(chunk)+'?=');chunk='';}chunk+=char;}if(chunk)words.push('=?UTF-8?B?'+utf8(chunk)+'?=');return words.join('\r\n ');}
export async function payrollGmailMime(message:GmailPayrollMessage,boundary='BillFlow-'+crypto.randomUUID()){
 const to=payrollEmployeeEmail(message.to);if(message.pdf.type!=='application/pdf'||message.pdf.size<=0||message.pdf.size>5242880||await message.pdf.slice(0,5).text()!=='%PDF-')throw Error('ไฟล์แนบต้องเป็น PDF ที่ถูกต้อง ขนาดไม่เกิน 5 MB');
 if(/[\r\n]/.test(message.filename)||!message.filename.endsWith('.pdf'))throw Error('ชื่อไฟล์ PDF ไม่ถูกต้อง');
 const asciiName=message.filename.replace(/[^A-Za-z0-9._-]/g,'_').slice(0,120)||'Payroll.pdf';
 const mime=['From: '+payrollGmailSender,'To: '+to,'Subject: '+encodedHeader(message.subject),'MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="'+boundary+'"','','--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',lines(utf8(message.text)),'--'+boundary,'Content-Type: application/pdf','Content-Transfer-Encoding: base64','Content-Disposition: attachment; filename="'+asciiName+'";'," filename*=UTF-8''"+encodeURIComponent(message.filename),'',lines(base64(new Uint8Array(await message.pdf.arrayBuffer()))),'--'+boundary+'--',''].join('\r\n');
 return utf8(mime).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export async function sendPayrollThroughGmail(token:string,message:GmailPayrollMessage,fetcher:typeof fetch=fetch){
 const profile=await fetcher('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
 if(!profile.ok)throw Error('ตรวจบัญชี Gmail ไม่สำเร็จ กรุณาเชื่อมบัญชีใหม่');
 const user=await profile.json();if(user.email?.toLowerCase()!==payrollGmailSender||user.email_verified!==true)throw Error('กรุณาเชื่อม Gmail '+payrollGmailSender+' เท่านั้น บัญชีที่เลือกยังไม่ได้ส่งอีเมล');
 const raw=await payrollGmailMime(message);
 let response:Response;try{response=await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({raw}),signal:AbortSignal.timeout(30000)});}catch{throw new GmailDeliveryUnknown();}
 if(!response.ok){if(response.status>=500)throw new GmailDeliveryUnknown();if(response.status===401)throw Error('สิทธิ์ Gmail หมดอายุ กรุณาเชื่อมใหม่');if(response.status===403)throw Error('Google ยังไม่อนุญาตให้ส่ง กรุณาตรวจการเปิด Gmail API และสิทธิ์ gmail.send ใน Google Cloud');if(response.status===429)throw Error('Gmail จำกัดการส่งชั่วคราว กรุณารอแล้วลองใหม่');throw Error('Gmail ไม่รับคำขอส่งอีเมล กรุณาตรวจข้อมูลผู้รับและไฟล์แนบ');}
 let result;try{result=await response.json()}catch{throw new GmailDeliveryUnknown();}if(!result.id)throw new GmailDeliveryUnknown();return {id:String(result.id)};
}
