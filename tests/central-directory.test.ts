import test from 'node:test';
import assert from 'node:assert/strict';
import {readCentralDirectory,writeCentralDirectory} from '../src/centralDirectory.ts';
import type {State} from '../src/money.ts';
test('directory merges preserve local references and private staff fields; writes use version',async()=>{
 const calls:any[]=[];const h={id:'hub-1',code:'AFS-692001',updatedAt:'2026-11-02T00:00:00Z',externalId:'local-1',data:{firstName:'สมชาย',lastName:'ใจดี',position:'ช่างบริการ',enabled:'1',personnelType:'พนักงาน',employmentYear:'2569'}};
 globalThis.fetch=(async(_url:any,opts:any)=>{const body=opts.body?JSON.parse(opts.body):null;calls.push(body);return Response.json(body?{data:{...h,updatedAt:'new'}}:{customers:[],personnel:[h]})}) as any;
 const source={contacts:[],employees:[{id:'local-1',code:'AFS-692001',name:'เก่า',active:true,bankAccountNumber:'private',userId:'keep-access'}]} as unknown as State;
 const merged=await readCentralDirectory(source,'test',false);assert.equal(merged.employees![0].id,'local-1');assert.equal(merged.employees![0].name,'สมชาย ใจดี');assert.equal(merged.employees![0].bankAccountNumber,'private');assert.equal(merged.employees![0].userId,'keep-access');
 await writeCentralDirectory(merged,'test');assert.equal(calls.length,1);
 merged.employees![0].name='สมชาย ใหม่';await assert.rejects(()=>writeCentralDirectory(merged,'test'),/PUROnGCustomer/);assert.equal(calls.length,1);
 await assert.rejects(()=>writeCentralDirectory({...merged,employees:[]} as State,'test'),/PUROnGCustomer/);
});
test('central outage does not block unchanged financial workspace save',async()=>{globalThis.fetch=(async()=>{throw Error('offline')}) as any;const state={contacts:[{id:'c',code:'CTM-10001',name:'เดิม',active:true}],employees:[]} as unknown as State;await readCentralDirectory(state,'test',false);assert.deepEqual(await writeCentralDirectory(state,'test'),state);await assert.rejects(()=>writeCentralDirectory({...state,contacts:[{...state.contacts![0],name:'แก้ไข'}]},'test'),/PUROnGCustomer/)});

test('authoritative empty hub removes stale people without publishing them',async()=>{const calls:any[]=[];globalThis.fetch=(async(_u:any,o:any)=>{calls.push(o.method);return Response.json({customers:[],personnel:[]})}) as any;const state={contacts:[{id:'old',name:'old',active:true}],employees:[]} as unknown as State;const next=await readCentralDirectory(state,'test',true);assert.deepEqual(next.contacts,[]);assert.deepEqual(calls,['GET']);await writeCentralDirectory(next,'test');await assert.rejects(()=>writeCentralDirectory(state,'test'),/PUROnGCustomer/)});
