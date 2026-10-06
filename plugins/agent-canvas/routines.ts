import {z} from "zod";
import type {BbPluginApi} from "@get-bb/plugin-sdk";

export const triggerSchema=z.discriminatedUnion("triggerType",[
 z.object({triggerType:z.literal("schedule"),cron:z.string().min(1).max(100),timezone:z.string().min(1).max(100)}),
 z.object({triggerType:z.literal("once"),runAt:z.number().int().positive()}),
]);
export const routineSchema=z.object({
 id:z.string(),projectId:z.string(),name:z.string(),enabled:z.boolean(),
 nextRunAt:z.number().nullable(),lastRunAt:z.number().nullable(),
 trigger:triggerSchema.optional(),execution:z.object({mode:z.string(),prompt:z.string().optional(),targetThreadId:z.string().optional()}).optional(),
 lastRunStatus:z.string().nullable(),lastError:z.string().nullable(),
});
export type Routine=z.infer<typeof routineSchema>;
export function routineBridge(bb:BbPluginApi){
 async function list(projectId:string){
  return bb.sdk.plugins.callRpc({pluginId:"automations",method:"automations_list",input:{projectId},outputSchema:z.array(routineSchema).max(500)});
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
 async function create(input:{projectId:string;threadId:string;name:string;prompt:string;trigger:z.infer<typeof triggerSchema>}){
  const execution=await executionFor(input);
  return bb.sdk.plugins.callRpc({pluginId:"automations",method:"automations_create",input:{projectId:input.projectId,name:input.name,enabled:false,origin:"human",trigger:input.trigger,execution},outputSchema:routineSchema});
 }
 async function update(input:{projectId:string;automationId:string;threadId:string;name:string;prompt:string;trigger:z.infer<typeof triggerSchema>}){
  const execution=await executionFor(input);
  return bb.sdk.plugins.callRpc({pluginId:"automations",method:"automations_update",input:{projectId:input.projectId,automationId:input.automationId,name:input.name,trigger:input.trigger,execution},outputSchema:routineSchema});
 }
 async function remove(input:{projectId:string;automationId:string}){
  return bb.sdk.plugins.callRpc({pluginId:"automations",method:"automations_delete",input,outputSchema:z.object({ok:z.literal(true)})});
 }
 async function setEnabled(input:{projectId:string;automationId:string;enabled:boolean}){
  return bb.sdk.plugins.callRpc({pluginId:"automations",method:input.enabled?"automations_resume":"automations_pause",input:{projectId:input.projectId,automationId:input.automationId},outputSchema:routineSchema});
 }
 return {list,create,update,remove,setEnabled};
}
