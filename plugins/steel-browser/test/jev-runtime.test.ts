import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import {
  parseJevOutcome,
  prepareJevEnvironment,
  runJevRuntime,
  type JevCdpSession,
  type JevEnvironment,
} from "../jev-runtime.ts";

const exec = promisify(execFile);

const BROWSER_MODULE = `
def cdp(method, session_id=None, **params):
    raise RuntimeError("bridge was not installed")
class Browser:
    def call(self, method, **params):
        return cdp(method, **params)
`;

const AGENT_MODULE = `
import json, os, urllib.error, urllib.request
from jev_ultrafast.browser import Browser
class Agent:
    def __init__(self, url, goal):
        self.state={"status":os.environ.get("FAKE_JEV_STATUS", "done"), "history":[{"goal":goal}]}
    def __enter__(self):
        self.browser=Browser("about:blank")
        bridge_file=os.environ.get("FAKE_JEV_BRIDGE_FILE")
        if bridge_file:
            with open(bridge_file, "w") as output:
                output.write(os.environ["BB_JEV_BRIDGE"])
        if os.environ.get("FAKE_JEV_MODE") == "unauthorized":
            self.state["status"]="blocked"
            request=urllib.request.Request(os.environ["BB_JEV_BRIDGE"],
                data=json.dumps({"method":"Runtime.evaluate","params":{}}).encode(),
                headers={"Authorization":"Bearer invalid","Content-Type":"application/json"})
            try:
                urllib.request.urlopen(request)
                raise RuntimeError("unauthorized request succeeded")
            except urllib.error.HTTPError as error:
                if error.code != 403:
                    raise
        return self
    def __exit__(self, *args):
        self.browser.close()
    def run(self):
        if os.environ.get("FAKE_JEV_MODE") == "unsupported":
            self.browser.call("Network.enable")
        elif os.environ.get("FAKE_JEV_MODE") != "unauthorized":
            self.browser.call("Runtime.evaluate", expression="document.title")
        yield self.state
`;

async function runtimeFixture(): Promise<{
  checkout: string;
  runtime: JevEnvironment;
  cleanup(): Promise<void>;
}> {
  const checkout = await mkdtemp(join(tmpdir(), "bb-surf-jev-runtime-"));
  await mkdir(join(checkout, ".venv/bin"), { recursive: true });
  await mkdir(join(checkout, "jev_ultrafast"));
  const python = (await exec("python3", ["-c", "import sys; print(sys.executable)"])).stdout.trim();
  await symlink(python, join(checkout, ".venv/bin/python"));
  await writeFile(join(checkout, "jev_ultrafast/__init__.py"), "");
  await writeFile(join(checkout, "jev_ultrafast/browser.py"), BROWSER_MODULE);
  await writeFile(join(checkout, "jev_ultrafast/agent.py"), AGENT_MODULE);
  const envFile = join(checkout, "credentials.env");
  await writeFile(envFile, "TYPESAFE_API_KEY=typesafe-secret\nTEXT_MODEL_API_KEY=text-secret\n");
  await chmod(envFile, 0o600);
  const runtime = await prepareJevEnvironment({
    jevCheckout: checkout,
    jevEnvFile: envFile,
    jevTextModel: "test/model",
  }, true);
  return {
    checkout,
    runtime,
    cleanup: () => rm(checkout, { recursive: true, force: true }),
  };
}

function session() {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  let detached = 0;
  const value: JevCdpSession = {
    async send(method, params) {
      calls.push({ method, params });
      return { value: "Example" };
    },
    async detach() {
      detached++;
    },
  };
  return { value, calls, detached: () => detached };
}

test("the production Python bridge executes against the bounded CDP adapter and cleans up", async () => {
  const fixture = await runtimeFixture();
  const cdp = session();
  const bridgeFile = join(fixture.checkout, "bridge-url.txt");
  try {
    const outcome = await runJevRuntime(
      { ...fixture.runtime, env: { ...fixture.runtime.env, FAKE_JEV_BRIDGE_FILE: bridgeFile } },
      fixture.checkout,
      "Read the title",
      cdp.value,
    );
    assert.equal(outcome.status, "done");
    assert.equal(outcome.actions, 1);
    assert.ok(outcome.agentLoopMs >= 0);
    assert.deepEqual(cdp.calls, [
      { method: "Emulation.setFocusEmulationEnabled", params: { enabled: true } },
      { method: "Runtime.evaluate", params: { expression: "document.title" } },
    ]);
    assert.equal(cdp.detached(), 1);
    const bridgeUrl = await readFile(bridgeFile, "utf8");
    await assert.rejects(fetch(bridgeUrl));
  } finally {
    await fixture.cleanup();
  }
});

test("the bridge rejects unauthenticated and unsupported operations", async () => {
  const fixture = await runtimeFixture();
  try {
    const unauthenticated = session();
    const blocked = await runJevRuntime(
      { ...fixture.runtime, env: { ...fixture.runtime.env, FAKE_JEV_MODE: "unauthorized" } },
      fixture.checkout,
      "Try an unauthorized request",
      unauthenticated.value,
    );
    assert.equal(blocked.status, "blocked");
    assert.deepEqual(unauthenticated.calls.map(call => call.method), [
      "Emulation.setFocusEmulationEnabled",
    ]);
    assert.equal(unauthenticated.detached(), 1);

    const unsupported = session();
    await assert.rejects(
      runJevRuntime(
        { ...fixture.runtime, env: { ...fixture.runtime.env, FAKE_JEV_MODE: "unsupported" } },
        fixture.checkout,
        "Use an unsupported method",
        unsupported.value,
      ),
    );
    assert.deepEqual(unsupported.calls.map(call => call.method), [
      "Emulation.setFocusEmulationEnabled",
    ]);
    assert.equal(unsupported.detached(), 1);
  } finally {
    await fixture.cleanup();
  }
});

test("runtime results accept only terminal status, nonnegative actions, and bounded timing", async () => {
  assert.deepEqual(parseJevOutcome('{"status":"blocked","actions":0,"agent_ms":12}'), {
    status: "blocked",
    actions: 0,
    agentLoopMs: 12,
  });
  for (const output of [
    '{"status":"running","actions":1,"agent_ms":12}',
    '{"status":"done","actions":-1,"agent_ms":12}',
    '{"status":"done","actions":1.5,"agent_ms":12}',
    '{"status":"done","actions":1,"agent_ms":-1}',
    '{"status":"done","actions":1,"agent_ms":90001}',
    "not json",
  ]) {
    assert.throws(() => parseJevOutcome(output), /invalid runtime result/u);
  }
});

test("malformed upstream terminal state cannot be reported as success", async () => {
  const fixture = await runtimeFixture();
  const cdp = session();
  try {
    await assert.rejects(
      runJevRuntime(
        { ...fixture.runtime, env: { ...fixture.runtime.env, FAKE_JEV_STATUS: "running" } },
        fixture.checkout,
        "Return a malformed status",
        cdp.value,
      ),
      /invalid runtime result/u,
    );
    assert.equal(cdp.detached(), 1);
  } finally {
    await fixture.cleanup();
  }
});
