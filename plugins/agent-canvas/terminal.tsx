import {useEffect,useRef,useState} from "react";
import {useSdk} from "@get-bb/plugin-sdk/app";
import {Terminal} from "@xterm/xterm";
import {FitAddon} from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

type Session={id:string;title:string;status:string};
const encode=(data:string)=>{
 const bytes=new TextEncoder().encode(data);let binary="";
 for(const value of bytes)binary+=String.fromCharCode(value);
 return btoa(binary);
};
export function ThreadTerminal({threadId}:{threadId:string}){
 const sdk=useSdk(),root=useRef<HTMLDivElement>(null),surface=useRef<HTMLDivElement>(null);
 const [sessions,setSessions]=useState<Session[]>([]),[selected,setSelected]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[visible,setVisible]=useState(false),[status,setStatus]=useState("");
 const reconnectKey=useRef(0),[generation,setGeneration]=useState(0);
 useEffect(()=>{const observer=new IntersectionObserver(([e])=>setVisible(e.isIntersecting),{rootMargin:"160px"});if(root.current)observer.observe(root.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{let disposed=false;void sdk.terminals.list({scope:{kind:"thread",threadId}}).then(r=>{if(disposed)return;setSessions(r.sessions);setSelected(current=>r.sessions.some(s=>s.id===current)?current:r.sessions.find(s=>s.status==="running")?.id??r.sessions[0]?.id??"");setError("");}).catch(e=>{if(!disposed)setError(e instanceof Error?e.message:"Thread terminals are unavailable.");});return()=>{disposed=true;};},[sdk,threadId,generation]);
 async function create(){if(busy)return;setBusy(true);try{const session=await sdk.terminals.create({scope:{kind:"thread",threadId},cols:80,rows:24,title:"Canvas shell"});setSessions(v=>[...v,session]);setSelected(session.id);setError("");}catch(e){setError(e instanceof Error?e.message:"Terminal creation could not be confirmed. Refresh before creating again.");}finally{setBusy(false);}}
 async function close(){if(!selected||busy)return;setBusy(true);try{const result=await sdk.terminals.close({terminalId:selected,mode:"if-clean"});setSessions(v=>v.map(s=>s.id===result.id?result:s));setStatus(result.status);setError("");}catch(e){setError(e instanceof Error?e.message:"The terminal is busy; return to it before closing.");}finally{setBusy(false);}}
 useEffect(()=>{
  const element=surface.current;if(!element||!selected||!visible)return;
  let disposed=false,failedInput=false,sequence:number|undefined,timer:ReturnType<typeof setTimeout>|undefined,resizeTimer:ReturnType<typeof setTimeout>|undefined,inputQueue=Promise.resolve();
  const terminal=new Terminal({fontSize:12,scrollback:3000,cursorBlink:true,convertEol:false,screenReaderMode:true,linkHandler:{activate:()=>setError("Use a canvas portal to open terminal links in the project browser.")},theme:{background:"#1c1d21",foreground:"#e4e4e9"}}),fit=new FitAddon();
  terminal.loadAddon(fit);terminal.open(element);
  const input=terminal.onData(data=>{
   inputQueue=inputQueue.then(async()=>{if(disposed||failedInput)return;await sdk.terminals.input({terminalId:selected,dataBase64:encode(data)});}).catch(()=>{if(!disposed){failedInput=true;terminal.options.disableStdin=true;setError("Terminal input could not be confirmed. Reconnect before typing again; input is not replayed.");}});
  });
  const resize=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(disposed||!element.clientWidth||!element.clientHeight)return;try{fit.fit();void sdk.terminals.resize({terminalId:selected,cols:terminal.cols,rows:terminal.rows}).catch(()=>{if(!disposed)setError("Terminal size could not be synchronized.");});}catch{/* Wait for a visible layout. */}},150);};
  const observer=new ResizeObserver(resize);observer.observe(element);resize();
  async function poll(){
   if(disposed)return;
   try{
    if(document.visibilityState==="visible"){
     const result=await sdk.terminals.output({terminalId:selected,sinceSeq:sequence,tailBytes:100000,limitChunks:200});
     if(disposed)return;
     if(result.truncated)terminal.write("\r\n[Earlier terminal output omitted]\r\n");
     for(const chunk of result.chunks){const bytes=Uint8Array.from(atob(chunk.dataBase64),c=>c.charCodeAt(0));terminal.write(bytes);}
     sequence=result.nextSeq;setStatus(result.status);
    }
   }catch(e){if(!disposed)setError(e instanceof Error?e.message:"Terminal output is unavailable. Reconnect to retry.");}
   if(!disposed)timer=setTimeout(()=>void poll(),600);
  }
  void poll();
  return()=>{disposed=true;clearTimeout(timer);clearTimeout(resizeTimer);observer.disconnect();input.dispose();terminal.dispose();};
 },[sdk,selected,visible,generation]);
 return <div className="thread-terminal native-chat" ref={root}>
  <div className="terminal-tools"><select aria-label="Thread terminal" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose a shell</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.title} · {s.status}</option>)}</select><button disabled={busy} onClick={()=>void create()}>New shell</button><button onClick={()=>{reconnectKey.current++;setGeneration(reconnectKey.current);}}>Reconnect</button><button disabled={!selected||busy} onClick={()=>void close()}>Close clean shell</button></div>
  <small className="dim">{status||"Native BB shell"} · Separate from the agent’s provider runtime</small>
  {error&&<p role="alert">{error}</p>}
  {!selected&&<p>Create or choose a real shell on this thread's environment. Opening this view alone starts no process.</p>}
  <div className="terminal-screen" ref={surface}/>
 </div>;
}
