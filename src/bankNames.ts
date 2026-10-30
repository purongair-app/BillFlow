import type {State} from './money';
export function bankNameOptions(s:State){
 const names=[...s.accounts.map(a=>a.bankName),...(s.employees||[]).filter(p=>p.active).map(p=>p.bankName),...s.entries.flatMap(e=>[e.senderBank,e.receiverBank,e.referenceBank])];
 const unique=new Map<string,string>();
 for(const value of names){const name=value?.trim();if(name&&!unique.has(name.normalize('NFKC').toLocaleLowerCase('th-TH')))unique.set(name.normalize('NFKC').toLocaleLowerCase('th-TH'),name);}
 return [...unique.values()].sort((a,b)=>a.localeCompare(b,'th'));
}
