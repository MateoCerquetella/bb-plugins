import type {Binding} from "./contract.ts";
import {navigationUrlSchema} from "./contract.ts";

type Target={type:string;webSocketDebuggerUrl?:string};
export function pageSocketUrl(binding:Binding,target:Target){
 if(target.type!=="page"||!target.webSocketDebuggerUrl)throw Error("No project browser page is available");
 const url=new URL(target.webSocketDebuggerUrl);
 if(!url.pathname.startsWith("/devtools/page/"))throw Error("The project returned an invalid page target");
 const endpoint=new URL(binding.cdpUrl);url.host=endpoint.host;url.protocol=endpoint.protocol==="https:"?"wss:":"ws:";
 url.username="";url.password="";return url.href;
}

/** Connect to a project page rather than attaching to every browser/UI target. */
export async function navigateProject(binding:Binding,input:string){
 const destination=navigationUrlSchema.parse(input);
 const response=await fetch(new URL("/json/list",binding.cdpUrl),{signal:AbortSignal.timeout(8000),redirect:"error"});
 if(!response.ok)throw Error("Project browser targets are unavailable");
 const targets=await response.json() as Target[];
 let target=targets.filter(t=>t.type==="page").at(-1);
 if(!target){
  const created=await fetch(new URL("/json/new?about:blank",binding.cdpUrl),{method:"PUT",signal:AbortSignal.timeout(8000),redirect:"error"});
  if(!created.ok)throw Error("A project browser tab could not be opened");
  target=await created.json() as Target;
 }
 const socket=new WebSocket(pageSocketUrl(binding,target));
 const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 let id=0;
 function fail(){for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error("Project browser disconnected. Inspect before retrying navigation."));}pending.clear();}
 socket.addEventListener("message",event=>{
  try{const value=JSON.parse(String(event.data));const request=pending.get(value.id);if(!request)return;pending.delete(value.id);clearTimeout(request.timer);if(value.error)request.reject(Error(value.error.message??"Project browser action failed"));else request.resolve(value.result);}catch{fail();}
 });
 socket.addEventListener("close",fail);socket.addEventListener("error",fail);
 function call(method:string,params:object={}){
  return new Promise<any>((resolve,reject)=>{
   const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error("Project browser action timed out. Inspect before retrying navigation."));},10000);
   pending.set(key,{resolve,reject,timer});socket.send(JSON.stringify({id:key,method,params}));
  });
 }
 try{
  await new Promise<void>((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error("Project page connection timed out")),8000);
   socket.addEventListener("open",()=>{clearTimeout(timer);resolve();},{once:true});
   socket.addEventListener("error",()=>{clearTimeout(timer);reject(Error("Project page connection failed"));},{once:true});
  });
  await call("Page.enable");
  const navigation=await call("Page.navigate",{url:destination});
  if(navigation.errorText)throw Error(`Project navigation failed: ${navigation.errorText}`);
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
   const tree=await call("Page.getFrameTree");
   if(!navigation.loaderId||tree.frameTree?.frame?.loaderId===navigation.loaderId){
    const result=await call("Runtime.evaluate",{expression:"JSON.stringify({url:location.href,title:document.title,ready:document.readyState})",returnByValue:true});
    if(!result.exceptionDetails&&result.result?.value){
     const state=JSON.parse(result.result.value) as {url:string;title:string;ready:string};
     if(state.ready==="interactive"||state.ready==="complete")return {url:state.url,title:state.title,viewerUrl:new URL("v1/sessions/debug",binding.viewerUrl).href};
    }
   }
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error("Project navigation was not confirmed. Inspect the browser before retrying.");
 }finally{socket.close();fail();}
}
