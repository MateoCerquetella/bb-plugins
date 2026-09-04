import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const runtime = JSON.parse(readFileSync(join(homedir(), ".bb/bb-app-runtime.json"), "utf8"));
const serverUrl = process.env.BB_SERVER_URL ?? runtime.serverUrl;
if (typeof serverUrl !== "string") throw new Error("Could not resolve the BB server URL.");

const port = 9337;
const profile = mkdtempSync(join(tmpdir(), "host-monitor-browser-"));
const browser = spawn("chromium", [
  "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });

const outputDir = join(process.cwd(), ".empirical/specs/host-monitor-native-footer-configurable-metrics/evidence/browser");
mkdirSync(outputDir, { recursive: true });
const desktopPath = join(outputDir, "editor-desktop.png");
const narrowPath = join(outputDir, "editor-390.png");
const sidebarPath = join(outputDir, "sidebar-icon-only.png");
const monitorPath = join(outputDir, "monitor-desktop.png");

try {
  let pages;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  const page = pages?.find((candidate) => candidate.type === "page");
  if (page == null) throw new Error("No Chromium page target found.");

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    const handler = pending.get(message.id);
    if (handler == null) return;
    pending.delete(message.id);
    if (message.error != null) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });

  const call = (method, params = {}) => {
    const id = nextId++;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails != null) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async (expression, timeoutMs = 10_000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };
  const screenshot = async (path) => {
    const result = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(path, Buffer.from(result.data, "base64"));
  };

  await call("Page.enable");
  await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: serverUrl });
  await waitFor("Array.from(document.querySelectorAll('button')).some((button) => button.getAttribute('aria-label') === 'Host Monitor' || button.getAttribute('title') === 'Host Monitor')");
  const footerActionsBefore = await evaluate("Array.from(document.querySelectorAll('button')).filter((button) => button.getAttribute('aria-label') === 'Host Monitor' || button.getAttribute('title') === 'Host Monitor').length");
  await screenshot(sidebarPath);
  await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === 'Host Monitor' || button.getAttribute('title') === 'Host Monitor')?.click()`);
  await waitFor("document.querySelectorAll('.host-monitor__machine-card').length >= 2");
  await waitFor("document.querySelectorAll('.host-monitor__panel-grid > article').length > 0");

  const initial = await evaluate(`({
    machines: document.querySelectorAll('.host-monitor__machine-card').length,
    panels: document.querySelectorAll('.host-monitor__panel-grid > article').length,
    sidebarRows: Array.from(document.querySelectorAll('[data-testid="plugin-nav-sidebar-items"] a, [data-testid="plugin-nav-sidebar-items"] button')).filter((node) => node.textContent?.trim() === 'Host Monitor').length,
    selected: document.querySelector('#machine-heading')?.textContent ?? null,
    alerts: document.querySelectorAll('[role="alert"]').length
  })`);
  initial.footerActionsBefore = footerActionsBefore;
  if (initial.footerActionsBefore !== 1 || initial.sidebarRows !== 0 || initial.alerts !== 0) throw new Error(`Unexpected native chrome: ${JSON.stringify(initial)}`);
  await screenshot(monitorPath);

  await waitFor("Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.includes('Edit dashboard') && !button.disabled)");
  await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Edit dashboard'))?.click()`);
  await waitFor("document.querySelector('.host-monitor__editor') !== null");
  const beforeAdd = await evaluate("document.querySelectorAll('.host-monitor__editor-list > li').length");
  await evaluate("document.querySelector('.host-monitor__editor')?.scrollIntoView({ block: 'start' })");
  await screenshot(desktopPath);
  await evaluate(`Array.from(document.querySelectorAll('.host-monitor__editor button')).find((button) => button.textContent?.trim() === 'Add panel')?.click()`);
  await waitFor(`document.querySelectorAll('.host-monitor__editor-list > li').length === ${beforeAdd + 1}`);
  const afterAdd = await evaluate("document.querySelectorAll('.host-monitor__editor-list > li').length");
  await evaluate(`Array.from(document.querySelectorAll('.host-monitor__editor button')).find((button) => button.textContent?.trim() === 'Cancel')?.click()`);
  await waitFor("document.querySelector('.host-monitor__editor') === null");

  const targetName = await evaluate("document.querySelectorAll('.host-monitor__machine-card strong')[1]?.textContent ?? null");
  if (targetName == null) throw new Error("A second host was not available.");
  await evaluate(`document.querySelectorAll('.host-monitor__machine-card')[1]?.click()`);
  await waitFor(`document.querySelector('.host-monitor__machine-card[data-selected="true"] strong')?.textContent === ${JSON.stringify(targetName)}`);
  await waitFor("document.querySelectorAll('.host-monitor__panel-grid > article').length > 0");

  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: serverUrl });
  await waitFor("Array.from(document.querySelectorAll('button')).some((button) => button.getAttribute('aria-label') === 'Host Monitor' || button.getAttribute('title') === 'Host Monitor')");
  await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === 'Host Monitor' || button.getAttribute('title') === 'Host Monitor')?.click()`);
  await waitFor("Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.includes('Edit dashboard') && !button.disabled)");
  await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Edit dashboard'))?.click()`);
  await waitFor("document.querySelector('.host-monitor__editor') !== null");
  await evaluate("document.querySelector('.host-monitor__editor')?.scrollIntoView({ block: 'start' })");
  const narrow = await evaluate(`({
    viewport: [innerWidth, innerHeight],
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    rows: document.querySelectorAll('.host-monitor__editor-list > li').length
  })`);
  if (narrow.overflow || narrow.rows < 1) throw new Error(`Invalid narrow layout: ${JSON.stringify(narrow)}`);
  await screenshot(narrowPath);

  console.log(JSON.stringify({ initial, editor: { beforeAdd, afterAdd }, switchedTo: targetName, narrow, artifacts: [sidebarPath, monitorPath, desktopPath, narrowPath] }));
  socket.close();
} finally {
  browser.kill("SIGTERM");
  await new Promise((resolve) => browser.once("exit", resolve));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      rmSync(profile, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
