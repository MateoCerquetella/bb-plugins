import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
// @ts-expect-error .mjs helper is tested as runtime JavaScript.
import {fingerprint,nativeTrace,recordNativeCacheTrace} from '../ops/cache-trace.mjs';
// @ts-expect-error .mjs helper is tested as runtime JavaScript.
import {addNativeCacheTrace} from '../ops/install-cache-trace.mjs';
test('Python and native fingerprints agree without exposing content',()=>{
 const payload={input:[{role:'user',content:'private á 🐳'}],tools:[{min:1.0,ratio:.000001}],reasoning:{effort:'medium'},prompt_cache_options:{mode:'implicit',comparison_response_id:'secret'}};
 const code='import json,sys;sys.path.insert(0,"runtime");from cache_telemetry import fingerprint;print(json.dumps(fingerprint(json.load(sys.stdin))))';
 const expected=JSON.parse(execFileSync('python3',['-c',code],{input:JSON.stringify(payload),encoding:'utf8'}));
 assert.deepEqual(fingerprint(payload),expected);assert.doesNotMatch(JSON.stringify(nativeTrace('a'.repeat(32),payload)),/private|secret/);
 assert.equal(nativeTrace('bad\nheader',payload),null);assert.equal(nativeTrace('a'.repeat(32)+'\n',payload),null);assert.equal(recordNativeCacheTrace('bad',payload,'/invalid'),false);
});
test('trace patch refuses partial/ambiguous states and is idempotent',()=>{
 const source='      headers = nativeHeaders(request);\n      routedBody = await compressedNativeBody(';
 const first=addNativeCacheTrace(source);assert.equal(first.changed,true);assert.equal(addNativeCacheTrace(first.source).changed,false);
 assert.throws(()=>addNativeCacheTrace(first.source+source));assert.throws(()=>addNativeCacheTrace(source+source));
 assert.doesNotMatch(first.source,/headers\["x-jev-request-id"\]\s*=/);assert.match(first.source,/delete headers\["x-jev-request-id"\]/);
});
