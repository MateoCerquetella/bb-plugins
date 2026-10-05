import { execFile } from "node:child_process";
import { readFile, stat, access } from "node:fs/promises";
import { constants } from "node:fs";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { createRequire } from "node:module";
import { parseEnv, promisify } from "node:util";
import type { EnginePolicy, Binding } from "./contract.ts";

const exec = promisify(execFile);
// Playwright loads driver assets relative to its package, so keep it external.
const loadPlaywright = () => createRequire(import.meta.url)("playwright") as typeof import("playwright");
type Engine = "playwright" | "jev";
export type JevConfig = { jevCheckout: string; jevEnvFile: string; jevTextModel: string };
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
  } catch {
    signal?.throwIfAborted();
    if (!policy.fallback) throw new Error(`${primary} preflight failed. No browser action was dispatched.`);
    const secondary = primary === "jev" ? "playwright" : "jev";
    await preflight(secondary);
    signal?.throwIfAborted();
    return { engine: secondary, fallbackReason: `${primary} unavailable before execution` };
  }
}

async function jevEnvironment(config: JevConfig, allowPaid: boolean) {
  if (!allowPaid) throw new Error("Jev requires explicit per-run --allow-paid authorization.");
  if (!isAbsolute(config.jevCheckout) || !isAbsolute(config.jevEnvFile)) {
    throw new Error("Configure absolute Jev checkout and credentials-file paths.");
  }
  const file = await stat(config.jevEnvFile);
  if (!file.isFile() || file.size > 65536 || (file.mode & 0o077) !== 0) {
    throw new Error("Jev credentials file must be private (0600) and at most 64KiB.");
  }
  const values = parseEnv(await readFile(config.jevEnvFile, "utf8"));
  if (!values.TYPESAFE_API_KEY?.trim() || !values.TEXT_MODEL_API_KEY?.trim()) {
    throw new Error("Jev credentials are missing.");
  }
  const python = join(config.jevCheckout, ".venv/bin/python");
  await access(python, constants.X_OK);
  // Do not pass arbitrary dotenv keys such as PYTHONPATH or LD_PRELOAD.
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME };
  for (const key of ["TYPESAFE_API_KEY", "TYPESAFE_MODEL", "TEXT_MODEL_API_KEY", "TEXT_MODEL_BASE_URL", "TEXT_MODEL_REASONING"]) {
    if (values[key]) env[key] = values[key];
  }
  env.TEXT_MODEL = config.jevTextModel;
  try {
    await exec(python, ["-c", "import jev_ultrafast.agent, jev_ultrafast.browser"], {
      cwd: config.jevCheckout, env, timeout: 10000, maxBuffer: 4096,
    });
  } catch {
    throw new Error("Jev runtime import failed. Check the configured checkout and run uv sync.");
  }
  return { python, env };
}

const JEV_BRIDGE = `
import json, os, urllib.request
import jev_ultrafast.browser as browser_module
import jev_ultrafast.agent as agent_module
def cdp(method, session_id=None, **params):
    request=urllib.request.Request(os.environ["BB_JEV_BRIDGE"],
        data=json.dumps({"method":method,"params":params}).encode(),
        headers={"Authorization":"Bearer "+os.environ["BB_JEV_TOKEN"],"Content-Type":"application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload=json.load(response)
    if "error" in payload: raise RuntimeError("Browser action failed; inspect before retrying")
    return payload["result"]
browser_module.cdp=cdp
class ProjectBrowser(browser_module.Browser):
    def __init__(self, url):
        self.session="project"
        self.target=None
        self.call("Emulation.setFocusEmulationEnabled", enabled=True)
    def close(self): pass
agent_module.Browser=ProjectBrowser
with agent_module.Agent("about:blank", os.environ["BB_JEV_GOAL"]) as agent:
    for state in agent.run(): pass
    print(json.dumps({"status":agent.state["status"],"actions":len(agent.state["history"])}))
`;

export async function runBrowser(
  binding: Binding, policy: EnginePolicy, config: JevConfig, request: RunRequest,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const url = new URL(request.url);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Navigation requires an HTTP(S) URL without credentials.");
  }
  let jev: Awaited<ReturnType<typeof jevEnvironment>> | undefined;
  const effectivePolicy: EnginePolicy = request.goal?.trim()
    ? policy
    : { engine: "playwright", fallback: false };
  const selected = await chooseEngine(effectivePolicy, async engine => {
    if (engine === "jev") {
      if (!request.goal?.trim()) throw new Error("Jev requires a goal.");
      jev = await jevEnvironment(config, request.allowPaid);
    } else {
      loadPlaywright();
    }
  }, signal);
  if (selected.engine === "playwright" && request.goal) {
    return { ...selected, status: "agent-handoff", cdpUrl: binding.cdpUrl,
      message: "No browser action has run. Use bb steel-browser inspect/click/fill/press on this project, including when CDP is on another host." };
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
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
    signal?.throwIfAborted();
    if (selected.engine === "playwright") {
      return { ...selected, status: "navigated", url: page.url(), title: await page.title() };
    }
    const session = await context.newCDPSession(page);
    const token = randomBytes(32).toString("hex");
    const methods = new Set(["Runtime.evaluate", "Page.captureScreenshot", "Emulation.setFocusEmulationEnabled",
      "Input.dispatchMouseEvent", "Input.dispatchKeyEvent", "Input.insertText"]);
    const server = createServer(async (req, res) => {
      if (req.method !== "POST" || req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(403).end(); return;
      }
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk.toString();
          if (body.length > 1048576) throw new Error("Request too large");
        }
        const { method, params } = JSON.parse(body);
        if (!methods.has(method)) throw new Error("Unsupported CDP method");
        const result = await session.send(method, params);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ result }));
      } catch { res.end(JSON.stringify({ error: "Browser operation failed" })); }
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Bridge unavailable");
      const result = await exec(jev!.python, ["-c", JEV_BRIDGE], {
        cwd: config.jevCheckout, timeout: 90000, maxBuffer: 16384, signal,
        env: { ...jev!.env, BB_JEV_BRIDGE: `http://127.0.0.1:${address.port}`,
          BB_JEV_TOKEN: token, BB_JEV_GOAL: request.goal },
      });
      const outcome = JSON.parse(result.stdout.trim());
      return { ...selected, status: String(outcome.status), actions: Number(outcome.actions), url: page.url() };
    } catch {
      throw new Error("Jev stopped after execution began. Outcome must be inspected; automatic replay is disabled.");
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await session.detach();
    }
  } finally { await browser.close(); }
}
