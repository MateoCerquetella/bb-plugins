import {z} from "zod";
import type {BbPluginApi} from "@get-bb/plugin-sdk";

export const chainDefinitionSchema=z.object({automationId:z.string(),projectId:z.string(),threadId:z.string(),prompt:z.string().max(30000),version:z.string()});
export type ChainDefinition=z.infer<typeof chainDefinitionSchema>;
export const chainStateSchema=z.object({runId:z.string(),automationId:z.string(),status:z.enum(["running","completed","failed","paused","interrupted"]),step:z.number().int(),total:z.number().int(),error:z.string().nullable()});
export type ChainState=z.infer<typeof chainStateSchema>;
export function splitPrompts(prompt:string){
 const parts=prompt.split(/^\s*&&\s*$/m).map(v=>v.trim());
 if(parts.some(v=>!v))throw Error("Every chain step must contain a prompt");
 if(parts.length>20)throw Error("A routine chain supports at most 20 prompts");
 return parts;
}
export function chainScript(){
 return `(async()=>{const {execFileSync}=await import('node:child_process');
const fs=await import('node:fs');const os=await import('node:os');const path=await import('node:path');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bb-canvas-chain-'));
const inputPath=path.join(directory,'input.json');
fs.writeFileSync(inputPath,JSON.stringify({automationId:process.env.BB_AUTOMATION_ID,runId:process.env.BB_AUTOMATION_RUN_ID}),{mode:0o600});
const cli=process.env.BB_CLI||'bb';
function rpc(method){return JSON.parse(execFileSync(cli,['plugin','rpc','call','agent-canvas',method,'--input-file',inputPath,'--json'],{encoding:'utf8',timeout:20000}));}
try{let state=rpc('beginRoutineChain');const deadline=Date.now()+850000;while(state.status==='running'){if(Date.now()>deadline)throw Error('Routine chain timed out; inspect before trying again');await new Promise(r=>setTimeout(r,1000));state=rpc('routineChainStatus');}console.log(JSON.stringify({status:state.status,completedSteps:state.step,total:state.total,error:state.error}));if(state.status!=='completed'&&state.status!=='paused')process.exitCode=1;}catch(error){console.error(error.message);process.exitCode=1;}finally{fs.rmSync(directory,{recursive:true,force:true});}})();`;
}
const nativeAutomation=z.object({id:z.string(),projectId:z.string(),enabled:z.boolean(),execution:z.object({mode:z.string()})});
const nativeRuns=z.object({runs:z.array(z.object({id:z.string(),automationId:z.string(),status:z.string(),runMode:z.string()})),nextCursor:z.string().nullable()});
const eventTypes=["client/turn/requested","turn/input/accepted","turn/completed","client/turn/rejected","system/thread/interrupted"] as const;
class Paused extends Error{}

