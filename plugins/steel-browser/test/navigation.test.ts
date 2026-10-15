import assert from "node:assert/strict";
import {test} from "node:test";
import {pageSocketUrl,navigateProject} from "../navigation.ts";
import {navigationUrlSchema} from "../contract.ts";
const binding={apiUrl:"http://127.0.0.1:3210",cdpUrl:"http://127.0.0.1:9320",viewerUrl:"https://project.getbb.app"};

test("page targets remain bound to the current project endpoint, excluding browser UI targets",()=>{
 assert.equal(pageSocketUrl(binding,{type:"page",webSocketDebuggerUrl:"ws://upstream.invalid:80/devtools/page/target"}),"ws://127.0.0.1:9320/devtools/page/target");
 assert.throws(()=>pageSocketUrl(binding,{type:"browser_ui",webSocketDebuggerUrl:"ws://upstream/devtools/page/ui"}));
 assert.throws(()=>pageSocketUrl(binding,{type:"page",webSocketDebuggerUrl:"ws://upstream/devtools/browser/foreign"}));
});
test("navigation rejects credential-bearing and non-web destinations before opening a connection",async()=>{
 for(const url of ["file:///etc/passwd","javascript:alert(1)","https://user:password@example.com/"]){assert.equal(navigationUrlSchema.safeParse(url).success,false);await assert.rejects(navigateProject(binding,url));}
 assert.equal(navigationUrlSchema.parse("https://example.com/"),"https://example.com/");
});
