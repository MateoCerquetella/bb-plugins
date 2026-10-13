import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { bindingReady, ensureViewerShare, provisionProjectInstance, viewerOrigin } from "../provisioning.ts";

const project = "proj_fixture";
const hash = createHash("sha256").update(project).digest("hex");
const name = `bb-steel-${hash.slice(0, 24)}`;
const image = "ghcr.io/steel-dev/steel-browser@sha256:f5cd68fbc2cb27e5d7766269860fd0fb29cbe5fe506245a49c82f85ba210e7da";
const instance = () => ({
  Config: { Image: image, Labels: { "bb.steel.project": project },
    Env: ["DOMAIN=viewer.test", "USE_SSL=true", "CHROME_USER_DATA_DIR=/profiles/chrome"] },
  HostConfig: { Dns: ["1.1.1.1", "8.8.8.8"], PortBindings: {
    "3000/tcp": [{HostIp: "127.0.0.1", HostPort: "3200"}],
    "9223/tcp": [{HostIp: "127.0.0.1", HostPort: "9300"}],
  }},
  State: { Running: true },
  Mounts: [{Type: "volume", Name: `${name}-profile`, Destination: "/profiles"}],
});

const binding = { apiUrl: "http://127.0.0.1:3200", cdpUrl: "http://127.0.0.1:9300", viewerUrl: "https://viewer.test" };

test("missing viewer share validates the container then exposes only API on the Steel host", async () => {
  const calls: string[][] = [];
  await ensureViewerShare(project, binding, {
    host: "steel-host",
    verify: async (id, saved) => {
      assert.equal(id, project);
      assert.deepEqual(saved, binding);
      calls.push(["verify"]);
    },
    run: async (cmd, args) => {
      assert.equal(cmd, "bb");
      calls.push(args);
      if (args.includes("shares")) return JSON.stringify({ shares: [{ port: 9300, url: "https://unrelated.test" }] });
      return binding.viewerUrl;
    },
  });
  assert.deepEqual(calls, [
    ["verify"],
    ["connect", "shares", "--host", "steel-host", "--json"],
    ["connect", "expose", "3200", "--host", "steel-host"],
  ]);
});

test("matching viewer share validates ownership and is reused without share mutations", async () => {
  let verified = false;
  await ensureViewerShare(project, binding, {
    verify: async () => { verified = true; },
    run: async (_cmd, args) => {
      assert(args.includes("shares"));
      return JSON.stringify({ shares: [{ port: 3200, url: binding.viewerUrl }] });
    },
  });
  assert.equal(verified, true);
});

test("matching viewer share rejects container mismatch without calling Connect", async () => {
  let called = false;
  await assert.rejects(ensureViewerShare(project, binding, {
    verify: async () => { throw new Error("container mismatch"); },
    run: async () => {
      called = true;
      return JSON.stringify({ shares: [{ port: 3200, url: binding.viewerUrl }] });
    },
  }), /container mismatch/);
  assert.equal(called, false);
});

test("viewer share validation and Connect errors propagate without repair", async () => {
  for (const failure of ["list", "verify", "expose", "existing-origin", "restored-origin", "malformed"]) {
    let exposed = false;
    await assert.rejects(ensureViewerShare(project, binding, {
      verify: async () => {
        if (failure === "verify") throw new Error("container mismatch");
      },
      run: async (_cmd, args) => {
        if (args.includes("shares")) {
          if (failure === "list") throw new Error("Connect unavailable");
          if (failure === "malformed") return "{}";
          return JSON.stringify({ shares: failure === "existing-origin"
            ? [{ port: 3200, url: "https://wrong.test" }] : [] });
        }
        exposed = true;
        if (failure === "expose") throw new Error("Connect unavailable");
        return "https://wrong.test";
      },
    }));
    assert.equal(exposed, ["expose", "restored-origin"].includes(failure));
  }
});

test("viewer recovery refuses nonlocal and CDP ports before calling Connect", async () => {
  for (const apiUrl of ["http://remote.test:3200", binding.cdpUrl, "http://127.0.0.1", "http://127.0.0.1:3200/path"]) {
    await assert.rejects(ensureViewerShare(project, { ...binding, apiUrl }, {
      run: async () => { assert.fail("unsafe endpoint must not reach Connect"); },
    }), /dedicated loopback/);
  }
});

