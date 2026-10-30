import {loadPdfDependencies} from './pdfEngine';
import {internalPdfDefinition,type InternalDocument,type InternalPaper} from './internalDocuments';
import type {State} from './money';
export async function createInternalPdf(doc:InternalDocument,state:State,paper:InternalPaper){
 const [{default:pdfMake},{payrollFonts}]=await loadPdfDependencies(()=>Promise.all([import('pdfmake/build/pdfmake'),import('./payrollFonts')]));
 pdfMake.vfs=payrollFonts;pdfMake.fonts={Sarabun:{normal:'Sarabun-Regular.ttf',bold:'Sarabun-Bold.ttf',italics:'Sarabun-Regular.ttf',bolditalics:'Sarabun-Bold.ttf'}};
 const definition=internalPdfDefinition(doc,state,paper);
 const blob=await new Promise<Blob>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('สร้าง PDF นานเกินไป กรุณาลองอีกครั้ง')),25000);try{pdfMake.createPdf(definition).getBlob((blob:Blob)=>{clearTimeout(timer);resolve(blob);});}catch(e){clearTimeout(timer);reject(e);}});
 return {blob,filename:doc.number.replace(/[^A-Za-z0-9ก-๙._-]/g,'-')+'-'+paper+'.pdf'};
}
