import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {thaiToday,thaiDateInput,parseThaiDate,thaiDateLabel,thaiMonthLabel,thaiDateTime,thaiTime} from '../src/thaiDate.ts';
test('Buddhist dates round trip to the same stored Gregorian day and month',()=>{
 assert.equal(thaiDateInput('1980-06-25'),'25/06/2523');
 assert.equal(parseThaiDate('25/06/2523'),'1980-06-25');
 assert.equal(parseThaiDate('๒๕/๐๖/๒๕๒๓'),'1980-06-25');
 assert.equal(thaiDateInput('2026-10',true),'10/2569');
 assert.equal(parseThaiDate('10/2569',true),'2026-10');
 assert.match(thaiDateLabel('1980-06-25'),/2523/);
 assert.match(thaiMonthLabel('2026-10'),/2569/);
});
test('invalid dates and malformed years never become a different day',()=>{
 for(const date of ['31/02/2569','29/02/2569','31/04/2569','00/01/2569','1/13/2569','25/06/25','1980-06-25','25/06/0543'])assert.equal(parseThaiDate(date),null,date);
 assert.equal(parseThaiDate('29/02/2567'),'2024-02-29');
 assert.equal(parseThaiDate('13/2569',true),null);
 assert.equal(thaiDateInput('2026-02-31'),'');
 assert.equal(thaiDateLabel('bad'),'—');
});
test('Bangkok midnight and New Year determine dates, year and 24-hour time',()=>{
 assert.equal(thaiToday(new Date('2026-12-31T16:59:59Z')),'2026-12-31');
 assert.equal(thaiToday(new Date('2026-12-31T17:00:00Z')),'2027-01-01');
 assert.match(thaiDateTime('2026-12-31T17:00:00Z'),/2570/);
 assert.match(thaiDateTime('2026-12-31T17:00:00Z'),/00:00:00/);
 assert.equal(thaiTime('2026-10-30T08:30:00Z'),'15:30:00');
 assert.equal(thaiDateLabel('2026-01-01'),'1 ม.ค. 2569');
});
test('all date/month fields use the Buddhist input instead of browser-local Gregorian controls',()=>{
 for(const file of readdirSync(new URL('../src',import.meta.url)).filter(f=>f.endsWith('.tsx')&&f!=='ThaiDateInput.tsx')){
  const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
  assert.doesNotMatch(source,/<input\b[^>]*type="(?:date|month|datetime-local)"/,file);
 }
 const payroll=readFileSync(new URL('../src/Payroll.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(payroll,/ค\.ศ\. YYYY/);
});
