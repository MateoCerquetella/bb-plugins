import { build } from "esbuild";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

assert(process.env.STEEL_CDP_URL, "Use the current thread's bb steel-browser project CDP URL");
const result = await build({
  stdin: { contents: `
    import React,{useState} from "react";import {createRoot} from "react-dom/client";
    import {SteelBrowserPage,SteelBrowserDirective} from "./app.tsx";
    function App(){const [count,setCount]=useState(1);return location.search
      ? <><button onClick={()=>setCount(2)}>Add viewer</button>{Array.from({length:count},(_,i)=>
        <SteelBrowserDirective key={i} message={{id:"m"+i,threadId:"thread",projectId:"test-project",turnId:null}}
          source="" attributes={{}} openWorkspaceFile={null} />)}</>
      : <SteelBrowserPage/>;}
    createRoot(document.getElementById("root")).render(<App/>);`,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)), loader: "tsx" },
  bundle: true, write: false, outdir: "/tmp/steel-human-check", jsx: "automatic",
  plugins: [{ name: "sdk", setup(b) {
    b.onResolve({ filter: /^@get-bb\/plugin-sdk\/app$/ }, () => ({ path: "sdk", namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ loader: "js", contents: `
      let records=[];
      const rpc={call:async(method,input)=>{
        window.rpcCalls=(window.rpcCalls||[]).concat([{method,input}]);
        if(method==="project")return {projectId:"test-project",projectName:"Test",binding:null,policy:{engine:"playwright",fallback:false}};
        if(method==="allProjects")return [];
        if(method==="signIns")return records;
        if(method==="confirmSignIn"){records=[{service:input.service,label:input.label,confirmedAt:new Date().toISOString()}];return records;}
        if(method==="forgetSignIn"){records=[];return records;}
        if(method==="openSignIn")return {opened:true};
        return {connected:true,endpoint:"http://127.0.0.1:3100",error:null,checkedAt:new Date().toISOString(),
          uiUrl:"https://steel.test/ui",docsUrl:"https://steel.test/documentation",
          sessions:Array.from({length:3},(_,i)=>({id:"browser-"+i,status:i===0?"idle":"released",
            createdAt:new Date().toISOString(),debugUrl:"https://steel.test/v1/sessions/debug",
            websocketUrl:"ws://127.0.0.1:3100/"}))};
      }};
      export const useRpc=()=>rpc;export const definePluginApp=()=>null;
      export const useBbContext=()=>({threadId:null,projectId:"test-project"});
      export const experimental_useSidebarThreads=()=>({status:"ready",projects:[{id:"test-project",name:"Test project"}]});
      export const useSettings=()=>({values:{},isLoading:false});`
    }));
  } }],
});
const js = result.outputFiles.find(f => f.path.endsWith(".js")).text;
const css = result.outputFiles.find(f => f.path.endsWith(".css")).text;
const cdp = new URL(process.env.STEEL_CDP_URL);
const version = await (await fetch(new URL("/json/version", cdp))).json();
const ws = new URL(version.webSocketDebuggerUrl); ws.host = cdp.host;
const browser = await chromium.connectOverCDP(ws.toString());
const context = browser.contexts()[0];
const pages = [];
try {
  for (const width of [1280, 390]) {
    const page = await context.newPage(); pages.push(page);
    const metrics = await context.newCDPSession(page);
    await metrics.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    let loads = 0;
    await page.route("https://steel.test/**", route => {
      loads++;
      return route.fulfill({ contentType: "text/html", body: `
        <body style="margin:0;background:#f5f7f9;color:#202429;font:16px system-ui">
        <header style="padding:14px;background:#e0e5ea">Test project / Account sign-in</header>
        <main style="max-width:300px;margin:35px auto;padding:12px">
        <h2>Sign in</h2><label>Account<input id="target" aria-label="Remote field" style="display:block;padding:10px;max-width:90%"></label></main>
        <script>
          window.messages=[];
          window.parent.postMessage({type:"clipboardBridgeReady"},"*");
          addEventListener("message",e=>{
            window.messages.push(e.data);
            if(e.data.type==="triggerPaste")document.querySelector("input").value=e.data.text;
            if(e.data.type==="triggerCopy")window.parent.postMessage({type:"requestClipboardWrite",requestId:1,text:"dummy-selection"},"*");
          });
        </script>` });
    });
    await page.route("https://steel-ui.test/**", route => route.fulfill({
      contentType: "text/html", body: `<meta name="viewport" content="width=device-width,initial-scale=1">
        <style>body{margin:0;font-family:system-ui;background:#18191c;color:#ececef}#root{height:100dvh}${css}</style>
        <div id="root"></div><script>${js}</script>`,
    }));
    await page.goto("https://steel-ui.test");
    await page.waitForFunction(() => document.querySelector('[aria-label="Paste into browser"]')?.disabled === false);
    await page.evaluate(() => {
      window.clipboardWrites=[];
      Object.defineProperty(navigator, "clipboard", { configurable:true, value:{
        readText:async()=>{throw new Error("denied")},
        writeText:async text=>window.clipboardWrites.push(text),
      }});
    });
    const initialLoads = loads;
    await page.getByRole("button", { name: "Take control", exact: true }).click();
    assert.equal(await page.locator("iframe").count(), 1);
    assert.equal(loads, initialLoads, "expanding must keep the stream");
    await page.getByRole("button", { name: "Paste into browser", exact: true }).click();
    await page.getByRole("button", { name: "Paste clipboard", exact: true }).click();
    await page.getByText("Clipboard access denied.", { exact: false }).first().waitFor();
    await page.getByLabel("Text to paste").fill("dummy-password");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    assert.equal(await page.frameLocator("iframe").getByLabel("Remote field").inputValue(), "dummy-password");
    assert.equal(await page.getByLabel("Text to paste").inputValue(), "");
    assert(!(await page.evaluate(() => JSON.stringify(window.rpcCalls))).includes("dummy-password"));
    await page.getByRole("button", { name: "Copy selected browser text" }).click();
    await page.waitForFunction(() => window.clipboardWrites.length === 1);
    await page.evaluate(() => window.postMessage({ type:"requestClipboardWrite", requestId:2,text:"spoof" }, "*"));
    await page.frameLocator("iframe").locator("body").evaluate(() =>
      parent.postMessage({ type:"requestClipboardWrite", requestId:3,text:"unsolicited" }, "*"));
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => window.clipboardWrites), ["dummy-selection"]);
    await page.getByRole("button", { name: "Exit expanded control" }).click();
    assert.equal(loads, initialLoads);
    await page.getByRole("button", { name: "Confirm GitHub account" }).click();
    await page.getByLabel("GitHub account label").fill("dummy-account");
    await page.getByRole("button", { name: "Confirm signed in" }).click();
    await page.getByText("dummy-account", { exact:true }).waitFor();
    assert.equal(await page.getByText("User confirmed", { exact:false }).count(), 1);
    await page.getByRole("button", { name: "Sign in", exact:true }).first().click();
    await page.waitForFunction(() => window.rpcCalls.some(c=>c.method==="openSignIn"&&c.input.service==="github"));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.BB_THREAD_STORAGE) {
      const shot = await metrics.send("Page.captureScreenshot", { format:"png",captureBeyondViewport:false });
      await writeFile(`${process.env.BB_THREAD_STORAGE}/steel-human-${width}.png`, Buffer.from(shot.data,"base64"));
    }
    await page.goto("https://steel-ui.test/?inline");
    await page.waitForFunction(() => document.querySelectorAll("iframe").length===1);
    await page.getByRole("button", {name:"Add viewer"}).click();
    await page.waitForFunction(() => document.querySelectorAll(".steel-inline-anchor").length===2
      && document.querySelectorAll("iframe").length===1 && document.querySelectorAll(".steel-inline-anchor")[1].querySelector("iframe"));
    await page.getByRole("button", { name:"Minimize inline browser" }).last().click();
    assert.equal(await page.locator("iframe").count(), 0);
    await page.getByRole("button", { name:"Restore inline browser" }).click();
    await page.waitForFunction(() => document.querySelectorAll("iframe").length===1);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    console.log(`PASS ${width}: one stream, expand retains frame, clipboard fallback/clear/spoof rejection, account confirmation, latest inline ownership`);
    await metrics.detach();
    await page.close();
  }
} finally {
  for (const page of pages) if (!page.isClosed()) await page.close();
  await browser.close();
}
