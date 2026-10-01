import { build } from "esbuild";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const result = await build({
  stdin: { contents: `import React from "react"; import {createRoot} from "react-dom/client";
    import {SteelBrowserDirective,SteelAgentSettings} from "./app.tsx";
    createRoot(document.getElementById("root")).render(location.search ? <SteelAgentSettings /> : <><SteelBrowserDirective
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
        if(method==="setEngine"){project.policy=input.policy;return {...project};}
        return {connected:true,uiUrl:"https://viewer.test/ui",sessions:[{status:"idle"}]};
      }};
      export const useRpc=()=>rpc;
      export const useSettings=()=>({values:{},isLoading:false});
      export const useBbContext=()=>location.search ? {threadId:null,projectId:null} : {threadId:"t",projectId:"p"};
      export const definePluginApp=()=>null;
    ` }));
  } }],
});
const js = result.outputFiles.find(f => f.path.endsWith(".js")).text;
const css = result.outputFiles.find(f => f.path.endsWith(".css")).text;
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    let loads = 0;
    await page.route("https://viewer.test/**", route => {
      loads++;
      return route.fulfill({ body: "<body style='background:#edf1f5'><h2>Project A browser</h2><input aria-label='Fixture'></body>", contentType: "text/html" });
    });
    await page.route("http://inline.test/**", route => route.fulfill({
      body: `<style>body{margin:16px;font-family:system-ui}${css}</style><div id="root"></div><script>${js}</script>`,
      contentType: "text/html",
    }));
    await page.goto("http://inline.test");
    await page.getByText("Project A", { exact: true }).waitFor();
    await page.frameLocator("iframe").getByRole("textbox").fill("Retained");
    const box = await page.locator(".steel-inline-browser").boundingBox();
    assert(box.width <= 562 && box.width <= width - 30);
    assert.equal(await page.locator(".steel-inline-browser .steel-project-controls").count(), 0);
    await page.locator("#settings").getByText("Project A", { exact: true }).waitFor();
    await page.getByRole("combobox").selectOption("auto");
    await page.getByRole("checkbox", { name: "Fallback" }).check();
    assert.equal(await page.getByRole("combobox").inputValue(), "auto");
    await page.getByRole("button", { name: "Minimize inline browser" }).click();
    assert.equal(await page.locator("iframe").isVisible(), false);
    await page.getByRole("button", { name: "Restore inline browser" }).click();
    assert.equal(await page.frameLocator("iframe").getByRole("textbox").inputValue(), "Retained");
    assert.equal(loads, 1, "minimizing must not reload the viewer");
    const signIn = page.getByRole("link", { name: "Sign in to BB Connect in a new tab" });
    assert.equal(await signIn.getAttribute("href"), "https://viewer.test/v1/sessions/debug");
    assert.equal(await signIn.getAttribute("target"), "_blank");
    assert.equal(await signIn.getAttribute("rel"), "noopener noreferrer");
    const popupPromise = page.waitForEvent("popup");
    await signIn.click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.equal(popup.url(), "https://viewer.test/v1/sessions/debug");
    assert.equal(await popup.evaluate(() => window.opener), null);
    await popup.close();
    await page.getByRole("button", { name: "Done signing in" }).click();
    await page.frameLocator("iframe").getByRole("textbox").waitFor();
    assert.equal(await page.frameLocator("iframe").getByRole("textbox").inputValue(), "");
    assert.equal(await page.getByRole("button", { name: "Done signing in" }).count(), 0);
    const viewport = await page.locator(".steel-inline-browser__viewport").boundingBox();
    assert(Math.abs(viewport.width - viewport.height) <= 1, "inline viewport must stay square");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.BB_THREAD_STORAGE) await page.screenshot({ path: `${process.env.BB_THREAD_STORAGE}/steel-project-inline-${width}.png` });
    await page.goto("http://inline.test/?no-project");
    await page.getByText(/No project selected/).waitFor();
    assert.equal(await page.getByRole("combobox").count(), 0);
    assert.equal(await page.evaluate(() => (window.rpcCalls || []).length), 0);
    assert(await page.getByText("jev-ultrafast", { exact: true }).isVisible());
    assert.equal(await page.getByRole("alert").count(), 0);
    await page.close();
  }
} finally { await browser.close(); }
console.log("Inline viewer: desktop/mobile, engine controls, minimize persistence passed.");
