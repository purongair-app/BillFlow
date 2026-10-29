import type {Debt,State} from './money.ts';
import {validateState} from './money.ts';

export function upsertDebt(state:State,debt:Debt){
 const previous=state.debts.find(d=>d.id===debt.id);
 const payments=state.entries.filter(e=>e.debtId===debt.id);
 if(previous&&payments.length&&previous.type!==debt.type)throw Error('หนี้ที่มีประวัติชำระแล้วไม่สามารถเปลี่ยนประเภทได้');
 if(payments.reduce((n,e)=>n+e.amount,0)>debt.amount)throw Error('ยอดหนี้ต้องไม่น้อยกว่ายอดที่ชำระแล้ว');
 const n=structuredClone(state);
 n.debts=previous?n.debts.map(d=>d.id===debt.id?debt:d):[...n.debts,debt];
 validateState(n);
 return n.debts;
}
