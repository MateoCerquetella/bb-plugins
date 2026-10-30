import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

assert(process.env.STEEL_CDP_URL, "Use this thread's bb surf project CDP endpoint");
assert(process.env.BB_VIEWER_BASE_URL, "Use the current BB server's app origin");
assert(process.env.BB_THREAD_ID, "A current BB thread is required");
const appOrigin = new URL(process.env.BB_VIEWER_BASE_URL).origin;
const viewer = new URL("/api/v1/plugins/steel-browser/http/viewer", appOrigin);
viewer.search = new URLSearchParams({ threadId: process.env.BB_THREAD_ID, interactive: "true", clipboardBridge: "true" });
const bundled = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {LiveViewer} from './live-viewer.tsx'; import './app.css';
      createRoot(document.getElementById('root')).render(<LiveViewer title="Live relay verification" url={${JSON.stringify(viewer.href)}}/>);`,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)), loader: "tsx",
  }, bundle: true, write: false, outdir: "/tmp/steel-viewer-check", jsx: "automatic",
});
const js = bundled.outputFiles.find(f => f.path.endsWith(".js")).text;
const css = bundled.outputFiles.find(f => f.path.endsWith(".css")).text;
const cdp = new URL(process.env.STEEL_CDP_URL);
const version = await (await fetch(new URL("/json/version", cdp))).json();
const socket = new URL(version.webSocketDebuggerUrl); socket.host = cdp.host;
const browser = await chromium.connectOverCDP(socket.href, { timeout: 10000 });
const context = browser.contexts()[0];
const pages = [];
const errors = [];
const transports = new Set();
try {
  const target = await context.newPage(); pages.push(target);
  await target.setContent(`<!doctype html><title>Steel input verification</title>
    <style>body{font:22px system-ui;padding:40px;background:#fafafa;color:#222}input,button{font:inherit;padding:12px;margin:12px 0;display:block}</style>
    <h1>Steel input verification</h1><label for="field">Test input</label><input id="field">
    <button id="check" onclick="document.getElementById('result').textContent='Click received'">Check click</button><output id="result"></output>`);
  const page = await context.newPage(); pages.push(page);
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  // Chromium is in Docker; route its host-loopback requests through the test
  // driver. Both the real HTTP and WebSocket handlers still run in BB.
  await page.route(`${appOrigin}/api/v1/plugins/steel-browser/http/viewer?*`, async route => {
    await route.fulfill({ response: await route.fetch() });
  });
  await page.routeWebSocket(`${appOrigin.replace(/^http/u, "ws")}/api/v1/plugins/steel-browser/http/viewer-cast?*`, routed => {
    const upstream = new WebSocket(routed.url(), { origin: appOrigin });
    transports.add(upstream);
    const pending = [];
    routed.onMessage(data => upstream.readyState === WebSocket.OPEN ? upstream.send(data) : pending.push(data));
    upstream.on("open", () => { for (const data of pending) upstream.send(data); pending.length = 0; });
    upstream.on("message", (data, binary) => routed.send(binary ? data : data.toString()));
    upstream.on("close", () => { transports.delete(upstream); routed.close(); });
    upstream.on("error", () => routed.close());
    routed.onClose(() => upstream.close());
  });
  await page.route(`${appOrigin}/__steel-viewer-check`, route => route.fulfill({ contentType: "text/html", body: `
    <!doctype html><title>BB Surf live verification</title><style>body{margin:0;background:#18191c;color:#eee;font:15px system-ui}
    #root{height:100vh}${css}</style><div id="root"></div><script>
    window.copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copied=text}});
    </script><script>${js}</script>` }));
  await page.goto(`${appOrigin}/__steel-viewer-check`);
  await page.getByText("Interactive", { exact: true }).waitFor({ timeout: 10000 });
  const frame = page.frameLocator("iframe");
  await frame.locator(".tab").filter({ hasText: "Steel input verification" }).click({ timeout: 10000 });
  const playerFrame = page.frames().find(f => f.url() === viewer.href);
  await playerFrame.waitForFunction(() => {
    const tab = document.querySelector(".tab.active .tab-title");
    const canvas = document.querySelector(".canvas-container.active canvas");
    return tab?.textContent === "Steel input verification" && canvas
      && canvas.getContext("2d").getImageData(10, 10, 1, 1).data[3] === 255;
  }, null, { timeout: 15000 });

  async function clickRemote(selector) {
    const remote = await target.locator(selector).boundingBox();
    const viewport = await target.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    const canvas = frame.locator(".canvas-container.active canvas");
    const box = await canvas.boundingBox();
    assert(remote && box, "Remote element and streamed canvas must be visible");
    await page.mouse.click(box.x + (remote.x + remote.width / 2) / viewport.width * box.width,
      box.y + (remote.y + remote.height / 2) / viewport.height * box.height);
  }
  await clickRemote("#field");
  await page.keyboard.type("keyboard-ok");
  await target.waitForFunction(() => document.querySelector("#field").value === "keyboard-ok");
  await page.getByRole("button", { name: "Paste into browser", exact: true }).click();
  await page.getByRole("textbox", { name: "Text to paste" }).fill("-paste-ok");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await target.waitForFunction(() => document.querySelector("#field").value === "keyboard-ok-paste-ok");
  await target.locator("#field").evaluate(input => input.select());
  await page.getByRole("button", { name: "Copy selected browser text" }).click();
  await page.waitForFunction(() => window.copied === "keyboard-ok-paste-ok");
  await clickRemote("#check");
  await target.waitForFunction(() => document.querySelector("#result").textContent === "Click received");
  assert.deepEqual(errors, []);
  console.log("PASS: real embedded player, screen frames, mouse, keyboard, masked paste and copy through the BB relay");
} catch (error) {
  console.log("Browser errors:", errors);
  const page = pages.at(-1);
  if (page) {
    console.log("Visible text:", (await page.locator("body").innerText()).slice(0,1000));
    console.log("Frames:", page.frames().map(f => f.url()));
  }
  throw error;
} finally {
  for (const upstream of transports) upstream.terminate();
  transports.clear();
  for (const page of pages.reverse()) await page.close();
  await browser.close();
}
