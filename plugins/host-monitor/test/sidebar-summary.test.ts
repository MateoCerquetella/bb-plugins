import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Dashboard, MachineRow } from "../contract.ts";
import {
  clampHostMonitorFloatingPosition,
  hostMonitorDragThresholdExceeded,
  hostMonitorFloatingDropPosition,
  hostIdFromFleetSubPath,
  hostMonitorNativeOpenRpcRequest,
  hostMonitorPanelPath,
  hostMonitorSidebarMetricTones,
  hostMonitorSidebarPreferencesRpcRequest,
  hostMonitorSidebarRefreshDelay,
  hostMonitorSidebarRpcRequest,
  hostMonitorSidebarSummary,
  hostMonitorTriggerRectIsVisible,
  isBbDesktopWindow,
  parseHostMonitorFloatingPositionCache,
  parseHostMonitorSidebarPreferencesCache,
  parseHostMonitorSidebarThresholdColorsCache,
  resolveHostMonitorSidebarPreferences,
  resolveHostMonitorSidebarThresholdColors,
} from "../lib/sidebar-host-monitor.ts";

function machine(
  id: string,
  overrides: Partial<Pick<MachineRow, "health" | "sampleState">> & {
    status?: MachineRow["host"]["status"];
    error?: string | null;
  } = {},
): MachineRow {
  const status = overrides.status ?? "connected";
  return {
    host: {
      id,
      name: `Host ${id}`,
      status,
      lastSeenAt: null,
    },
    snapshot: null,
    sampleState:
      overrides.sampleState ?? (status === "connected" ? "fresh" : "offline"),
    health:
      overrides.health ?? (status === "connected" ? "healthy" : "offline"),
    error: overrides.error ?? null,
    alert: null,
  };
}

function dashboard(machines: MachineRow[]): Dashboard {
  return {
    generatedAtMs: 1,
    refreshIntervalMs: 10_000,
    thresholds: { attentionPercent: 85, criticalPercent: 95 },
    machines,
  };
}

