export class PdfEngineLoadError extends Error{
 constructor(){super('โหลดตัวสร้าง PDF ไม่สำเร็จ หน้าเว็บอาจเป็นเวอร์ชันเก่าหรืออินเทอร์เน็ตขัดข้อง กรุณาโหลดเว็บเวอร์ชันล่าสุดแล้วลองใหม่');this.name='PdfEngineLoadError';}
}
export async function loadPdfDependencies<T>(loader:()=>Promise<T>):Promise<T>{
 try{return await loader();}catch{throw new PdfEngineLoadError();}
}
