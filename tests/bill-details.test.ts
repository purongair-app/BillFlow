import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,validateState,balance,type Entry} from '../src/money.ts';
import {bookState,postings,trialBalance,profitAndLoss,positionStatement,partyBalances} from '../src/bookkeeping.ts';
import {billTotal,billDetailsFromForm,type BillDetails,type BillLine} from '../src/billDetails.ts';
import {normalizeExtraction,extractDocument} from '../supabase/functions/billflow-line/ocr.ts';
import {importLineDocument,suggestImport,type LineDocument} from '../src/lineDocuments.ts';
const line=(kind:BillLine['kind'],amount:number,extra:Partial<BillLine>={}):BillLine=>({kind,amount,description:kind,quantity:null,code:'',...extra});
const bill=(lines:BillLine[],extra:Partial<BillDetails>={}):BillDetails=>({lines,vatMode:'unknown',vat:0,separateVat:false,...extra});
const entry=(b:BillDetails,extra:Partial<Entry>={}):Entry=>({id:'bill1',date:'2026-10-29',type:'expense',title:'บิลทดสอบ',amount:billTotal(b),account:'cash',category:'อะไหล่และวัสดุ',contact:'คู่ค้า',note:'',billDetails:b,...extra});
function state(b:BillDetails,extra:Partial<Entry>={}){const s=initialState();s.entries=[entry(b,extra)];return s;}
function balanced(s:ReturnType<typeof initialState>){for(const j of postings(s))assert.equal(j.lines.reduce((n,l)=>n+l.debit,0),j.lines.reduce((n,l)=>n+l.credit,0));assert.equal(positionStatement(s,'2026-10-31').difference,0);}
const pos=bill([line('item',500000,{quantity:1}),line('item',200000,{quantity:100}),line('item',330000,{quantity:10}),line('discount',30000)],{vatMode:'included',vat:65421});
test('Thai Post receipt retains EMS 37 and surcharge 3 as distinct lines, debits shipping 40 and pays cash once',()=>{
 const b=bill([line('shipping',3700,{description:'EMS ในประเทศ'}),line('shipping',300,{description:'ค่าบริการขนส่งเพิ่มเติม'})]);const s=state(b);validateState(s);const j=postings(s)[0];assert.equal(j.lines.filter(l=>l.code==='541000').length,2);assert.equal(j.lines.filter(l=>l.code==='101001').length,1);assert.equal(balance(s,'cash'),-4000);assert.equal(trialBalance(s,'2026-10-31').find(a=>a.code==='541000')!.debit,4000);balanced(s);
});
test('POS extended line totals do not multiply by quantity or add VAT twice, and discount is posted separately',()=>{
 const s=state(pos);validateState(s);assert.equal(s.entries[0].amount,1000000);assert.equal(balance(s,'cash'),-1000000);const j=postings(s)[0];assert.equal(j.lines.find(l=>l.code==='519000')!.credit,30000);assert.equal(profitAndLoss(s,'2026-10-01','2026-10-31').expense,1000000);assert.ok(!j.lines.some(l=>l.code==='113000'));balanced(s);
});
test('explicit included VAT separation preserves every satang and records net cost and input VAT',()=>{
 const s=state({...pos,separateVat:true});validateState(s);assert.equal(profitAndLoss(s,'2026-10-01','2026-10-31').expense,934579);assert.equal(trialBalance(s,'2026-10-31').find(a=>a.code==='113000')!.debit,65421);assert.equal(balance(s,'cash'),-1000000);balanced(s);
});
test('all charges and withholding produce balanced detailed journal with one net cash payment',()=>{
 const b=bill([line('item',100000),line('service',10000),line('shipping',5000),line('other',2000),line('discount',3000)],{vatMode:'excluded',vat:7980,separateVat:true}),s=state(b,{withholding:{rate:3,base:100000,amount:3000,certificateNo:'WT1',certificateDate:'',payerTaxId:'',payeeTaxId:'',form:'',manual:false,note:''}});validateState(s);assert.equal(balance(s,'cash'),-(121980-3000));const codes=postings(s)[0].lines.map(l=>l.code);for(const c of ['510000','543000','541000','590000','519000','113000','213000'])assert.ok(codes.includes(c));balanced(s);
});
test('income separates sales, service, shipping, discount and output VAT without doubling cash',()=>{
 const b=bill([line('item',100000),line('service',10000),line('shipping',5000),line('discount',3000)],{vatMode:'excluded',vat:7840,separateVat:true}),s=state(b,{type:'income',category:'ขายสินค้า'});validateState(s);assert.equal(balance(s,'cash'),119840);assert.equal(profitAndLoss(s,'2026-10-01','2026-10-31').income,112000);assert.equal(trialBalance(s,'2026-10-31').find(a=>a.code==='212000')!.credit,7840);balanced(s);
});
test('item account overrides and persisted older charts support new charge codes',()=>{
 const b=bill([line('item',10000,{code:'120000'}),line('service',2000)]),s=state(b);s.bookkeeping=bookState(s);s.bookkeeping.chart=s.bookkeeping.chart.filter(a=>!['421000','430000','519000','543000'].includes(a.code));validateState(s);assert.equal(trialBalance(s,'2026-10-31').find(a=>a.code==='120000')!.debit,10000);assert.equal(profitAndLoss(s,'2026-10-01','2026-10-31').expense,2000);balanced(s);
});
test('receivable settlement ignores expense and income reclassification on original bill lines',()=>{
 const s=state(pos,{type:'income',category:'ขายสินค้า'});s.bookkeeping=bookState(s);s.bookkeeping.allocations.bill1={code:'110000',department:'',project:'',reference:'INV1',source:'',note:''};validateState(s);assert.equal(postings(s)[0].lines.filter(l=>l.code==='110000').length,1);assert.equal(partyBalances(s,'2026-10-31')[0].amount,-1000000);assert.equal(profitAndLoss(s,'2026-10-01','2026-10-31').income,0);balanced(s);
});
test('mismatched bill, excessive discount, fractional amounts, cash codes and transfer breakdown reject before saving',()=>{
 const s=state(pos);s.entries[0].amount++;assert.throws(()=>validateState(s));s.entries=[entry(bill([line('item',100),line('discount',100)]))];assert.throws(()=>validateState(s));s.entries=[entry(bill([line('item',100.1)]))];assert.throws(()=>validateState(s));s.entries=[entry(bill([line('item',100,{code:'101001'})]))];assert.throws(()=>validateState(s));s.entries=[entry(pos,{type:'transfer',to:'bank'})];assert.throws(()=>validateState(s));const f=new FormData();assert.equal(billDetailsFromForm(f,100),null);f.set('billDetails',JSON.stringify(pos));assert.equal(billDetailsFromForm(f,1000000)!.lines.length,4);assert.throws(()=>billDetailsFromForm(f,1000001));
});
test('OCR normalizes item money once, retains printed quantities, warns on unreadable and mismatched totals and never chooses tax credit',()=>{
 const x=normalizeExtraction({amount:10000,billDetails:{lines:[{kind:'item',description:'สินค้า',quantity:100,amount:10300},{kind:'discount',description:'ส่วนลด',amount:300}],vatMode:'included',vat:654.21,separateVat:true}});assert.equal(x.billDetails!.lines[0].amount,1030000);assert.equal(x.billDetails!.lines[0].quantity,100);assert.equal(x.billDetails!.vat,65421);assert.equal(x.billDetails!.separateVat,false);assert.equal(x.warnings.length,0);const bad=normalizeExtraction({amount:40,billDetails:{lines:[{kind:'shipping',description:'EMS',amount:37},{kind:'shipping',description:'เพิ่ม',amount:null}],vatMode:'unknown'}});assert.ok(bad.warnings.length>=2);assert.equal(bad.billDetails!.lines[1].amount,0);
});
test('LINE confirms structured invoice as debt without moving cash and rejects broken breakdown',()=>{
 const s=initialState(),doc:LineDocument={id:'77777777-7777-4777-8777-777777777777',file_id:'88888888-8888-4888-8888-888888888888',mime:'image/jpeg',file_size:100,status:'ready',created_at:'2026-10-29',extracted:{documentType:'invoice',documentNo:'INV1',title:'บิลสินค้า',contact:'คู่ค้า',amount:1000000,billDetails:pos}};const fields=suggestImport(s,doc),result=importLineDocument(s,doc,fields);assert.deepEqual(result.state.debts[0].billDetails,pos);assert.equal(balance(result.state,'cash'),0);assert.equal(result.state.entries.length,0);assert.throws(()=>importLineDocument(s,doc,{...fields,amount:'9999'}));const receipt={...doc,extracted:{...doc.extracted,documentType:'receipt'}};const cash=importLineDocument(s,receipt,{...suggestImport(s,receipt),type:'expense',account:'cash',paymentMethod:'cash'}).state;assert.equal(cash.entries[0].paymentMethod,'cash');assert.equal(cash.entries[0].billDetails!.lines.length,4);assert.equal(balance(cash,'cash'),-1000000);
});
test('OCR request instructs distinct charges, extended totals and no balancing inventions',async()=>{
 let prompt='';const fetcher:typeof fetch=async(_url,init)=>{prompt=JSON.parse(String(init?.body)).contents[0].parts[0].text;return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({documentType:'receipt',amount:40,billDetails:{lines:[{kind:'shipping',description:'EMS',amount:37},{kind:'shipping',description:'เพิ่ม',amount:3}],vatMode:'unknown'}})}]}}]}));};const x=await extractDocument('qa-only','gemini-model',new Uint8Array([1]),'image/jpeg',fetcher);assert.equal(x.billDetails!.lines.length,2);assert.match(prompt,/EXTENDED TOTAL/);assert.match(prompt,/never invent a balancing item/);assert.equal(x.amount,4000);
});
