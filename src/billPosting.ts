import {billSign,type BillDetails} from './billDetails.ts';
// Scale signed lines with cumulative rounding so every satang remains balanced.
function scale(amounts:number[],numerator:number,denominator:number){let cumulative=0,previous=0;return amounts.map(a=>{cumulative+=a;const n=BigInt(cumulative)*BigInt(numerator),d=BigInt(denominator),rounded=Number(n<0n?-((-n+d/2n)/d):(n+d/2n)/d),result=rounded-previous;previous=rounded;return result;});}
export function billPostingParts(b:BillDetails,type:string,counter:string,split:boolean){
 if(!split)return [{code:counter,amount:b.lines.reduce((n,l)=>n+billSign(l)*l.amount,0)+(b.vatMode==='excluded'?b.vat:0),detail:'ยอดตามเอกสาร / ชำระหนี้'}];
 const signed=b.lines.map(l=>billSign(l)*l.amount),sum=signed.reduce((n,a)=>n+a,0),amounts=b.separateVat&&b.vatMode==='included'?scale(signed,sum-b.vat,sum):signed;
 const parts=b.lines.map((l,i)=>({code:l.code||(l.kind==='discount'?(type==='income'?'430000':'519000'):l.kind==='shipping'?(type==='income'?'421000':'541000'):l.kind==='service'?(type==='income'?'410000':'543000'):l.kind==='other'?(type==='income'?'490000':'590000'):counter),amount:amounts[i],detail:l.description}));
 if(b.vat&&(b.separateVat||b.vatMode==='excluded'))parts.push({code:b.separateVat?(type==='income'?'212000':'113000'):counter,amount:b.vat,detail:b.separateVat?'VAT แยกบัญชีตามเอกสาร':'VAT รวมต้นทุน / รายได้'});
 return parts.filter(p=>p.amount!==0);
}
