import {useCallback,useEffect,useState} from "react";
import {useRpc} from "@get-bb/plugin-sdk/app";
import type {Snapshot,rpcContract} from "./contract";
import type {Routine} from "./routines";

export function Routines({projectId,threads}:{projectId:string;threads:Snapshot["threads"]}){
 const rpc=useRpc<typeof rpcContract>();
 const [routines,setRoutines]=useState<Routine[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [paused,setPaused]=useState(false);
 const [editing,setEditing]=useState<string|null>(null),[deleting,setDeleting]=useState<string|null>(null);
 const [name,setName]=useState(""),[prompt,setPrompt]=useState(""),[threadId,setThreadId]=useState(""),[once,setOnce]=useState(false);
 const [cron,setCron]=useState("0 9 * * 1-5"),[timezone,setTimezone]=useState(()=>Intl.DateTimeFormat().resolvedOptions().timeZone),[runAt,setRunAt]=useState("");
 const refresh=useCallback(async()=>{setBusy(true);try{setRoutines(await rpc.call("listRoutines",{projectId}));setError("");}catch(e){setError(e instanceof Error?e.message:"BB routines are unavailable. Your draft is retained.");}finally{setBusy(false);}},[rpc,projectId]);
 useEffect(()=>{void refresh();},[refresh]);
 const targets=threads.filter(t=>t.projectId===projectId&&t.environmentId);
 async function create(){
  if(busy)return;setBusy(true);setError("");
  try{
   const trigger=once?{triggerType:"once" as const,runAt:new Date(runAt).getTime()}:{triggerType:"schedule" as const,cron,timezone};
   const created=editing?await rpc.call("updateRoutine",{projectId,automationId:editing,threadId,name,prompt,trigger,enabled:!paused}):await rpc.call("createRoutine",{projectId,threadId,name,prompt,trigger,enabled:!paused});
   setRoutines(v=>editing?v.map(r=>r.id===created.id?created:r):[...v,created]);setName("");setPrompt("");setEditing(null);
  }catch(e){setError(`${e instanceof Error?e.message:"Routine could not be saved"}. Refresh the list before creating again if the result is uncertain. Your draft is retained.`);}finally{setBusy(false);}
 }
 async function toggle(routine:Routine){
  if(busy)return;setBusy(true);try{const changed=await rpc.call("setRoutineEnabled",{projectId,automationId:routine.id,enabled:!routine.enabled});setRoutines(v=>v.map(r=>r.id===changed.id?changed:r));setError("");}catch(e){setError(e instanceof Error?e.message:"Routine status could not be confirmed. Refresh before retrying.");}finally{setBusy(false);}
 }
 function edit(r:Routine){setEditing(r.id);setName(r.name);setPrompt(r.execution?.prompt??"");setThreadId(r.execution?.targetThreadId??"");setPaused(!r.enabled);setOnce(r.trigger?.triggerType==="once");if(r.trigger?.triggerType==="schedule"){setCron(r.trigger.cron);setTimezone(r.trigger.timezone);}else if(r.trigger?.triggerType==="once"){const date=new Date(r.trigger.runAt);setRunAt(new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16));}}
 async function remove(r:Routine){if(busy)return;setBusy(true);try{await rpc.call("deleteRoutine",{projectId,automationId:r.id});setRoutines(v=>v.filter(v=>v.id!==r.id));setDeleting(null);setError("");}catch(e){setError(e instanceof Error?e.message:"Delete could not be confirmed. Refresh before retrying.");}finally{setBusy(false);}}
 return <>
  <p>Schedule a prompt for a real agent. Its current model, environment and permissions are inherited. Saving schedules future runs. Prompts separated by && on its own line run as separate ordered steps.</p>
  {error&&<p role="alert">{error}</p>}
  <button disabled={busy} onClick={()=>void refresh()}>Refresh routines</button>
  {routines.map(r=><section className="library-card" key={r.id}><h3>{r.name}</h3><p>{r.enabled?"Active":"Paused"}{r.nextRunAt?` · Next ${new Date(r.nextRunAt).toLocaleString()}`:""}</p>{r.chainState&&<p>{r.chainState.status} · {r.chainState.step}/{r.chainState.total} steps{r.chainState.error?` · ${r.chainState.error}`:""}</p>}{r.lastRunStatus&&<p>Last run: {r.lastRunStatus}</p>}{r.lastError&&<p role="alert">{r.lastError}</p>}<button disabled={busy} onClick={()=>void toggle(r)}>{r.enabled?"Pause":"Activate"}</button>{(r.execution?.mode==="agent"||r.execution?.mode==="chain")&&<button disabled={busy} onClick={()=>edit(r)}>Edit</button>}{deleting===r.id?<><p>Delete “{r.name}” and its saved schedule?</p><button disabled={busy} className="danger" onClick={()=>void remove(r)}>Confirm delete routine</button><button onClick={()=>setDeleting(null)}>Keep routine</button></>:<button disabled={busy} className="danger" onClick={()=>setDeleting(r.id)}>Delete</button>}</section>)}
  <h3>{editing?"Edit routine":"New routine"}</h3>{editing&&<button onClick={()=>{setEditing(null);setName("");setPrompt("");}}>Cancel edit</button>}
  <label>Name<input value={name} maxLength={200} onChange={e=>setName(e.target.value)}/></label>
  <label>Agent<select value={threadId} onChange={e=>setThreadId(e.target.value)}><option value="">Choose an agent</option>{targets.map(t=><option key={t.id} value={t.id}>{t.title} · {t.provider}</option>)}</select></label>
  <label>Prompt<textarea value={prompt} maxLength={30000} onChange={e=>setPrompt(e.target.value)}/></label>
  <label className="check"><input type="checkbox" checked={paused} onChange={e=>setPaused(e.target.checked)}/>Keep paused</label>
  <label className="check"><input type="checkbox" checked={once} onChange={e=>setOnce(e.target.checked)}/>Run once</label>
  {once?<label>Run at (local time)<input type="datetime-local" value={runAt} onChange={e=>setRunAt(e.target.value)}/></label>:<><label>Schedule (minute hour day month weekday)<input value={cron} maxLength={100} onChange={e=>setCron(e.target.value)}/></label><label>Timezone<input value={timezone} maxLength={100} onChange={e=>setTimezone(e.target.value)}/></label></>}
  <p>{once?`One run: ${runAt||"choose a time"}`:`Recurring: ${cron} in ${timezone}`} · Target: {targets.find(t=>t.id===threadId)?.title??"choose an agent"}</p>
  <button disabled={busy||!threadId||!name.trim()||!prompt.trim()||(once&&!runAt)} onClick={()=>void create()}>{editing?"Save routine changes":paused?"Save paused routine":"Save & schedule routine"}</button>
 </>;
}
