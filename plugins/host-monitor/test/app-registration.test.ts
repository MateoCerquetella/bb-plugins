import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";

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

test("restores the bottom modal and dedicated Host Monitor page", () => {
  assert.equal(manifest.name, "bb-plugin-host-monitor");
  assert.equal(manifest.bb.name, "Host Monitor");
  assert.equal(manifest.bb.app, "./app.tsx");
  assert.equal(manifest.bb.server, "./server.ts");
  assert.equal(manifest.bb.host, "./host.ts");
  assert.match(app, /id: "host-monitor"/u);
  assert.match(app, /title: "Host Monitor"/u);
  assert.match(app, /app\.slots\.sidebarFooterAction\(\{/u);
  assert.match(app, /icon: "Terminal"/u);
  assert.match(app, /run: toggleHostMonitorMiniModal/u);
  assert.match(app, /app\.contentScripts\.register\(\{/u);
  assert.match(app, /mountHostMonitorMiniModal\(pluginId, signal\)/u);
  assert.match(app, /app\.slots\.navPanel\(\{/u);
  assert.match(app, /path: "host-monitor"/u);
  assert.doesNotMatch(app, /app\.slots\.settingsSection\(/u);
  assert.doesNotMatch(app, /experimental_sidebarAccessory/u);
});

test("ships per-host history and bounded process host sources", () => {
  assert.equal(manifest.dependencies.echarts, "6.1.0");
  assert.ok(manifest.dependencies["better-sqlite3"]);
  for (const source of ["chart-data.ts", "dashboard-config.ts", "sidebar-modal.ts", "contract.ts", "host.ts", "store.ts", "lib/"]) {
    assert.ok(manifest.files.includes(source));
  }
  assert.ok(manifest.files.includes("dist/host.js"));
  assert.ok(manifest.files.includes("dist/host.meta.json"));
});

test("keeps the modal and page notification-free while restoring guarded processes", () => {
  for (const source of [app, server]) {
    assert.doesNotMatch(
      source,
      /\btoast\b|new Notification|threshold-alert|warning-badge|experimental_appOverlay/u,
    );
  }
  assert.doesNotMatch(app, /role="alert"/u);
  assert.match(app, /role="status"/u);
  assert.doesNotMatch(server, /primaryIpAddress/u);
  assert.match(server, /ProcessConfirmationStore/u);
  assert.match(server, /prepareProcessTermination/u);
  assert.match(server, /executeProcessTermination/u);
  assert.match(app, /<DashboardEditor/u);
  assert.match(app, /<ProcessesWidget/u);
  assert.match(app, /<AlertDialog\.Root/u);
  assert.match(app, /rpc\.call\("saveDashboardConfig"/u);
});

test("imports only public SDK and declared third-party surfaces", () => {
  const scan = experimental_scanPublicSdkOnly(
    new URL("..", import.meta.url).pathname,
    { allow: [/^better-sqlite3$/u, /^echarts(?:\/.*)?$/u, /^react$/u, /^@radix-ui\/react-(?:alert-dialog|select)$/u] },
  );
  assert.deepEqual(scan.violations, []);
  assert.deepEqual(scan.privateDependencies, []);
});
