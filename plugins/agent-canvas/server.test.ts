import assert from "node:assert/strict";
import test from "node:test";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "./server.ts";

test("only the selected universal Control thread can send bounded UI commands", async () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "agent-canvas", sdk: {
    threads: { get: async () => makeThreadResponse({ id: "control" }), updatePluginMetadata: async () => ({}) },
  } });
  await plugin(bb);
  try {
    await harness.behavior.callRpc("selectControl", { threadId: "control" });
    await assert.rejects(harness.behavior.callAgentTool("agent_canvas_control", { action: "fit" }, { threadId: "other" }));
    const unavailable = await harness.behavior.callAgentTool("agent_canvas_control", { action: "fit" }, { threadId: "control" });
    assert.match(String(unavailable), /No mounted/);
    await harness.behavior.callRpc("presence", {
      clientId: "canvas-a", workspaceId: null, focusedThreadId: null, zoom: 1, visible: true,
    });
    const pending = harness.behavior.callAgentTool("agent_canvas_control", { action: "zoom", value: .8 }, { threadId: "control" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const signal = harness.realtimeSignals.find((item) => item.channel === "ui-command");
    assert.ok(signal);
    const { requestId } = signal.payload as { requestId: string };
    const rejected = await harness.behavior.callRpc("acknowledge", { clientId: "wrong", requestId, applied: true, detail: "wrong client" });
    assert.deepEqual(rejected, { ok: false });
    await harness.behavior.callRpc("acknowledge", { clientId: "canvas-a", requestId, applied: true, detail: "Zoom updated." });
    assert.equal(await pending, "Zoom updated.");
    assert.equal(harness.inspection.sdk.callsTo("threads.spawn").length, 0);
  } finally { await harness.lifecycle.dispose(); }
});

test("capture rejects browser ownership from a different host", async () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "agent-canvas", sdk: {
    threads: { get: async () => makeThreadResponse({ id: "owner", environmentId: "env" }) },
    environments: { get: async () => ({ hostId: "expected-host" }) },
  } });
  await plugin(bb);
  try {
    await assert.rejects(harness.behavior.callRpc("captureBrowser", {
      threadId: "owner", hostId: "other-host", tabId: "tab", instanceId: "instance", generation: "generation",
    }));
    assert.equal(harness.inspection.sdk.callsTo("experimental_desktopBrowsers.captureTab").length, 0);
  } finally { await harness.lifecycle.dispose(); }
});

test("shared document writes serialize revisions and reject stale views", async()=>{
 const {bb,harness}=createFakePluginHost({pluginId:"agent-canvas"});await plugin(bb);
 try{const {emptyDocument,createNode}=await import("./document.ts");const d=emptyDocument();d.nodes.push(createNode("note","project",{x:0,y:0,w:300,h:200}));const results=await Promise.allSettled([harness.behavior.callRpc("saveDocument",{revision:0,document:d}),harness.behavior.callRpc("saveDocument",{revision:0,document:d})]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.filter(r=>r.status==="rejected").length,1);const read=await harness.behavior.callRpc("readDocument",null) as {revision:number;document:typeof d};assert.equal(read.revision,1);assert.deepEqual(read.document,d);}finally{await harness.lifecycle.dispose();}
});
test("stored role presets migrate once and invalidate previously loaded revisions",async()=>{
 const {emptyDocument}=await import("./document.ts");
 const {bb,harness}=createFakePluginHost({pluginId:"agent-canvas"});
 await bb.storage.kv.set("canvas-document-v1",{revision:7,document:emptyDocument()});
 await plugin(bb);
 try{
  const current=await harness.behavior.callRpc("readDocument",null) as {revision:number;document:ReturnType<typeof emptyDocument>};
  assert.equal(current.revision,8);assert.equal(current.document.roles.length,5);
  await assert.rejects(harness.behavior.callRpc("saveDocument",{revision:7,document:emptyDocument()}));
  const edited={...current.document,roles:current.document.roles.filter(role=>role.name!=="Reviewer")};
  await harness.behavior.callRpc("saveDocument",{revision:8,document:edited});
  const stored=await bb.storage.kv.get<{revision:number;document:typeof edited}>("canvas-document-v1");
  assert.equal(stored?.document.settings.rolePresetsVersion,1);
  assert.equal(stored?.document.roles.some(role=>role.name==="Reviewer"),false);
 }finally{await harness.lifecycle.dispose();}
});
test("connected-note tools enforce the calling project and explicit current links",async()=>{
 const {emptyDocument,createNode,connect}=await import("./document.ts");let deleted=false;
 const {bb,harness}=createFakePluginHost({pluginId:"agent-canvas",sdk:{threads:{get:async(args:any)=>makeThreadResponse({id:args.threadId,projectId:args.threadId==="outsider"?"other":"project",deletedAt:deleted?1:null})}}});await plugin(bb);
 try{let d=emptyDocument();const note=createNode("note","project",{x:0,y:0,w:300,h:200});note.content="Shared";d.nodes.push(note);d=connect(d,"reader",note.id);d=connect(d,"outsider",note.id);await harness.behavior.callRpc("saveDocument",{revision:0,document:d});assert.equal(JSON.parse(String(await harness.behavior.callAgentTool("agent_canvas_notes",{},{threadId:"reader"})))[0].content,"Shared");assert.deepEqual(JSON.parse(String(await harness.behavior.callAgentTool("agent_canvas_notes",{},{threadId:"outsider"}))),[]);await assert.rejects(harness.behavior.callAgentTool("agent_canvas_write_note",{id:note.id,content:"Unrelated"},{threadId:"unlinked"}));await harness.behavior.callAgentTool("agent_canvas_write_note",{id:note.id,content:"Updated"},{threadId:"reader"});const current=await harness.behavior.callRpc("readDocument",null) as {revision:number;document:typeof d};await harness.behavior.callRpc("saveDocument",{revision:current.revision,document:{...current.document,edges:[]}});await assert.rejects(harness.behavior.callAgentTool("agent_canvas_write_note",{id:note.id,content:"Stale"},{threadId:"reader"}));deleted=true;await assert.rejects(harness.behavior.callAgentTool("agent_canvas_notes",{},{threadId:"reader"}));assert.equal(harness.inspection.sdk.callsTo("threads.spawn").length,0);}finally{await harness.lifecycle.dispose();}
});

