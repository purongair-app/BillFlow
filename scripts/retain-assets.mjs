import {mkdir,readdir,stat,copyFile,utimes,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Keep hashed assets for one week so open tabs can still load their PDF engine.
export async function retainAssets(dist='dist/assets',cache='.pages-assets',now=Date.now()){
 await mkdir(cache,{recursive:true});
 const current=await readdir(dist,{withFileTypes:true});
 for(const file of current){
  if(!file.isFile())continue;
  const target=join(cache,file.name);
  await copyFile(join(dist,file.name),target);
  await utimes(target,now/1000,now/1000);
 }
 for(const file of await readdir(cache,{withFileTypes:true})){
  if(!file.isFile())continue;
  const source=join(cache,file.name),info=await stat(source);
  if(now-info.mtimeMs>7*86400000){await rm(source);continue;}
  if(!current.some(x=>x.name===file.name))await copyFile(source,join(dist,file.name));
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await retainAssets();
