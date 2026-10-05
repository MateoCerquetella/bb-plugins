import { createRequire } from "node:module";
import type { Page } from "playwright";
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

export type BrowserAction =
  | { kind: "inspect" }
  | { kind: "click"; role: string; name: string }
  | { kind: "fill"; role: string; name: string; value: string }
  | { kind: "press"; key: string }
  | { kind: "screenshot" };

export function parseBrowserAction(
  command: string,
  args: string[],
): BrowserAction {
  if (command === "inspect" && args.length === 0) return { kind: "inspect" };
  if (command === "screenshot" && args.length === 0)
    return { kind: "screenshot" };
  if (
    command === "press" &&
    args.length === 1 &&
    args[0] &&
    args[0].length <= 80
  ) {
    return { kind: "press", key: args[0] };
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
        ? { kind: "click", role, name }
        : { kind: "fill", role, name, value: value! };
    }
  }
  throw new Error(
    "Use inspect, click <role> <exact-name>, fill <role> <exact-name> <value>, press <key>, or screenshot.",
  );
}

export async function executeBrowserAction(page: Page, action: BrowserAction) {
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
    const page = browser.contexts()[0]?.pages()[0];
    if (!page)
      throw new Error(
        "No active project browser page. Navigate with `bb steel-browser run <url>` first.",
      );
    const result = await executeBrowserAction(page, action);
    signal?.throwIfAborted();
    return result;
  } finally {
    await browser.close();
  }
}
