import {useEffect,useState} from "react";
import {useSdk} from "@get-bb/plugin-sdk/app";
import {z} from "zod";
const snapshotSchema=z.object({fetchedAt:z.string(),host:z.object({id:z.string().nullable(),name:z.string().nullable()}),providers:z.array(z.object({id:z.string(),name:z.string(),status:z.string(),planLabel:z.string().nullable(),windows:z.array(z.object({label:z.string(),usedPercent:z.number(),barPercent:z.number().min(0).max(100),resetsAt:z.string().nullable()}))}))});
export function ProviderUsage({threadId,providerId}:{threadId:string;providerId:string}){
 const sdk=useSdk();const [snapshot,setSnapshot]=useState<z.infer<typeof snapshotSchema>|null>(null),[error,setError]=useState("");
 useEffect(()=>{let disposed=false;void sdk.plugins.callRpc({pluginId:"usage-tracker",method:"getUsage",input:{threadId},outputSchema:snapshotSchema}).then(value=>{if(!disposed){setSnapshot(value);setError("");}}).catch(()=>{if(!disposed)setError("Provider limits are unavailable. Enable Usage Tracker and sign in to the provider on this host to see supported limits.");});return()=>{disposed=true;};},[sdk,threadId]);
 const normalized=providerId==="claude-code"?"claudeCode":providerId==="acp-cursor"?"cursor":providerId;
 const provider=snapshot?.providers.find(p=>p.id===normalized);
 return <section className="library-card"><h3>Provider usage</h3>{error?<p role="status">{error}</p>:!snapshot?<p>Loading host usage…</p>:provider?<><p>{provider.name} · {provider.planLabel??provider.status}{snapshot.host.name?` · ${snapshot.host.name}`:""}</p>{provider.windows.map((w,i)=><div key={i}><label>{w.label} · {Math.round(w.usedPercent)}% used<progress aria-label={`${w.label} usage`} value={w.barPercent} max={100}/></label>{w.resetsAt&&<small>Resets {new Date(w.resetsAt).toLocaleString()}</small>}</div>)}{!provider.windows.length&&<p>Usage meters are unavailable for this account.</p>}<small>Account limits on this host, observed {new Date(snapshot.fetchedAt).toLocaleTimeString()}; these are shared across its agent conversations.</small></>:<p>This provider does not report supported usage windows.</p>}</section>;
}
