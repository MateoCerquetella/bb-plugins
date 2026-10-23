import { createRequire } from "node:module";
import type { EnginePolicy, Binding } from "./contract.ts";
import { projectPages } from "./actions.ts";
import {
  prepareJevEnvironment,
  runJevRuntime,
  type JevConfig as RuntimeJevConfig,
} from "./jev-runtime.ts";

// Playwright loads driver assets relative to its package, so keep it external.
const loadPlaywright = () => createRequire(import.meta.url)("playwright") as typeof import("playwright");
type Engine = "playwright" | "jev";
export type { JevConfig } from "./jev-runtime.ts";
export type RunRequest = { url: string; goal?: string; allowPaid: boolean };

export async function chooseEngine(
  policy: EnginePolicy,
  preflight: (engine: Engine) => Promise<void>,
  signal?: AbortSignal,
): Promise<{ engine: Engine; fallbackReason: string | null }> {
  signal?.throwIfAborted();
  const primary = policy.engine === "auto" ? "jev" : policy.engine;
  try {
    await preflight(primary);
    signal?.throwIfAborted();
    return { engine: primary, fallbackReason: null };
  } catch (error) {
    signal?.throwIfAborted();
    const reason = error instanceof Error ? error.message : `${primary} preflight failed.`;
    if (!policy.fallback) throw new Error(`${reason} No browser action was dispatched.`);
    const secondary = primary === "jev" ? "playwright" : "jev";
    await preflight(secondary);
    signal?.throwIfAborted();
    return { engine: secondary, fallbackReason: reason };
  }
}

export async function runBrowser(
  binding: Binding, policy: EnginePolicy, config: RuntimeJevConfig, request: RunRequest,
  signal?: AbortSignal,
) {
  const started = performance.now();
  signal?.throwIfAborted();
  const url = new URL(request.url);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Navigation requires an HTTP(S) URL without credentials.");
  }
  let jev: Awaited<ReturnType<typeof prepareJevEnvironment>> | undefined;
  const effectivePolicy: EnginePolicy = request.goal?.trim()
    ? policy
    : { engine: "playwright", fallback: false };
  const selected = await chooseEngine(effectivePolicy, async engine => {
    if (engine === "jev") {
      if (!request.goal?.trim()) throw new Error("Jev requires a goal.");
      jev = await prepareJevEnvironment(config, request.allowPaid, signal);
    } else {
      try {
        loadPlaywright();
      } catch {
        throw new Error("Playwright runtime is unavailable. Reinstall BB Surf.");
      }
    }
  }, signal);
  if (selected.engine === "playwright" && request.goal) {
    return { ...selected, status: "agent-handoff", cdpUrl: binding.cdpUrl,
      message: "No browser action has run. Use bb surf inspect/click/fill/press on this project, including when CDP is on another host." };
  }
  const versionResponse = await fetch(new URL("/json/version", binding.cdpUrl), {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
    redirect: "error",
  });
  if (!versionResponse.ok) throw new Error("Project CDP endpoint is unavailable.");
  const version = await versionResponse.json() as { webSocketDebuggerUrl: string };
  const ws = new URL(version.webSocketDebuggerUrl);
  ws.host = new URL(binding.cdpUrl).host;
  ws.protocol = "ws:";
  const { chromium } = loadPlaywright();
  const browser = await chromium.connectOverCDP(ws.toString(), { timeout: 10000 });
  // No fallback from this point: even navigation can cause external effects.
  try {
    signal?.throwIfAborted();
    const context = browser.contexts()[0];
    if (!context) throw new Error("Project browser has no persistent context.");
    const page = projectPages(context).at(-1) ?? await context.newPage();
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
    signal?.throwIfAborted();
    if (selected.engine === "playwright") {
      return { ...selected, status: "navigated", url: page.url(), title: await page.title() };
    }
    try {
      const outcome = await runJevRuntime(
        jev!,
        config.jevCheckout,
        request.goal!,
        await context.newCDPSession(page),
        signal,
      );
      return {
        ...selected,
        status: outcome.status,
        actions: outcome.actions,
        url: page.url(),
        timing: {
          totalMs: Math.round(performance.now() - started),
          agentLoopMs: outcome.agentLoopMs,
        },
        verification: "required",
      };
    } catch {
      throw new Error("Jev stopped after execution began. Outcome must be inspected; automatic replay is disabled.");
    }
  } finally { await browser.close(); }
}
