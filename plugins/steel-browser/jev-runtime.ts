import { execFile } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { isAbsolute, join } from "node:path";
import { parseEnv, promisify } from "node:util";

const exec = promisify(execFile);
const BRIDGE_BODY_LIMIT = 1_048_576;
const BRIDGE_REQUEST_TIMEOUT_MS = 30_000;
const JEV_PROCESS_TIMEOUT_MS = 90_000;

export type JevConfig = {
  jevCheckout: string;
  jevEnvFile: string;
  jevTextModel: string;
};

export type JevEnvironment = {
  python: string;
  env: NodeJS.ProcessEnv;
};

export type JevOutcome = {
  status: "done" | "blocked";
  actions: number;
  agentLoopMs: number;
};

export type JevCdpSession = {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  detach(): Promise<void>;
};

async function bounded<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Browser operation timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const JEV_BRIDGE = `
import json, os, time, urllib.request
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
    started=time.monotonic()
    for state in agent.run(): pass
    agent_ms=round((time.monotonic()-started)*1000)
    print(json.dumps({"status":agent.state["status"],"actions":len(agent.state["history"]),"agent_ms":agent_ms}))
`;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function authorized(header: string | string[] | undefined, token: string): boolean {
  if (typeof header !== "string") return false;
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function parseJevOutcome(stdout: string): JevOutcome {
  let value: unknown;
  try {
    value = JSON.parse(stdout.trim());
  } catch {
    throw new Error("Jev returned an invalid runtime result.");
  }
  if (
    !record(value)
    || (value.status !== "done" && value.status !== "blocked")
    || typeof value.actions !== "number"
    || !Number.isSafeInteger(value.actions)
    || value.actions < 0
    || typeof value.agent_ms !== "number"
    || !Number.isFinite(value.agent_ms)
    || value.agent_ms < 0
    || value.agent_ms > JEV_PROCESS_TIMEOUT_MS
  ) {
    throw new Error("Jev returned an invalid runtime result.");
  }
  return {
    status: value.status,
    actions: value.actions,
    agentLoopMs: value.agent_ms,
  };
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}

export async function prepareJevEnvironment(
  config: JevConfig,
  allowPaid: boolean,
  signal?: AbortSignal,
): Promise<JevEnvironment> {
  if (!allowPaid) {
    throw new Error("Jev requires explicit per-run --allow-paid authorization.");
  }
  if (!isAbsolute(config.jevCheckout) || !isAbsolute(config.jevEnvFile)) {
    throw new Error("Configure absolute Jev checkout and credentials-file paths.");
  }
  if (!config.jevTextModel.trim()) {
    throw new Error("Configure a Jev text model.");
  }
  let file: Awaited<ReturnType<typeof stat>>;
  try {
    file = await stat(config.jevEnvFile);
  } catch {
    throw new Error("Jev credentials file is unavailable. Check the configured path.");
  }
  if (!file.isFile() || file.size > 65_536 || (file.mode & 0o077) !== 0) {
    throw new Error("Jev credentials file must be private (0600) and at most 64KiB.");
  }
  let values: Record<string, string>;
  try {
    const parsed = parseEnv(await readFile(config.jevEnvFile, { encoding: "utf8", signal }));
    values = Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    signal?.throwIfAborted();
    throw new Error("Jev credentials file is invalid.");
  }
  if (!values.TYPESAFE_API_KEY?.trim() || !values.TEXT_MODEL_API_KEY?.trim()) {
    throw new Error("Jev credentials are missing.");
  }
  const python = join(config.jevCheckout, ".venv/bin/python");
  try {
    await access(python, constants.X_OK);
  } catch {
    throw new Error("Jev Python runtime is unavailable. Run uv sync in the configured checkout.");
  }
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME };
  for (const key of [
    "TYPESAFE_API_KEY",
    "TYPESAFE_MODEL",
    "TEXT_MODEL_API_KEY",
    "TEXT_MODEL_BASE_URL",
    "TEXT_MODEL_REASONING",
  ]) {
    if (values[key]) env[key] = values[key];
  }
  env.TEXT_MODEL = config.jevTextModel;
  try {
    await exec(python, ["-c", "import jev_ultrafast.agent, jev_ultrafast.browser"], {
      cwd: config.jevCheckout,
      env,
      timeout: 10_000,
      maxBuffer: 4096,
      signal,
    });
  } catch {
    signal?.throwIfAborted();
    throw new Error("Jev runtime import failed. Check the configured checkout and run uv sync.");
  }
  return { python, env };
}

export async function runJevRuntime(
  runtime: JevEnvironment,
  checkout: string,
  goal: string,
  session: JevCdpSession,
  signal?: AbortSignal,
): Promise<JevOutcome> {
  const token = randomBytes(32).toString("hex");
  const methods = new Set([
    "Runtime.evaluate",
    "Page.captureScreenshot",
    "Emulation.setFocusEmulationEnabled",
    "Input.dispatchMouseEvent",
    "Input.dispatchKeyEvent",
    "Input.insertText",
  ]);
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (
      req.method !== "POST"
      || req.url !== "/"
      || !authorized(req.headers.authorization, token)
    ) {
      res.writeHead(403).end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.byteLength;
        if (size > BRIDGE_BODY_LIMIT) throw new Error("Request too large");
        chunks.push(bytes);
      }
      const payload: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (
        !record(payload)
        || typeof payload.method !== "string"
        || !methods.has(payload.method)
        || !record(payload.params)
      ) {
        throw new Error("Unsupported CDP request");
      }
      const result = await bounded(
        session.send(payload.method, payload.params),
        BRIDGE_REQUEST_TIMEOUT_MS,
      );
      res.end(JSON.stringify({ result }));
    } catch {
      res.end(JSON.stringify({ error: "Browser operation failed" }));
    }
  });
  server.headersTimeout = 5_000;
  server.requestTimeout = BRIDGE_REQUEST_TIMEOUT_MS;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Jev bridge is unavailable.");
    const result = await exec(runtime.python, ["-c", JEV_BRIDGE], {
      cwd: checkout,
      timeout: JEV_PROCESS_TIMEOUT_MS,
      maxBuffer: 16_384,
      signal,
      env: {
        ...runtime.env,
        BB_JEV_BRIDGE: `http://127.0.0.1:${address.port}`,
        BB_JEV_TOKEN: token,
        BB_JEV_GOAL: goal,
      },
    });
    return parseJevOutcome(result.stdout);
  } finally {
    try {
      await closeServer(server);
    } finally {
      await session.detach();
    }
  }
}