describe("Host Monitor sidebar summary", () => {
  it("distinguishes null loading, error, and idle-empty states", () => {
    assert.deepEqual(hostMonitorSidebarSummary(null, true, false), {
      counts: { total: 0, connected: 0, offline: 0, attention: 0 },
      status: "loading",
      label: "Host Monitor · Loading host metrics",
    });
    assert.deepEqual(hostMonitorSidebarSummary(null, false, true), {
      counts: { total: 0, connected: 0, offline: 0, attention: 0 },
      status: "error",
      label: "Host Monitor · Metrics unavailable",
    });
    assert.deepEqual(hostMonitorSidebarSummary(null, false, false), {
      counts: { total: 0, connected: 0, offline: 0, attention: 0 },
      status: "empty",
      label: "Host Monitor · No enrolled hosts",
    });
    assert.deepEqual(
      hostMonitorSidebarSummary(dashboard([]), false, false),
      {
        counts: { total: 0, connected: 0, offline: 0, attention: 0 },
        status: "empty",
        label: "Host Monitor · No enrolled hosts",
      },
    );
  });

  it("reports an all-healthy connected fleet", () => {
    const summary = hostMonitorSidebarSummary(
      dashboard([machine("alpha"), machine("bravo")]),
      false,
      false,
    );

    assert.deepEqual(summary, {
      counts: { total: 2, connected: 2, offline: 0, attention: 0 },
      status: "healthy",
      label: "Host Monitor · 2 of 2 connected",
    });
  });

  it("surfaces an offline host when no connected host needs attention", () => {
    const summary = hostMonitorSidebarSummary(
      dashboard([
        machine("alpha"),
        machine("bravo", { status: "disconnected" }),
      ]),
      false,
      false,
    );

    assert.deepEqual(summary, {
      counts: { total: 2, connected: 1, offline: 1, attention: 0 },
      status: "offline",
      label: "Host Monitor · 1 of 2 connected",
    });
  });

  it("counts each attention host once and gives critical health precedence", () => {
    const summary = hostMonitorSidebarSummary(
      dashboard([
        machine("attention", { health: "attention" }),
        machine("critical", { health: "critical" }),
        machine("unavailable-error", {
          health: "unavailable",
          sampleState: "error",
          error: "ssh://user:password@secret-host failed",
        }),
        machine("stale", { sampleState: "stale" }),
        machine("offline", { status: "disconnected" }),
      ]),
      false,
      false,
    );

    assert.deepEqual(summary.counts, {
      total: 5,
      connected: 4,
      offline: 1,
      attention: 4,
    });
    assert.equal(summary.status, "critical");
    assert.equal(
      summary.label,
      "Host Monitor · 4 of 5 connected · 1 critical host · 3 need attention",
    );
    assert.doesNotMatch(summary.label, /password|secret-host|unavailable-error/u);
  });

  it("uses the attention tone when freshness needs attention without a critical host", () => {
    const summary = hostMonitorSidebarSummary(
      dashboard([
        machine("attention", { health: "attention" }),
        machine("stale", { sampleState: "stale" }),
      ]),
      false,
      false,
    );

    assert.equal(summary.status, "attention");
    assert.equal(summary.counts.attention, 2);
  });

  it("keeps a connected host waiting for its first sample neutral", () => {
    const summary = hostMonitorSidebarSummary(
      dashboard([
        machine("sampling", {
          health: "unavailable",
          sampleState: "sampling",
        }),
      ]),
      false,
      false,
    );

    assert.deepEqual(summary, {
      counts: { total: 1, connected: 1, offline: 0, attention: 0 },
      status: "healthy",
      label: "Host Monitor · 1 of 1 connected",
    });

    const refreshingCritical = hostMonitorSidebarSummary(
      dashboard([
        machine("refreshing-critical", {
          health: "critical",
          sampleState: "sampling",
        }),
      ]),
      false,
      false,
    );
    assert.equal(refreshingCritical.status, "healthy");
    assert.equal(refreshingCritical.counts.attention, 0);

    const staleCritical = hostMonitorSidebarSummary(
      dashboard([
        machine("stale-critical", {
          health: "critical",
          sampleState: "stale",
        }),
      ]),
      false,
      false,
    );
    assert.equal(staleCritical.status, "attention");
    assert.equal(
      staleCritical.label,
      "Host Monitor · 1 of 1 connected · 1 need attention",
    );
  });

  it("degrades cached data when a later refresh is unavailable", () => {
    const summary = hostMonitorSidebarSummary(
      dashboard([
        machine("alpha"),
        machine("attention", { health: "attention" }),
      ]),
      false,
      true,
    );

    assert.deepEqual(summary, {
      counts: { total: 2, connected: 2, offline: 0, attention: 1 },
      status: "error",
      label:
        "Host Monitor · Refresh unavailable · 2 of 2 connected · 1 need attention",
    });
  });
});

describe("Host Monitor sidebar requests", () => {
  it("claims native open requests only from BB desktop windows", () => {
    assert.deepEqual(hostMonitorNativeOpenRpcRequest("host-monitor"), {
      url: "/api/v1/plugins/host-monitor/rpc/claimNativeOpen",
      body: "null",
    });
    assert.equal(isBbDesktopWindow({ bbDesktop: {} }), true);
    assert.equal(isBbDesktopWindow({}), false);
    assert.equal(
      hostMonitorPanelPath("host-monitor", "host alpha/1"),
      "/plugins/host-monitor/machines/host/host%20alpha%2F1",
    );
    assert.equal(hostIdFromFleetSubPath("host/host%20alpha%2F1"), "host alpha/1");
    assert.equal(hostIdFromFleetSubPath("host/%E0%A4%A"), null);
    assert.equal(hostIdFromFleetSubPath("other/host-alpha"), null);
  });

  it("loads the declarative sidebar color preference", () => {
    assert.deepEqual(
      hostMonitorSidebarPreferencesRpcRequest("host-monitor"),
      {
        url: "/api/v1/plugins/host-monitor/rpc/getPreferences",
        body: "null",
      },
    );
  });

  it("uses the dashboard RPC for passive reads", () => {
    assert.deepEqual(hostMonitorSidebarRpcRequest("host-monitor", "dashboard"), {
      url: "/api/v1/plugins/host-monitor/rpc/dashboard",
      body: "null",
    });
  });

  it("uses refresh-all semantics for an explicit refresh", () => {
    assert.deepEqual(hostMonitorSidebarRpcRequest("host-monitor", "refresh"), {
      url: "/api/v1/plugins/host-monitor/rpc/refresh",
      body: '{"hostId":null}',
    });
  });
});

