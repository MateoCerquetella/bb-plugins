#!/usr/bin/env node
/** Narrow installed-router compatibility repair; leaves every non-Jev adapter unchanged. */
import { readFile, writeFile, rename, stat, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const original = '  if (!deepSeekResponses) {\n    // Three replay channels, not two.';
const replacement = `  // Jev native-only histories keep their reasoning continuation tokens.
  if (!deepSeekResponses && !(provider?.id === "jev" && !chatCompletionsProvider &&
      Array.isArray(input) && input.every((item) => item?.type !== "reasoning" || (
        typeof item.id === "string" && item.id.startsWith("rs_") &&
        typeof item.encrypted_content === "string" && item.encrypted_content.length > 0 &&
        item.encrypted_content !== reasoningItemText(item) &&
        !reasoningItemText({ content: item.content })
      )))) {
    // Three replay channels, not two.`;
export function preserveJevNativeReplay(source) {
  const originals=source.split(original).length-1;
  const replacements=source.split(replacement).length-1;
  if (originals===0 && replacements===1) return {source,changed:false};
  if (originals!==1 || replacements!==0) throw new Error('Unsupported router source: expected one reasoning-carry boundary; no files changed.');
  return {source:source.replace(original,replacement),changed:true};
}
export async function patchInstalledRouter(root) {
  const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  if(pkg.name!=='codex-model-router')throw new Error('Target is not a Codex Model Router installation.');
  const file=path.join(root,'src/router.mjs');const before=await readFile(file,'utf8');
  const result=preserveJevNativeReplay(before);
  if(!result.changed)return {changed:false,file};
  const digest=createHash('sha256').update(before).digest('hex').slice(0,16);
  const backup=`${file}.before-jev-native-replay-${digest}`;
  await copyFile(file,backup);
  const temporary=`${file}.jev-stage-${process.pid}`;
  await writeFile(temporary,result.source,{mode:(await stat(file)).mode & 0o777});
  await rename(temporary,file);
  return {changed:true,file,backup};
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const root=path.resolve(process.argv[2]??path.join(homedir(),'.local/share/codex-router'));
 console.log(JSON.stringify(await patchInstalledRouter(root)));
}
