import test from 'node:test';
import assert from 'node:assert/strict';
import {canView,canEdit,canSaveChanges,type Access} from '../src/permissions.ts';
test('my profile is available independently of assigned financial menus',()=>{
 const user:Access={owner:false,workspaceOwner:'self',menus:[],editMenus:[]};
 assert.equal(canView(user,'profile'),true);
 for(const menu of ['overview','entries','people','payroll','settings'])assert.equal(canView(user,menu),false);
});
test('viewing my profile never grants employee-directory or ledger writes',()=>{
 const user:Access={owner:false,workspaceOwner:'self',menus:['entries'],editMenus:['entries']};
 assert.equal(canEdit(user,'people'),false);
 assert.equal(canEdit(user,'profile'),false);
 const previous={business:'Shop',employees:[{id:'employee',name:'Original'}],entries:[],audit:[]};
 assert.equal(canSaveChanges(user,previous,{...previous,employees:[{id:'employee',name:'Changed'}]}),false);
 assert.equal(canSaveChanges(user,previous,{...previous,entries:[{id:'new'}]}),true);
});
