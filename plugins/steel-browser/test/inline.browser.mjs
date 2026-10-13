import { build } from "esbuild";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
const result = await build({
  stdin: { contents: `import React from "react"; import {createRoot} from "react-dom/client";
    import {SteelBrowserDirective,SteelAgentSettings,SteelBrowserPage} from "./app.tsx";
    window.mountSteel = () => createRoot(document.getElementById("root")).render(location.search ? <SteelBrowserPage /> : <><SteelBrowserDirective
      message={{id:"m",threadId:"t",projectId:"p",turnId:null}} source="" attributes={{}} openWorkspaceFile={null} />
      <div id="settings"><SteelAgentSettings /></div></>);`,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)), loader: "tsx" },
  bundle: true, write: false, outdir: "/tmp/steel-inline-check", jsx: "automatic",
  plugins: [{ name: "sdk", setup(b) {
    b.onResolve({ filter: /^@get-bb\/plugin-sdk\/app$/ }, () => ({ path: "sdk", namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ loader: "js", contents: `
      const project={projectId:"p",projectName:"Project A",binding:null,policy:{engine:"playwright",fallback:false}};
      const rpc={call:async(method,input)=>{
        window.rpcCalls=(window.rpcCalls||[]).concat([{method,input}]);
        if(Object.values(input).some(value=>value===undefined))throw new Error("undefined RPC input");
        if(method==="project")return {...project};
        if(method==="allProjects")return [];
        if(method==="setEngine"){project.policy=input.policy;return {...project};}
        return {connected:true,uiUrl:"https://viewer.test/ui",sessions:[{status:"idle"}]};
      }};
      export const useRpc=()=>rpc;
      export const experimental_useSidebarThreads=()=>({status:"ready",projects:[]});
      export const useSettings=()=>({values:{},isLoading:false});
      export const useBbContext=()=>location.search ? {threadId:null,projectId:null} : {threadId:"t",projectId:"p"};
      export const definePluginApp=()=>null;
    ` }));
  } }],
});
const js = result.outputFiles.find(f => f.path.endsWith(".js")).text;
const css = result.outputFiles.find(f => f.path.endsWith(".css")).text;
const cdp = new URL(process.env.STEEL_CDP_URL);
const version = await (await fetch(new URL("/json/version", cdp))).json();
const ws = new URL(version.webSocketDebuggerUrl);
ws.host = cdp.host;
const browser = await chromium.connectOverCDP(ws.toString());
const context = browser.contexts()[0];
const pages = [];
try {
  for (const { width, touch } of [
    { width: 1280, touch: false },
    { width: 390, touch: true },
    { width: 390, touch: false },
    { width: 1280, touch: true },
  ]) {
    const page = await context.newPage();
    pages.push(page);
    await page.setViewportSize({ width, height: 900 });
    console.log(`Checking inline viewer: width=${width}, touch=${touch}`);
    const minimized = width <= 640 || touch;
    let loads = 0;
    await page.route("https://viewer.test/**", route => {
      loads++;
      return route.fulfill({ body: "<body style='background:#edf1f5'><h2>Project A browser</h2><input aria-label='Fixture'></body>", contentType: "text/html" });
    });
    await page.route("http://inline.test/**", route => route.fulfill({
      body: `<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:16px;font-family:system-ui}#thread{height:700px;overflow:auto}#message{display:flow-root;padding-top:80px}#later{height:1600px}${css}</style><main id="thread"><article id="message"><div id="root"></div></article><div id="later">Later messages</div></main><textarea aria-label="Composer"></textarea><script>${js}</script>`,
      contentType: "text/html",
    }));
    const metrics = await context.newCDPSession(page);
    await page.goto("http://inline.test");
    await metrics.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: touch });
    await metrics.send("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: 5 });
    assert.equal(await page.evaluate(() => innerWidth), width, "Steel test viewport must match the requested width");
    assert.equal(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), touch);
    assert.equal(await page.evaluate(() => matchMedia("(max-width: 640px), (pointer: coarse)").matches), minimized,
      "Steel test device profile must match the requested client class");
    await page.evaluate(() => window.mountSteel());
    await page.getByText("Project A", { exact: true }).waitFor();
    if (minimized) {
      await page.getByText("Minimized", { exact: true }).waitFor();
      assert.equal(await page.locator("iframe").count(), 0, "mobile must not mount the viewer automatically");
      assert.equal(loads, 0, "mobile must not request the viewer before explicit restore");
      const collapsed = await page.locator(".steel-inline-browser").boundingBox();
      assert(collapsed.height < 100 && collapsed.width <= width - 30, "collapsed viewer fits the mobile header");
      if (process.env.BB_THREAD_STORAGE) {
        await page.screenshot({ path: `${process.env.BB_THREAD_STORAGE}/steel-minimized-${width}-${touch}.png` });
      }
      await page.getByRole("button", { name: "Restore inline browser" }).click();
      await page.frameLocator("iframe").getByRole("textbox").waitFor();
      assert.equal(loads, 1, "mobile restore loads the viewer once");
    } else {
      await page.frameLocator("iframe").getByRole("textbox").waitFor();
      assert.equal(loads, 1, "desktop loads the viewer automatically");
    }
    await page.frameLocator("iframe").getByRole("textbox").fill("Retained");
    const box = await page.locator(".steel-inline-browser").boundingBox();
    assert(box.width <= 562 && box.width <= width - 30, JSON.stringify({width, box}));
    assert.equal(await page.locator(".steel-inline-browser .steel-project-controls").count(), 0);
    await page.locator("#settings").getByText("Project A", { exact: true }).waitFor();
    await page.getByRole("combobox").selectOption("auto");
    await page.getByRole("checkbox", { name: "Fallback" }).check();
    assert.equal(await page.getByRole("combobox").inputValue(), "auto");
    await page.getByRole("button", { name: "Minimize inline browser" }).click();
    assert.equal(await page.locator("iframe").count(), 0);
    await page.getByRole("button", { name: "Restore inline browser" }).click();
    await page.frameLocator("iframe").getByRole("textbox").waitFor();
    await page.frameLocator("iframe").getByRole("textbox").fill("Retained");
    assert.equal(loads, 2, "restoring reconnects the stream, not the remote browser");
    await page.locator("#thread").evaluate(element => { element.scrollTop = 1100; });
    await page.waitForTimeout(80);
    assert.equal(await page.locator(".steel-inline-browser--following").count(), 0,
      "viewer remains in normal thread flow while scrolling");
    const inFlowTop = await page.locator(".steel-inline-browser").boundingBox();
    const anchorHeight = await page.locator(".steel-inline-anchor").evaluate(element => element.getBoundingClientRect().height);
    await page.locator("#message").evaluate(element => {
      const stream = document.createElement("div");
      stream.style.height = "900px";
      stream.textContent = "Streaming response";
      element.append(stream);
    });
    await page.waitForTimeout(80);
    assert.equal(await page.locator(".steel-inline-browser--following").count(), 0, "streaming layout stays in normal flow");
    assert((await page.locator(".steel-inline-browser").boundingBox()).y >= inFlowTop.y,
      "streaming content does not pin the viewer to the viewport");
    assert(await page.locator(".steel-inline-anchor").evaluate(element => element.getBoundingClientRect().height) >= anchorHeight,
      "streaming content keeps the viewer in its message");
    assert.equal(await page.frameLocator("iframe").getByRole("textbox").inputValue(), "Retained");
    await page.getByRole("button", { name: "Minimize inline browser" }).click();
    assert.equal(await page.locator("iframe").count(), 0);
    await page.getByRole("button", { name: "Restore inline browser" }).click();
    await page.frameLocator("iframe").getByRole("textbox").waitFor();
    assert.equal(loads, 3, "minimized viewers release their streams");
    if (process.env.BB_THREAD_STORAGE) {
      const shot = await metrics.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(`${process.env.BB_THREAD_STORAGE}/steel-following-${width}.png`, Buffer.from(shot.data, "base64"));
    }
    await page.locator("#thread").evaluate(element => {
      element.scrollTop = 0;
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(80);
    assert.equal(await page.locator(".steel-inline-browser--following").count(), 0);
    assert.equal(await page.locator('a[target="_blank"]').count(), 0);
    await page.getByRole("button", { name: "Reload inline browser" }).click();
    await page.frameLocator("iframe").getByRole("textbox").waitFor();
    assert.equal(await page.frameLocator("iframe").getByRole("textbox").inputValue(), "");
    assert.equal(await page.getByRole("button", { name: "Done signing in" }).count(), 0);
    const viewport = await page.locator(".steel-inline-browser__viewport").boundingBox();
    assert(Math.abs(viewport.width - viewport.height) <= 1, "inline viewport must stay square");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.BB_THREAD_STORAGE) await page.screenshot({ path: `${process.env.BB_THREAD_STORAGE}/steel-project-inline-${width}.png` });
    await page.goto("http://inline.test/?no-project");
    await page.evaluate(() => window.mountSteel());
    await page.getByRole("heading", { name: "All projects" }).waitFor();
    assert.equal(await page.getByRole("combobox").count(), 1);
    assert.deepEqual(await page.evaluate(() => window.rpcCalls), [{method:"allProjects",input:{}}]);
    assert.equal(await page.getByRole("alert").count(), 0);
    assert.equal(await page.getByText("Connecting", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Loading endpoint...", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "New session", exact: true }).count(), 0);
    await page.close();
  }
} catch (error) {
  const page = pages.at(-1);
  if (page && !page.isClosed()) {
    console.error(await page.evaluate(() => ({
      width: innerWidth,
      hidden: document.hidden,
      scrollY,
      threadScroll: document.querySelector("#thread")?.scrollTop,
      anchor: document.querySelector(".steel-inline-anchor")?.getBoundingClientRect().toJSON(),
      viewer: document.querySelector(".steel-inline-browser")?.outerHTML.slice(0, 3000),
      frames: [...document.querySelectorAll("iframe")].map(frame => ({
        src: frame.src, width: frame.clientWidth, height: frame.clientHeight,
      })),
    })));
  }
  throw error;
} finally {
  for (const page of pages) if (!page.isClosed()) await page.close();
  await browser.close();
}
console.log("Inline viewer: desktop, mobile, narrow fine-pointer, wide coarse-pointer, explicit restore, engine controls, minimize persistence passed.");
