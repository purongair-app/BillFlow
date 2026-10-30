import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,type Entry} from '../src/money.ts';
import {saveCategory,deleteCategory} from '../src/categories.ts';
test('category rename updates references without changing money or mutating input',()=>{
 const s=initialState();s.categories=['เดิม'];s.entries=[{id:'e',category:'เดิม',amount:10000} as Entry];s.budgets=[{id:'b',category:'เดิม',amount:20000}];
 const n=saveCategory(s,'ใหม่','เดิม');assert.equal(n.entries[0].category,'ใหม่');assert.equal(n.budgets[0].category,'ใหม่');assert.equal(n.entries[0].amount,10000);assert.equal(s.entries[0].category,'เดิม');
 assert.throws(()=>deleteCategory(n,'ใหม่'));
});
test('unused categories can be added, edited and removed; duplicate names rejected',()=>{
 const s=saveCategory(initialState(),'Test');assert.throws(()=>saveCategory(s,' test '));
 assert.ok(!deleteCategory(saveCategory(s,'Renamed','Test'),'Renamed').categories.includes('Renamed'));
 assert.throws(()=>saveCategory(s,'  '));assert.throws(()=>saveCategory(s,'new','missing'));
});
test('payroll category cannot be renamed away from its accounting invariant',()=>{
 const s=initialState();s.entries=[{category:'เงินเดือน',payrollId:'p'} as Entry];assert.throws(()=>saveCategory(s,'อื่น','เงินเดือน'));
});
