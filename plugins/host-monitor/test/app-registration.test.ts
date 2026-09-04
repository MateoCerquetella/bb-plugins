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

test("keeps Host Monitor identity with only the native bottom sidebar action", () => {
  assert.equal(manifest.name, "bb-plugin-host-monitor");
  assert.equal(manifest.bb.name, "Host Monitor");
  assert.equal(manifest.bb.app, "./app.tsx");
  assert.equal(manifest.bb.server, "./server.ts");
  assert.equal(manifest.bb.host, "./host.ts");
  assert.match(app, /id: "host-monitor"/u);
  assert.match(app, /title: "Host Monitor"/u);
  assert.match(app, /app\.slots\.sidebarFooterAction\(\{/u);
  assert.match(app, /icon: "Activity"/u);
  assert.match(app, /run: \(\{ openSettings \}\) => openSettings\(\)/u);
  assert.match(app, /app\.slots\.settingsSection\(\{/u);
  assert.match(app, /id: "monitor"/u);
  assert.doesNotMatch(app, /app\.slots\.navPanel\(/u);
  assert.doesNotMatch(app, /experimental_sidebarAccessory/u);
});

test("ships per-host history and metrics-only host sources", () => {
  assert.equal(manifest.dependencies.echarts, "6.1.0");
  assert.ok(manifest.dependencies["better-sqlite3"]);
  for (const source of ["chart-data.ts", "dashboard-config.ts", "contract.ts", "host.ts", "store.ts", "lib/"]) {
    assert.ok(manifest.files.includes(source));
  }
  assert.ok(manifest.files.includes("dist/host.js"));
  assert.ok(manifest.files.includes("dist/host.meta.json"));
});

test("keeps every monitoring surface inside the page without notifications", () => {
  for (const source of [app, server]) {
    assert.doesNotMatch(
      source,
      /\btoast\b|new Notification|threshold-alert|warning-badge|popover|contentScripts\.register|experimental_appOverlay|app\.slots\.navPanel/u,
    );
  }
  assert.doesNotMatch(app, /role="alert"/u);
  assert.match(app, /role="status"/u);
  assert.doesNotMatch(server, /terminateProcess|listProcesses|primaryIpAddress/u);
  assert.match(app, /<DashboardEditor/u);
  assert.match(app, /rpc\.call\("saveDashboardConfig"/u);
});

test("imports only public SDK and declared third-party surfaces", () => {
  const scan = experimental_scanPublicSdkOnly(
    new URL("..", import.meta.url).pathname,
    { allow: [/^better-sqlite3$/u, /^echarts(?:\/.*)?$/u, /^react$/u] },
  );
  assert.deepEqual(scan.violations, []);
  assert.deepEqual(scan.privateDependencies, []);
});