describe("Host Monitor sidebar threshold colors", () => {
  it("accepts enabled and disabled preference values", () => {
    assert.equal(
      resolveHostMonitorSidebarThresholdColors(
        { sidebarThresholdColors: true },
        false,
      ),
      true,
    );
    assert.equal(
      resolveHostMonitorSidebarThresholdColors(
        { sidebarThresholdColors: false },
        true,
      ),
      false,
    );
  });

  it("preserves the last-known value for malformed responses", () => {
    for (const value of [
      null,
      [],
      {},
      { sidebarThresholdColors: "false" },
    ]) {
      assert.equal(
        resolveHostMonitorSidebarThresholdColors(value, true),
        true,
      );
    }
  });

  it("parses only explicit boolean cache values", () => {
    assert.equal(parseHostMonitorSidebarThresholdColorsCache("true"), true);
    assert.equal(parseHostMonitorSidebarThresholdColorsCache("false"), false);
    assert.equal(parseHostMonitorSidebarThresholdColorsCache(null), null);
    assert.equal(parseHostMonitorSidebarThresholdColorsCache("1"), null);
  });

  it("accepts effective cutoffs and falls back field by field", () => {
    const fallback = {
      sidebarThresholdColors: true,
      thresholds: { attentionPercent: 85, criticalPercent: 95 },
    };
    assert.deepEqual(
      resolveHostMonitorSidebarPreferences(
        {
          sidebarThresholdColors: false,
          thresholds: { attentionPercent: 72, criticalPercent: 91 },
        },
        fallback,
      ),
      {
        sidebarThresholdColors: false,
        thresholds: { attentionPercent: 72, criticalPercent: 91 },
      },
    );
    assert.deepEqual(
      resolveHostMonitorSidebarPreferences(
        {
          sidebarThresholdColors: false,
          thresholds: { attentionPercent: 92, criticalPercent: 91 },
        },
        fallback,
      ),
      {
        sidebarThresholdColors: false,
        thresholds: fallback.thresholds,
      },
    );
  });

  it("round-trips only complete valid sidebar preference caches", () => {
    assert.deepEqual(
      parseHostMonitorSidebarPreferencesCache(
        '{"sidebarThresholdColors":false,"thresholds":{"attentionPercent":72,"criticalPercent":91}}',
      ),
      {
        sidebarThresholdColors: false,
        thresholds: { attentionPercent: 72, criticalPercent: 91 },
      },
    );
    for (const value of [
      null,
      "",
      "{}",
      '{"sidebarThresholdColors":true}',
      '{"sidebarThresholdColors":true,"thresholds":{"attentionPercent":95,"criticalPercent":85}}',
      '{"sidebarThresholdColors":"true","thresholds":{"attentionPercent":85,"criticalPercent":95}}',
    ]) {
      assert.equal(parseHostMonitorSidebarPreferencesCache(value), null);
    }
  });

  it("computes shared threshold tones for CPU and RAM only", () => {
    const tones = hostMonitorSidebarMetricTones(96, 86);

    assert.deepEqual(tones, { cpu: "critical", memory: "attention" });
    assert.deepEqual(Object.keys(tones), ["cpu", "memory"]);
    assert.deepEqual(hostMonitorSidebarMetricTones(null, Number.NaN), {
      cpu: "unavailable",
      memory: "unavailable",
    });
    assert.deepEqual(hostMonitorSidebarMetricTones(96, 86, false), {
      cpu: "neutral",
      memory: "neutral",
    });
    assert.deepEqual(
      hostMonitorSidebarMetricTones(
        91,
        72,
        true,
        { attentionPercent: 70, criticalPercent: 90 },
      ),
      { cpu: "critical", memory: "attention" },
    );
  });

  it("gates sidebar tones behind the default-on preference attribute", () => {
    const css = readFileSync(
      new URL("../app.css", import.meta.url),
      "utf8",
    );
    const pageStart = css.lastIndexOf("\n.host-monitor-dashboard {");
    assert.notEqual(pageStart, -1);
    const sidebarCss = css.slice(0, pageStart);

    assert.match(
      sidebarCss,
      /\[data-host-monitor-trigger\]\[data-host-monitor-status="error"\]::after/u,
    );
    assert.match(
      sidebarCss,
      /data-host-monitor-threshold-colors="true"[^{}]*host-monitor-sidebar__compact-metric-value\[data-tone="attention"\]/u,
    );
    assert.match(
      sidebarCss,
      /data-host-monitor-threshold-colors="true"[^{}]*host-monitor-sidebar__compact-metric-value\[data-tone="normal"\]/u,
    );
    assert.match(
      sidebarCss,
      /data-host-monitor-threshold-colors="true"[^{}]*host-monitor-sidebar__metric-value\[data-tone="critical"\]/u,
    );
    assert.match(
      sidebarCss,
      /data-host-monitor-threshold-colors="true"[^{}]*host-monitor-sidebar__metric-value\[data-tone="normal"\]/u,
    );
    assert.doesNotMatch(
      sidebarCss,
      /data-host-monitor-threshold-colors="true"[^{}]*(?:host-monitor-sidebar__heading|host-monitor-sidebar__summary|host-monitor-sidebar__host-status|host-monitor-sidebar__host-state|host-monitor-sidebar__health)/u,
    );
    assert.doesNotMatch(
      sidebarCss,
      /data-host-monitor-threshold-colors="false"[^{}]*data-tone/u,
    );
  });

  it("colors download red and upload blue independently of threshold colors", () => {
    const css = readFileSync(
      new URL("../app.css", import.meta.url),
      "utf8",
    );
    const pageStart = css.lastIndexOf("\n.host-monitor-dashboard {");
    assert.notEqual(pageStart, -1);
    const sidebarCss = css.slice(0, pageStart);

    assert.match(
      sidebarCss,
      /\.host-monitor-sidebar__metric\[data-network-direction="down"\][^{}]*\.host-monitor-sidebar__metric-value\s*\{[^{}]*var\(--host-monitor-network-down\)/u,
    );
    assert.match(
      sidebarCss,
      /\.host-monitor-sidebar__metric\[data-network-direction="up"\][^{}]*\.host-monitor-sidebar__metric-value\s*\{[^{}]*var\(--host-monitor-network-up\)/u,
    );
    assert.match(
      sidebarCss,
      /--host-monitor-network-down:\s*var\(--destructive\)/u,
    );
    assert.match(
      sidebarCss,
      /--host-monitor-network-up:\s*var\(--timeline-accent\)/u,
    );
  });

  it("uses bb's traffic-light semantic tokens instead of the accent color", () => {
    const css = readFileSync(
      new URL("../app.css", import.meta.url),
      "utf8",
    );

    assert.match(css, /--host-monitor-normal:\s*var\(--success\)/u);
    assert.match(css, /--host-monitor-attention:\s*var\(--warning\)/u);
    assert.match(css, /--host-monitor-critical:\s*var\(--destructive\)/u);
    assert.doesNotMatch(
      css,
      /data-host-monitor-threshold-colors="true"[^{}]*\{[^{}]*var\(--primary\)/u,
    );
  });
});

describe("Host Monitor trigger visibility", () => {
  const viewport = { width: 1200, height: 800 };

  it("accepts a trigger that intersects the viewport", () => {
    assert.equal(
      hostMonitorTriggerRectIsVisible(
        { top: 770, right: 64, bottom: 810, left: 24 },
        viewport.width,
        viewport.height,
      ),
      true,
    );
  });

  it("rejects collapsed, zero-area, and fully offscreen triggers", () => {
    const hiddenRects = [
      { top: 20, right: 40, bottom: 20, left: 40 },
      { top: 20, right: -8, bottom: 60, left: -48 },
      { top: 20, right: 1248, bottom: 60, left: 1208 },
      { top: -48, right: 64, bottom: -8, left: 24 },
      { top: 808, right: 64, bottom: 848, left: 24 },
    ];
    for (const rect of hiddenRects) {
      assert.equal(
        hostMonitorTriggerRectIsVisible(
          rect,
          viewport.width,
          viewport.height,
        ),
        false,
      );
    }
  });
});

describe("Host Monitor drag threshold", () => {
  const start = { x: 20, y: 40 };

  it("keeps sub-threshold movement as an ordinary click", () => {
    assert.equal(
      hostMonitorDragThresholdExceeded(start, { x: 24, y: 46 }),
      false,
    );
    assert.equal(
      hostMonitorDragThresholdExceeded(start, { x: 27.99, y: 40 }),
      false,
    );
  });

  it("engages at the inclusive eight-pixel boundary", () => {
    assert.equal(
      hostMonitorDragThresholdExceeded(start, { x: 28, y: 40 }),
      true,
    );
    assert.equal(
      hostMonitorDragThresholdExceeded(start, { x: 20, y: 48 }),
      true,
    );
  });
});

describe("Host Monitor sidebar refresh cadence", () => {
  it("polls cheaply while closed and follows a bounded visible cadence", () => {
    assert.equal(hostMonitorSidebarRefreshDelay("closed", 1_000), 30_000);
    assert.equal(hostMonitorSidebarRefreshDelay("popover", null), 10_000);
    assert.equal(hostMonitorSidebarRefreshDelay("floating", 10_000), 10_000);
    assert.equal(hostMonitorSidebarRefreshDelay("floating", 100), 5_000);
    assert.equal(hostMonitorSidebarRefreshDelay("popover", 90_000), 60_000);
  });
});

describe("Host Monitor floating metric privacy", () => {
  it("colors only CPU/RAM percentages by threshold and marks network direction", () => {
    const source = readFileSync(
      new URL("../lib/sidebar-host-monitor.ts", import.meta.url),
      "utf8",
    );
    assert.match(source, /receiveBytesPerSecond/u);
    assert.match(source, /sendBytesPerSecond/u);
    assert.match(source, /thresholdToneAccessibleLabel\(tones\.cpu\)/u);
    assert.match(source, /thresholdToneAccessibleLabel\(tones\.memory\)/u);
    assert.match(source, /value\.dataset\.tone = tone/u);
    assert.match(source, /metricValue\.dataset\.tone = options\.tone/u);
    assert.match(source, /metric\.dataset\.networkDirection = options\.direction/u);
    assert.match(source, /direction: "down"/u);
    assert.match(source, /direction: "up"/u);
    assert.equal(
      [
        ...source.matchAll(
          /network\.available\s*\?\s*\{\s*direction:\s*"(?:down|up)"\s*\}\s*:\s*\{\}/gu,
        ),
      ].length,
      2,
    );
    assert.doesNotMatch(source, /row\.dataset\.tone/u);
    assert.doesNotMatch(source, /headingSummary\.dataset\.tone/u);
    assert.doesNotMatch(source, /metric\.dataset\.tone/u);
    assert.doesNotMatch(
      source,
      /primaryIpAddress|hardwareAddress|interfaceName|netmask/u,
    );
  });
});

describe("Host Monitor floating position", () => {
  const viewport = { left: 0, top: 0, width: 1200, height: 800 };
  const size = { width: 352, height: 420 };

  it("preserves an in-bounds position", () => {
    assert.deepEqual(
      clampHostMonitorFloatingPosition(
        { left: 300, top: 120 },
        size,
        viewport,
      ),
      { left: 300, top: 120 },
    );
  });

  it("clamps every edge with an eight-pixel gutter", () => {
    assert.deepEqual(
      clampHostMonitorFloatingPosition(
        { left: -100, top: -50 },
        size,
        viewport,
      ),
      { left: 8, top: 8 },
    );
    assert.deepEqual(
      clampHostMonitorFloatingPosition(
        { left: 2_000, top: 2_000 },
        size,
        viewport,
      ),
      { left: 840, top: 372 },
    );
  });

  it("pins an oversized panel to the viewport gutter", () => {
    assert.deepEqual(
      clampHostMonitorFloatingPosition(
        { left: 500, top: 500 },
        { width: 352, height: 420 },
        { left: 12, top: 20, width: 300, height: 360 },
      ),
      { left: 20, top: 28 },
    );
  });

  it("places the dropped titlebar under the pointer and then clamps", () => {
    assert.deepEqual(
      hostMonitorFloatingDropPosition(
        { x: 500, y: 300 },
        size,
        viewport,
      ),
      { left: 476, top: 284 },
    );
    assert.deepEqual(
      hostMonitorFloatingDropPosition(
        { x: 4, y: 4 },
        size,
        viewport,
      ),
      { left: 8, top: 8 },
    );
  });

  it("parses only finite coordinate cache objects", () => {
    assert.deepEqual(
      parseHostMonitorFloatingPositionCache('{"left":42.5,"top":18}'),
      { left: 42.5, top: 18 },
    );
    for (const value of [
      null,
      "",
      "[]",
      "{}",
      '{"left":"42","top":18}',
      '{"left":42,"top":null}',
      '{"left":1e999,"top":18}',
    ]) {
      assert.equal(parseHostMonitorFloatingPositionCache(value), null);
    }
  });
});