test("readiness probes API and CDP concurrently and rejects unhealthy responses", async () => {
  const binding = { apiUrl: "http://127.0.0.1:3200", cdpUrl: "http://127.0.0.1:9300", viewerUrl: "https://viewer.test" };
  const pending: (() => void)[] = [];
  const ready = bindingReady(binding, (async (url, options) => {
    assert(options?.signal);
    await new Promise<void>(resolve => pending.push(resolve));
    return Response.json(String(url).endsWith("/v1/health") ? { status: "ok" } : { webSocketDebuggerUrl: "ws://127.0.0.1/test" });
  }) as typeof fetch);
  assert.equal(pending.length, 2);
  pending.forEach(resolve => resolve());
  assert.equal(await ready, true);
  for (const response of [Response.json({}), new Response("bad", { status: 503 }), new Response("invalid json")]) {
    assert.equal(await bindingReady(binding, (async () => response.clone()) as typeof fetch), false);
  }
  assert.equal(await bindingReady(binding, (async () => { throw new Error("offline"); }) as typeof fetch), false);
});

test("new setup skips occupied/shared ports and exposes only API on the server host", async () => {
  const calls: [string, string[]][] = [];
  const start = 20000 + (parseInt(hash.slice(0, 8), 16) % 10000) * 2;
  let ready = false;
  const result = await provisionProjectInstance(project, {
    host: "server-host",
    available: async port => port !== start + 2,
    ready: async () => { ready = true; },
    run: async (cmd, args) => {
      calls.push([cmd, args]);
      if (args.includes("shares")) return JSON.stringify({ shares: [{port: start + 1}] });
      if (cmd === "bb") return "https://viewer.test\n";
      return "";
    },
  });
  assert.equal(result.apiUrl, `http://127.0.0.1:${start + 4}`);
  assert.equal(result.cdpUrl, `http://127.0.0.1:${start + 5}`);
  assert.deepEqual(calls.find(([, a]) => a.includes("expose")), ["bb", ["connect", "expose", String(start + 4), "--host", "server-host"]]);
  const docker = calls.find(([, a]) => a[0] === "run")![1];
  assert(docker.includes(`${name}-profile:/profiles`));
  assert(docker.includes(`bb.steel.project=${project}`));
  assert(docker.includes(image));
  assert(ready);
  assert.equal(docker[docker.indexOf("--dns") + 1], "1.1.1.1");
  assert.equal(docker[docker.indexOf("--dns", docker.indexOf("--dns") + 1) + 1], "8.8.8.8");
});

test("existing project with inherited DNS is recreated with the same profile", async () => {
  const existing = instance();
  existing.HostConfig.Dns = ["192.168.88.1"];
  const calls: string[][] = [];
  await provisionProjectInstance(project, {
    ready: async () => {},
    run: async (cmd, args) => {
      calls.push(args);
      if (cmd === "bb") return "https://viewer.test";
      if (args[0] === "ps") return name;
      if (args[0] === "inspect") return JSON.stringify([existing]);
      return "";
    },
  });
  assert(calls.some(args => args[0] === "rm" && args[1] === "-f" && args[2] === name));
  const cleanup = calls.find(args => args.includes("--entrypoint"))!;
  assert(cleanup.includes(`${name}-profile:/profiles`));
  assert.equal(cleanup.at(-1), "rm -f /profiles/chrome/SingletonLock /profiles/chrome/SingletonCookie /profiles/chrome/SingletonSocket");
  assert(calls.findIndex(args => args[0] === "stop") < calls.indexOf(cleanup));
  assert(calls.findIndex(args => args[0] === "rm") < calls.indexOf(cleanup));
  const run = calls.find(args => args[0] === "run" && args.includes("--name"))!;
  assert(run.includes("--dns") && run.includes("1.1.1.1") && run.includes("8.8.8.8"));
  assert(run.includes(`${name}-profile:/profiles`));
});

