import {useId,type InputHTMLAttributes} from 'react';
export default function BankNameInput({options,...props}:{options:string[]}&Omit<InputHTMLAttributes<HTMLInputElement>,'list'>){
 const listId=useId();
 return <><input {...props} list={listId} placeholder={props.placeholder||'เลือกหรือพิมพ์ชื่อธนาคาร'}/><datalist id={listId}>{options.map(name=><option key={name} value={name}/>)}</datalist></>;
}
