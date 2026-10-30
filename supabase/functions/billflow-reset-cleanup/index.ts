import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set(['https://purongair-app.github.io','https://billflow.airfriendservice.com']);
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://purongair-app.github.io','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Content-Type':'application/json'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return reply({error:'Method not allowed'},405);try{
 let owner:string|null=null;const worker=req.headers.get('x-billflow-worker');
 if(worker){const {data,error}=await db.rpc('billflow_line_check_worker',{p_key:worker});if(error||!data)return reply({error:'Unauthorized'},401);}
 else{const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];if(!token)return reply({error:'Unauthorized'},401);const {data:{user},error}=await db.auth.getUser(token);if(error||!user)return reply({error:'Unauthorized'},401);const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false}});const check=await client.rpc('billflow_access_only');if(check.error||check.data?.owner!==true)return reply({error:'Owner only'},403);owner=user.id;}
 const {data:job,error}=await db.rpc('billflow_reset_cleanup_claim',{p_owner:owner});if(error)throw Error('CLAIM');if(!job)return reply({processed:false});
 const removed:string[]=[];let failed=false;
 try{for(let i=0;i<Math.min(job.paths.length,500);i+=100){const batch=job.paths.slice(i,i+100);if(batch.some((p:unknown)=>typeof p!=='string'||p.split('/')[0]!==job.owner||p.includes('..')))throw Error('INVALID_PATH');const {error}=await db.storage.from('billflow-receipts').remove(batch);if(error){failed=true;break;}removed.push(...batch);}}catch{failed=true;}
 const finish=await db.rpc('billflow_reset_cleanup_finish',{p_id:job.id,p_removed:removed,p_failed:failed});if(finish.error)throw Error('FINISH');return reply({processed:true,removed:removed.length,pending:job.paths.length-removed.length});
 }catch{return reply({error:'ล้างไฟล์ยังไม่สำเร็จ ระบบจะลองใหม่'},500);}});
