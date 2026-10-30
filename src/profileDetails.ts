export const profileBasicFields=[['code','รหัสพนักงาน'],['name','ชื่อ–นามสกุล'],['position','ตำแหน่ง'],['email','อีเมลบัญชี'],['phone','เบอร์โทรศัพท์'],['address','ที่อยู่']] as const;
export function profileCompleteness(profile:Partial<Record<typeof profileBasicFields[number][0],string>>){
 const missing=profileBasicFields.filter(([key])=>!profile[key]?.trim()).map(([,label])=>label);
 return {percent:Math.round((profileBasicFields.length-missing.length)/profileBasicFields.length*100),missing};
}
