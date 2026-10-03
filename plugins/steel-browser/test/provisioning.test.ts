import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { provisionProjectInstance, viewerOrigin } from "../provisioning.ts";

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
  const run = calls.find(args => args[0] === "run")!;
  assert(run.includes("--dns") && run.includes("1.1.1.1") && run.includes("8.8.8.8"));
  assert(run.includes(`${name}-profile:/profiles`));
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