export async function createChainEngine(bb:BbPluginApi,lifetime:AbortSignal){
 let definitions=z.array(chainDefinitionSchema).max(100).parse(await bb.storage.kv.get("routine-chain-definitions")??[]);
 let states=z.array(chainStateSchema).max(200).parse(await bb.storage.kv.get("routine-chain-states")??[]);
 const working=new Set<string>();let writes:Promise<unknown>=Promise.resolve();
 function persist(){const value=structuredClone(states);const task=writes.then(()=>bb.storage.kv.set("routine-chain-states",value));writes=task.catch(()=>{});return task;}
 // A vanished process is an interrupted run. Never replay a possibly delivered step.
 states=states.map(s=>s.status==="running"?{...s,status:"interrupted",error:"Server restarted during this chain. Inspect the target before activating again."}:s);
 await persist();
 function definition(automationId:string){const d=definitions.find(v=>v.automationId===automationId);if(!d)throw Error("This automation is not a registered canvas chain");return d;}
 async function setDefinition(d:ChainDefinition){definitions=z.array(chainDefinitionSchema).max(100).parse([...definitions.filter(v=>v.automationId!==d.automationId),d]);await bb.storage.kv.set("routine-chain-definitions",definitions);}
 async function removeDefinition(automationId:string){definitions=definitions.filter(v=>v.automationId!==automationId);await bb.storage.kv.set("routine-chain-definitions",definitions);}
 async function native(d:ChainDefinition){return bb.sdk.plugins.callRpc({pluginId:"automations",method:"automations_get",input:{projectId:d.projectId,automationId:d.automationId},outputSchema:nativeAutomation});}
 async function pauseNative(d:ChainDefinition){await bb.sdk.plugins.callRpc({pluginId:"automations",method:"automations_pause",input:{projectId:d.projectId,automationId:d.automationId},outputSchema:z.unknown()});}
 function update(runId:string,patch:Partial<ChainState>){states=states.map(s=>s.runId===runId?{...s,...patch}:s);return persist();}
 async function wait(signal:AbortSignal){signal.throwIfAborted();await new Promise<void>((resolve,reject)=>{const done=()=>{clearTimeout(timer);signal.removeEventListener("abort",abort);resolve();};const abort=()=>{clearTimeout(timer);signal.removeEventListener("abort",abort);reject(Error("Chain interrupted"));};const timer=setTimeout(done,300);signal.addEventListener("abort",abort,{once:true});});}
 async function run(d:ChainDefinition,runId:string){
  let queuedId:string|undefined,marker="",sentPrompt="";
  const signal=AbortSignal.any([lifetime,AbortSignal.timeout(840000)]);
  try{
   const parts=splitPrompts(d.prompt);
   for(let index=0;index<parts.length;index++){
    if(definitions.find(v=>v.automationId===d.automationId)?.version!==d.version)throw new Paused("Routine changed; remaining steps were not sent");
    const automation=await native(d);if(!automation.enabled)throw new Paused("Routine paused before the next step");
    const thread=await bb.sdk.threads.get({threadId:d.threadId,signal});
    if(thread.projectId!==d.projectId||thread.deletedAt||thread.archivedAt||thread.visibility==="hidden")throw Error("Target thread is unavailable");
    if(thread.status==="error"||thread.status==="stopping")throw new Paused("Target agent is failed or stopping; remaining steps were not sent");
    const latest=await bb.sdk.threads.events.list({threadId:d.threadId,limit:"1",order:"desc",signal});let cursor=latest[0]?.seq??0;
    marker=`Agent Canvas routine execution ${runId} step ${index+1}`;sentPrompt=parts[index];
    // Persist before sending. Recovery deliberately never resends this step.
    await update(runId,{step:index});signal.throwIfAborted();
    const sent=await bb.sdk.threads.send({threadId:d.threadId,mode:"queue-if-active",input:[{type:"text",text:parts[index],mentions:[]},{type:"text",text:marker,mentions:[],visibility:"agent-only"}]});
    queuedId=sent.delivery==="queued"?sent.queuedMessage.id:undefined;
    let requestId:string|undefined,turnId:string|undefined,completed=false;
    while(!completed){
     signal.throwIfAborted();
     const rows=await bb.sdk.threads.events.list({threadId:d.threadId,afterSeq:String(cursor),limit:"100",order:"asc",types:eventTypes,signal});
     for(const row of rows){
      cursor=Math.max(cursor,row.seq);const data=row.data as any;
      if(row.type==="client/turn/requested"&&data.input?.some((i:any)=>i.type==="text"&&i.text===marker))requestId=data.requestId;
      if(row.type==="client/turn/rejected"&&requestId&&data.requestId===requestId)throw Error("Routine step was rejected");
      if(row.type==="turn/input/accepted"&&requestId&&data.clientRequestId===requestId&&row.scope.kind==="turn")turnId=row.scope.turnId;
      if(row.type==="turn/completed"&&turnId&&row.scope.kind==="turn"&&row.scope.turnId===turnId){if(data.status!=="completed")throw Error(`Routine step ${index+1} ${data.status}`);completed=true;}
      if(row.type==="system/thread/interrupted")throw new Paused("Target agent was stopped; remaining steps were not sent");
     }
     if(completed)break;
     const current=await bb.sdk.threads.get({threadId:d.threadId,signal});
     if(current.deletedAt||current.archivedAt||current.status==="error")throw Error("Target agent became unavailable or failed");
     if(current.status==="stopping")throw new Paused("Target agent is stopping; remaining steps were not sent");
     if(!turnId&&!(await native(d)).enabled)throw new Paused("Routine paused while waiting to dispatch");
     await wait(signal);
    }
    queuedId=undefined;await update(runId,{step:index+1});
   }
   await update(runId,{status:"completed",error:null});
  }catch(error){
   const message=error instanceof Error?error.message:"Chain failed";
   // Withdraw only our still-unaccepted queued prompt, never another user's draft.
   if(queuedId){try{const queue=await bb.sdk.threads.queuedMessages.list({threadId:d.threadId});if(queue.some(m=>m.id===queuedId&&m.content.length===2&&m.content[0].type==="text"&&m.content[0].text===sentPrompt&&m.content[1].type==="text"&&m.content[1].text===marker&&m.content[1].visibility==="agent-only"))await bb.sdk.threads.queuedMessages.delete({threadId:d.threadId,queuedMessageId:queuedId});}catch{/* Native queue/stop policy still applies. */}}
   await update(runId,{status:lifetime.aborted?"interrupted":error instanceof Paused?"paused":"failed",error:message});
   try{if(definitions.find(v=>v.automationId===d.automationId)?.version===d.version)await pauseNative(d);}catch{/* State retains the failure; future starts are rejected. */}
  }finally{working.delete(d.automationId);}
 }
 async function begin(input:{automationId:string;runId:string}){
  const d=definition(input.automationId),existing=states.find(s=>s.runId===input.runId&&s.automationId===input.automationId);if(existing)return existing;
  const automation=await native(d);if(automation.projectId!==d.projectId||automation.execution.mode!=="script"||!automation.enabled)throw Error("This native chain is unavailable or paused");
  const runs=await bb.sdk.plugins.callRpc({pluginId:"automations",method:"automations_runs",input:{projectId:d.projectId,automationId:d.automationId,limit:50},outputSchema:nativeRuns});
  if(!runs.runs.some(r=>r.id===input.runId&&r.automationId===input.automationId&&r.status==="running"&&r.runMode==="script"))throw Error("A current native script run is required to start this chain");
  const concurrent=states.find(s=>s.runId===input.runId&&s.automationId===input.automationId);if(concurrent)return concurrent;
  if(working.has(d.automationId))throw Error("This chain already has an active run");
  if(states.some(s=>s.automationId===d.automationId&&["failed","interrupted"].includes(s.status)))throw Error("Inspect the previous failed chain and explicitly activate it again before starting");
  const state:ChainState={...input,status:"running",step:0,total:splitPrompts(d.prompt).length,error:null};states=[...states.filter(s=>s.status==="running"||s.automationId!==d.automationId).slice(-199),state];working.add(d.automationId);try{await persist();}catch(error){working.delete(d.automationId);states=states.map(s=>s.runId===input.runId?{...s,status:"failed",error:"Chain state could not be persisted; no prompt was sent"}:s);throw error;}void run(d,input.runId);return state;
 }
 async function acknowledgeActivation(automationId:string){states=states.filter(s=>s.automationId!==automationId||s.status==="running");await persist();}
 function status(input:{automationId:string;runId:string}){const state=states.find(s=>s.runId===input.runId&&s.automationId===input.automationId);if(!state)throw Error("Chain run is unavailable");return state;}
 return {definition,setDefinition,removeDefinition,begin,status,acknowledgeActivation,list:()=>definitions,latestState:(automationId:string)=>[...states].reverse().find(s=>s.automationId===automationId)};
}

export type ChainEngine=Awaited<ReturnType<typeof createChainEngine>>;
