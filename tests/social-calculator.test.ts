import {test} from 'node:test';
import assert from 'node:assert/strict';
import {socialDefaults,calculateSocial,socialRemaining,applySocial} from '../src/socialCalculator.ts';
import type {PayrollSlip} from '../src/payroll.ts';
test('year ceilings, zero wages, minimum and whole-baht rounding',()=>{
 assert.equal(socialDefaults('2025-12-31').maximum,1500000);assert.equal(socialDefaults('2026-01-01').maximum,1750000);assert.equal(socialDefaults('2029-01-01').maximum,2000000);assert.equal(socialDefaults('2032-01-01').maximum,2300000);
 assert.deepEqual(calculateSocial(2000000,165000,1750000,5,5),{base:1750000,employee:87500,employer:87500});
 assert.equal(calculateSocial(1001000,165000,1750000,5,5).employee,50100);
 assert.equal(calculateSocial(1000900,165000,1750000,5,5).employee,50000);
 assert.equal(calculateSocial(10000,165000,1750000,5,5).employee,8300);
 assert.equal(calculateSocial(0,165000,1750000,5,5).employee,0);
 assert.throws(()=>calculateSocial(1,10,5,5,5));assert.throws(()=>calculateSocial(NaN,0,100,5,5));
});
test('approved monthly installments only; replace social lines without changing other deductions',()=>{
 const p={id:'current',employeeId:'a',periodEnd:'2026-10-31',status:'draft',deductions:[{kind:'tax',name:'tax',amount:2000},{kind:'social',name:'old',amount:100},{kind:'social',name:'duplicate',amount:200}],employerSocial:0} as PayrollSlip;
 const other={...p,id:'other',status:'approved',employerSocial:30000,deductions:[{kind:'social',name:'social',amount:30000}]} as PayrollSlip;
 const r=socialRemaining([p,other,{...other,id:'draft',status:'draft'},{...other,id:'cancel',status:'cancelled'},{...other,id:'other-person',employeeId:'b'},{...other,id:'prior',periodEnd:'2026-09-30'}],p,87500,87500);
 assert.deepEqual(r,{deducted:30000,contributed:30000,employee:57500,employer:57500});
 const updated=applySocial(p,r.employee,r.employer);assert.equal(updated.deductions.length,2);assert.equal(updated.deductions[0].amount,2000);assert.equal(updated.employerSocial,57500);assert.equal(p.deductions.length,3);
 assert.deepEqual(applySocial(updated,r.employee,r.employer),updated);
 assert.equal(socialRemaining([other],p,10000,10000).employee,0);
});
