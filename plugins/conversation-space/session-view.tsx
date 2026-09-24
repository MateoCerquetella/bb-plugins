import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRpc } from '@get-bb/plugin-sdk/app';
import type { rpcContract } from './server';
import { mergeMessages, type SessionMessage } from './session';
import type { Snapshot } from './app';
const exact=(value:number|null|undefined)=>value==null?'Not reported':value.toLocaleString('en-US');
const date=(value:number|null|undefined)=>value==null?'Not reported':new Date(value).toLocaleString();
export function SessionUsage({threadId,usage,onClose,children}:{threadId:string;usage:Snapshot|null;onClose:()=>void;children:ReactNode}) {
 const rpc=useRpc<typeof rpcContract>();
 const dialog=useRef<HTMLDialogElement>(null);
 const alive=useRef(true);
 const [messages,setMessages]=useState<SessionMessage[]>([]);
 const [started,setStarted]=useState<number|null>(null);
 const [cursor,setCursor]=useState<string|null>(null);
 const [busy,setBusy]=useState(true),[error,setError]=useState('');
 const [query,setQuery]=useState(''),[role,setRole]=useState('all'),[copied,setCopied]=useState('');
 useEffect(()=>{
  alive.current=true;dialog.current?.showModal();
  void rpc.call('session',{threadId}).then(result=>{if(alive.current){setMessages(result.messages);setStarted(result.startedAt);setCursor(result.nextCursor);}}).catch(()=>{if(alive.current)setError('Could not load message records. Close and reopen to retry.');}).finally(()=>{if(alive.current)setBusy(false);});
  return ()=>{alive.current=false;};
 },[rpc,threadId]);
 async function loadMore(){if(!cursor||busy)return;setBusy(true);setError('');try{const result=await rpc.call('session',{threadId,beforeSeq:cursor});if(alive.current){setMessages(previous=>mergeMessages(previous,result.messages));setCursor(result.nextCursor);}}catch{if(alive.current)setError('Could not load older records. Try again.');}finally{if(alive.current)setBusy(false);}}
 async function copy(){try{await navigator.clipboard.writeText(JSON.stringify({threadId,source:'BB recorded events, not a complete provider wire transcript',usage,startedAt:started,hasOlderRecords:cursor!==null,messages},null,2));if(alive.current)setCopied('Copied');}catch{if(alive.current)setCopied('Copy failed');}}
 const users=messages.filter(m=>m.role==='user').length,replies=messages.filter(m=>m.role==='assistant').length;
 const lastReply=messages.find(m=>m.role==='assistant')?.at;
 const visible=messages.filter(m=>(role==='all'||m.role===role)&&`${m.id} ${m.type} ${m.raw}`.toLowerCase().includes(query.toLowerCase()));
 const model=usage?.jev?.state==='recorded'?usage.jev.lastModel:usage?.model;
 return <dialog ref={dialog} className="cs-session" aria-label="Session usage" onCancel={onClose} onClose={onClose}>
  <header><h2>Session usage</h2><div><button type="button" onClick={()=>void copy()} disabled={busy}>▢ Copy JSON</button><span role="status">{copied}</span><button type="button" className="cs-session-close" aria-label="Close session usage" onClick={onClose}>×</button></div></header>
  <div className="cs-session-summary"><div><span>Model</span><strong>{model??'Not reported'} {usage?.provider?`(${usage.provider})`:''}</strong><small>Billing plan not reported</small></div><div><span>Total cost</span><strong>Not reported</strong></div><div><span>Messages</span><strong>{busy&&!messages.length?'Loading…':users+replies}{cursor?' loaded':''}</strong><small>{cursor?'Older records available':'Recorded user and assistant messages'}</small></div></div>
  <div className="cs-session-columns"><section><div className="cs-row"><h3>Context used</h3><b>{usage?.percent==null?'Not reported':`${usage.percent}%`}</b></div><progress max={100} value={usage?.percent??0}/><p className="cs-session-capacity">{exact(usage?.used)} / {exact(usage?.capacity)}</p>
   <div className="cs-context-categories">{[['Your messages','user'],['Replies','reply'],['Tool results','tool'],['Other','other']].map(([name,color])=><div className="cs-row" key={name}><span><i className={`cs-dot-${color}`}/>{name}</span><span>Not reported</span></div>)}</div><p className="cs-session-note">The provider reports total context usage, but does not attribute context tokens to these categories. No category sizes are estimated.</p>
  </section><section><h3>Details</h3><dl>{[
   ['Input tokens (latest call)',exact(usage?.totalInput)],['Output tokens (latest call)',exact(usage?.output)],['Reasoning tokens',exact(usage?.reasoning)],['Cache read / write',`${exact(usage?.cached)} / Not reported`],['Your messages',`${users}${cursor?' loaded':''}`],['Assistant replies',`${replies}${cursor?' loaded':''}`],['Session started',date(started)],['Last recorded reply',date(lastReply)]
  ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section></div>
  <details className="cs-session-routing"><summary>Usage and Jev diagnostics</summary>{children}</details>
  <details className="cs-raw" open><summary>Raw message data <span>{messages.length}{cursor?'+':''}</span></summary><div className="cs-raw-body"><p>BB’s recorded input, replies and tool events. This is not the complete provider wire transcript. Search and filters apply to loaded records; long records are visibly truncated.</p>
   <div className="cs-message-controls"><input aria-label="Search messages" placeholder="Search messages" value={query} onChange={e=>setQuery(e.target.value)}/><div role="group" aria-label="Filter messages">{[['all','All'],['user','You'],['assistant','Assistant'],['tool','Tools']].map(([value,label])=><button type="button" key={value} aria-pressed={role===value} onClick={()=>setRole(value)}>{label}</button>)}</div></div>
   {error&&<p role="alert">{error}</p>}{busy&&<p role="status">Loading records…</p>}
   {!busy&&!error&&!visible.length&&<p>No matching records.</p>}
   <div className="cs-message-list">{visible.map(message=><details key={message.id} className="cs-message"><summary><span className={`cs-role cs-role-${message.role}`}>{message.role}</span><code>{message.id}</code><time>{date(message.at)}</time><span>⌄</span></summary>{message.truncated&&<p>Truncated to 12,000 characters.</p>}<pre>{message.raw}</pre></details>)}</div>
   {cursor&&<button type="button" className="cs-load-more" disabled={busy} onClick={()=>void loadMore()}>Load older records</button>}
  </div></details>
 </dialog>;
}
