import { build } from "esbuild";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const pluginRoot = fileURLToPath(new URL("../", import.meta.url));
const result = await build({
  stdin: {
    contents: `import React from "react";
      import {createRoot} from "react-dom/client";
      import {SteelBrowserPage} from "./app.tsx";
      createRoot(document.getElementById("root")).render(React.createElement(SteelBrowserPage));`,
    resolveDir: pluginRoot,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  outdir: "/tmp/steel-viewer-check",
  jsx: "automatic",
  plugins: [{
    name: "mock-bb-rpc",
    setup(b) {
      b.onResolve({ filter: /^@get-bb\/plugin-sdk\/app$/ }, () => ({ path: "sdk", namespace: "mock" }));
      b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
        contents: `const rpc={call:async()=>({
          connected:true,endpoint:"http://127.0.0.1:3100",error:null,
          checkedAt:new Date().toISOString(),uiUrl:"https://steel.test/ui",
          docsUrl:"https://steel.test/documentation",
          sessions:Array.from({length:8},(_,i)=>({id:"browser-"+i,
            status:i===0?"idle":"released",createdAt:new Date().toISOString(),
            websocketUrl:"ws://127.0.0.1:3100/"}))
        })}; export const useRpc=()=>rpc;export const definePluginApp=()=>null;`,
        loader: "js",
      }));
    },
  }],
});
const js = result.outputFiles.find(f => f.path.endsWith(".js")).text;
const css = result.outputFiles.find(f => f.path.endsWith(".css")).text;
const browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.route("https://steel.test/**", route => route.fulfill({ body: "<p>Viewer fixture</p>", contentType: "text/html" }));
    await page.route("http://steel-ui.test/**", route => route.fulfill({
      body: `<html><style>body{margin:0}#root{height:100dvh;overflow:hidden}${css}</style><div id="root"></div><script>${js}</script></html>`,
      contentType: "text/html",
    }));
    await page.goto("http://steel-ui.test");
    await page.getByRole("button", { name: "Watch browser", exact: true }).first().waitFor();
    const main = page.locator("main");
    assert(await main.evaluate(e => e.scrollHeight > e.clientHeight), "workspace must scroll");
    await main.evaluate(e => e.scrollTop = e.scrollHeight);
    await page.getByText("Developer connection").click();
    assert(await page.getByText("Developer connection").isVisible());
    await main.evaluate(e => e.scrollTop = 0);
    await page.getByRole("button", { name: "Sign in / Take control", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    assert(await page.locator("dialog iframe").count() === 1);
    await page.keyboard.press("Escape");
    assert(!(await page.getByRole("dialog").isVisible()));
    await page.getByRole("button", { name: "Sign in / Take control", exact: true }).click();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByTitle("Live Steel browser").waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.BB_THREAD_STORAGE) {
      await page.screenshot({ path: `${process.env.BB_THREAD_STORAGE}/steel-viewer-${width}.png` });
    }
    console.log(`PASS ${width}x${height}: scrolling, modal, Escape, Done, horizontal bounds`);
    await page.close();
  }
} finally {
  await browser.close();
}
