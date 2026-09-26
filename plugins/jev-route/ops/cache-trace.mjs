import {createHash} from 'node:crypto';
import {appendFileSync,statSync,renameSync,unlinkSync,mkdirSync} from 'node:fs';
import path from 'node:path';
function canonical(value){
 if(value===undefined||value===null)return ['null'];
 if(typeof value==='boolean')return ['bool',value];
 if(typeof value==='number'){const bytes=Buffer.alloc(8);bytes.writeDoubleBE(value);return ['number',bytes.toString('hex')];}
 if(typeof value==='string')return ['string',value];
 if(Array.isArray(value))return ['array',value.map(canonical)];
 if(typeof value==='object')return ['object',Object.keys(value).sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b))).map(key=>[key,canonical(value[key])])];
 return ['unknown'];
}
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value)).replace(/[^\x00-\x7f]/g,ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0'))).digest('hex');
export function fingerprint(payload){
 const options=payload.prompt_cache_options&&typeof payload.prompt_cache_options==='object'?{...payload.prompt_cache_options}:payload.prompt_cache_options;
 if(options&&typeof options==='object')delete options.comparison_response_id;
 const items=Array.isArray(payload.input)?payload.input:[payload.input];
 return {input_hash:hash(payload.input),instructions_hash:hash(payload.instructions),tools_hash:hash(payload.tools),reasoning_hash:hash(payload.reasoning),text_hash:hash(payload.text),cache_options_hash:hash(options),history_items:items.length,reasoning_items:items.filter(x=>x?.type==='reasoning').length};
}
export function nativeTrace(requestId,payload){
 if(typeof requestId!=='string'||requestId.length!==32||! /^[a-f0-9]{32}$/.test(requestId))return null;
 const key=payload.prompt_cache_key;
 return {at:new Date().toISOString(),request_id:requestId,stage:'native_egress',scope:typeof key==='string'&&key.trim()?createHash('sha256').update(`prompt:${key.trim()}`).digest('hex').slice(0,16):null,model:['gpt-5.6-luna','gpt-5.6-sol','gpt-6-astra'].includes(payload.model)?payload.model:'other',...fingerprint(payload)};
}
export function recordNativeCacheTrace(requestId,payload,stateDir){
 try{
  const record=nativeTrace(requestId,payload);if(!record)return false;
  const line=JSON.stringify(record)+'\n';if(line.length>8192)return false;
  mkdirSync(stateDir,{recursive:true,mode:0o700});const file=path.join(stateDir,'jev-native-cache-trace.jsonl');
  let size=0;try{size=statSync(file).size;}catch{}
  if(size>=10*1024*1024){try{unlinkSync(file+'.1');}catch{}renameSync(file,file+'.1');}
  appendFileSync(file,line,{mode:0o600});return true;
 }catch{return false;} // Observability must never break a model request.
}
