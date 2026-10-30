import { build } from "esbuild";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

assert(process.env.STEEL_CDP_URL, "Use this thread's bb surf project CDP URL");
const result = await build({
  stdin: { contents: `import React,{useState} from "react";import {createRoot} from "react-dom/client";
    import {SteelThreadPanel,SteelBrowserDirective} from "./app.tsx";
    function App(){const [thread,setThread]=useState("t");return <>
      <main id="conversation"><h1>Watch your agent work</h1><textarea aria-label="Message"/>
        <button onClick={()=>setThread(thread==="t"?"next":"t")}>Switch thread</button>
        <SteelBrowserDirective message={{id:"m",threadId:thread}} attributes={{}} source="" openWorkspaceFile={null}/>
      </main><aside id="panel"><SteelThreadPanel threadId={thread} params={null}/></aside>
      <div id="composer-chrome">Composer</div><div id="splitter-chrome"/></>;}
    createRoot(document.getElementById("root")).render(<App/>);`,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)), loader: "tsx" },
  bundle: true, write: false, outdir: "/tmp/cerq-panel-check", jsx: "automatic",
  plugins: [{ name: "sdk", setup(b) {
    b.onResolve({ filter: /^@get-bb\/plugin-sdk\/app$/ }, () => ({ path: "sdk", namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ loader: "js", contents: `
      const rpc={call:async(method,input)=>{window.calls=(window.calls||[]).concat([{method,input}]);
        return {connected:true,uiUrl:"https://cerq-viewer.test/ui",sessions:[{status:"idle"}]};}};
      export const useRpc=()=>rpc;export const definePluginApp=()=>null;
      export const useSettings=()=>({values:{},isLoading:false});
      export const experimental_useSidebarThreads=()=>({status:"ready",projects:[]});
      export const useBbContext=()=>({threadId:"t",projectId:"p"});
      export const experimental_useAppPanel=()=>({openTab:options=>{
        window.openCalls=(window.openCalls||[]).concat([options]);return window.acceptPanel!==false;}});`
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
const shots = process.env.BB_THREAD_STORAGE;
if (shots) await mkdir(shots, { recursive: true });
const pages = [];
try {
  for (const {width,touch,theme,zoom=1} of [
    {width:1440,touch:false,theme:"light",zoom:1.25},
    {width:1440,touch:false,theme:"dark"},
    {width:1440,touch:false,theme:"light"},
    {width:390,touch:true,theme:"light"},
    {width:1440,touch:true,theme:"dark"},
  ]) {
    const page = await context.newPage(); pages.push(page);
    await page.setViewportSize({width,height:900});
    const metrics = await context.newCDPSession(page);
    let loads = 0;
    await page.route("**/api/v1/plugins/steel-browser/http/viewer?*", route => {
      loads++;
      return route.fulfill({contentType:"text/html",body:`<meta charset="utf-8"><style>body{font:15px system-ui;background:#f4f4f5;color:#27272a;margin:0}header{padding:16px;border-bottom:1px solid #ddd}main{padding:32px}input{padding:8px}</style>
        <header>Project browser · agent working</header><main><h2>Browser task</h2><input aria-label="Remote field" value="Keep this page"/></main>
        <script>setTimeout(()=>parent.postMessage({type:"clipboardBridgeReady"},location.origin),100)</script>`});
    });
    await page.route(/^https:\/\/cerq-panel\.test\/(?:\?.*)?$/u, route => route.fulfill({contentType:"text/html",body:`
      <meta name="viewport" content="width=device-width,initial-scale=1"><style>
      :root{--background:${theme==="dark"?"#19191c":"#fafafa"};--foreground:${theme==="dark"?"#e4e4e7":"#242427"};--border:${theme==="dark"?"#333338":"#e4e4e7"};--muted-foreground:#93939e;--accent:#8882;--ring:#888;}
      body{margin:0;zoom:${zoom};color:var(--foreground);background:var(--background);font:13px system-ui}#root{height:calc(100vh / ${zoom});display:flex;padding-top:48px;box-sizing:border-box}
      #conversation{flex:1;min-width:0;padding:16px;overflow:auto}#panel{position:relative;z-index:0;width:min(440px,70vw);height:100%;border-left:1px solid var(--border)}textarea{display:block;width:25%;height:70px}
      #composer-chrome{position:fixed;z-index:1000;left:30vw;bottom:30px;width:30vw;height:100px;background:#ddd}
      #splitter-chrome{position:fixed;z-index:1000;right:min(440px,70vw);top:48px;bottom:0;width:4px;background:#888}
      ${css}</style><div id="root"></div><script>
      const nativeMatchMedia=window.matchMedia.bind(window);
      window.matchMedia=query=>{const media=nativeMatchMedia(query);
        if(${touch} && query.includes('(pointer: coarse)'))Object.defineProperty(media,'matches',{value:true});return media;};
      window.liveIntervals=new Set();
      const nativeSetInterval=window.setInterval;
      const nativeClearInterval=window.clearInterval;
      window.setInterval=(callback,delay,...args)=>{const id=nativeSetInterval(callback,delay,...args);window.liveIntervals.add(id);return id};
      window.clearInterval=id=>{window.liveIntervals.delete(id);return nativeClearInterval(id)};
      </script><script>${js}</script>`}));
    await page.goto("https://cerq-panel.test", {waitUntil:"domcontentloaded"});
    await metrics.send("Emulation.setDeviceMetricsOverride", {width,height:900,deviceScaleFactor:1,mobile:touch});
    await metrics.send("Emulation.setTouchEmulationEnabled", {enabled:touch,maxTouchPoints:5});
    const panel = page.locator(".steel-thread-panel");
    await panel.locator("iframe").waitFor();
    await page.getByRole("button", {name:"Open browser panel"}).click();
    assert.deepEqual(await page.evaluate(()=>window.openCalls), [{tab:{id:"steel-live-browser",context:{kind:"thread"},availability:"action"},title:"BB Surf"}]);
    assert.equal(await page.locator(".steel-inline-browser iframe").count(),0,"handoff transfers viewing to side panel");
    // A declined host open retains the inline fallback.
    await page.evaluate(()=>window.acceptPanel=false);
    await page.getByRole("button", {name:"Open browser panel"}).click();
    await page.locator(".steel-inline-browser iframe").waitFor();
    await page.getByRole("button", {name:"Minimize inline browser"}).click();
    const baseline = loads;
    await panel.locator("iframe").evaluate(frame=>window.originalFrame=frame);
    const frame = panel.frameLocator("iframe");
    const assertUnobscured = async () => {
      const hits = await page.evaluate(() => {
        const panel = document.querySelector(".steel-thread-panel");
        const box = panel.getBoundingClientRect();
        return ["composer-chrome", "splitter-chrome"].map(id => {
          const chrome = document.getElementById(id).getBoundingClientRect();
          const left=Math.max(box.left,chrome.left), right=Math.min(box.right,chrome.right);
          const top=Math.max(box.top,chrome.top), bottom=Math.min(box.bottom,chrome.bottom);
          if(right<=left || bottom<=top) return {id,overlaps:false};
          return {id,overlaps:true,viewer:panel.contains(document.elementFromPoint((left+right)/2,(top+bottom)/2))};
        });
      });
      assert(hits.some(hit=>hit.overlaps),"fixture chrome overlaps the expanded viewer");
      for(const hit of hits) if(hit.overlaps) assert(hit.viewer,`${hit.id} cannot cover or intercept the expanded viewer`);
    };
    await frame.getByRole("textbox").fill("Preserved while expanding");
    // Move out before beginning dwell; focus inside the iframe must not break it.
    await page.mouse.move(5,5);
    const box = await panel.boundingBox();
    // Dwell over the panel chrome so the outer page owns the hover timer.
    await page.mouse.move(box.x+80,box.y+20);
    await page.waitForTimeout(1100);
    assert.equal(await page.locator(".steel-thread-panel--expanded").count(),0,"a short hover never expands");
    if (!touch) {
      await page.waitForFunction(()=>document.querySelector(".steel-thread-panel--expanded"));
      const wide = await panel.boundingBox();
      const viewport = await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
      console.log('Hover geometry:', {zoom, viewport, panel:wide});
      assert(wide.width>=viewport.width*.62 && wide.width<=viewport.width*.7 && wide.x>=0 && wide.x+wide.width<=viewport.width);
      const conversation=await page.locator("#conversation").boundingBox();
      assert(conversation && wide.x-conversation.x>=viewport.width*.28,"expanded browser leaves a third of the thread unobscured");
      assert.equal(loads,baseline,"dwell does not reconnect viewer");
      assert(await panel.locator("iframe").evaluate(frame=>frame===window.originalFrame));
      assert.equal(await frame.getByRole("textbox").inputValue(),"Preserved while expanding");
      await assertUnobscured();
      if(shots) await page.screenshot({path:`${shots}/cerq-panel-expanded-${theme}.png`});
      await page.mouse.move(5,5);
      await page.waitForFunction(()=>!document.querySelector(".steel-thread-panel--expanded"));
      // A pending dwell must be cancelled after leaving and after blur.
      await page.mouse.move(box.x+80,box.y+20);await page.mouse.move(box.x+80,box.y+120);await page.waitForTimeout(350);await page.mouse.move(5,5);
      await page.waitForTimeout(2100);
      assert.equal(await page.locator(".steel-thread-panel--expanded").count(),0,"leave cancels delayed expansion");
      await panel.getByRole("button", {name:"Expand browser panel"}).hover();
      await page.evaluate(()=>{document.querySelector("textarea").focus();window.dispatchEvent(new Event("blur"));});
      await page.waitForTimeout(2100);
      assert.equal(await page.locator(".steel-thread-panel--expanded").count(),0,"window blur cancels pending dwell");
    } else {
      await page.waitForTimeout(1300);
      assert.equal(await page.locator(".steel-thread-panel--expanded").count(),0,"touch never auto-expands");
    }
    await panel.getByRole("button", {name:"Expand browser panel"}).click();
    await page.mouse.move(5,5);
    assert.equal(await page.locator(".steel-thread-panel--expanded").count(),1,"explicit expansion stays pinned");
    await page.waitForFunction(()=>window.liveIntervals.size===0);
    assert.equal(await page.evaluate(()=>window.liveIntervals.size),0,"pinned expansion suspends hover sampling");
    const wide = await panel.boundingBox();
    const viewport = await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
    assert(wide.x>=0 && wide.x+wide.width<=viewport.width && wide.y+wide.height<=viewport.height,"expanded view fits viewport");
    if(!touch) assert(wide.width<=viewport.width*.7,"explicit expansion keeps a third of the thread visible");
    await assertUnobscured();
    assert.equal(await page.getByRole("dialog").count(),0,"no focus trap or modal");
    await panel.getByRole("button",{name:"Paste into browser",exact:true}).click();
    await page.getByRole("dialog").waitFor();
    await page.getByLabel("Text to paste").fill("synthetic paste");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({state:"hidden"});
    assert.equal(await page.locator(".steel-thread-panel--expanded").count(),1,"clipboard dialog owns Escape above the expanded panel");
    await page.getByRole("textbox",{name:"Message",exact:true}).fill("Chat remains available");
    await page.keyboard.press("Escape");
    await page.waitForFunction(()=>!document.querySelector(".steel-thread-panel--expanded"));
    await panel.getByRole("button", {name:"Expand browser panel"}).click();
    await panel.getByRole("button", {name:"Shrink browser panel"}).click();
    await page.waitForTimeout(2100);
    assert.equal(await page.locator(".steel-thread-panel--expanded").count(),0,"manual shrink does not immediately expand again");
    assert.equal(loads,baseline,"manual controls preserve stream");
    if(shots) await page.screenshot({path:`${shots}/cerq-panel-compact-${width}-${touch}-${theme}.png`});
    await panel.getByRole("button",{name:"Expand browser panel"}).click();
    await page.getByRole("button",{name:"Switch thread"}).evaluate(button=>button.click());
    await page.mouse.move(5,5);
    await page.waitForFunction(()=>!document.querySelector(".steel-thread-panel--expanded"));
    await panel.locator("iframe").waitFor();
    assert((await page.evaluate(()=>window.calls)).some(call=>call.input.threadId==="next"),"thread switch uses new scope");
    await page.waitForTimeout(2100);
    assert.equal(await page.locator(".steel-thread-panel--expanded").count(),0,"thread switch resets expansion without a stale timer");
    console.log(`Panel passed: width=${width}, touch=${touch}, theme=${theme}, zoom=${zoom}`);
    await page.close();
  }
} finally {
  for(const page of pages) if(!page.isClosed()) await page.close();
  await browser.close();
}
