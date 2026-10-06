import assert from "node:assert/strict";
import test from "node:test";
import {createFakePluginHost,makeThreadResponse} from "@get-bb/plugin-sdk/testing";
import {routineBridge} from "./routines.ts";

test("native routines inherit target execution and stay paused until activation",async()=>{
 const calls:any[]=[];
 const {bb}=createFakePluginHost({pluginId:"agent-canvas",sdk:{threads:{get:async()=>makeThreadResponse({id:"agent",projectId:"project",providerId:"codex",environmentId:"floor"}),defaultExecutionOptions:async()=>({model:"model",permissionMode:"accept-edits",reasoningLevel:"medium",serviceTier:"default"})},plugins:{callRpc:async(args:any)=>{calls.push(args);return {id:"routine"};}}}});
 const bridge=routineBridge(bb);
 await bridge.create({projectId:"project",threadId:"agent",name:"Review",prompt:"Review changes",trigger:{triggerType:"schedule",cron:"0 9 * * 1-5",timezone:"UTC"}});
 assert.equal(calls[0].pluginId,"automations");assert.equal(calls[0].method,"automations_create");assert.equal(calls[0].input.enabled,false);assert.deepEqual(calls[0].input.execution,{mode:"agent",targetThreadId:"agent",prompt:"Review changes",providerId:"codex",model:"model",permissionMode:"accept-edits",reasoningLevel:"medium",serviceTier:"default",environment:{type:"reuse",environmentId:"floor"}});
 await bridge.setEnabled({projectId:"project",automationId:"routine",enabled:true});assert.equal(calls[1].method,"automations_resume");assert.deepEqual(calls[1].input,{projectId:"project",automationId:"routine"});
});
test("a cross-project routine is rejected before any native automation mutation",async()=>{
 let called=false;const {bb}=createFakePluginHost({pluginId:"agent-canvas",sdk:{threads:{get:async()=>makeThreadResponse({id:"agent",projectId:"other",environmentId:"floor"})},plugins:{callRpc:async()=>{called=true;}}}});
 await assert.rejects(routineBridge(bb).create({projectId:"project",threadId:"agent",name:"Review",prompt:"Review",trigger:{triggerType:"once",runAt:Date.now()+60000}}));assert.equal(called,false);
});
