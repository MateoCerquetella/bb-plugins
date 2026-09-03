import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LineChart } from "echarts/charts";
import { AriaComponent, DatasetComponent, GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { definePluginApp, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";

import { expectedSampleInterval, withChartGaps } from "./chart-data.ts";
import type { Fleet, HistoryPoint, MachineHistory, MachineRow, RangeHours, rpcContract } from "./contract.ts";
import "./app.css";

echarts.use([
  AriaComponent,
  DatasetComponent,
  GridComponent,
  LineChart,
  MarkLineComponent,
  SVGRenderer,
  TooltipComponent,
]);

const RANGES: RangeHours[] = [1, 6, 24, 24 * 7, 24 * 30];
const REALTIME_CHANNEL = "host-monitor-machines-changed";

type ChartTheme = {
  foreground: string;
  muted: string;
  border: string;
  surface: string;
  primary: string;
  secondary: string;
  tertiary: string;
  warning: string;
};

function FleetDashboard() {
  const rpc = useRpc<typeof rpcContract>();
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [history, setHistory] = useState<MachineHistory | null>(null);
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [rangeHours, setRangeHours] = useState<RangeHours>(24);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const historyRequest = useRef(0);

  const loadFleet = useCallback(async () => {
    try {
      const next = await rpc.call("fleet");
      setFleet(next);
      setError(null);
      setSelectedHostId((current) => {
        if (current != null && next.machines.some((machine) => machine.host.id === current)) {
          return current;
        }
        return next.machines.find((machine) => machine.host.status === "connected")?.host.id
          ?? next.machines[0]?.host.id
          ?? null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the machine fleet.");
    }
  }, [rpc]);

  useEffect(() => { void loadFleet(); }, [loadFleet]);
  useRealtime(REALTIME_CHANNEL, useCallback(() => { void loadFleet(); }, [loadFleet]));

  useEffect(() => {
    if (selectedHostId == null) {
      setHistory(null);
      return;
    }
    const request = ++historyRequest.current;
    void rpc.call("machineHistory", { hostId: selectedHostId, rangeHours })
      .then((next) => {
        if (historyRequest.current === request) setHistory(next);
      })
      .catch((cause) => {
        if (historyRequest.current === request) {
          setHistory(null);
          setError(cause instanceof Error ? cause.message : "Could not load machine history.");
        }
      });
  }, [rangeHours, rpc, selectedHostId]);

  const refreshAll = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const next = await rpc.call("refresh", { hostId: null });
      setFleet(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh the fleet.");
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, rpc]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleMachines = useMemo(() => {
    if (fleet == null || normalizedQuery === "") return fleet?.machines ?? [];
    return fleet.machines.filter((machine) =>
      [machine.host.name, machine.host.id, machine.snapshot?.system.osName, machine.snapshot?.system.platform]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)),
    );
  }, [fleet, normalizedQuery]);

  const selected = fleet?.machines.find((machine) => machine.host.id === selectedHostId) ?? null;
  const points = history?.hostId === selectedHostId ? history.points : [];

  return (
    <main className="host-monitor">
      <section className="host-monitor__toolbar" aria-label="Fleet controls">
        <div className="host-monitor__fleet-summary">
          <strong>{fleet == null ? "—" : `${fleet.connected}/${fleet.total}`}</strong>
          <span>machines connected</span>
          <small>{fleet == null ? "Loading fleet…" : `Updated ${relativeTime(fleet.generatedAtMs)}`}</small>
        </div>
        <label className="host-monitor__search">
          <span>Find machine</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, id, or platform" type="search" />
        </label>
        <label>
          <span>History</span>
          <select value={rangeHours} onChange={(event) => setRangeHours(Number(event.target.value) as RangeHours)}>
            {RANGES.map((hours) => <option key={hours} value={hours}>{rangeLabel(hours)}</option>)}
          </select>
        </label>
        <button className="host-monitor__refresh" disabled={refreshing || fleet?.refreshing === true} onClick={() => void refreshAll()} type="button">
          {refreshing || fleet?.refreshing ? "Refreshing…" : "Refresh all"}
        </button>
      </section>

      {error != null && <p className="host-monitor__inline-status" role="status">{error}</p>}

      <section className="host-monitor__fleet" aria-labelledby="fleet-heading">
        <header>
          <div><h2 id="fleet-heading">Fleet overview</h2><p>Every machine enrolled in BB</p></div>
          <span>{visibleMachines.length} of {fleet?.total ?? 0}</span>
        </header>
        {fleet == null ? <FleetSkeleton /> : visibleMachines.length === 0 ? (
          <p className="host-monitor__empty">No machines match “{query.trim()}”.</p>
        ) : (
          <ul className="host-monitor__machine-grid">
            {visibleMachines.map((machine) => (
              <li key={machine.host.id}>
                <MachineCard
                  machine={machine}
                  onSelect={() => setSelectedHostId(machine.host.id)}
                  selected={machine.host.id === selectedHostId}
                  thresholds={fleet.thresholds}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <MachineDashboard machine={selected} points={points} rangeHours={rangeHours} thresholds={fleet?.thresholds ?? { cpu: 90, ram: 90, disk: 90 }} />
    </main>
  );
}

const MachineCard = memo(function MachineCard({
  machine,
  onSelect,
  selected,
  thresholds,
}: {
  machine: MachineRow;
  onSelect(): void;
  selected: boolean;
  thresholds: Fleet["thresholds"];
}) {
  const snapshot = machine.snapshot;
  return (
    <button
      aria-label={`Open dashboard for ${machine.host.name}, ${sampleStateLabel(machine)}`}
      aria-pressed={selected}
      className="host-monitor__machine-card"
      data-selected={selected}
      onClick={onSelect}
      type="button"
    >
      <header>
        <span className="host-monitor__state-dot" data-state={machine.sampleState} aria-hidden="true" />
        <span><strong>{machine.host.name}</strong><small>{snapshot?.system.osName ?? machine.host.id}</small></span>
        <em>{sampleStateLabel(machine)}</em>
      </header>
      <dl>
        <CardValue label="CPU" value={percent(snapshot?.cpu.usagePercent)} warning={isOver(snapshot?.cpu.usagePercent, thresholds.cpu)} />
        <CardValue label="RAM" value={percent(snapshot?.memory.usagePercent)} warning={isOver(snapshot?.memory.usagePercent, thresholds.ram)} />
        <CardValue label="Disk" value={percent(snapshot?.disk?.usagePercent)} warning={isOver(snapshot?.disk?.usagePercent, thresholds.disk)} />
        <CardValue label="Load" value={number(snapshot?.cpu.loadAverage?.[1])} warning={false} />
      </dl>
      <footer>
        <span>↓ {rate(snapshot?.network.receiveBytesPerSecond)}</span>
        <span>↑ {rate(snapshot?.network.sendBytesPerSecond)}</span>
        <small>{snapshot == null ? "No sample yet" : relativeTime(snapshot.sampledAtMs)}</small>
      </footer>
    </button>
  );
});

function CardValue({ label, value, warning }: { label: string; value: string; warning: boolean }) {
  return <div data-warning={warning}><dt>{label}</dt><dd>{value}</dd></div>;
}

function MachineDashboard({
  machine,
  points,
  rangeHours,
  thresholds,
}: {
  machine: MachineRow | null;
  points: HistoryPoint[];
  rangeHours: RangeHours;
  thresholds: Fleet["thresholds"];
}) {
  if (machine == null) {
    return <section className="host-monitor__dashboard host-monitor__dashboard--empty"><p>Select a machine to inspect its dashboard.</p></section>;
  }
  const snapshot = machine.snapshot;
  const interval = expectedSampleInterval(rangeHours);
  const usageRows = withChartGaps(points.map((point) => [
    point.collectedAtMs,
    point.cpuPercent,
    point.memoryPercent,
    point.diskPercent,
  ]), interval);
  const loadRows = withChartGaps(points.map((point) => [
    point.collectedAtMs,
    point.load1,
    point.load5,
    point.load15,
  ]), interval);
  const networkRows = withChartGaps(points.map((point) => [
    point.collectedAtMs,
    point.receiveBytesPerSecond,
    point.sendBytesPerSecond,
  ]), interval);

  return (
    <section className="host-monitor__dashboard" aria-labelledby="machine-heading">
      <header className="host-monitor__machine-heading">
        <div>
          <span className="host-monitor__state-dot" data-state={machine.sampleState} aria-hidden="true" />
          <div><h2 id="machine-heading">{machine.host.name}</h2><p>{snapshot == null ? machine.host.id : `${snapshot.system.osName} · ${snapshot.system.arch}`}</p></div>
        </div>
        <span>{sampleStateLabel(machine)}{snapshot == null ? "" : ` · sampled ${relativeTime(snapshot.sampledAtMs)}`}</span>
      </header>

      {machine.error != null && <p className="host-monitor__inline-status" role="status">{machine.error}</p>}
      {snapshot?.issues.map((issue) => <p className="host-monitor__inline-status host-monitor__inline-status--quiet" role="status" key={`${issue.metric}:${issue.message}`}>{issue.metric}: {issue.message}</p>)}

      <div className="host-monitor__stat-grid">
        <StatPanel label="CPU" value={percent(snapshot?.cpu.usagePercent)} detail={snapshot == null ? "Unavailable" : `${snapshot.cpu.logicalCores} logical cores`} warning={isOver(snapshot?.cpu.usagePercent, thresholds.cpu)} />
        <StatPanel label="RAM" value={percent(snapshot?.memory.usagePercent)} detail={snapshot == null ? "Unavailable" : `${bytes(snapshot.memory.usedBytes)} / ${bytes(snapshot.memory.totalBytes)}`} warning={isOver(snapshot?.memory.usagePercent, thresholds.ram)} />
        <StatPanel label="Root disk" value={percent(snapshot?.disk?.usagePercent)} detail={snapshot?.disk == null ? "Unavailable" : `${bytes(snapshot.disk.availableBytes)} free`} warning={isOver(snapshot?.disk?.usagePercent, thresholds.disk)} />
        <StatPanel label="Load (5m)" value={number(snapshot?.cpu.loadAverage?.[1])} detail={snapshot == null ? "Unavailable" : `up ${uptime(snapshot.system.uptimeSeconds)}`} warning={false} />
      </div>

      <div className="host-monitor__chart-grid">
        <Chart
          description="CPU, RAM, and root disk utilization history"
          dimensions={["time", "CPU", "RAM", "Disk"]}
          percentChart
          rows={usageRows}
          series={["CPU", "RAM", "Disk"]}
          thresholds={{ CPU: thresholds.cpu, RAM: thresholds.ram, Disk: thresholds.disk }}
          title="Utilization"
        />
        <Chart description="One, five, and fifteen minute load history" dimensions={["time", "1m", "5m", "15m"]} rows={loadRows} series={["1m", "5m", "15m"]} thresholds={{}} title="Load average" />
        <Chart description="Aggregate receive and send throughput history" dimensions={["time", "Receive", "Send"]} rows={networkRows} series={["Receive", "Send"]} thresholds={{}} title="Network throughput" valueFormatter={rate} />
      </div>

      <dl className="host-monitor__facts">
        <Fact label="Processor" value={snapshot?.cpu.model || "Unavailable"} />
        <Fact label="Platform" value={snapshot == null ? "Unavailable" : `${snapshot.system.platform} · ${snapshot.system.arch}`} />
        <Fact label="Kernel" value={snapshot?.system.kernelRelease ?? "Unavailable"} />
        <Fact label="Uptime" value={snapshot == null ? "Unavailable" : uptime(snapshot.system.uptimeSeconds)} />
        <Fact label="Download" value={rate(snapshot?.network.receiveBytesPerSecond)} />
        <Fact label="Upload" value={rate(snapshot?.network.sendBytesPerSecond)} />
      </dl>
    </section>
  );
}

function StatPanel({ label, value, detail, warning }: { label: string; value: string; detail: string; warning: boolean }) {
  return <article className="host-monitor__stat" data-warning={warning}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function FleetSkeleton() {
  return <div className="host-monitor__machine-grid" aria-label="Loading machines">{[0, 1, 2].map((index) => <div className="host-monitor__skeleton" key={index} />)}</div>;
}

function SidebarFleetAccessory() {
  const rpc = useRpc<typeof rpcContract>();
  const [summary, setSummary] = useState<{ connected: number; total: number } | null>(null);
  const refresh = useCallback(() => {
    void rpc.call("sidebarSummary").then(setSummary).catch(() => setSummary(null));
  }, [rpc]);
  useEffect(refresh, [refresh]);
  useRealtime(REALTIME_CHANNEL, refresh);
  if (summary == null) return null;
  return <span className="host-monitor__sidebar-summary" aria-label={`${summary.connected} of ${summary.total} machines connected`}>{summary.connected}/{summary.total}</span>;
}

const Chart = memo(function Chart({
  description,
  dimensions,
  percentChart = false,
  rows,
  series,
  thresholds,
  title,
  valueFormatter,
}: {
  description: string;
  dimensions: string[];
  percentChart?: boolean;
  rows: Array<Array<number | null>>;
  series: string[];
  thresholds: Record<string, number>;
  title: string;
  valueFormatter?: (value: number | null | undefined) => string;
}) {
  const target = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ description, dimensions, percentChart, rows, series, thresholds, title, valueFormatter });
  latest.current = { description, dimensions, percentChart, rows, series, thresholds, title, valueFormatter };
  const applyRef = useRef<(() => void) | null>(null);
  const summary = chartSummary(rows, valueFormatter ?? (percentChart ? percent : number));

  useLayoutEffect(() => {
    const element = target.current;
    if (element == null) return;
    let chart: ReturnType<typeof echarts.init> | null = null;
    let frame = 0;
    let width = 0;
    let height = 0;
    let themeKey = "";
    const apply = (initial = false) => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      chart ??= echarts.init(element, undefined, { renderer: "svg", useDirtyRect: true });
      const current = latest.current;
      const theme = readTheme(element);
      themeKey = JSON.stringify(theme);
      chart.setOption(chartOption(current, theme), { notMerge: initial, lazyUpdate: !initial, silent: true });
    };
    const resize = new ResizeObserver(([entry]) => {
      if (entry == null) return;
      const nextWidth = Math.round(entry.contentRect.width);
      const nextHeight = Math.round(entry.contentRect.height);
      if (nextWidth <= 0 || nextHeight <= 0 || (nextWidth === width && nextHeight === height)) return;
      width = nextWidth;
      height = nextHeight;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => chart == null ? apply(true) : chart.resize({ width, height, silent: true }));
    });
    const observer = new MutationObserver(() => {
      if (JSON.stringify(readTheme(element)) !== themeKey) apply();
    });
    resize.observe(element);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    applyRef.current = () => apply(false);
    apply(true);
    return () => {
      applyRef.current = null;
      cancelAnimationFrame(frame);
      resize.disconnect();
      observer.disconnect();
      chart?.dispose();
    };
  }, []);

  useEffect(() => { applyRef.current?.(); }, [description, dimensions, percentChart, rows, series, thresholds, title, valueFormatter]);

  return <article className="host-monitor__chart"><header><div><h3>{title}</h3><p>{rows.length} points</p></div><dl><div><dt>Latest</dt><dd>{summary.latest}</dd></div><div><dt>Min</dt><dd>{summary.min}</dd></div><div><dt>Max</dt><dd>{summary.max}</dd></div></dl></header><div ref={target} role="img" aria-label={description} /></article>;
});

function chartOption(current: {
  description: string;
  dimensions: string[];
  percentChart: boolean;
  rows: Array<Array<number | null>>;
  series: string[];
  thresholds: Record<string, number>;
  title: string;
  valueFormatter?: (value: number | null | undefined) => string;
}, theme: ChartTheme) {
  const colors = [theme.primary, theme.secondary, theme.tertiary];
  return {
    aria: { enabled: true, description: current.description },
    animation: false,
    backgroundColor: "transparent",
    dataset: { id: `${current.title}-data`, dimensions: current.dimensions, source: current.rows },
    grid: { left: 8, right: 12, top: 14, bottom: 10, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
    tooltip: { trigger: "axis", confine: true, renderMode: "richText", backgroundColor: theme.surface, borderColor: theme.border, textStyle: { color: theme.foreground, fontSize: 11 } },
    xAxis: { type: "time", axisLabel: { color: theme.muted, fontSize: 10, hideOverlap: true }, axisLine: { lineStyle: { color: theme.border } } },
    yAxis: { type: "value", min: 0, max: current.percentChart ? 100 : undefined, axisLabel: { color: theme.muted, fontSize: 10, formatter: (value: number) => current.valueFormatter?.(value) ?? `${value.toFixed(value >= 10 ? 0 : 1)}${current.percentChart ? "%" : ""}` }, splitLine: { lineStyle: { color: theme.border } } },
    series: current.series.map((name, index) => ({
      id: `${current.title}-${name}`,
      type: "line",
      name,
      datasetId: `${current.title}-data`,
      encode: { x: "time", y: name },
      showSymbol: false,
      connectNulls: false,
      sampling: "lttb",
      lineStyle: { width: 1.6, color: colors[index], opacity: 1 },
      itemStyle: { color: colors[index], opacity: 1 },
      emphasis: { focus: "none", lineStyle: { width: 1.8, color: colors[index] } },
      markLine: current.thresholds[name] == null ? undefined : { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: theme.warning, type: "dashed", opacity: 0.7 }, data: [{ yAxis: current.thresholds[name] }] },
    })),
  };
}

function readTheme(target: HTMLElement): ChartTheme {
  const probe = document.createElement("i");
  probe.className = "host-monitor__theme";
  target.append(probe);
  const style = getComputedStyle(probe);
  const theme = {
    foreground: style.color,
    muted: style.borderTopColor,
    border: style.borderRightColor,
    surface: style.backgroundColor,
    primary: style.borderBottomColor,
    secondary: style.outlineColor,
    tertiary: style.textDecorationColor,
    warning: style.borderLeftColor,
  };
  probe.remove();
  return theme;
}

function chartSummary(rows: Array<Array<number | null>>, formatter: (value: number | null | undefined) => string) {
  const values = rows
    .map((row) => row[1])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    latest: formatter(values.at(-1)),
    min: formatter(values.length === 0 ? null : Math.min(...values)),
    max: formatter(values.length === 0 ? null : Math.max(...values)),
  };
}

function sampleStateLabel(machine: MachineRow): string {
  if (machine.sampleState === "offline") return "Offline";
  if (machine.sampleState === "sampling") return "Sampling";
  if (machine.sampleState === "error") return "Error";
  if (machine.sampleState === "stale") return "Stale";
  return "Live";
}

function percent(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;
}

function number(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(value >= 10 ? 0 : 1);
}

function bytes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${units[index]}`;
}

function rate(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : `${bytes(value)}/s`;
}

function uptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1_000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function rangeLabel(hours: number): string {
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  if (hours === 24) return "1 day";
  return `${hours / 24} days`;
}

function isOver(value: number | null | undefined, threshold: number): boolean {
  return value != null && Number.isFinite(value) && value >= threshold;
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "host-monitor",
    title: "Host Monitor",
    icon: "Activity",
    path: "host-monitor",
    component: FleetDashboard,
    experimental_sidebarAccessory: SidebarFleetAccessory,
  });
});
