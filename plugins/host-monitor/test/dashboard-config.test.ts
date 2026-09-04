import assert from "node:assert/strict";
import test from "node:test";

import { dashboardConfigSchema } from "../contract.ts";
import {
  DASHBOARD_CATALOG,
  DASHBOARD_METRICS,
  DASHBOARD_PANEL_LIMIT,
  addDashboardPanel,
  availableDashboardPanels,
  changeDashboardPanelVisualization,
  defaultDashboardConfig,
  moveDashboardPanel,
  removeDashboardPanel,
  supportsVisualization,
} from "../dashboard-config.ts";

test("default dashboard is bounded, independent, and uses supported unique panels", () => {
  const first = defaultDashboardConfig();
  const second = defaultDashboardConfig();
  assert.notEqual(first, second);
  assert.notEqual(first.panels, second.panels);
  assert.ok(first.panels.length > 0 && first.panels.length <= DASHBOARD_PANEL_LIMIT);
  assert.equal(new Set(first.panels.map((panel) => `${panel.metric}:${panel.visualization}`)).size, first.panels.length);
  assert.ok(first.panels.every((panel) => supportsVisualization(panel.metric, panel.visualization)));
  first.panels.shift();
  assert.notEqual(first.panels.length, second.panels.length);
});

test("editor operations add, change, reorder, and remove panels without mutating input", () => {
  const original = { version: 1, panels: [
    { metric: "cpu", visualization: "stat" },
    { metric: "memory", visualization: "stat" },
  ] } as const;
  const added = addDashboardPanel(original, { metric: "network", visualization: "timeseries" });
  assert.equal(original.panels.length, 2);
  assert.deepEqual(added.panels.at(-1), { metric: "network", visualization: "timeseries" });
  assert.equal(availableDashboardPanels(added).some((panel) => panel.metric === "network" && panel.visualization === "timeseries"), false);

  const changed = changeDashboardPanelVisualization(added, 0, "timeseries");
  assert.deepEqual(changed.panels[0], { metric: "cpu", visualization: "timeseries" });
  const moved = moveDashboardPanel(changed, 2, 0);
  assert.equal(moved.panels[0]?.metric, "network");
  const removed = removeDashboardPanel(moved, 1);
  assert.equal(removed.panels.length, 2);
  assert.equal(removeDashboardPanel({ version: 1, panels: [removed.panels[0]!] }, 0).panels.length, 1);
});

test("catalog covers every supported host metric and stat/time-series compatibility", () => {
  assert.deepEqual(Object.keys(DASHBOARD_CATALOG), [...DASHBOARD_METRICS]);
  assert.deepEqual(DASHBOARD_CATALOG.uptime.visualizations, ["stat"]);
  for (const metric of ["cpu", "memory", "disk", "load", "network"] as const) {
    assert.deepEqual(DASHBOARD_CATALOG[metric].visualizations, ["stat", "timeseries"]);
  }
});

test("dashboard schema rejects duplicates, unknown fields, invalid combinations, and oversized input", () => {
  const valid = { version: 1, panels: [{ metric: "cpu", visualization: "stat" }] };
  assert.equal(dashboardConfigSchema.safeParse(valid).success, true);
  assert.equal(dashboardConfigSchema.safeParse({ ...valid, extra: true }).success, false);
  assert.equal(dashboardConfigSchema.safeParse({ version: 1, panels: [] }).success, false);
  assert.equal(dashboardConfigSchema.safeParse({ version: 1, panels: [valid.panels[0], valid.panels[0]] }).success, false);
  assert.equal(dashboardConfigSchema.safeParse({ version: 1, panels: [{ metric: "uptime", visualization: "timeseries" }] }).success, false);
  assert.equal(dashboardConfigSchema.safeParse({ version: 1, panels: Array.from({ length: DASHBOARD_PANEL_LIMIT + 1 }, (_, index) => ({ metric: "cpu", visualization: index % 2 === 0 ? "stat" : "timeseries" })) }).success, false);
});
