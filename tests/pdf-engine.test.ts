import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPdfDependencies,PdfEngineLoadError} from '../src/pdfEngine.ts';
import {retainAssets} from '../scripts/retain-assets.mjs';
import {mkdtemp,mkdir,writeFile,readFile,utimes,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('missing PDF chunks return an actionable error while successful imports pass through',async()=>{
 const dependency={pdf:true};assert.equal(await loadPdfDependencies(async()=>dependency),dependency);
 await assert.rejects(()=>loadPdfDependencies(async()=>{throw new TypeError('Failed to fetch dynamically imported module: old-chunk.js')}),e=>e instanceof PdfEngineLoadError&&e.message.includes('เวอร์ชันล่าสุด')&&!e.message.includes('old-chunk.js'));
});
test('publish keeps recent old chunks, expires stale chunks and never replaces a current chunk',async()=>{
 const root=await mkdtemp(join(tmpdir(),'billflow-assets-')),dist=join(root,'dist'),cache=join(root,'cache'),now=Date.now();
 try{
 await mkdir(dist);await mkdir(cache);await writeFile(join(dist,'current.js'),'new');await writeFile(join(cache,'current.js'),'old');
 await writeFile(join(cache,'recent.js'),'recent');await writeFile(join(cache,'expired.js'),'expired');
 await utimes(join(cache,'expired.js'),(now-8*86400000)/1000,(now-8*86400000)/1000);
 await retainAssets(dist,cache,now);
 assert.equal(await readFile(join(dist,'current.js'),'utf8'),'new');assert.equal(await readFile(join(dist,'recent.js'),'utf8'),'recent');
 await assert.rejects(()=>stat(join(cache,'expired.js')));await assert.rejects(()=>stat(join(dist,'expired.js')));
 assert.equal(await readFile(join(cache,'current.js'),'utf8'),'new');
 }finally{await rm(root,{recursive:true,force:true});}
});