test("Maestro tools require an assigned role and direct teammates; recruitment inherits execution",async()=>{
 const {emptyDocument,setPresentation}=await import("./document.ts");const calls:{kind:string;args:any}[]=[];
 const {bb,harness}=createFakePluginHost({pluginId:"agent-canvas",sdk:{threads:{get:async(args:any)=>makeThreadResponse({id:args.threadId,projectId:"project",environmentId:"floor",providerId:"codex",parentThreadId:args.threadId==="child"?"lead":null}),defaultExecutionOptions:async()=>({model:"model",permissionMode:"accept-edits",reasoningLevel:"medium",serviceTier:"default",source:"client/thread/start"}),spawn:async(args:any)=>{calls.push({kind:"spawn",args});return makeThreadResponse({id:"recruited",parentThreadId:args.parentThreadId});},send:async(args:any)=>{calls.push({kind:"send",args});return {status:"sent"};},stop:async(args:any)=>{calls.push({kind:"stop",args});return {ok:true};}}}});await plugin(bb);
 try{await assert.rejects(harness.behavior.callAgentTool("agent_canvas_team",{action:"recruit",title:"Worker",task:"Work"},{threadId:"lead"}));let d=emptyDocument();d.roles.push({id:"maestro",name:"Lead",color:"#578af3",instructions:"Coordinate",maestro:true});d=setPresentation(d,"lead",{roleId:"maestro"});await harness.behavior.callRpc("saveDocument",{revision:0,document:d});await assert.rejects(harness.behavior.callAgentTool("agent_canvas_team",{action:"dismiss",threadId:"unrelated"},{threadId:"lead"}));assert.equal(calls.length,0);await harness.behavior.callAgentTool("agent_canvas_team",{action:"recruit",title:"Worker",task:"Work"},{threadId:"lead"});assert.equal(calls[0].args.parentThreadId,"lead");assert.equal(calls[0].args.providerId,"codex");assert.equal(calls[0].args.permissionMode,"accept-edits");assert.deepEqual(calls[0].args.environment,{type:"reuse",environmentId:"floor"});await harness.behavior.callAgentTool("agent_canvas_team",{action:"reassign",threadId:"child",task:"Review"},{threadId:"lead"});assert.equal(calls[1].args.senderThreadId,"lead");await harness.behavior.callAgentTool("agent_canvas_team",{action:"dismiss",threadId:"child"},{threadId:"lead"});assert.equal(calls[2].kind,"stop");assert.equal(harness.inspection.sdk.callsTo("threads.delete").length,0);}finally{await harness.lifecycle.dispose();}
});

test("native connected-note mentions are minted only for live connections and resolve fresh content",async()=>{
 const {emptyDocument,createNode,connect}=await import("./document.ts");const {bb,harness}=createFakePluginHost({pluginId:"agent-canvas",sdk:{threads:{get:async(args:any)=>makeThreadResponse({id:args.threadId,projectId:"project"})}}});await plugin(bb);
 try{const note=createNode("note","project",{x:0,y:0,w:200,h:200});note.title="Brief";note.content="First";let d=connect({...emptyDocument(),nodes:[note]},"reader",note.id);await harness.behavior.callRpc("saveDocument",{revision:0,document:d});const provider=harness.registrations.mentionProviders[0];const found=await provider.search({trigger:"@",query:"brief",projectId:"project",threadId:"reader"});assert.equal(found.length,1);assert.deepEqual(await provider.search({trigger:"@",query:"",projectId:"project",threadId:"other"}),[]);await assert.rejects(async()=>provider.resolve(found[0].id.slice(0,-4)+"AAAA"));d={...d,nodes:[{...note,content:"Fresh"}]};await harness.behavior.callRpc("saveDocument",{revision:1,document:d});assert.match((await provider.resolve(found[0].id)).context,/Fresh/);await harness.behavior.callRpc("saveDocument",{revision:2,document:{...d,edges:[]}});await assert.rejects(async()=>provider.resolve(found[0].id));}finally{await harness.lifecycle.dispose();}
});
