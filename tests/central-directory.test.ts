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
 merged.employees![0].name='สมชาย ใหม่';await writeCentralDirectory(merged,'test');assert.equal(calls[1].mode,'update');assert.equal(calls[1].updatedAt,h.updatedAt);assert(!('bankAccountNumber' in calls[1].data));
 await assert.rejects(()=>writeCentralDirectory({...merged,employees:[]} as State,'test'),/ฐานกลาง/);
});
test('central outage does not block unchanged financial workspace save',async()=>{globalThis.fetch=(async()=>{throw Error('offline')}) as any;const state={contacts:[{id:'c',code:'CTM-10001',name:'เดิม',active:true}],employees:[]} as unknown as State;await readCentralDirectory(state,'test',false);assert.deepEqual(await writeCentralDirectory(state,'test'),state);await assert.rejects(()=>writeCentralDirectory({...state,contacts:[{...state.contacts![0],name:'แก้ไข'}]},'test'),/offline/)});
