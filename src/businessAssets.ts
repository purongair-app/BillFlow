export type BusinessAssetKind='logo'|'signature'|'paymentQr';
export type BusinessAssets=Partial<Record<BusinessAssetKind,string>>;
export const businessImagePolicy={
 logo:{label:'โลโก้ร้าน',fileLimit:5*1024*1024,dataLimit:200000,maxSide:768,hint:'JPG, PNG หรือ WebP ไม่เกิน 5 MB'},
 signature:{label:'ลายเซ็นอิเล็กทรอนิกส์',fileLimit:500*1024,dataLimit:160000,maxSide:1024,hint:'JPG, PNG หรือ WebP ไม่เกิน 500 KB'},
 paymentQr:{label:'QR รับชำระเงิน',fileLimit:750*1024,dataLimit:240000,maxSide:1024,hint:'JPG, PNG หรือ WebP ไม่เกิน 750 KB'}
} as const;
export function validateBusinessAssets(value:unknown):asserts value is BusinessAssets|undefined{
 if(value===undefined)return;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('ข้อมูลรูปแนบร้านค้าไม่ถูกต้อง');
 for(const [key,image] of Object.entries(value)){
  if(!Object.hasOwn(businessImagePolicy,key))throw Error('ประเภทรูปแนบร้านค้าไม่ถูกต้อง');
  const policy=businessImagePolicy[key as BusinessAssetKind];
  if(typeof image!=='string'||image.length>policy.dataLimit||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))throw Error(policy.label+' ไม่ถูกต้องหรือใหญ่เกินไป กรุณาเลือกรูปใหม่');
 }
}
export async function prepareBusinessImage(file:File,kind:BusinessAssetKind):Promise<string>{
 const policy=businessImagePolicy[kind];
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size===0||file.size>policy.fileLimit)throw Error(policy.label+': '+policy.hint);
 let bitmap:ImageBitmap;
 try{bitmap=await createImageBitmap(file)}catch{throw Error('เปิดไฟล์'+policy.label+'ไม่ได้ กรุณาเลือกรูป JPG, PNG หรือ WebP ที่สมบูรณ์')}
 try{
  if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>50000000)throw Error('รูปมีขนาดพิกเซลใหญ่เกินไป กรุณาลดขนาดรูปก่อน');
  const scale=Math.min(1,policy.maxSide/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d');if(!context)throw Error('อุปกรณ์ไม่สามารถเตรียมรูปได้ กรุณาลองอีกครั้ง');
  context.imageSmoothingEnabled=kind!=='paymentQr';context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  let image=canvas.toDataURL('image/png');
  if(image.length>policy.dataLimit&&kind!=='paymentQr')image=canvas.toDataURL('image/webp',.9);
  validateBusinessAssets({[kind]:image});return image;
 }finally{bitmap.close()}
}
