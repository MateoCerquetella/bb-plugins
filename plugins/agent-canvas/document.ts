import { z } from "zod";
import type { Box } from "./graph.ts";
const id = z.string().min(1).max(240);
const coordinate = z.number().finite().min(-100000).max(100000);
export const boxSchema = z.object({ x: coordinate, y: coordinate, w: z.number().finite().min(120).max(4000), h: z.number().finite().min(80).max(4000) });
const point = z.object({ x: z.number().finite().min(-10000).max(10000), y: z.number().finite().min(-10000).max(10000) });
export const strokeSchema = z.object({ points: z.array(point).min(1).max(2000), color: z.string().regex(/^#[a-fA-F0-9]{6}$/), width: z.number().min(1).max(20) });
export const nodeSchema = z.object({
  id, kind: z.enum(["note", "text", "drawing", "files", "portal", "agent"]), workspaceId: id,
  environmentId: id.nullable(), title: z.string().max(240), box: boxSchema,
  content: z.string().max(200000), color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  locked: z.boolean(), blurred: z.boolean(), strokes: z.array(strokeSchema).max(100),
  url: z.string().max(2000).refine(v => { if (!v) return true; try { return ["http:","https:"].includes(new URL(v).protocol); } catch { return false; } }),
  roleId: id.nullable(), threadId: id.nullable(),
});
export const edgeSchema = z.object({ id, source: id, target: id });
const groupSchema = z.object({ id, title: z.string().max(240), members: z.array(id).min(2).max(200) });
export const roleSchema = z.object({ id, name: z.string().min(1).max(120), color: z.string().regex(/^#[a-fA-F0-9]{6}$/), instructions: z.string().max(30000), maestro: z.boolean() });
const presentationSchema = z.object({ box: boxSchema.optional(), locked: z.boolean().default(false), blurred: z.boolean().default(false), roleId: id.nullable().default(null) });
export const ensembleSchema = z.object({ id, title: z.string().min(1).max(240), nodes: z.array(nodeSchema).max(200), edges: z.array(edgeSchema).max(400), groups: z.array(groupSchema).max(100) });
const collectionSchema = z.object({ id, title: z.string().min(1).max(240), members: z.array(id).max(200) });
const baseSchema = z.object({
  version: z.literal(1), nodes: z.array(nodeSchema).max(300), edges: z.array(edgeSchema).max(600), groups: z.array(groupSchema).max(150),
  roles: z.array(roleSchema).max(100), ensembles: z.array(ensembleSchema).max(50), collections: z.array(collectionSchema).max(100),
  presentations: z.record(id, presentationSchema).refine(v=>Object.keys(v).length<=300),
  viewports: z.record(id,z.object({x:coordinate,y:coordinate,zoom:z.number().finite().min(.1).max(1.5),environmentId:id.nullable()})).refine(v=>Object.keys(v).length<=100),
  settings: z.object({ nodeWidth:z.number().min(320).max(1500), nodeHeight:z.number().min(260).max(1500), noteWidth:z.number().min(120).max(1000), noteHeight:z.number().min(80).max(1000), grid:z.boolean() }),
});
export type CanvasDocument = z.infer<typeof baseSchema>;
export type CanvasNode = z.infer<typeof nodeSchema>;
export type CanvasRole = z.infer<typeof roleSchema>;
export type Ensemble = z.infer<typeof ensembleSchema>;
function duplicates(values:string[]) { return new Set(values).size!==values.length; }
export const documentSchema = baseSchema.superRefine((d,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:"custom",message});
  for(const [label,values] of Object.entries({nodes:d.nodes,edges:d.edges,groups:d.groups,roles:d.roles,ensembles:d.ensembles,collections:d.collections})) if(duplicates(values.map(v=>v.id))) fail(`Duplicate ${label} IDs`);
  const known=new Set([...d.nodes.map(n=>n.id),...Object.keys(d.presentations)]);
  const roles=new Set(d.roles.map(r=>r.id));
  if(d.nodes.some(n=>n.roleId&&!roles.has(n.roleId)))fail("Unknown node role");
  if(Object.values(d.presentations).some(p=>p.roleId&&!roles.has(p.roleId)))fail("Unknown presentation role");
  for(const edge of d.edges) if(edge.source===edge.target||!known.has(edge.source)||!known.has(edge.target))fail("Dangling or self connection");
  if(duplicates(d.edges.map(e=>[e.source,e.target].sort().join("\0"))))fail("Duplicate connections");
  const grouped=new Set<string>();
  for(const group of d.groups){if(duplicates(group.members)||group.members.some(v=>!known.has(v)||grouped.has(v)))fail("Invalid group membership");for(const member of group.members)grouped.add(member);}
  for(const collection of d.collections)if(duplicates(collection.members)||collection.members.some(v=>!d.nodes.some(n=>n.id===v&&n.kind==="note")))fail("Invalid note collection");
  for(const ensemble of d.ensembles){
    const ids=new Set(ensemble.nodes.map(n=>n.id)),members=new Set<string>();
    if(duplicates(ensemble.nodes.map(n=>n.id))||duplicates(ensemble.edges.map(e=>e.id))||duplicates(ensemble.groups.map(g=>g.id))||duplicates(ensemble.edges.map(e=>[e.source,e.target].sort().join("\0")))||ensemble.edges.some(e=>e.source===e.target||!ids.has(e.source)||!ids.has(e.target)))fail("Invalid ensemble references");
    for(const group of ensemble.groups){if(duplicates(group.members)||group.members.some(v=>!ids.has(v)||members.has(v)))fail("Invalid ensemble group membership");for(const member of group.members)members.add(member);}
  }
});
export function emptyDocument():CanvasDocument{return {version:1,nodes:[],edges:[],groups:[],roles:[],ensembles:[],collections:[],presentations:{},viewports:{},settings:{nodeWidth:540,nodeHeight:420,noteWidth:320,noteHeight:300,grid:true}};}
export const newId=()=>crypto.randomUUID();
export const snap=(v:number)=>Math.round(v/20)*20;
export const boundedBox=(box:Box):Box=>({x:Math.max(-100000,Math.min(100000,box.x)),y:Math.max(-100000,Math.min(100000,box.y)),w:Math.max(120,Math.min(4000,box.w)),h:Math.max(80,Math.min(4000,box.h))});
export function createNode(kind:CanvasNode["kind"],workspaceId:string,box:Box,environmentId:string|null=null):CanvasNode{return {id:newId(),kind,workspaceId,environmentId,title:{note:"New note",text:"Text",drawing:"Drawing",files:"Files",portal:"Browser portal",agent:"Agent template"}[kind],box:boundedBox(box),content:"",color:kind==="note"?"#fff8bd":"#78a5ed",locked:false,blurred:false,strokes:[],url:"",roleId:null,threadId:null};}
export function presentation(d:CanvasDocument,id:string){const n=d.nodes.find(n=>n.id===id);return n??d.presentations[id]??{locked:false,blurred:false,roleId:null};}
export function setPresentation(d:CanvasDocument,id:string,patch:Partial<CanvasDocument["presentations"][string]>):CanvasDocument{return d.nodes.some(n=>n.id===id)?{...d,nodes:d.nodes.map(n=>n.id===id?{...n,...patch}:n)}:{...d,presentations:{...d.presentations,[id]:{...presentation(d,id),...patch}}};}
export function moveNodes(d:CanvasDocument,ids:string[],dx:number,dy:number,boxes:Map<string,Box>,grid=false):CanvasDocument{
  let next=d;for(const id of ids){if(presentation(d,id).locked)continue;const b=boxes.get(id);if(!b)continue;next=setPresentation(next,id,{box:boundedBox({...b,x:grid?snap(b.x+dx):b.x+dx,y:grid?snap(b.y+dy):b.y+dy})});}return next;
}
export function removeNodes(d:CanvasDocument,ids:string[]):CanvasDocument{const set=new Set(ids);return {...d,nodes:d.nodes.filter(n=>!set.has(n.id)),presentations:Object.fromEntries(Object.entries(d.presentations).filter(([id])=>!set.has(id))),edges:d.edges.filter(e=>!set.has(e.source)&&!set.has(e.target)),groups:d.groups.map(g=>({...g,members:g.members.filter(id=>!set.has(id))})).filter(g=>g.members.length>=2),collections:d.collections.map(c=>({...c,members:c.members.filter(id=>!set.has(id))}))};}
export function connect(d:CanvasDocument,source:string,target:string):CanvasDocument{
 if(source===target||d.edges.some(e=>[e.source,e.target].includes(source)&&[e.source,e.target].includes(target)))return d;
 let next=d;for(const id of [source,target])if(!next.nodes.some(n=>n.id===id)&&!next.presentations[id])next=setPresentation(next,id,{});
 return {...next,edges:[...next.edges,{id:newId(),source,target}]};
}
export function groupNodes(d:CanvasDocument,ids:string[],title="Group"):CanvasDocument{if(ids.length<2)return d;let next=d;for(const id of ids)if(!next.nodes.some(n=>n.id===id)&&!next.presentations[id])next=setPresentation(next,id,{});const members=[...new Set(ids)];return {...next,groups:[...next.groups.map(g=>({...g,members:g.members.filter(id=>!members.includes(id))})).filter(g=>g.members.length>=2),{id:newId(),title,members}]};}
export function ungroupNodes(d:CanvasDocument,ids:string[]):CanvasDocument{return {...d,groups:d.groups.filter(g=>!g.members.some(id=>ids.includes(id)))};}
export function bounds(boxes:Box[]):Box|null{if(!boxes.length)return null;const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));return {x,y,w:Math.max(...boxes.map(b=>b.x+b.w))-x,h:Math.max(...boxes.map(b=>b.y+b.h))-y};}
export type Arrangement="left"|"center-x"|"right"|"top"|"center-y"|"bottom"|"distribute-x"|"distribute-y"|"tidy";
export function arrange(d:CanvasDocument,ids:string[],boxes:Map<string,Box>,mode:Arrangement):CanvasDocument{
 const eligible=ids.filter(id=>boxes.has(id)&&!presentation(d,id).locked);if(eligible.length<2)return d;const total=bounds(eligible.map(id=>boxes.get(id)!))!;let next=d;
 let ordered=eligible;if(mode.startsWith("distribute"))ordered=[...eligible].sort((a,b)=>boxes.get(a)![mode==="distribute-x"?"x":"y"]-boxes.get(b)![mode==="distribute-x"?"x":"y"]||a.localeCompare(b));
 const horizontal=mode==="distribute-x",sum=ordered.reduce((s,id)=>s+boxes.get(id)![horizontal?"w":"h"],0);const gap=((horizontal?total.w:total.h)-sum)/(ordered.length-1);let cursor=horizontal?total.x:total.y;
 const columns=Math.ceil(Math.sqrt(ordered.length)),cellW=Math.max(...ordered.map(id=>boxes.get(id)!.w))+20,cellH=Math.max(...ordered.map(id=>boxes.get(id)!.h))+20;
 ordered.forEach((id,i)=>{const b={...boxes.get(id)!};if(mode==="left")b.x=total.x;if(mode==="right")b.x=total.x+total.w-b.w;if(mode==="center-x")b.x=total.x+(total.w-b.w)/2;if(mode==="top")b.y=total.y;if(mode==="bottom")b.y=total.y+total.h-b.h;if(mode==="center-y")b.y=total.y+(total.h-b.h)/2;if(mode.startsWith("distribute")){b[horizontal?"x":"y"]=cursor;cursor+=b[horizontal?"w":"h"]+gap;}if(mode==="tidy"){b.x=total.x+(i%columns)*cellW;b.y=total.y+Math.floor(i/columns)*cellH;}next=setPresentation(next,id,{box:boundedBox(b)});});return next;
}
export function magneticBox(box:Box,others:Box[],threshold=12):Box{let x=box.x,y=box.y,bestX=threshold,bestY=threshold;for(const b of others){for(const v of [b.x,b.x+b.w,b.x-box.w,b.x+b.w-box.w])if(Math.abs(v-box.x)<bestX){bestX=Math.abs(v-box.x);x=v;}for(const v of [b.y,b.y+b.h,b.y-box.h,b.y+b.h-box.h])if(Math.abs(v-box.y)<bestY){bestY=Math.abs(v-box.y);y=v;}}return boundedBox({...box,x,y});}
export function extractEnsemble(d:CanvasDocument,ids:string[],boxes:Map<string,Box>,threadNames:Map<string,string>=new Map()):Ensemble{
 const selected=new Set(ids),frame=bounds(ids.flatMap(id=>boxes.has(id)?[boxes.get(id)!]:[]))??{x:0,y:0,w:1,h:1};
 const nodes=ids.flatMap(id=>{const b=boxes.get(id);if(!b)return [];const n=d.nodes.find(n=>n.id===id)??{...createNode("agent","template",b),...presentation(d,id)};return [{...n,id,threadId:null,title:threadNames.get(id)??n.title,box:{...b,x:b.x-frame.x,y:b.y-frame.y}}];});
 return {id:newId(),title:"New ensemble",nodes,edges:d.edges.filter(e=>selected.has(e.source)&&selected.has(e.target)),groups:d.groups.filter(g=>g.members.every(id=>selected.has(id)))};
}
export function placeEnsemble(d:CanvasDocument,e:Ensemble,workspaceId:string,environmentId:string|null,x:number,y:number):{document:CanvasDocument;ids:string[]}{
 const mapping=new Map(e.nodes.map(n=>[n.id,newId()]));const nodes=e.nodes.map(n=>({...n,id:mapping.get(n.id)!,workspaceId,environmentId,threadId:null,roleId:d.roles.some(r=>r.id===n.roleId)?n.roleId:null,box:boundedBox({...n.box,x:n.box.x+x,y:n.box.y+y})}));
 return {document:{...d,nodes:[...d.nodes,...nodes],edges:[...d.edges,...e.edges.map(edge=>({id:newId(),source:mapping.get(edge.source)!,target:mapping.get(edge.target)!}))],groups:[...d.groups,...e.groups.map(g=>({...g,id:newId(),members:g.members.map(id=>mapping.get(id)!)}))]},ids:nodes.map(n=>n.id)};
}
export function importDocument(raw:string):CanvasDocument{if(raw.length>5_000_000)throw Error("Canvas import exceeds 5 MB");return documentSchema.parse(JSON.parse(raw));}
export function exportDocument(d:CanvasDocument):string{return JSON.stringify(documentSchema.parse(d),null,2);}
export function readDocument():CanvasDocument{try{const raw=localStorage.getItem("agent-canvas:document:v1");return raw?importDocument(raw):emptyDocument();}catch{return emptyDocument();}}
export function writeDocument(d:CanvasDocument):void{localStorage.setItem("agent-canvas:document:v1",exportDocument(d));}
export type History={past:CanvasDocument[];present:CanvasDocument;future:CanvasDocument[]};
export function commit(h:History,d:CanvasDocument):History{if(h.present===d)return h;return {past:[...h.past,h.present].slice(-60),present:documentSchema.parse(d),future:[]};}
export function undo(h:History):History{return h.past.length?{past:h.past.slice(0,-1),present:h.past[h.past.length-1],future:[h.present,...h.future].slice(0,60)}:h;}
export function redo(h:History):History{return h.future.length?{past:[...h.past,h.present].slice(-60),present:h.future[0],future:h.future.slice(1)}:h;}
