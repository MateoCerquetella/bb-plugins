import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_MINI_MODAL_THRESHOLD,
  HOST_MONITOR_NAV_ROW_SELECTOR,
  HOST_MONITOR_PAGE_PATH,
  MINI_MODAL_MACHINE_LIMIT,
  miniModalPosition,
  miniMetricPresentation,
  parseMiniModalFleet,
} from "../sidebar-modal.ts";

test("projects a bounded safe fleet for the mini modal", () => {
  const machines = Array.from({ length: MINI_MODAL_MACHINE_LIMIT + 10 }, (_, index) => ({
    host: { id: `host-${index}`, name: index === 0 ? "Alpha" : `Host ${index}`, status: index === 2 ? "disconnected" : "connected" },
    sampleState: index === 2 ? "offline" : "fresh",
    snapshot: index === 2 ? null : {
      cpu: { usagePercent: 25 },
      memory: { usagePercent: 50 },
      disk: { usagePercent: 75 },
    },
  }));
  const fleet = parseMiniModalFleet({ ok: true, result: { connected: 137, total: 138, thresholds: { cpu: 80, ram: 85 }, machines } });
  assert.equal(fleet?.machines.length, MINI_MODAL_MACHINE_LIMIT);
  assert.deepEqual(fleet?.thresholds, { cpu: 80, ram: 85 });
  assert.deepEqual(fleet?.machines[0], { id: "host-0", name: "Alpha", state: "fresh", cpuPercent: 25, ramPercent: 50, diskPercent: 75 });
  assert.deepEqual(fleet?.machines[2], { id: "host-2", name: "Host 2", state: "offline", cpuPercent: null, ramPercent: null, diskPercent: null });
});

test("parses safe CPU/RAM guides and exposes accessible passive states", () => {
  const fallback = parseMiniModalFleet({ ok: true, result: { thresholds: { cpu: 101, ram: "85" }, machines: [] } });
  assert.deepEqual(fallback?.thresholds, { cpu: DEFAULT_MINI_MODAL_THRESHOLD, ram: DEFAULT_MINI_MODAL_THRESHOLD });
  assert.deepEqual(miniMetricPresentation("CPU", 80, 80, true), { guide: "over", accessibleLabel: "CPU 80.0%, above 80% guide" });
  assert.deepEqual(miniMetricPresentation("RAM", 79.9, 80, true), { guide: "normal", accessibleLabel: "RAM 79.9%, below 80% guide" });
  assert.deepEqual(miniMetricPresentation("CPU", 95, 80, false), { guide: "neutral", accessibleLabel: "CPU 95.0%" });
  assert.deepEqual(miniMetricPresentation("RAM", null, 80, true), { guide: "unavailable", accessibleLabel: "RAM unavailable" });
});

test("rejects malformed envelopes and drops malformed rows", () => {
  for (const value of [null, [], {}, { ok: false }, { ok: true, result: {} }]) {
    assert.equal(parseMiniModalFleet(value), null);
  }
  assert.deepEqual(parseMiniModalFleet({ ok: true, result: { machines: [null, {}, { host: { id: "host-a", name: "A", status: "connected" }, snapshot: { cpu: { usagePercent: 101 } } }] } })?.machines, [
    { id: "host-a", name: "A", state: "sampling", cpuPercent: null, ramPercent: null, diskPercent: null },
  ]);
});

test("anchors above the footer trigger and clamps narrow viewports", () => {
  assert.deepEqual(miniModalPosition({ left: 20, top: 740 }, { width: 1200, height: 800 }), { left: 20, bottom: 68 });
  assert.deepEqual(miniModalPosition({ left: 380, top: 740 }, { width: 390, height: 800 }), { left: 22, bottom: 68 });
  assert.equal(HOST_MONITOR_PAGE_PATH, "/plugins/host-monitor/host-monitor");
  assert.equal(HOST_MONITOR_NAV_ROW_SELECTOR, '[data-sidebar-navigation-item="host-monitor/host-monitor"]');
});

test("owns a cleanup-safe DOM lifecycle without unsafe HTML or legacy features", async () => {
  const source = await readFile(new URL("../sidebar-modal.ts", import.meta.url), "utf8");
  assert.match(source, /signal\.addEventListener\("abort", dispose/u);
  assert.match(source, /requestController\?\.abort\(\)/u);
  assert.match(source, /request === pending/u);
  assert.match(source, /requestController === controller/u);
  assert.match(source, /clearInterval\(interval\)/u);
  assert.match(source, /removeEventListener/u);
  assert.match(source, /new MutationObserver\(hideNavRows\)/u);
  assert.match(source, /hiddenNavRows\.set\(row, row\.hidden\)/u);
  assert.match(source, /row\.hidden = wasHidden/u);
  assert.match(source, /button\.click\(\)/u);
  assert.match(source, /textContent/u);
  assert.doesNotMatch(source, /location\.assign|location\.replace|innerHTML|insertAdjacentHTML|localStorage|primaryIpAddress|process|terminate|Notification|toast|floating/iu);
});
