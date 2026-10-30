import test from 'node:test';
import assert from 'node:assert/strict';
import {GmailDeliveryUnknown,payrollGmailMime,payrollGmailSender,sendPayrollThroughGmail} from '../src/gmailPayroll.ts';
const message={to:'employee@example.com',subject:'ใบแจ้งเงินเดือน ทดสอบ',text:'เรียน พนักงาน\r\nทดสอบเอกสาร',filename:'Payroll-QA001-employee.pdf',pdf:new Blob(['%PDF-1.7\nQA binary \u0000\u00ff'],{type:'application/pdf'})};
const decode=(raw:string)=>Buffer.from(raw,'base64url').toString('utf8');
test('Gmail MIME preserves Thai text, the fixed sender and exact PDF bytes',async()=>{
 const mime=decode(await payrollGmailMime(message,'TestBoundary'));
 assert.ok(mime.includes('From: '+payrollGmailSender+'\r\n'));assert.ok(mime.includes('To: employee@example.com\r\n'));assert.ok(mime.includes('Content-Type: application/pdf'));
 const header=mime.split('\r\n').filter(x=>x.startsWith('Subject:')||x.startsWith(' =?')).join('').replace(/^Subject: /,'');
 const subject=[...header.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map(x=>Buffer.from(x[1],'base64').toString()).join('');assert.equal(subject,message.subject);
 const base64=mime.split('filename*=')[1].split('\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g,'');assert.deepEqual(Buffer.from(base64,'base64'),Buffer.from(await message.pdf.arrayBuffer()));
 await assert.rejects(()=>payrollGmailMime({...message,to:'a@example.com\r\nBcc:b@example.com'}));
 await assert.rejects(()=>payrollGmailMime({...message,pdf:new Blob(['not pdf'],{type:'application/pdf'})}));
});
test('a wrong or unverified Gmail sender is rejected before a send request',async()=>{
 for(const user of [{email:'other@example.com',email_verified:true},{email:payrollGmailSender,email_verified:false}]){
 let posts=0;const fetcher=(async(_url:any,init:any)=>{if(init.method==='POST')posts++;return new Response(JSON.stringify(user))}) as typeof fetch;
 await assert.rejects(()=>sendPayrollThroughGmail('test-token',message,fetcher),/เท่านั้น/);assert.equal(posts,0);
 }
});
test('Gmail accepted results include a message ID and transport uncertainty never reports success',async()=>{
 let posts=0;const profile=()=>new Response(JSON.stringify({email:payrollGmailSender,email_verified:true}));
 const accepted=(async(_url:any,init:any)=>{if(init.method==='POST'){posts++;assert.equal(init.headers.Authorization,'Bearer test-token');assert.ok(decode(JSON.parse(init.body).raw).includes('employee@example.com'));return new Response(JSON.stringify({id:'gmail-qa-id'}));}return profile()}) as typeof fetch;
 assert.deepEqual(await sendPayrollThroughGmail('test-token',message,accepted),{id:'gmail-qa-id'});assert.equal(posts,1);
 const lost=(async(_url:any,init:any)=>{if(init.method==='POST')throw Error('network');return profile()}) as typeof fetch;
 await assert.rejects(()=>sendPayrollThroughGmail('test-token',message,lost),GmailDeliveryUnknown);
 const denied=(async(_url:any,init:any)=>init.method==='POST'?new Response('{}',{status:403}):profile()) as typeof fetch;
 await assert.rejects(()=>sendPayrollThroughGmail('test-token',message,denied),/Gmail API/);
});
