import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {withCors} from '../supabase/functions/billflow-line/cors.ts';
import {notificationText} from '../supabase/functions/billflow-line/messages.ts';
test('LINE permits both deployed frontend origins on preflight and authenticated/error responses',async()=>{
 for(const origin of ['https://billflow.airfriendservice.com','https://purongair-app.github.io']){
  const preflight=withCors(new Response(null,{status:204}),origin);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);assert.match(preflight.headers.get('Access-Control-Allow-Headers')!,/authorization/);assert.match(preflight.headers.get('Vary')!,/Origin/);
  const denied=withCors(new Response('{"error":"กรุณาเข้าสู่ระบบ"}',{status:401,headers:{'Content-Type':'application/json'}}),origin);assert.equal(denied.status,401);assert.equal(denied.headers.get('Access-Control-Allow-Origin'),origin);assert.equal((await denied.json()).error,'กรุณาเข้าสู่ระบบ');
 }
 for(const origin of [null,'https://example.com','https://billflow.airfriendservice.com.example.com','http://billflow.airfriendservice.com'])assert.equal(withCors(new Response(null,{status:204}),origin).headers.get('Access-Control-Allow-Origin'),null);
});
test('LINE inbox and reminder links use the custom domain and retain the destination query',()=>{
 const inbox=readFileSync(new URL('../supabase/functions/billflow-line/inbox.ts',import.meta.url),'utf8');assert.ok(inbox.includes("https://billflow.airfriendservice.com/?inbox=1"));assert.ok(!inbox.includes('https://purongair-app.github.io/BillFlow/'));
 const text=notificationText({id:'qa',action:'reminder',entry:{amount:4000,days:3,due:'2026-10-31',title:'ทดสอบ',frequency:'monthly'},business:'QA',accounts:[]});assert.ok(text.includes('https://billflow.airfriendservice.com/?recurring=1'));
});
