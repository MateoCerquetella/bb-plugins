import { createRequire } from "node:module";
import type { BrowserContext, Page } from "playwright";
import type { Binding } from "./contract.ts";

const loadPlaywright = () =>
  createRequire(import.meta.url)("playwright") as typeof import("playwright");
const roles = new Set([
  "button",
  "link",
  "textbox",
  "checkbox",
  "combobox",
  "menuitem",
  "tab",
  "radio",
  "option",
]);

export type BrowserAction = (
  | { kind: "tabs" }
  | { kind: "inspect" }
  | { kind: "click"; role: string; name: string }
  | { kind: "fill"; role: string; name: string; value: string }
  | { kind: "press"; key: string }
  | { kind: "screenshot" }
) & { tab?: number };

export function projectPages(context: BrowserContext): Page[] {
  return context.pages().filter(page => !page.isClosed());
}

export function selectProjectPage(context: BrowserContext, tab?: number): Page {
  const pages = projectPages(context);
  const page = tab === undefined ? pages.at(-1) : pages[tab];
  if (!page) throw new Error(
    pages.length
      ? `Tab ${tab} is unavailable. Use \`bb steel-browser tabs\` to list open tabs.`
      : "No active project browser page. Navigate with `bb steel-browser run <url>` first.",
  );
  return page;
}

export function parseBrowserAction(
  command: string,
  args: string[],
): BrowserAction {
  let tab: number | undefined;
  if (args.length >= 2 && args.at(-2) === "--tab") {
    const value = args.at(-1)!;
    if (!/^(0|[1-9]\d{0,3})$/.test(value)) throw new Error("Invalid tab index. Use `bb steel-browser tabs`.");
    tab = Number(value);
    args = args.slice(0, -2);
  }
  if (command === "tabs" && args.length === 0 && tab === undefined) return { kind: "tabs" };
  if (command === "inspect" && args.length === 0) return { kind: "inspect", tab };
  if (command === "screenshot" && args.length === 0)
    return { kind: "screenshot", tab };
  if (
    command === "press" &&
    args.length === 1 &&
    args[0] &&
    args[0].length <= 80
  ) {
    return { kind: "press", key: args[0], tab };
  }
  if (
    (command === "click" || command === "fill") &&
    args.length === (command === "click" ? 2 : 3)
  ) {
    const [role, name, value] = args;
    if (
      role &&
      roles.has(role) &&
      (command !== "fill" || ["textbox", "combobox"].includes(role)) &&
      name &&
      name.length <= 500 &&
      (value === undefined || value.length <= 8000)
    ) {
      return command === "click"
        ? { kind: "click", role, name, tab }
        : { kind: "fill", role, name, value: value!, tab };
    }
  }
  throw new Error(
    "Use tabs, inspect, click <role> <exact-name>, fill <role> <exact-name> <value>, press <key>, or screenshot. Actions accept --tab <index>.",
  );
}

export async function executeBrowserAction(page: Page, action: BrowserAction) {
  if (action.kind === "tabs") throw new Error("List tabs with the project browser context.");
  if (action.kind === "inspect") {
    const snapshot = await page
      .locator("body")
      .ariaSnapshot({ timeout: 10000 });
    return {
      url: page.url(),
      title: await page.title(),
      snapshot: snapshot.slice(0, 40000),
      truncated: snapshot.length > 40000,
    };
  }
  if (action.kind === "screenshot") {
    return {
      url: page.url(),
      mimeType: "image/png",
      base64: (await page.screenshot({ timeout: 10000 })).toString("base64"),
    };
  }
  if (action.kind === "press") {
    await page.keyboard.press(action.key);
  } else {
    const locator = page.getByRole(
      action.role as Parameters<Page["getByRole"]>[0],
      { name: action.name, exact: true },
    );
    const count = await locator.count();
    if (count !== 1)
      throw new Error(
        `Expected one ${action.role} named "${action.name}", found ${count}. Inspect the page again.`,
      );
    if (action.kind === "click") await locator.click({ timeout: 10000 });
    else await locator.fill(action.value, { timeout: 10000 });
  }
  return { url: page.url(), title: await page.title() };
}

export async function actOnProject(
  binding: Binding,
  action: BrowserAction,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const response = await fetch(new URL("/json/version", binding.cdpUrl), {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Project CDP endpoint is unavailable.");
  const version = (await response.json()) as { webSocketDebuggerUrl: string };
  const ws = new URL(version.webSocketDebuggerUrl);
  ws.host = new URL(binding.cdpUrl).host;
  ws.protocol = "ws:";
  const browser = await loadPlaywright().chromium.connectOverCDP(
    ws.toString(),
    { timeout: 10000 },
  );
  try {
    signal?.throwIfAborted();
    const context = browser.contexts()[0];
    if (!context) throw new Error("Project browser has no persistent context.");
    if (action.kind === "tabs") {
      return await Promise.all(projectPages(context).map(async (page, index) => ({
        index, url: page.url(), title: await page.title(),
      })));
    }
    const page = selectProjectPage(context, action.tab);
    const result = await executeBrowserAction(page, action);
    signal?.throwIfAborted();
    return result;
  } finally {
    await browser.close();
  }
}
