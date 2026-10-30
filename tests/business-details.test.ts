import {test} from 'node:test';
import assert from 'node:assert/strict';
import {businessNames,formatBusinessPhone,ssoBusinessDetails,validateBusinessDetails} from '../src/businessDetails.ts';
test('tax identifier accepts an optional thirteen digit value and preserves leading zeros',()=>{
 validateBusinessDetails({taxId:'0123456789012'});validateBusinessDetails({taxId:''});
 for(const taxId of ['123','01234567890123','012345678901x'])assert.throws(()=>validateBusinessDetails({taxId}));
 assert.equal(JSON.parse(JSON.stringify({taxId:'0123456789012'})).taxId,'0123456789012');
});
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
 assert.throws(()=>validateBusinessDetails({postalCode:'96A00'}));validateBusinessDetails({shopPhone:'073-511113 ต่อ 2'});assert.throws(()=>validateBusinessDetails({mobilePhone:'hello'}));assert.throws(()=>validateBusinessDetails({address:3}));
});

test('both contact numbers require ten digits; formatting retains leading zeros',()=>{
 assert.equal(formatBusinessPhone('0887880256'),'088-788-0256');
 assert.equal(formatBusinessPhone('088-788-0256'),'088-788-0256');
 validateBusinessDetails({mobilePhone:'0887880256',mobilePhone2:'081-234-5678'});
 for(const mobilePhone2 of ['123456789','12345678901','abc1234567','088-7880256'])assert.throws(()=>validateBusinessDetails({mobilePhone2}));
 assert.equal(ssoBusinessDetails({business:'shop',businessDetails:{mobilePhone2:'0812345678'}}).phone,'081-234-5678');
});
test('address export retains field headings and postal code stays a bare value',()=>{
 const f=ssoBusinessDetails({business:'shop',businessDetails:{address:'16 ถนนโคกเคียน',subdistrict:'บางนาค',district:'เมือง',province:'นราธิวาส',postalCode:'96000'}});
 assert.equal(f.address,'บ้านเลขที่ / หมู่ / อาคาร / ซอย / ถนน 16 ถนนโคกเคียน ตำบล/แขวง บางนาค อำเภอ/เขต เมือง จังหวัด นราธิวาส');
 assert.equal(f.postalCode,'96000');assert.ok(!f.address.includes('รหัสไปรษณีย์'));
});