test("dead CDP on a validated project triggers one scoped repair", async () => {
  const calls: string[][] = [];
  let attempts = 0;
  await provisionProjectInstance(project, {
    ready: async () => { if (++attempts === 1) throw new Error("CDP unavailable"); },
    run: async (cmd, args) => {
      calls.push(args);
      if (cmd === "bb") return "https://viewer.test";
      if (args[0] === "ps") return name;
      if (args[0] === "inspect") return JSON.stringify([instance()]);
      return "";
    },
  });
  assert.equal(attempts, 2);
  assert.equal(calls.filter(args => args[0] === "rm").length, 1);
  assert(calls.some(args => args.includes(`${name}-profile:/profiles`) && args.includes("--entrypoint")));
});

test("persistent CDP failure is bounded to one recovery attempt", async () => {
  const calls: string[][] = [];
  await assert.rejects(provisionProjectInstance(project, {
    ready: async () => { throw new Error("CDP unavailable"); },
    run: async (cmd, args) => {
      calls.push(args);
      if (cmd === "bb") return "https://viewer.test";
      if (args[0] === "ps") return name;
      if (args[0] === "inspect") return JSON.stringify([instance()]);
      return "";
    },
  }), /CDP unavailable/);
  assert.equal(calls.filter(args => args[0] === "rm").length, 1);
});

test("shared profile or changed saved binding cannot trigger destructive repair", async () => {
  for (const shared of [true, false]) {
    const calls: string[][] = [];
    await assert.rejects(provisionProjectInstance(project, {
      existing: shared ? null : {
        apiUrl: "http://127.0.0.1:9999", cdpUrl: "http://127.0.0.1:9300", viewerUrl: "https://viewer.test",
      },
      ready: async () => { throw new Error("CDP unavailable"); },
      run: async (cmd, args) => {
        calls.push(args);
        if (cmd === "bb") return "https://viewer.test";
        if (args.some(arg => arg.startsWith("volume="))) return `${name}\nforeign-container`;
        if (args[0] === "ps") return name;
        if (args[0] === "inspect") return JSON.stringify([instance()]);
        return "";
      },
    }), shared ? /another running container/ : /saved binding/);
    assert(!calls.some(args => ["stop", "rm", "run"].includes(args[0]!)));
  }
});

test("existing stopped project is validated and resumed without replacing its profile", async () => {
  const existing = instance();
  existing.State.Running = false;
  const calls: string[][] = [];
  await provisionProjectInstance(project, {
    ready: async () => {},
    run: async (cmd, args) => {
      calls.push(args);
      if (cmd === "bb") return "https://viewer.test";
      if (args[0] === "ps") return name;
      if (args[0] === "inspect") return JSON.stringify([existing]);
      return "";
    },
  });
  assert(calls.some(args => args[0] === "start"));
  assert(!calls.some(args => ["run", "rm"].includes(args[0]!)));
});

test("foreign profile and Connect errors fail closed", async () => {
  const existing = instance();
  existing.Config.Labels["bb.steel.project"] = "another-project";
  await assert.rejects(provisionProjectInstance(project, {
    run: async (_cmd, args) => args[0] === "ps" ? name : JSON.stringify([existing]),
  }), /refusing replacement/);
  await assert.rejects(provisionProjectInstance(project, {
    available: async () => true,
    run: async (cmd) => {
      if (cmd === "bb") throw new Error("Connect unavailable");
      return "";
    },
  }), /Connect unavailable/);
});

test("viewer origins reject credentials, non-HTTPS and paths", () => {
  for (const value of ["http://viewer.test", "https://user:password@viewer.test", "https://viewer.test/path"]) {
    assert.throws(() => viewerOrigin(value));
  }
  assert.equal(viewerOrigin("https://viewer.test\n"), "https://viewer.test");
});

test("Docker port inspection requests only bounded port metadata", async () => {
  let inspected = false;
  await provisionProjectInstance(project, {
    available: async () => true,
    ready: async () => {},
    run: async (cmd, args) => {
      if (args.includes("shares")) return '{"shares":[]}';
      if (cmd === "bb") return "https://viewer.test";
      if (args.includes("{{json .ID}}")) return '"container-id"\n';
      if (args[0] === "inspect") {
        assert.deepEqual(args, ["inspect", "--format", "{{json .HostConfig.PortBindings}}", "container-id"]);
        inspected = true;
        return '{"3000/tcp":[{"HostPort":"3200"}]}\n';
      }
      return "";
    },
  });
  assert(inspected);
});
