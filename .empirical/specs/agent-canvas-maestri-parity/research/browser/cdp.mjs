import WebSocket from 'ws';
import {execFileSync} from 'node:child_process';
const project=JSON.parse(execFileSync('bb',['steel-browser','project'],{encoding:'utf8'}));
const endpoint=project.binding.cdpUrl;
const targets=await(await fetch(new URL('/json/list',endpoint))).json();const target=targets.find(t=>t.type==='page');const url=new URL(target.webSocketDebuggerUrl);url.host=new URL(endpoint).host;
export const ws=new WebSocket(url.href);await new Promise((res,rej)=>{ws.once('open',res);ws.once('error',rej)});let id=0;const pending=new Map();ws.on('message',data=>{const v=JSON.parse(data);if(v.id){const p=pending.get(v.id);if(p){pending.delete(v.id);clearTimeout(p.timer);v.error?p.reject(Error(JSON.stringify(v.error))):p.resolve(v.result);}}});
export function call(method,params={}){return new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout: '+method));},15000);pending.set(key,{resolve,reject,timer});ws.send(JSON.stringify({id:key,method,params}));});}
export async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
