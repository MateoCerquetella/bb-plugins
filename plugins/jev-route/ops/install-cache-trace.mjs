import {readFile,writeFile,rename,copyFile,stat,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const imports='import { recordNativeCacheTrace } from "./jev-cache-trace.mjs";\nimport { STATE_DIR as JEV_STATE_DIR } from "./paths.mjs";\n';
const original='      headers = nativeHeaders(request);\n      routedBody = await compressedNativeBody(';
const changed='      headers = nativeHeaders(request);\n      delete headers["x-jev-request-id"];\n      recordNativeCacheTrace(request.headers["x-jev-request-id"], native, JEV_STATE_DIR);\n      routedBody = await compressedNativeBody(';
export function addNativeCacheTrace(source){
 const a=source.split(original).length-1,b=source.split(changed).length-1,c=source.split(imports).length-1;
 if(a===0&&b===1&&c===1)return {source,changed:false};
 if(a!==1||b!==0||c!==0)throw new Error('Unsupported or ambiguous native trace boundary; source unchanged.');
 return {source:imports+source.replace(original,changed),changed:true};
}
export async function installNativeCacheTrace(root){
 if(JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).name!=='codex-model-router')throw new Error('Wrong router installation');
 const file=path.join(root,'src/router.mjs'),before=await readFile(file,'utf8'),result=addNativeCacheTrace(before);
 const module=path.join(root,'src/jev-cache-trace.mjs');const helper=await readFile(new URL('./cache-trace.mjs',import.meta.url),'utf8');
 const suffix=createHash('sha256').update(before).digest('hex').slice(0,16);const backup=`${file}.before-jev-cache-trace-${suffix}`;
 let moduleBefore=null;try{moduleBefore=await readFile(module,'utf8');}catch{}
 if(!result.changed&&moduleBefore===helper)return {changed:false,file,module};
 await copyFile(file,backup);
 const moduleBackup=moduleBefore!==null?`${module}.before-${createHash('sha256').update(moduleBefore).digest('hex').slice(0,16)}`:null;
 if(moduleBackup)await copyFile(module,moduleBackup);
 const staged=`${file}.trace-stage-${process.pid}`;
 try{
  await writeFile(module,helper,{mode:0o644});
  await writeFile(staged,result.source,{mode:(await stat(file)).mode&0o777});
  await rename(staged,file);
 }catch(error){if(moduleBefore===null)await rm(module,{force:true});else await writeFile(module,moduleBefore);throw error;}
 finally{await rm(staged,{force:true});}
 return {changed:true,file,module,backup,moduleBackup};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(JSON.stringify(await installNativeCacheTrace(path.resolve(process.argv[2]??path.join(homedir(),'.local/share/codex-router')))));
