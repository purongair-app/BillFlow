import type {Account,Entry} from './money';
import {bankDefaults} from './banking';
export default function TransferBankNames({account,to,entry}:{account?:Account,to?:Account,entry:Entry|null}){
 const defaults=bankDefaults('transfer',account,to);
 return <><label key={'sender-'+account?.id}>ธนาคารต้นทาง / ที่โอน (ถ้ามี)<input name="senderBank" maxLength={150} defaultValue={entry?.type==='transfer'&&entry.account===account?.id?entry.senderBank??defaults.senderBank:defaults.senderBank} placeholder="ฝากเงินสดผ่านตู้ เว้นช่องนี้ได้"/></label><label key={'receiver-'+to?.id}>ธนาคารที่ฝาก / รับโอน<input name="receiverBank" maxLength={150} defaultValue={entry?.type==='transfer'&&entry.to===to?.id?entry.receiverBank??defaults.receiverBank:defaults.receiverBank} placeholder="เช่น ไทยพาณิชย์ / กรุงไทย"/><small>เติมจากบัญชีปลายทางที่เลือก และแก้ไขให้ตรงกับสลิปได้</small></label></>;
}
