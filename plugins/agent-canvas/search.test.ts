import assert from "node:assert/strict";
import test from "node:test";
import {rankSearch,type SearchEntry} from "./search.ts";
const run=()=>{};
const entries:SearchEntry[]=[
 {id:"cafe",label:"Café release",kind:"note",workspaceId:"web",detail:"Web",body:"Deploy after the review",run},
 {id:"api",label:"Claude reviewer",kind:"Agent",workspaceId:"api",detail:"API Codex",run},
 {id:"web",label:"Claude reviewer",kind:"Agent",workspaceId:"web",detail:"Web Codex",run},
 {id:"action",label:"New agent",kind:"Action",run},
];
test("search matches accents, note bodies and multiword workspace/provider metadata",()=>{
 assert.equal(rankSearch(entries,"cafe","web")[0].id,"cafe");assert.equal(rankSearch(entries,"deploy review",null)[0].id,"cafe");assert.deepEqual(rankSearch(entries,"claude api",null).map(v=>v.id),["api"]);assert.equal(rankSearch(entries,"cld rvw",null)[0].kind,"Agent");assert.deepEqual(rankSearch(entries,"unknown missing",null),[]);
});
test("name matches lead body matches, workspace boosts ties, and empty search lists actions first",()=>{
 const more=[...entries,{id:"body",label:"Memo",kind:"note",body:"Claude reviewer",run}];assert.equal(rankSearch(more,"claude","web")[0].id,"web");assert.equal(rankSearch(entries,"",null)[0].id,"action");assert.equal(rankSearch(more,"claude",null).at(-1)!.id,"body");assert.equal(rankSearch(Array.from({length:100},(_,i)=>({id:String(i),label:`Node ${i}`,kind:"note",run})),"",null).length,80);
});
