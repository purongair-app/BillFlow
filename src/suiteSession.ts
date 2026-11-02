const endpoint='https://customer.airfriendservice.com/api/suite-session';
const supported=()=>['https://billflow.airfriendservice.com','https://app.airfriendservice.com','https://customer.airfriendservice.com'].includes(window.location.origin);
async function publish(session:unknown){const r=await fetch(endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(session),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Shared session unavailable')}
/** Supabase reads the current shared refresh token before refreshing it. */
export const suiteStorage={
 async getItem(key:string){
  const local=localStorage.getItem(key);if(key!=='billflow-auth'||!supported())return local;
  try{const r=await fetch(endpoint,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)return local;const result=await r.json();if(result.signedOut){localStorage.removeItem(key);return null}if(result.session){const value=JSON.stringify(result.session);localStorage.setItem(key,value);return value}if(local){await publish(JSON.parse(local)).catch(()=>{});}return local}catch{return local}
 },
 async setItem(key:string,value:string){localStorage.setItem(key,value);if(key==='billflow-auth'&&supported())await publish(JSON.parse(value)).catch(()=>{});},
 async removeItem(key:string){localStorage.removeItem(key);}
};
export async function clearSuiteSession(){if(supported())await publish({action:'logout'})}
