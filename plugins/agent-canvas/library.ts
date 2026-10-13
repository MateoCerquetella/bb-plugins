import {z} from "zod";
import {documentSchema,emptyDocument,ensembleSchema,roleSchema,newId,placeEnsemble,type CanvasDocument,type Ensemble} from "./document.ts";
const librarySchema=z.object({
 format:z.literal("agent-canvas-library"),version:z.literal(1),
 kind:z.enum(["ensembles","collections"]),items:z.array(ensembleSchema).max(50),roles:z.array(roleSchema).max(100),
}).strict();
export function exportLibrary(d:CanvasDocument,kind:"ensembles"|"collections",items:Ensemble[]):string{
 const roles=d.roles.filter(r=>items.some(e=>e.nodes.some(n=>n.roleId===r.id)));
 return JSON.stringify(librarySchema.parse({format:"agent-canvas-library",version:1,kind,items,roles}),null,2);
}
export function importLibrary(d:CanvasDocument,raw:string):CanvasDocument{
 if(raw.length>2_000_000)throw Error("Library import exceeds 2 MB");
 const library=librarySchema.parse(JSON.parse(raw));
 documentSchema.parse({...emptyDocument(),roles:library.roles,ensembles:library.kind==="ensembles"?library.items:[],collectionTemplates:library.kind==="collections"?library.items:[]});
 const knownRoles=new Set(library.roles.map(r=>r.id));
 if(library.items.some(e=>e.nodes.some(n=>n.roleId&&!knownRoles.has(n.roleId))))throw Error("Library contains an unknown role reference");
 const mapping=new Map(library.roles.map(r=>[r.id,newId()]));
 const roles=library.roles.map(r=>({...r,id:mapping.get(r.id)!}));
 const items=library.items.map(e=>{
  const ids=new Map(e.nodes.map(n=>[n.id,newId()]));
  return {...e,id:newId(),nodes:e.nodes.map(n=>({...n,id:ids.get(n.id)!,roleId:n.roleId?mapping.get(n.roleId)??null:null,threadId:null})),edges:e.edges.map(edge=>({...edge,id:newId(),source:ids.get(edge.source)!,target:ids.get(edge.target)!})),groups:e.groups.map(g=>({...g,id:newId(),members:g.members.map(id=>ids.get(id)!)}))};
 });
 return documentSchema.parse({...d,roles:[...d.roles,...roles],ensembles:library.kind==="ensembles"?[...d.ensembles,...items]:d.ensembles,collectionTemplates:library.kind==="collections"?[...d.collectionTemplates,...items]:d.collectionTemplates});
}
export function placeCollection(d:CanvasDocument,template:Ensemble,workspaceId:string,environmentId:string|null,x:number,y:number){
 if(template.nodes.some(n=>n.kind!=="note"))throw Error("A note collection may contain only notes");
 const placed=placeEnsemble(d,template,workspaceId,environmentId,x,y);
 return {document:documentSchema.parse({...placed.document,collections:[...placed.document.collections,{id:newId(),title:template.title,members:placed.ids}]}),ids:placed.ids};
}
