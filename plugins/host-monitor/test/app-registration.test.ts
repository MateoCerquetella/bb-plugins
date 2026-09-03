import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../app.tsx", import.meta.url), "utf8");
const server = await readFile(new URL("../server.ts", import.meta.url), "utf8");
const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as {
  name: string;
  bb: { name: string; app: string; server: string; host?: string };
  dependencies: Record<string, string>;
  files: string[];
};

test("keeps the Host Monitor package and navigation identity", () => {
  assert.equal(manifest.name, "bb-plugin-host-monitor");
  assert.equal(manifest.bb.name, "Host Monitor");
  assert.equal(manifest.bb.app, "./app.tsx");
  assert.equal(manifest.bb.server, "./server.ts");
  assert.equal(manifest.bb.host, undefined);
  assert.match(app, /id: "host-monitor"/u);
  assert.match(app, /title: "Host Monitor"/u);
  assert.match(app, /path: "host-monitor"/u);
  assert.doesNotMatch(app, /Machine Monitor|machine-monitor/u);
  assert.doesNotMatch(server, /machine-monitor/u);
});

test("ships historical monitoring dependencies and sources", () => {
  assert.equal(manifest.dependencies.echarts, "6.1.0");
  assert.ok(manifest.dependencies["better-sqlite3"]);
  for (const source of ["monitor.ts", "store.ts", "rpc-contract.ts"]) {
    assert.ok(manifest.files.includes(source));
  }
});

test("removes every notification surface", () => {
  for (const source of [app, server, JSON.stringify(manifest)]) {
    assert.doesNotMatch(
      source,
      /\btoast\b|new Notification|experimental_sidebarAccessory|sidebar-warning|threshold-alert/u,
    );
  }
  assert.doesNotMatch(app, /role="alert"/u);
  assert.match(app, /role="status"/u);
});

test("removes the old fleet and destructive process-control surfaces", () => {
  assert.doesNotMatch(
    app,
    /FleetMatrix|floating monitor|ProcessTerminationDialog|terminateProcess|Show IPs/u,
  );
  assert.doesNotMatch(
    server,
    /experimental_callHostRpc|terminateProcess|inspectProcessTermination|listProcesses/u,
  );
});
