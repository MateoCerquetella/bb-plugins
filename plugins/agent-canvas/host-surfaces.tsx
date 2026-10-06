import {useEffect,useState} from "react";
import {useSdk} from "@get-bb/plugin-sdk/app";

export function useHostWorkspaces(capturedAt:number){
 const sdk=useSdk();
 const [projects,setProjects]=useState<{id:string;name:string}[]>([]);
 const [floors,setFloors]=useState<{id:string;projectId:string;name:string;branch:string;status:string}[]>([]);
 useEffect(()=>{let disposed=false;void Promise.allSettled([sdk.projects.list({includePersonal:true}),sdk.environments.list({limit:200})]).then(([p,e])=>{if(disposed)return;if(p.status==="fulfilled")setProjects(p.value.map(v=>({id:v.id,name:v.name})));if(e.status==="fulfilled")setFloors(e.value.map(v=>({id:v.id,projectId:v.projectId,name:v.name??v.branchName??"Workspace",branch:v.branchName??"",status:v.status})));});return()=>{disposed=true;};},[sdk,capturedAt]);
 return {projects,floors};
}

export function FloorReview({environmentId,onOpenThread,threadId}:{environmentId:string;onOpenThread:(id:string)=>void;threadId?:string}){
 const sdk=useSdk();const [branch,setBranch]=useState(""),[files,setFiles]=useState<{path:string;additions:number;deletions:number}[]>([]),[pr,setPr]=useState<{title:string;state:string;checks:string;attention:string}|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(true);
 useEffect(()=>{let disposed=false;setBusy(true);setError("");void Promise.allSettled([sdk.environments.get({environmentId}),sdk.environments.diffFiles({environmentId,target:"uncommitted"}),sdk.environments.pullRequest({environmentId})]).then(([env,diff,pull])=>{if(disposed)return;if(env.status==="fulfilled")setBranch(env.value.branchName??"No branch");else setError("This floor is unavailable.");if(diff.status==="fulfilled"&&diff.value.outcome==="available")setFiles(diff.value.files);else setError(e=>e||"Changes could not be loaded.");if(pull.status==="fulfilled"&&pull.value.outcome==="available"){const p=pull.value.pullRequest;setPr({title:p.title,state:p.state,checks:p.checks.state,attention:p.attention});}else setPr(null);setBusy(false);});return()=>{disposed=true;};},[sdk,environmentId]);
 return <><p>{branch}{busy?" · Loading…":""}</p>{error&&<p role="alert">{error}</p>}<h3>Uncommitted changes</h3>{!busy&&!files.length&&!error&&<p>No uncommitted changes.</p>}{files.map(f=><p key={f.path}>{f.path} <small>+{f.additions} / −{f.deletions}</small></p>)}{pr&&<><h3>{pr.title}</h3><p>{pr.state} · {pr.checks} checks · {pr.attention.replaceAll("_"," ")}</p></>}{threadId?<><button onClick={()=>onOpenThread(threadId)}>Open floor in BB</button><p className="dim">Review the full diff and use the floor's native commit, pull request and landing actions in BB.</p></>:<p className="dim">Create an agent on this floor to open its native review and landing actions.</p>}</>;
}
