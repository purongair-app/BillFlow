import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollDocumentEmployee,employeeDocumentEmail,payrollEmployeeEmail,payrollEmailDraft} from '../src/payrollEmail.ts';
import {savePerson,people} from '../src/people.ts';
import {initialState} from '../src/money.ts';
test('document email persists in the employee directory and takes precedence over login email',()=>{
 const s=savePerson(initialState(),{kind:'employee',code:'EMP001',name:'พนักงานทดสอบ',details:'ช่าง',email:'employee@example.com',loginEmail:'login@example.com'});
 assert.equal(employeeDocumentEmail(s.employees![0]),'employee@example.com');
 const next=savePerson(s,{kind:'employee',code:'EMP001',name:'พนักงานทดสอบ',details:'ช่าง'},people(s)[0]);
 assert.equal(employeeDocumentEmail(next.employees![0]),'employee@example.com');
 assert.throws(()=>savePerson(s,{kind:'employee',code:'EMP002',name:'ทดสอบ',details:'',email:'not-email'}),/อีเมล/);
});
test('linked accounts resolve only by the exact verified user ID without guessing from names',()=>{
 const account={id:'user-1',email:'verified@example.com',confirmed:true};
 assert.equal(employeeDocumentEmail({userId:'user-1'},[account]),'verified@example.com');
 assert.equal(employeeDocumentEmail({userId:'other',loginEmail:'stale@example.com'},[account]),'');
 assert.equal(employeeDocumentEmail({userId:'user-1'},[{...account,confirmed:false}]),'');
 assert.equal(employeeDocumentEmail({loginEmail:'legacy@example.com'}),'legacy@example.com');
 assert.equal(employeeDocumentEmail(undefined,[account]),'');
});
test('email drafts contain only the chosen recipient and encode subject and body safely',()=>{
 for(const address of ['', 'a@@example.com','a@example.com,b@example.com','a@example.com\r\nBcc:b@example.com'])assert.throws(()=>payrollEmployeeEmail(address));
 const p:any={id:'p',employeeCode:'EMP001',employeeName:'ทดสอบ & Bcc:',periodStart:'2026-10-01',periodEnd:'2026-10-15'};
 const uri=payrollEmailDraft(p,'ร้านทดสอบ',{kind:'payslip',copy:'employee'},'employee@example.com','Payroll-test.pdf'),query=new URLSearchParams(uri.split('?')[1]);
 assert.equal(query.size,2);assert.ok(query.get('body')?.includes('Payroll-test.pdf'));assert.equal(decodeURIComponent(uri.split('?')[0]),'mailto:employee@example.com');
});

test('payroll recipient uses matching employee code and name even when an old internal ID points to another employee',()=>{
 const intended={id:'new-id',code:'662050',name:'พาตีฮะห์ เซ๊ะ',email:'employee@example.com'};
 const other={id:'old-id',code:'662055',name:'นางสาวมาซีเตาะ ลาเเตะ',email:'other@example.com'};
 const slip={employeeId:'old-id',employeeCode:'662050',employeeName:'นางสาวพาตีฮะห์ เซ๊ะ'};
 assert.equal(employeeDocumentEmail(payrollDocumentEmployee(slip,[other,intended])),'employee@example.com');
 assert.equal(payrollDocumentEmployee(slip,[other]),undefined);
 assert.equal(payrollDocumentEmployee(slip,[intended,{...intended,id:'duplicate'}]),undefined);
 assert.equal(payrollDocumentEmployee({...slip,employeeName:'คนอื่น'},[intended]),undefined);
 assert.equal(payrollDocumentEmployee({...slip,employeeId:'new-id'},[intended]),intended);
});
