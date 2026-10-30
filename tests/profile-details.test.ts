import test from 'node:test';
import assert from 'node:assert/strict';
import {profileCompleteness} from '../src/profileDetails.ts';
test('contact completeness reports the exact missing fields',()=>{
 const partial=profileCompleteness({name:'Niasae',email:'user@example.com'});
 assert.equal(partial.percent,33);
 assert.deepEqual(partial.missing,['รหัสพนักงาน','ตำแหน่ง','เบอร์โทรศัพท์','ที่อยู่']);
});
test('whitespace is missing and all six basic fields complete the profile',()=>{
 assert.equal(profileCompleteness({name:'   '}).percent,0);
 const full={code:'EMP-001',name:'Employee',position:'Technician',email:'user@example.com',phone:'0800000000',address:'Address'};
 assert.deepEqual(profileCompleteness(full),{percent:100,missing:[]});
});
