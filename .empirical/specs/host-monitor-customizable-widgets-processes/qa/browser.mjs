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

const outputDir = join(process.cwd(), ".empirical/specs/host-monitor-customizable-widgets-processes/evidence/browser");
mkdirSync(outputDir, { recursive: true });
const desktopPath = join(outputDir, "editor-desktop.png");
const narrowPath = join(outputDir, "editor-390.png");
const sidebarPath = join(outputDir, "sidebar-icon-only.png");
const monitorPath = join(outputDir, "dashboard-wide.png");
const modalPath = join(outputDir, "mini-modal-desktop.png");
const processPath = join(outputDir, "process-widget-wide.png");
const processDialogPath = join(outputDir, "process-confirmation.png");
const processCollapsedPath = join(outputDir, "process-collapsed.png");
const comboPath = join(outputDir, "history-combobox.png");
const dashboardDragPath = join(outputDir, "dashboard-drag.png");

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
  const pressKey = async (key, code = key) => {
    const keyCode = { ArrowDown: 40, ArrowUp: 38, Home: 36, End: 35, Enter: 13, Escape: 27 }[key];
    const virtual = keyCode == null ? {} : { windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
    await call("Input.dispatchKeyEvent", { type: "keyDown", key, code, ...virtual });
    await call("Input.dispatchKeyEvent", { type: "keyUp", key, code, ...virtual });
  };
  const typeKey = async (key, code) => {
    const keyCode = key.codePointAt(0);
    await call("Input.dispatchKeyEvent", { type: "keyDown", key, code, text: key, unmodifiedText: key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
    await call("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
  };
  const clickCenter = async (elementExpression) => {
    const point = await evaluate(`(() => {
      const element = ${elementExpression};
      if (!(element instanceof Element)) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    if (point == null) throw new Error(`Could not resolve pointer target: ${elementExpression}`);
    await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await call("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
    await call("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
  };

  await call("Page.enable");
  await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: serverUrl });
  await waitFor("Array.from(document.querySelectorAll('button')).some((button) => button.getAttribute('aria-label') === 'Host Monitor' || button.getAttribute('title') === 'Host Monitor')");
  const documentMarker = `host-monitor-${Date.now()}`;
  await evaluate(`document.documentElement.dataset.hostMonitorTestMarker = ${JSON.stringify(documentMarker)}`);
  const footerActionsBefore = await evaluate("Array.from(document.querySelectorAll('button')).filter((button) => button.getAttribute('aria-label') === 'Host Monitor' || button.getAttribute('title') === 'Host Monitor').length");
  const visiblePageRowsBefore = await evaluate("document.querySelectorAll('[data-sidebar-navigation-item=\"host-monitor/host-monitor\"]:not([hidden])').length");
  await screenshot(sidebarPath);
  await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === 'Host Monitor' || button.getAttribute('title') === 'Host Monitor')?.click()`);
  await waitFor("document.querySelector('.host-monitor-mini') !== null");
  await waitFor("document.querySelectorAll('.host-monitor-mini__machine').length >= 2");
  const modalSummary = await evaluate(`({
    machines: document.querySelectorAll('.host-monitor-mini__machine').length,
    metrics: document.querySelectorAll('.host-monitor-mini__machine dd').length,
    dialog: document.querySelector('.host-monitor-mini')?.getAttribute('role'),
    guideLabels: Array.from(document.querySelectorAll('.host-monitor-mini__machine [data-guide]')).filter((node) => node.getAttribute('aria-label')?.includes('guide')).length,
    numericGuideChips: document.querySelectorAll('.host-monitor-mini__machine dt small').length,
    settingsRoute: location.pathname.includes('/settings'),
    alerts: document.querySelectorAll('[role="alert"]').length
  })`);
  if (footerActionsBefore !== 1 || visiblePageRowsBefore !== 0 || modalSummary.machines < 2 || modalSummary.metrics < 6 || modalSummary.guideLabels < 4 || modalSummary.numericGuideChips !== 0 || modalSummary.dialog !== "dialog" || modalSummary.settingsRoute || modalSummary.alerts !== 0) throw new Error(`Invalid mini modal: ${JSON.stringify({ footerActionsBefore, visiblePageRowsBefore, ...modalSummary })}`);
  await screenshot(modalPath);
  await evaluate(`document.querySelector('[data-host-monitor-mini-close]')?.click()`);
  await waitFor("document.querySelector('.host-monitor-mini') === null");
  await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === 'Host Monitor' || button.getAttribute('title') === 'Host Monitor')?.click()`);
  await waitFor("document.querySelectorAll('.host-monitor-mini__machine').length >= 2");
  await evaluate(`Array.from(document.querySelectorAll('.host-monitor-mini button')).find((button) => button.textContent?.trim() === 'Refresh')?.click()`);
  await waitFor("document.querySelector('[data-host-monitor-mini-status]')?.textContent === 'Updated now'");
  await evaluate(`Array.from(document.querySelectorAll('.host-monitor-mini button')).find((button) => button.textContent?.trim() === 'Open Host Monitor')?.click()`);
  await waitFor("location.pathname === '/plugins/host-monitor/host-monitor'");
  const navigationState = await evaluate(`({
    marker: document.documentElement.dataset.hostMonitorTestMarker ?? null,
    visiblePageRows: document.querySelectorAll('[data-sidebar-navigation-item="host-monitor/host-monitor"]:not([hidden])').length,
    settingsRoute: location.pathname.includes('/settings')
  })`);
  if (navigationState.marker !== documentMarker || navigationState.visiblePageRows !== 0 || navigationState.settingsRoute) throw new Error(`Navigation reloaded or exposed the row: ${JSON.stringify(navigationState)}`);
  await waitFor("document.querySelectorAll('.host-monitor__machine-card').length >= 2");
  await waitFor("document.querySelectorAll('.host-monitor__grid-item > article').length > 0");
  const comboboxSummary = await evaluate(`({
    role: document.querySelector('.bb-select__trigger')?.getAttribute('role'),
    label: document.querySelector('.bb-select__trigger')?.getAttribute('aria-labelledby'),
    value: document.querySelector('.bb-select__trigger')?.textContent?.trim() ?? null
  })`);
  if (comboboxSummary.role !== 'combobox' || comboboxSummary.label !== 'host-monitor-history-label' || comboboxSummary.value !== '1 day') throw new Error(`Invalid History combobox: ${JSON.stringify(comboboxSummary)}`);
  await clickCenter("document.querySelector('.bb-select__trigger')");
  await waitFor("document.querySelector('.bb-select__content') !== null");
  const comboOptions = await evaluate("Array.from(document.querySelectorAll('.bb-select__item')).map((item) => item.textContent?.trim())");
  if (JSON.stringify(comboOptions) !== JSON.stringify(['1 hour', '6 hours', '1 day', '7 days', '30 days'])) throw new Error(`Unexpected History options: ${JSON.stringify(comboOptions)}`);
  await screenshot(comboPath);
  await clickCenter("Array.from(document.querySelectorAll('.bb-select__item')).find((item) => item.textContent?.trim() === '6 hours')");
  await waitFor("document.querySelector('.bb-select__trigger')?.textContent?.trim() === '6 hours'");
  await evaluate("document.querySelector('.bb-select__trigger')?.focus()");
  await pressKey("ArrowDown");
  await waitFor("document.querySelector('.bb-select__content') !== null");
  await typeKey("7", "Digit7");
  await waitFor("document.querySelector('.bb-select__item[data-highlighted]')?.textContent?.trim() === '7 days'");
  await pressKey("Enter");
  await waitFor("document.querySelector('.bb-select__content') === null && document.querySelector('.bb-select__trigger')?.textContent?.trim() === '7 days'");
  await clickCenter("document.querySelector('.bb-select__trigger')");
  await waitFor("document.querySelector('.bb-select__content') !== null");
  await clickCenter("Array.from(document.querySelectorAll('.bb-select__item')).find((item) => item.textContent?.trim() === '1 day')");
  await waitFor("document.querySelector('.bb-select__content') === null && document.querySelector('.bb-select__trigger')?.textContent?.trim() === '1 day'");
  await evaluate("document.querySelector('.bb-select__trigger')?.focus()");
  await pressKey("ArrowDown");
  await waitFor("document.querySelector('.bb-select__content') !== null");
  await pressKey("Escape");
  await waitFor("document.querySelector('.bb-select__content') === null && document.activeElement === document.querySelector('.bb-select__trigger')");

  const initial = await evaluate(`({
    machines: document.querySelectorAll('.host-monitor__machine-card').length,
    panels: document.querySelectorAll('.host-monitor__grid-item > article').length,
    selected: document.querySelector('#machine-heading')?.textContent ?? null,
    alerts: document.querySelectorAll('[role="alert"]').length,
    settingsRoute: location.pathname.includes('/settings'),
    monitorFont: getComputedStyle(document.querySelector('.host-monitor')).fontFamily,
    nativeFont: getComputedStyle(Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'New thread') ?? document.body).fontFamily
  })`);
  initial.footerActionsBefore = footerActionsBefore;
  if (initial.footerActionsBefore !== 1 || initial.alerts !== 0 || initial.settingsRoute || initial.monitorFont !== initial.nativeFont) throw new Error(`Unexpected dedicated page: ${JSON.stringify(initial)}`);
  await screenshot(monitorPath);

  const processHostName = await evaluate(`Array.from(document.querySelectorAll('.host-monitor__machine-card')).find((button) => button.querySelector('strong')?.textContent === 'dyaus' && !button.disabled)?.querySelector('strong')?.textContent ?? null`);
  if (processHostName != null) {
    await evaluate(`Array.from(document.querySelectorAll('.host-monitor__machine-card')).find((button) => button.querySelector('strong')?.textContent === 'dyaus')?.click()`);
    await waitFor("document.querySelector('.host-monitor__machine-card[data-selected=\"true\"] strong')?.textContent === 'dyaus'");
  }
  await waitFor("Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'Customize' && !button.disabled)");
  await waitFor("document.querySelector('.host-monitor__process-widget') !== null");
  await waitFor("document.querySelector('.host-monitor__process-widget .host-monitor__process-table tbody tr') !== null || document.querySelector('.host-monitor__process-widget .host-monitor__widget-state') !== null", 20000);
  await evaluate("document.querySelector('.host-monitor__process-widget')?.scrollIntoView({ block: 'start' })");
  await screenshot(processPath);
  const processRefreshCount = await evaluate("Number(document.querySelector('.host-monitor__process-widget')?.dataset.refreshCount ?? 0)");
  await evaluate(`Array.from(document.querySelectorAll('.host-monitor__process-widget button')).find((button) => button.textContent?.includes('Collapse'))?.click()`);
  await waitFor("document.querySelector('.host-monitor__process-widget')?.dataset.expanded === 'false'");
  const collapsedProcesses = await evaluate(`({
    summaries: document.querySelectorAll('.host-monitor__process-summary > div').length,
    table: document.querySelector('.host-monitor__process-table') !== null,
    paused: Array.from(document.querySelectorAll('.host-monitor__process-widget .bb-badge')).some((badge) => badge.textContent?.trim() === 'Paused'),
    toggleExpanded: Array.from(document.querySelectorAll('.host-monitor__process-widget button')).find((button) => button.textContent?.includes('Expand'))?.getAttribute('aria-expanded')
  })`);
  if (collapsedProcesses.summaries !== 5 || collapsedProcesses.table || !collapsedProcesses.paused || collapsedProcesses.toggleExpanded !== 'false') throw new Error(`Invalid collapsed process panel: ${JSON.stringify(collapsedProcesses)}`);
  await screenshot(processCollapsedPath);
  await evaluate(`Array.from(document.querySelectorAll('.host-monitor__process-widget button')).find((button) => button.textContent?.includes('Expand'))?.click()`);
  await waitFor(`document.querySelector('.host-monitor__process-widget')?.dataset.expanded === 'true' && document.querySelector('.host-monitor__process-table') !== null && Number(document.querySelector('.host-monitor__process-widget')?.dataset.refreshCount ?? 0) > ${processRefreshCount}`, 20000);
  const processSummary = await evaluate(`({
    rows: document.querySelectorAll('.host-monitor__process-table tbody tr').length,
    actionable: Array.from(document.querySelectorAll('.host-monitor__process-widget button')).filter((button) => button.textContent?.trim() === 'Terminate' || button.textContent?.trim() === 'Force terminate').length,
    state: document.querySelector('.host-monitor__process-widget .host-monitor__widget-state strong')?.textContent ?? null
  })`);
  if (processSummary.actionable < 1) throw new Error(`No actionable process was available for confirmation QA: ${JSON.stringify(processSummary)}`);
  {
    const processStatusBefore = await evaluate(`Array.from(document.querySelectorAll('.host-monitor__process-widget .host-monitor__widget-status')).at(-1)?.textContent ?? ''`);
    await evaluate(`Array.from(document.querySelectorAll('.host-monitor__process-widget button')).find((button) => button.textContent?.trim() === 'Terminate' || button.textContent?.trim() === 'Force terminate')?.click()`);
    await waitFor(`document.querySelector('.host-monitor__dialog') !== null || (((Array.from(document.querySelectorAll('.host-monitor__process-widget .host-monitor__widget-status')).at(-1)?.textContent ?? '') !== ${JSON.stringify(processStatusBefore)}) && !(Array.from(document.querySelectorAll('.host-monitor__process-widget .host-monitor__widget-status')).at(-1)?.textContent ?? '').includes('Rechecking'))`, 20000);
    const processActionState = await evaluate(`({ dialog: document.querySelector('.host-monitor__dialog') !== null, status: Array.from(document.querySelectorAll('.host-monitor__process-widget .host-monitor__widget-status')).at(-1)?.textContent ?? null })`);
    if (!processActionState.dialog) throw new Error(`Process preflight did not open confirmation: ${JSON.stringify(processActionState)}`);
    const dialogSummary = await evaluate(`({
      title: document.querySelector('.host-monitor__dialog h2')?.textContent ?? null,
      cancel: Array.from(document.querySelectorAll('.host-monitor__dialog button')).some((button) => button.textContent?.trim() === 'Cancel'),
      destructive: Array.from(document.querySelectorAll('.host-monitor__dialog button')).some((button) => /terminate/i.test(button.textContent ?? '')),
      cancelFocused: document.activeElement?.textContent?.trim() === 'Cancel'
    })`);
    if (!dialogSummary.cancel || !dialogSummary.cancelFocused || !dialogSummary.destructive || !dialogSummary.title?.includes('process')) throw new Error(`Invalid process confirmation: ${JSON.stringify(dialogSummary)}`);
    await screenshot(processDialogPath);
    await evaluate(`Array.from(document.querySelectorAll('.host-monitor__dialog button')).find((button) => button.textContent?.trim() === 'Cancel')?.click()`);
    await waitFor("document.querySelector('.host-monitor__dialog') === null");
  }

  await evaluate("document.querySelector('.host-monitor__machine-heading')?.scrollIntoView({ block: 'start' })");
  await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Customize')?.click()`);
  await waitFor("document.querySelector('.host-monitor__editor') !== null");
  await waitFor("document.querySelector('.host-monitor__process-list') !== null");
  const originalWidgets = await evaluate(`Array.from(document.querySelectorAll('.host-monitor__editor-list > li')).map((row) => ({ key: row.dataset.widgetKey, visible: row.querySelector('input[type=checkbox]')?.checked ?? false }))`);
  if (originalWidgets.length < 10) throw new Error(`Incomplete widget catalog: ${JSON.stringify(originalWidgets)}`);
  const changedKey = originalWidgets[0].key;
  await evaluate("document.querySelector('.host-monitor__editor')?.scrollIntoView({ block: 'start' })");
  await screenshot(desktopPath);
  const gridDragKey = await evaluate("document.querySelectorAll('.host-monitor__grid-item')[0]?.dataset.widgetKey ?? null");
  if (gridDragKey == null) throw new Error("No visible dashboard widget was available to drag.");
  await evaluate(`(() => {
    const transfer = new DataTransfer();
    window.__hostMonitorGridQaTransfer = transfer;
    document.querySelectorAll('.host-monitor__grid-item')[0]?.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
  })()`);
  await waitFor("document.querySelectorAll('.host-monitor__grid-item')[0]?.dataset.dragging === 'true'");
  await evaluate(`(() => {
    const transfer = window.__hostMonitorGridQaTransfer;
    const target = document.querySelectorAll('.host-monitor__grid-item')[1];
    if (target == null) return;
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientY: target.getBoundingClientRect().bottom - 1, dataTransfer: transfer }));
  })()`);
  await waitFor("document.querySelectorAll('.host-monitor__grid-item')[1]?.dataset.dropPosition === 'after'");
  await evaluate(`(() => {
    const transfer = window.__hostMonitorGridQaTransfer;
    const source = document.querySelectorAll('.host-monitor__grid-item')[0];
    if (source == null) return;
    source.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientY: source.getBoundingClientRect().bottom - 1, dataTransfer: transfer }));
  })()`);
  await waitFor("document.querySelector('.host-monitor__grid-item[data-drop-position]') === null");
  await evaluate(`(() => {
    const transfer = window.__hostMonitorGridQaTransfer;
    const target = document.querySelectorAll('.host-monitor__grid-item')[1];
    if (target == null) return;
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientY: target.getBoundingClientRect().bottom - 1, dataTransfer: transfer }));
  })()`);
  await waitFor("document.querySelectorAll('.host-monitor__grid-item')[1]?.dataset.dropPosition === 'after'");
  await evaluate("document.querySelector('.host-monitor__panel-grid')?.scrollIntoView({ block: 'start' })");
  await screenshot(dashboardDragPath);
  await evaluate(`(() => {
    const transfer = window.__hostMonitorGridQaTransfer;
    const target = document.querySelectorAll('.host-monitor__grid-item')[1];
    if (target == null) return;
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientY: target.getBoundingClientRect().bottom - 1, dataTransfer: transfer }));
    delete window.__hostMonitorGridQaTransfer;
  })()`);
  await waitFor(`document.querySelectorAll('.host-monitor__grid-item')[1]?.dataset.widgetKey === ${JSON.stringify(gridDragKey)}`);
  await evaluate(`document.querySelector('.host-monitor__editor-list [data-widget-key="${gridDragKey}"] button[aria-label*=" earlier"]')?.click()`);
  await waitFor(`document.querySelectorAll('.host-monitor__grid-item')[0]?.dataset.widgetKey === ${JSON.stringify(gridDragKey)}`);
  await evaluate(`(() => {
    const transfer = new DataTransfer();
    window.__hostMonitorQaTransfer = transfer;
    document.querySelectorAll('.host-monitor__editor-list > li')[0]?.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
  })()`);
  await waitFor("document.querySelectorAll('.host-monitor__editor-list > li')[0]?.dataset.dragging === 'true'");
  await evaluate(`(() => {
    const transfer = window.__hostMonitorQaTransfer;
    const target = document.querySelectorAll('.host-monitor__editor-list > li')[1];
    target?.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    target?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    delete window.__hostMonitorQaTransfer;
  })()`);
  await waitFor(`document.querySelectorAll('.host-monitor__editor-list > li')[1]?.dataset.widgetKey === ${JSON.stringify(changedKey)}`);
  await evaluate(`document.querySelector('.host-monitor__editor-list [data-widget-key="${changedKey}"] button[aria-label*=" earlier"]')?.click()`);
  await waitFor(`document.querySelectorAll('.host-monitor__editor-list > li')[0]?.dataset.widgetKey === ${JSON.stringify(changedKey)}`);
  await evaluate(`document.querySelector('.host-monitor__editor-list [data-widget-key="${changedKey}"] input[type=checkbox]')?.click()`);
  await evaluate(`document.querySelector('.host-monitor__editor-list [data-widget-key="${changedKey}"] button[aria-label*=" later"]')?.click()`);
  await evaluate(`Array.from(document.querySelectorAll('.host-monitor__editor button')).find((button) => button.textContent?.trim() === 'Save layout')?.click()`);
  await waitFor("document.querySelector('.host-monitor__editor') === null");
  await evaluate("new Promise((resolve) => setTimeout(resolve, 300))");
  await call("Page.reload", { ignoreCache: true });
  await waitFor("Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'Customize' && !button.disabled)");
  if (processHostName != null) {
    await evaluate(`Array.from(document.querySelectorAll('.host-monitor__machine-card')).find((button) => button.querySelector('strong')?.textContent === 'dyaus')?.click()`);
    await waitFor("document.querySelector('.host-monitor__machine-card[data-selected=\"true\"] strong')?.textContent === 'dyaus'");
    await waitFor("Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'Customize' && !button.disabled)");
  }
  await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Customize')?.click()`);
  await waitFor("document.querySelector('.host-monitor__editor') !== null");
  const persistedWidgets = await evaluate(`Array.from(document.querySelectorAll('.host-monitor__editor-list > li')).map((row) => ({ key: row.dataset.widgetKey, visible: row.querySelector('input[type=checkbox]')?.checked ?? false }))`);
  if (persistedWidgets[1]?.key !== changedKey || persistedWidgets[1]?.visible === originalWidgets[0]?.visible) throw new Error(`Widget layout did not persist: ${JSON.stringify({ changedKey, originalWidgets, persistedWidgets })}`);
  await evaluate(`document.querySelector('.host-monitor__editor-list [data-widget-key="${changedKey}"] input[type=checkbox]')?.click()`);
  await evaluate(`document.querySelector('.host-monitor__editor-list [data-widget-key="${changedKey}"] button[aria-label*=" earlier"]')?.click()`);
  await evaluate(`Array.from(document.querySelectorAll('.host-monitor__editor button')).find((button) => button.textContent?.trim() === 'Save layout')?.click()`);
  await waitFor("document.querySelector('.host-monitor__editor') === null");

  const targetName = await evaluate("document.querySelector('.host-monitor__machine-card:not([data-selected=\"true\"]) strong')?.textContent ?? null");
  if (targetName == null) throw new Error("A second host was not available.");
  await evaluate(`Array.from(document.querySelectorAll('.host-monitor__machine-card')).find((button) => button.querySelector('strong')?.textContent === ${JSON.stringify(targetName)})?.click()`);
  await waitFor(`document.querySelector('.host-monitor__machine-card[data-selected="true"] strong')?.textContent === ${JSON.stringify(targetName)}`);
  await waitFor("document.querySelectorAll('.host-monitor__grid-item > article').length > 0");

  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: `${serverUrl}/plugins/host-monitor/host-monitor` });
  await waitFor("Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'Customize' && !button.disabled)");
  await clickCenter("document.querySelector('.bb-select__trigger')");
  await waitFor("document.querySelector('.bb-select__content') !== null");
  const narrowCombo = await evaluate(`(() => {
    const rect = document.querySelector('.bb-select__content')?.getBoundingClientRect();
    return rect == null ? null : { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
  })()`);
  if (narrowCombo == null || narrowCombo.left < 0 || narrowCombo.right > narrowCombo.viewportWidth || narrowCombo.top < 0 || narrowCombo.bottom > narrowCombo.viewportHeight) throw new Error(`History popup escaped narrow viewport: ${JSON.stringify(narrowCombo)}`);
  await pressKey("Escape");
  await waitFor("document.querySelector('.bb-select__content') === null && document.activeElement === document.querySelector('.bb-select__trigger')");
  await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Customize')?.click()`);
  await waitFor("document.querySelector('.host-monitor__editor') !== null");
  await waitFor("document.querySelector('.host-monitor__process-list') !== null");
  await evaluate("document.querySelector('.host-monitor__editor')?.scrollIntoView({ block: 'start' })");
  const narrow = await evaluate(`({
    viewport: [innerWidth, innerHeight],
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    rows: document.querySelectorAll('.host-monitor__editor-list > li').length,
    hostStripOverflow: getComputedStyle(document.querySelector('.host-monitor__machine-grid')).overflowX,
    processTableDisplay: getComputedStyle(document.querySelector('.host-monitor__process-table-wrap')).display,
    processListDisplay: getComputedStyle(document.querySelector('.host-monitor__process-list')).display,
    rangeRight: document.querySelector('.host-monitor__range')?.getBoundingClientRect().right ?? innerWidth + 1,
    rangeWidth: document.querySelector('.host-monitor__range')?.getBoundingClientRect().width ?? 0
  })`);
  if (narrow.overflow || narrow.rows < 10 || narrow.hostStripOverflow !== 'auto' || narrow.processTableDisplay !== 'none' || narrow.processListDisplay !== 'grid' || narrow.rangeRight > narrow.viewport[0] || narrow.rangeWidth < 96) throw new Error(`Invalid narrow layout: ${JSON.stringify(narrow)}`);
  await screenshot(narrowPath);

  console.log(JSON.stringify({ modal: modalSummary, navigation: navigationState, combobox: { ...comboboxSummary, options: comboOptions, keyboardFocusRestored: true, narrowBounds: narrowCombo }, initial, widgets: { original: originalWidgets.length, persisted: persistedWidgets.length, changedKey, gridDragKey }, processes: { ...processSummary, collapsed: collapsedProcesses }, switchedTo: targetName, narrow, artifacts: [sidebarPath, modalPath, monitorPath, comboPath, dashboardDragPath, processPath, processCollapsedPath, processDialogPath, desktopPath, narrowPath] }));
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
