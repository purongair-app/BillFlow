import {useState} from 'react';
export default function ProfileAvatar({photo,name,size=40}:{photo?:string,name:string,size?:number}){
 const [failed,Failed]=useState('');
 return <span className="avatar" style={{width:size,height:size,overflow:'hidden',flexShrink:0}}>{photo&&failed!==photo?<img src={photo} alt={'รูป '+name} style={{width:'100%',height:'100%',objectFit:'cover'}} onError={()=>Failed(photo)}/>:name.trim().slice(0,1).toUpperCase()||'?'}</span>;
}
export async function employeePhoto(file:File):Promise<string>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('เลือกรูป JPG, PNG หรือ WEBP ขนาดไม่เกิน 5 MB');
 const bitmap=await createImageBitmap(file);
 try{const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');if(!ctx)throw Error('เปิดรูปไม่ได้ กรุณาลองรูปอื่น');const side=Math.min(bitmap.width,bitmap.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,256,256);ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,256,256);const result=canvas.toDataURL('image/jpeg',0.75);if(result.length>100000)throw Error('รูปมีรายละเอียดมากเกินไป กรุณาเลือกรูปอื่น');return result;}finally{bitmap.close();}
}
