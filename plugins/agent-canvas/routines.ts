import {z} from "zod";
import {chainScript,splitPrompts,chainStateSchema,type ChainEngine} from "./chains.ts";
import {newId} from "./document.ts";
import type {BbPluginApi} from "@get-bb/plugin-sdk";

export const triggerSchema=z.discriminatedUnion("triggerType",[
 z.object({triggerType:z.literal("schedule"),cron:z.string().min(1).max(100),timezone:z.string().min(1).max(100)}),
 z.object({triggerType:z.literal("once"),runAt:z.number().int().positive()}),
]);
export const routineSchema=z.object({
 id:z.string(),projectId:z.string(),name:z.string(),enabled:z.boolean(),
 nextRunAt:z.number().nullable(),lastRunAt:z.number().nullable(),
 trigger:triggerSchema.optional(),execution:z.object({mode:z.string(),prompt:z.string().optional(),targetThreadId:z.string().optional()}).optional(),
 chainState:chainStateSchema.optional(),
 lastRunStatus:z.string().nullable(),lastError:z.string().nullable(),
});
export type Routine=z.infer<typeof routineSchema>;
export function routineBridge(bb:BbPluginApi,chains?:ChainEngine){
 function enrich(r:Routine):Routine{const definition=chains?.list().find(d=>d.automationId===r.id);if(!definition||r.execution?.mode!=="script")return r;const state=chains?.latestState(r.id);return {...r,execution:{mode:"chain",prompt:definition.prompt,targetThreadId:definition.threadId},...(state?{chainState:state}:{})};}
 function chainExecution(){return {mode:"script",script:chainScript(),interpreter:"node",timeoutMs:900000,workingDirectory:{type:"automation-storage"}};}
 async function list(projectId:string){
  const rows=await bb.sdk.plugins.callRpc({pluginId:"automations",method:"automations_list",input:{projectId},outputSchema:z.array(routineSchema).max(500)});return rows.map(enrich);
 }
 async function executionFor(input:{projectId:string;threadId:string;prompt:string}){
  const thread=await bb.sdk.threads.get({threadId:input.threadId});
  if(thread.projectId!==input.projectId||thread.deletedAt||thread.archivedAt||thread.visibility==="hidden"||!thread.environmentId)throw Error("Choose an available agent in this workspace with a live environment");
  const execution=await bb.sdk.threads.defaultExecutionOptions({threadId:thread.id});
  if(!execution)throw Error("The target agent's execution settings are unavailable");
  return {mode:"agent",targetThreadId:thread.id,prompt:input.prompt,
    providerId:thread.providerId,model:execution.model,reasoningLevel:execution.reasoningLevel,
    serviceTier:execution.serviceTier,permissionMode:execution.permissionMode,
    environment:{type:"reuse",environmentId:thread.environmentId}};
 }
 async function create(input:{projectId:string;threadId:string;name:string;prompt:string;trigger:z.infer<typeof triggerSchema>;enabled?:boolean}){
  const execution=await executionFor(input),isChain=splitPrompts(input.prompt).length>1;
  if(isChain&&!chains)throw Error("Routine chain support is unavailable");
  const created=await bb.sdk.plugins.callRpc({pluginId:"automations",method:"automations_create",input:{projectId:input.projectId,name:input.name,enabled:isChain?false:input.enabled??true,origin:"human",trigger:input.trigger,execution:isChain?chainExecution():execution},outputSchema:routineSchema});
  if(isChain){try{await chains!.setDefinition({automationId:created.id,projectId:input.projectId,threadId:input.threadId,prompt:input.prompt,version:newId()});}catch{throw Error(`Routine ${created.id} was saved paused, but its chain could not be configured. Refresh before creating again.`);}if(input.enabled!==false)return setEnabled({projectId:input.projectId,automationId:created.id,enabled:true});}
  return enrich(created);
 }
 async function update(input:{projectId:string;automationId:string;threadId:string;name:string;prompt:string;trigger:z.infer<typeof triggerSchema>;enabled?:boolean}){
  const execution=await executionFor(input),isChain=splitPrompts(input.prompt).length>1;
  if(isChain&&!chains)throw Error("Routine chain support is unavailable");
  const previous=await bb.sdk.plugins.callRpc({pluginId:"automations",method:"automations_get",input:{projectId:input.projectId,automationId:input.automationId},outputSchema:routineSchema});
  if(previous.enabled)await setEnabled({projectId:input.projectId,automationId:input.automationId,enabled:false});
  const updated=await bb.sdk.plugins.callRpc({pluginId:"automations",method:"automations_update",input:{projectId:input.projectId,automationId:input.automationId,name:input.name,trigger:input.trigger,execution:isChain?chainExecution():execution},outputSchema:routineSchema});
  if(isChain)await chains!.setDefinition({automationId:input.automationId,projectId:input.projectId,threadId:input.threadId,prompt:input.prompt,version:newId()});else await chains?.removeDefinition(input.automationId);
  if(input.enabled??previous.enabled)return setEnabled({projectId:input.projectId,automationId:input.automationId,enabled:true});
  return enrich(updated);
 }

 async function remove(input:{projectId:string;automationId:string}){
  const result=await bb.sdk.plugins.callRpc({pluginId:"automations",method:"automations_delete",input,outputSchema:z.object({ok:z.literal(true)})});await chains?.removeDefinition(input.automationId);return result;
 }
 async function setEnabled(input:{projectId:string;automationId:string;enabled:boolean}){
  if(input.enabled)await chains?.acknowledgeActivation(input.automationId);
  const result=await bb.sdk.plugins.callRpc({pluginId:"automations",method:input.enabled?"automations_resume":"automations_pause",input:{projectId:input.projectId,automationId:input.automationId},outputSchema:routineSchema});return enrich(result);
 }
 return {list,create,update,remove,setEnabled};
}
