import {useEffect,useMemo,useState} from "react";
import {rankSearch,type SearchEntry} from "./search";
export function SearchPalette({entries,workspaceId}:{entries:SearchEntry[];workspaceId:string|null}){
 const [query,setQuery]=useState(""),[active,setActive]=useState(0);
 const results=useMemo(()=>rankSearch(entries,query,workspaceId),[entries,query,workspaceId]);
 useEffect(()=>{setActive(0);},[query]);
 const selected=Math.min(active,Math.max(0,results.length-1));
 useEffect(()=>{document.getElementById(`canvas-search-${selected}`)?.scrollIntoView({block:"nearest"});},[selected]);
 return <><input autoFocus role="combobox" aria-label="Search canvas" aria-expanded="true" aria-controls="canvas-search-results" aria-autocomplete="list" aria-activedescendant={results.length?`canvas-search-${selected}`:undefined} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Agents, notes, workspaces, actions…" onKeyDown={e=>{if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setActive(v=>results.length?(v+(e.key==="ArrowDown"?1:-1)+results.length)%results.length:0);}else if(e.key==="Enter"&&results[selected]){e.preventDefault();results[selected].run();}}}/><div id="canvas-search-results" role="listbox" aria-label="Canvas search results">{results.map((entry,i)=><button id={`canvas-search-${i}`} className="result" role="option" aria-selected={i===selected} key={entry.id} onMouseEnter={()=>setActive(i)} onClick={entry.run}><span>{entry.label}{entry.detail&&<small>{entry.detail}</small>}</span><small>{entry.kind}</small></button>)}</div>{!results.length&&<p>No matches. Try a name, workspace or words inside a note.</p>}<p className="dim">↑ / ↓ choose · Enter open · Esc return · Names, note contents and aliases are searched.</p></>;
}
