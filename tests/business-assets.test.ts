import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBusinessAssets,prepareBusinessImage,businessImagePolicy} from '../src/businessAssets.ts';
import {canSaveChanges} from '../src/permissions.ts';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=';
test('existing workspaces and removed images remain valid',()=>{
 assert.doesNotThrow(()=>validateBusinessAssets(undefined));
 assert.doesNotThrow(()=>validateBusinessAssets({}));
 assert.doesNotThrow(()=>validateBusinessAssets({logo:png,signature:png,paymentQr:png}));
});
test('restore rejects executable, remote, oversized and unknown image fields',()=>{
 for(const value of [null,[],{logo:'https://example.com/logo.png'},{logo:'data:image/svg+xml;base64,PHN2Zz4='},{logo:123},{unknown:png},{logo:'data:image/png;base64,'+'A'.repeat(businessImagePolicy.logo.dataLimit)}]){
  assert.throws(()=>validateBusinessAssets(value));
 }
});
test('upload rejects unsupported and oversized files before image decoding',async()=>{
 await assert.rejects(()=>prepareBusinessImage(new File(['<svg/>'],'logo.svg',{type:'image/svg+xml'}),'logo'));
 await assert.rejects(()=>prepareBusinessImage(new File([new Uint8Array(500*1024+1)],'signature.png',{type:'image/png'}),'signature'));
 await assert.rejects(()=>prepareBusinessImage(new File([],'empty.png',{type:'image/png'}),'paymentQr'));
});
test('employees cannot add or replace shop artwork through ledger saves',()=>{
 const member={owner:false,workspaceOwner:'workspace',menus:['entries'],editMenus:['entries']};
 const before={business:'ร้าน',businessAssets:{logo:png},entries:[],audit:[]};
 assert.equal(canSaveChanges(member,before,{...before,businessAssets:{}}),false);
 assert.equal(canSaveChanges(member,before,{...before,businessAssets:{logo:png,signature:png}}),false);
 assert.equal(canSaveChanges(member,before,{...before,entries:[{id:'new'}]}),true);
 assert.equal(canSaveChanges({...member,owner:true},before,{...before,businessAssets:{}}),true);
});
