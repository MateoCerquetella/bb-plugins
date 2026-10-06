import {useState} from "react";
import {useSdk} from "@get-bb/plugin-sdk/app";
import {z} from "zod";
import type {CanvasNode} from "./document";
const portalResult=z.object({url:z.string(),title:z.string(),viewerUrl:z.string().url()});
export function Portal({node,onSave}:{node:CanvasNode;onSave:(url:string)=>void}){
 const sdk=useSdk();const [url,setUrl]=useState(node.url),[viewer,setViewer]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[location,setLocation]=useState("");
 async function navigate(){
  if(busy)return;setError("");
  let target:URL;
  try{target=new URL(url);if(!["http:","https:"].includes(target.protocol)||target.username||target.password)throw Error("Use an HTTP(S) URL without embedded credentials.");}catch(e){setError(e instanceof Error?e.message:"Enter a website URL.");return;}
  setBusy(true);
  try{const result=await sdk.plugins.callRpc({pluginId:"steel-browser",method:"navigate",input:{scope:{projectId:node.workspaceId},url:target.href},outputSchema:portalResult});setViewer(result.viewerUrl);setLocation(result.title||result.url);onSave(result.url);}catch(e){setError(e instanceof Error?e.message:"Project browser unavailable. Your URL draft is retained.");}finally{setBusy(false);}
 }
 return <div className="resource-body interactive-portal"><label>Website URL<input aria-label="Portal URL" value={url} maxLength={2000} onChange={e=>setUrl(e.target.value)} placeholder="https://…"/></label><button disabled={busy} onClick={()=>void navigate()}>{busy?"Opening…":"Open in project browser"}</button>{error&&<p role="alert">{error}</p>}{viewer?<><span className="dim">{location} · shared project session</span><iframe title={`Interactive project browser for ${node.title}`} src={viewer} allow="clipboard-read; clipboard-write; fullscreen"/><p className="dim">Enter website sign-in and MFA directly in this browser. If the viewer asks you to sign in to BB Connect, use its embedded sign-in controls.</p></>:<p>The project’s Steel browser opens here after navigation. All portal nodes in this workspace share that session.</p>}</div>;
}
