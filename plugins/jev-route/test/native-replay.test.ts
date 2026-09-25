import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
// @ts-expect-error Runtime .mjs compatibility helper has no declaration file.
import { preserveJevNativeReplay, patchInstalledRouter } from '../ops/native-replay-compat.mjs';
const marker='  if (!deepSeekResponses) {\n    // Three replay channels, not two.';
function evaluateGate(source:string, id:string, protocol:string, deepSeekResponses=false, input:unknown[]=[]){
 const gate=source.slice(source.indexOf('if (')+4,source.lastIndexOf(') {'));
 return runInNewContext(gate,{deepSeekResponses,provider:{id},chatCompletionsProvider:protocol!=='openai-responses',input,reasoningItemText:(item:{content?:string;summary?:string})=>item.content??item.summary});
}
test('repair skips generic reasoning carry only for the native Jev Responses path',()=>{
 const patched=preserveJevNativeReplay(marker).source;
 assert.equal(evaluateGate(marker,'jev','openai-responses'),true);
 assert.equal(evaluateGate(patched,'jev','openai-responses'),false);
 assert.equal(evaluateGate(patched,'other','openai-responses'),true);
 assert.equal(evaluateGate(patched,'jev','chat-completions'),true);
 assert.equal(evaluateGate(patched,'other','openai-responses',true),false);
 assert.equal(evaluateGate(patched,'jev','openai-responses',false,[{type:'reasoning',id:'rs_1',encrypted_content:'opaque',summary:'summary'}]),false);
 assert.equal(evaluateGate(patched,'jev','openai-responses',false,[{type:'reasoning',id:'foreign',summary:'foreign summary'}]),true);
 assert.equal(evaluateGate(patched,'jev','openai-responses',false,[{type:'reasoning',id:'rs_1',encrypted_content:'summary',summary:'summary'}]),true);
 assert.equal(evaluateGate(patched,'jev','openai-responses',false,[{type:'reasoning',id:'rs_1',encrypted_content:'opaque',content:'foreign thinking'}]),true);
});
test('patch is idempotent and refuses an unknown or ambiguous upstream boundary',()=>{
 const once=preserveJevNativeReplay(marker);assert.equal(once.changed,true);
 assert.equal(preserveJevNativeReplay(once.source).changed,false);
 assert.throws(()=>preserveJevNativeReplay('different source'));
 assert.throws(()=>preserveJevNativeReplay(marker+'\n'+marker));
});

test('installed repair backs up source, is repeatable and validates target identity',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'jev-replay-'));
 try{
  await mkdir(path.join(root,'src'));await writeFile(path.join(root,'package.json'),JSON.stringify({name:'other'}));await writeFile(path.join(root,'src/router.mjs'),marker);
  await assert.rejects(patchInstalledRouter(root),/not a Codex/);
  assert.equal(await readFile(path.join(root,'src/router.mjs'),'utf8'),marker);
  await writeFile(path.join(root,'package.json'),JSON.stringify({name:'codex-model-router'}));
  const result=await patchInstalledRouter(root);assert.equal(result.changed,true);assert.equal(await readFile(result.backup,'utf8'),marker);
  assert.equal((await patchInstalledRouter(root)).changed,false);
 }finally{await rm(root,{recursive:true,force:true});}
});
