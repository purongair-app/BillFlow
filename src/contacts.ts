import {nextStateNumber} from './numbering.ts';
import {today} from './money.ts';
import type {Contact,ContactKind,Entry,State} from './money';
export const contactLabels={customer:'ลูกค้า',creditor:'เจ้าหนี้'};
export function contactsForKind(contacts:Contact[],kind:ContactKind){return contacts.filter(c=>c.active&&c.kind===kind);}
export function nextContactCode(s:State,kind:ContactKind='customer'){return nextStateNumber(s,kind,today());}
export function contactValue(e:Pick<Entry,'contact'|'contactId'>|undefined,contacts:Contact[]){const c=contacts.find(c=>c.id===e?.contactId);return c?`${c.code} · ${e?.contact||c.name}`:e?.contact||'';}
export function resolveContact(raw:string,contacts:Contact[],previous?:Pick<Entry,'contact'|'contactId'>,kind?:ContactKind):{name:string,id?:string}{const value=raw.trim();if(previous?.contactId&&value===contactValue(previous,contacts))return {name:previous.contact,id:previous.contactId};const exact=contacts.find(c=>value===`${c.code} · ${c.name}`);if(exact){if(kind&&exact.kind!==kind)throw Error('กรุณาเลือก'+contactLabels[kind]+'จากส่วนที่ถูกต้อง');if(!exact.active)throw Error('ลูกค้า / คู่ค้านี้ปิดใช้งานแล้ว กรุณาเลือกชื่ออื่น');return {name:exact.name,id:exact.id};}const names=contacts.filter(c=>c.active&&(!kind||c.kind===kind)&&c.name===value);if(names.length===1)return {name:names[0].name,id:names[0].id};return {name:value};}
export function contactUsageCount(s:State,id:string){return s.entries.filter(e=>e.contactId===id).length+s.debts.filter(d=>d.contactId===id).length;}
export function contactId(){return 'ct-'+Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');}
