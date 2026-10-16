import assert from "node:assert/strict";
import test from "node:test";

import { dashboardConfigSchema } from "../contract.ts";
import {
  DASHBOARD_CATALOG,
  DASHBOARD_PANEL_CATALOG,
  DASHBOARD_PANEL_LIMIT,
  addDashboardPanel,
  availableDashboardPanels,
  changeDashboardPanelVisualization,
  dashboardDropIndex,
  defaultDashboardConfig,
  isCompleteDashboardConfig,
  moveDashboardPanel,
  normalizeDashboardConfig,
  removeDashboardPanel,
  setDashboardPanelVisibility,
  visibleDashboardPanels,
} from "../dashboard-config.ts";

test("default dashboard is catalog-complete, bounded, and independently cloned", () => {
  const first = defaultDashboardConfig();
  const second = defaultDashboardConfig();
  assert.notEqual(first, second);
  assert.notEqual(first.panels, second.panels);
  assert.equal(first.version, 2);
  assert.equal(first.panels.length, DASHBOARD_PANEL_LIMIT);
  assert.equal(first.panels.length, DASHBOARD_PANEL_CATALOG.length);
  assert.equal(isCompleteDashboardConfig(first), true);
  assert.equal(dashboardConfigSchema.safeParse(first).success, true);
  first.panels[0]!.visible = !first.panels[0]!.visible;
  assert.notEqual(first.panels[0]!.visible, second.panels[0]!.visible);
});
test("editor operations show, hide, and reorder widgets without mutating input", () => {
  const original = defaultDashboardConfig();
  const cpuIndex = original.panels.findIndex((panel) => panel.metric === "cpu" && panel.visualization === "stat");
  const hidden = removeDashboardPanel(original, cpuIndex);
  assert.equal(original.panels[cpuIndex]!.visible, true);
  assert.equal(hidden.panels[cpuIndex]!.visible, false);
  assert.equal(availableDashboardPanels(hidden).some((panel) => panel.metric === "cpu" && panel.visualization === "stat"), true);

  const shown = addDashboardPanel(hidden, hidden.panels[cpuIndex]!);
  assert.equal(shown.panels[cpuIndex]!.visible, true);
  const moved = moveDashboardPanel(shown, cpuIndex, 3);
  assert.equal(moved.panels[3]!.metric, "cpu");
  assert.equal(isCompleteDashboardConfig(moved), true);
  assert.equal(visibleDashboardPanels(moved).length, visibleDashboardPanels(shown).length);

  const toggled = setDashboardPanelVisibility(moved, 3, false);
  assert.equal(toggled.panels[3]!.visible, false);
});

test("dashboard drop positions insert before or after the visual target", () => {
  assert.equal(dashboardDropIndex(4, 0, 1, "after"), 1);
  assert.equal(dashboardDropIndex(4, 2, 0, "before"), 0);
  assert.equal(dashboardDropIndex(4, 1, 3, "after"), 3);
  assert.equal(dashboardDropIndex(4, 3, 1, "before"), 1);
  assert.equal(dashboardDropIndex(4, 2, 2, "before"), 2);
  assert.equal(dashboardDropIndex(4, -1, 2, "after"), -1);
});

test("visualization changes transfer visibility to the catalog-backed sibling", () => {
  const original = defaultDashboardConfig();
  const statIndex = original.panels.findIndex((panel) => panel.metric === "cpu" && panel.visualization === "stat");
  const chartIndex = original.panels.findIndex((panel) => panel.metric === "cpu" && panel.visualization === "timeseries");
  const onlyStat = setDashboardPanelVisibility(setDashboardPanelVisibility(original, statIndex, true), chartIndex, false);
  const changed = changeDashboardPanelVisualization(onlyStat, statIndex, "timeseries");
  assert.equal(changed.panels[statIndex]!.visible, false);
  assert.equal(changed.panels[chartIndex]!.visible, true);
  assert.equal(isCompleteDashboardConfig(changed), true);
});

test("version-one dashboards migrate deterministically and retain supported order", () => {
  const migrated = normalizeDashboardConfig({
    version: 1,
    panels: [
      { metric: "network", visualization: "timeseries" },
      { metric: "cpu", visualization: "stat" },
      { metric: "cpu", visualization: "stat" },
      { metric: "unknown", visualization: "stat" },
    ],
  });
  assert.equal(migrated.version, 2);
  assert.deepEqual(
    migrated.panels.slice(0, 2).map((panel) => [panel.metric, panel.visualization, panel.visible]),
    [["network", "timeseries", true], ["cpu", "stat", true]],
  );
  assert.equal(migrated.panels.find((panel) => panel.metric === "system")?.visible, true);
  assert.equal(migrated.panels.find((panel) => panel.metric === "processes")?.visible, true);
  assert.equal(isCompleteDashboardConfig(migrated), true);
  assert.equal(dashboardConfigSchema.safeParse(migrated).success, true);
});

test("catalog exposes only widgets backed by current snapshot, history, or process data", () => {
  assert.deepEqual(DASHBOARD_CATALOG.system.visualizations, ["details"]);
  assert.deepEqual(DASHBOARD_CATALOG.processes.visualizations, ["table"]);
  assert.deepEqual(DASHBOARD_CATALOG.uptime.visualizations, ["stat"]);
  for (const metric of ["cpu", "memory", "disk", "load", "network"] as const) {
    assert.deepEqual(DASHBOARD_CATALOG[metric].visualizations, ["stat", "timeseries"]);
  }
});

test("dashboard schema rejects missing, duplicate, unknown, and unsupported widgets", () => {
  const valid = defaultDashboardConfig();
  assert.equal(dashboardConfigSchema.safeParse(valid).success, true);
  assert.equal(dashboardConfigSchema.safeParse({ ...valid, extra: true }).success, false);
  assert.equal(dashboardConfigSchema.safeParse({ ...valid, panels: valid.panels.slice(1) }).success, false);
  assert.equal(dashboardConfigSchema.safeParse({ ...valid, panels: [valid.panels[0], ...valid.panels.slice(0, -1)] }).success, false);
  const invalid = structuredClone(valid);
  invalid.panels[0] = { metric: "uptime", visualization: "timeseries", visible: true };
  assert.equal(dashboardConfigSchema.safeParse(invalid).success, false);
});
