import {test} from 'node:test';
import assert from 'node:assert/strict';
import {businessNames,ssoBusinessDetails,validateBusinessDetails} from '../src/businessDetails.ts';
test('separates existing full establishment name without losing its proprietor',()=>{
 const old={business:'ร้านเพื่อนแอร์ เซอร์วิส โดยนายนิอาแซ ปุโรง'};
 assert.deepEqual(businessNames(old),{business:'ร้านเพื่อนแอร์ เซอร์วิส',establishmentName:old.business});
 assert.equal(businessNames({business:'ร้านอื่น โดยนาย ก'}).business,'ร้านอื่น โดยนาย ก');
});
test('SSO uses establishment details and keeps shop and mobile phones independent through JSON',()=>{
 const state=JSON.parse(JSON.stringify({business:'ร้านเพื่อนแอร์ เซอร์วิส',businessDetails:{establishmentName:'ร้านเพื่อนแอร์ เซอร์วิส โดยนายนิอาแซ ปุโรง',address:'12 หมู่ 1',subdistrict:'บางนาค',district:'เมือง',province:'นราธิวาส',postalCode:'96000',shopPhone:'073-123456',mobilePhone:'0812345678'}}));
 validateBusinessDetails(state.businessDetails);
 const form=ssoBusinessDetails(state);assert.equal(form.business,state.businessDetails.establishmentName);assert.equal(form.phone,'073-123456');assert.equal(form.postalCode,'96000');assert.match(form.address,/12 หมู่ 1.*บางนาค.*เมือง.*นราธิวาส/);assert.equal(state.businessDetails.mobilePhone,'0812345678');
 assert.equal(ssoBusinessDetails({business:'เดิม'}).business,'เดิม');
});
test('rejects invalid postal codes and malformed contact details',()=>{
 assert.throws(()=>validateBusinessDetails({postalCode:'96A00'}));assert.throws(()=>validateBusinessDetails({shopPhone:'hello'}));assert.throws(()=>validateBusinessDetails({address:3}));
});
