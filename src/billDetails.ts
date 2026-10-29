export type BillKind='item'|'discount'|'service'|'shipping'|'other';
export type BillLine={kind:BillKind,description:string,quantity:number|null,amount:number,code:string};
export type BillDetails={lines:BillLine[],vatMode:'unknown'|'none'|'included'|'excluded',vat:number,separateVat:boolean};
export const billKindLabels:Record<BillKind,string>={item:'สินค้า / รายการหลัก',discount:'ส่วนลด',service:'ค่าบริการ',shipping:'ค่าขนส่ง',other:'ค่าใช้จ่ายอื่น ๆ'};
export const billSign=(l:BillLine)=>l.kind==='discount'?-1:1;
export function billTotal(b:BillDetails){return b.lines.reduce((n,l)=>n+billSign(l)*l.amount,0)+(b.vatMode==='excluded'?b.vat:0);}
export function validateBillDetails(b:BillDetails|null|undefined,gross:number,type?:string){
 if(b==null)return;
 const fail=():never=>{throw Error('รายละเอียดบิลไม่ถูกต้อง หรือยอดรายการย่อยรวมไม่ตรงยอดตามเอกสาร');};
 if(typeof b!=='object'||type==='transfer'||!Array.isArray(b.lines)||!b.lines.length||b.lines.length>100||!['unknown','none','included','excluded'].includes(b.vatMode)||typeof b.separateVat!=='boolean'||!Number.isSafeInteger(b.vat)||b.vat<0||b.vat>1e14)fail();
 let positive=0,discount=0;
 for(const l of b.lines){if(!l||!Object.hasOwn(billKindLabels,l.kind)||typeof l.description!=='string'||!l.description.trim()||l.description.length>500||!Number.isSafeInteger(l.amount)||l.amount<0||l.amount>1e14||!(l.quantity===null||typeof l.quantity==='number'&&Number.isFinite(l.quantity)&&l.quantity>0&&l.quantity<=1e9)||typeof l.code!=='string'||l.code!==''&&!/^\d{4,10}$/.test(l.code))fail();if(l.kind==='discount')discount+=l.amount;else positive+=l.amount;}
 if(!Number.isSafeInteger(positive)||!Number.isSafeInteger(discount)||positive<=discount||billTotal(b)!==gross||!Number.isSafeInteger(gross)||gross<=0||gross>1e14)fail();
 if(['none','unknown'].includes(b.vatMode)&&(b.vat!==0||b.separateVat)||b.vatMode==='included'&&b.vat>gross)fail();
}
export function billDetailsFromForm(f:FormData,gross:number,type?:string):BillDetails|null{
 const value=f.get('billDetails');if(!value)return null;let b:BillDetails;try{b=JSON.parse(String(value));}catch{throw Error('อ่านรายละเอียดบิลไม่สำเร็จ');}validateBillDetails(b,gross,type);return b;
}
export function billSummary(b:BillDetails|null|undefined){if(!b)return [];return [...b.lines.map(l=>`${billKindLabels[l.kind]}: ${l.description}${l.quantity!==null?' (จำนวน '+l.quantity+')':''} ${l.kind==='discount'?'−':''}${(l.amount/100).toFixed(2)} บาท${l.code?' ['+l.code+']':''}`),...(['included','excluded'].includes(b.vatMode)?['VAT '+(b.vatMode==='included'?'รวมในยอดแล้ว':'เพิ่มจากยอดรายการ')+': '+(b.vat/100).toFixed(2)+' บาท'+(b.separateVat?' • แยกบัญชีภาษี':' • รวมในต้นทุน / รายได้')]:[])];}
