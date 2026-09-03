import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LineChart } from "echarts/charts";
import { AriaComponent, DatasetComponent, GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { definePluginApp, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";

import type { HostMonitorSnapshot, rpcContract } from "./rpc-contract.ts";
import "./app.css";

echarts.use([AriaComponent, DatasetComponent, GridComponent, LineChart, SVGRenderer, TooltipComponent]);

const RANGES = [1, 6, 24, 24 * 7, 24 * 30] as const;
type RangeHours = typeof RANGES[number];
type ChartTheme = { foreground: string; muted: string; border: string; surface: string; cpu: string; memory: string; disk: string; load: string; warning: string };

function HostMonitorPanel() {
  const rpc = useRpc<typeof rpcContract>();
  const [rangeHours, setRangeHours] = useState<RangeHours>(24);
  const [snapshot, setSnapshot] = useState<HostMonitorSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRange = useRef(rangeHours);
  const mounted = useRef(true);
  const requestInFlight = useRef(false);
  const refreshPending = useRef(false);
  latestRange.current = rangeHours;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    refreshPending.current = true;
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    try {
      while (refreshPending.current) {
        refreshPending.current = false;
        const requestedRange = latestRange.current;
        try {
          const next = await rpc.call("snapshot", { rangeHours: requestedRange });
          if (mounted.current && !refreshPending.current && requestedRange === latestRange.current) {
            setSnapshot(next);
            setError(null);
          }
        } catch (cause) {
          if (mounted.current && !refreshPending.current && requestedRange === latestRange.current) {
            setError(cause instanceof Error ? cause.message : "Could not read the local machine monitor.");
          }
        }
      }
    } finally {
      requestInFlight.current = false;
      if (refreshPending.current && mounted.current) void refresh();
    }
  }, [rpc]);

  useEffect(() => { void refresh(); }, [refresh]);
  useRealtime("host-monitor-sample", useCallback(() => { void refresh(); }, [refresh]));
  useRealtime("host-monitor-directories", useCallback(() => { void refresh(); }, [refresh]));
  useRealtime("host-monitor-memory", useCallback(() => { void refresh(); }, [refresh]));

  const latest = snapshot?.latest ?? null;
  return (
    <main className="host-monitor">
      <header className="host-monitor__header">
        <div>
          <h1>Deployment machine</h1>
          <p>{snapshot == null ? "Reading local health…" : `${snapshot.hostName} · ${snapshot.platform}`}</p>
        </div>
        <label>
          <span>History</span>
          <select value={rangeHours} onChange={(event) => setRangeHours(Number(event.target.value) as RangeHours)}>
            {RANGES.map((hours) => <option key={hours} value={hours}>{rangeLabel(hours)}</option>)}
          </select>
        </label>
      </header>

      {error != null && <p className="host-monitor__error" role="status">{error}</p>}
      {snapshot?.lastError != null && <p className="host-monitor__error" role="status">Collector: {snapshot.lastError}</p>}

      <section className="host-monitor__metrics" aria-label="Current machine health">
        <Metric label="CPU (5 min)" value={percent(latest?.cpu5mPercent)} warning={isOver(latest?.cpu5mPercent, snapshot?.thresholds.cpu)} />
        <Metric label="Memory" value={ratio(latest?.memoryUsedBytes, latest?.memoryTotalBytes)} detail={bytes(latest?.memoryUsedBytes)} warning={isOver(percentNumber(latest?.memoryUsedBytes, latest?.memoryTotalBytes), snapshot?.thresholds.ram)} />
        <Metric label="Disk" value={ratio(latest?.diskUsedBytes, latest?.diskTotalBytes)} detail={growth(snapshot?.diskGrowthBytesPerDay, bytes(latest?.diskUsedBytes))} warning={isOver(percentNumber(latest?.diskUsedBytes, latest?.diskTotalBytes), snapshot?.thresholds.disk)} />
        <Metric label="Load (5 min)" value={number(latest?.load5)} detail={snapshot == null ? undefined : `up ${uptime(snapshot.uptimeSeconds)}`} warning={false} />
      </section>

      {snapshot != null && <DiagnosticsCharts samples={snapshot.samples} thresholds={snapshot.thresholds} />}
      {snapshot != null && <DirectoryUsage directories={snapshot.directories} />}
      {snapshot?.memoryDiagnostics != null && <MemoryPressure diagnostics={snapshot.memoryDiagnostics} processDetailsEnabled={snapshot.processDetailsEnabled} />}
      {snapshot != null && latest == null && <p className="host-monitor__empty">Waiting for the first local sample.</p>}
      <p className="host-monitor__footnote">CPU, RAM, and root-disk warnings use your Plugin Settings thresholds. CPU is a five-minute average to suppress bursts; load is context, not an alert. History is retained for 30 days and reduced to at most 720 points per chart.</p>
    </main>
  );
}

const MemoryPressure = memo(function MemoryPressure({ diagnostics, processDetailsEnabled }: { diagnostics: NonNullable<HostMonitorSnapshot["memoryDiagnostics"]>; processDetailsEnabled: boolean }) {
  const stalled = (diagnostics.pressureFullPercent ?? 0) > 0;
  return <section className="host-monitor__memory-pressure" data-pressure={stalled} aria-label="Memory pressure diagnostics">
    <header><div><h2>Memory pressure</h2><p>Kernel pressure and reclaim signals sample every minute, increasing to five seconds while work is stalled. Process ranking remains once per minute to avoid adding work during pressure.</p></div><span>{diagnostics.pressureSomePercent == null ? "Unavailable" : `${diagnostics.pressureSomePercent.toFixed(2)}% stalled`}</span></header>
    <dl><div><dt>Full stalls</dt><dd>{rateNumber(diagnostics.pressureFullPercent, "%")}</dd></div><div><dt>Refaults</dt><dd>{rateNumber(diagnostics.refaultPagesPerSecond, "/s")}</dd></div><div><dt>Reclaim scans</dt><dd>{rateNumber(diagnostics.reclaimPagesPerSecond, "/s")}</dd></div><div><dt>BB cgroup</dt><dd>{bytes(diagnostics.bbCgroupMemoryBytes) ?? "—"}</dd></div></dl>
    {!processDetailsEnabled ? <p className="host-monitor__processes-note">Process attribution is hidden. Enable “Show process attribution” in this plugin’s settings to reveal local workload names and PIDs.</p> : <><div className="host-monitor__processes" role="table" aria-label="Largest resident processes" tabIndex={0}><div role="row"><span role="columnheader">Workload</span><span role="columnheader">RSS</span><span role="columnheader">Change</span><span role="columnheader">Major faults</span></div>{diagnostics.processes.map((process) => <div role="row" key={`${process.pid}:${process.startTime}`}><span role="cell">{process.workload} <small>{process.workloadDetail == null ? `#${process.pid}` : `${process.workloadDetail} · #${process.pid}`}</small></span><span role="cell">{bytes(process.rssBytes)}</span><span role="cell">{signedBytes(process.rssDeltaBytes)}</span><span role="cell">{rateNumber(process.majorFaultsPerSecond, "/s")}</span></div>)}</div><p className="host-monitor__processes-note">Top 12 from a bounded, local scan of up to 2,048 processes{diagnostics.processDetailsCollectedAt == null ? "" : ` · ranked ${shortTime(diagnostics.processDetailsCollectedAt)}`}.</p></>}
  </section>;
});

const Metric = memo(function Metric({ label, value, detail, warning }: { label: string; value: string; detail?: string; warning: boolean }) {
  return <article data-warning={warning}><span>{label}</span><strong>{value}</strong>{detail != null && <small>{detail}</small>}</article>;
});

const DiagnosticsCharts = memo(function DiagnosticsCharts({ samples, thresholds }: { samples: HostMonitorSnapshot["samples"]; thresholds: HostMonitorSnapshot["thresholds"] }) {
  const usage = useMemo(() => withChartGaps(samples.map((sample) => [sample.collectedAt, sample.cpu5mPercent, percentNumber(sample.memoryUsedBytes, sample.memoryTotalBytes), percentNumber(sample.diskUsedBytes, sample.diskTotalBytes)])), [samples]);
  const load = useMemo(() => withChartGaps(samples.map((sample) => [sample.collectedAt, sample.load5])), [samples]);
  return <section className="host-monitor__charts">
    <Chart title="Utilization" description="Five-minute CPU, memory, and disk utilization over the selected period. Shaded regions were above a configured warning threshold." dimensions={["time", "CPU", "Memory", "Disk"]} rows={usage} sampleCount={samples.length} series={["CPU", "Memory", "Disk"]} thresholds={{ CPU: thresholds.cpu, Memory: thresholds.ram, Disk: thresholds.disk }} />
    <Chart title="Load average" description="Five-minute system load average over the selected period." dimensions={["time", "Load"]} rows={load} sampleCount={samples.length} series={["Load"]} thresholds={{}} />
  </section>;
});

const DirectoryUsage = memo(function DirectoryUsage({ directories }: { directories: HostMonitorSnapshot["directories"] }) {
  if (directories.length === 0) return null;
  return <section className="host-monitor__directories" aria-label="Local cache and working-directory usage">
    <h2>Cache and working directories</h2>
    <div>{directories.map((directory) => <article key={directory.id}>
      <span>{directory.label}</span><strong>{bytes(directory.bytes) ?? "—"}</strong><small>{growth(directory.growthBytesPerDay)}</small>
    </article>)}</div>
  </section>;
});

function Chart({ title, description, dimensions, rows, sampleCount, series, thresholds }: { title: string; description: string; dimensions: string[]; rows: Array<Array<number | null>>; sampleCount: number; series: string[]; thresholds: Record<string, number> }) {
  const target = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ title, description, dimensions, rows, series, thresholds });
  latest.current = { title, description, dimensions, rows, series, thresholds };
  const applyRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const element = target.current;
    if (element == null) return;
    let chart: ReturnType<typeof echarts.init> | null = null;
    let resizeFrame = 0;
    let width = 0;
    let height = 0;
    let themeKey = "";

    const apply = (initial = false) => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      chart ??= echarts.init(element, undefined, { renderer: "svg", useDirtyRect: true });
      const current = latest.current;
      const theme = readTheme(element);
      const nextThemeKey = JSON.stringify(theme);
      themeKey = nextThemeKey;
      chart.setOption(chartOption(current.title, current.description, current.dimensions, current.rows, current.series, current.thresholds, theme), {
        notMerge: initial,
        lazyUpdate: !initial,
        silent: true,
      });
    };
    const resize = new ResizeObserver(([entry]) => {
      if (entry == null) return;
      const nextWidth = Math.round(entry.contentRect.width);
      const nextHeight = Math.round(entry.contentRect.height);
      if (nextWidth <= 0 || nextHeight <= 0 || (nextWidth === width && nextHeight === height)) return;
      width = nextWidth; height = nextHeight;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => chart == null ? apply(true) : chart.resize({ width, height, silent: true }));
    });
    const themeObserver = new MutationObserver(() => {
      const nextThemeKey = JSON.stringify(readTheme(element));
      if (nextThemeKey !== themeKey) apply();
    });
    resize.observe(element);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    applyRef.current = () => apply(false);
    apply(true);
    return () => {
      applyRef.current = null;
      cancelAnimationFrame(resizeFrame);
      resize.disconnect();
      themeObserver.disconnect();
      chart?.dispose();
    };
  }, []);

  useEffect(() => { applyRef.current?.(); }, [dimensions, rows, series, thresholds, title, description]);
  return <article className="host-monitor__chart"><header><h2>{title}</h2><span>{sampleCount.toLocaleString()} samples</span></header><div ref={target} role="img" aria-label={description} /></article>;
}

function chartOption(title: string, description: string, dimensions: string[], rows: Array<Array<number | null>>, series: string[], thresholds: Record<string, number>, theme: ChartTheme) {
  const percentChart = title === "Utilization";
  const colors = title === "Utilization" ? [theme.cpu, theme.memory, theme.disk] : [theme.load];
  return {
    aria: { enabled: true, description }, animation: false, backgroundColor: "transparent",
    dataset: { id: `${title}-data`, dimensions, source: rows },
    grid: { left: 8, right: 12, top: 12, bottom: 12, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
    tooltip: { trigger: "axis", renderMode: "richText", confine: true, axisPointer: { type: "line", snap: true }, backgroundColor: theme.surface, borderColor: theme.border, textStyle: { color: theme.foreground, fontSize: 11 }, formatter: (params: unknown) => chartTooltip(params, dimensions, percentChart) },
    xAxis: { id: `${title}-x`, type: "time", axisPointer: { triggerEmphasis: true }, axisLabel: { color: theme.muted, fontSize: 10, hideOverlap: true }, axisLine: { lineStyle: { color: theme.border } } },
    yAxis: { id: `${title}-y`, type: "value", min: 0, max: percentChart ? 100 : undefined, axisLabel: { color: theme.muted, fontSize: 10, formatter: (value: number) => `${value.toFixed(1)}${percentChart ? "%" : ""}` }, splitLine: { lineStyle: { color: theme.border } } },
    series: series.map((name, index) => {
      const color = colors[index]!;
      return { id: `${title}-${name}`, type: "line", name, datasetId: `${title}-data`, encode: { x: "time", y: name }, showSymbol: false, connectNulls: false, sampling: "lttb", lineStyle: { width: 1.75, color, opacity: 1 }, itemStyle: { color, opacity: 1 }, emphasis: { focus: "none", scale: false, symbolSize: 8, lineStyle: { width: 1.75, color, opacity: 1 }, itemStyle: { color, opacity: 1 } }, blur: { lineStyle: { width: 1.75, color, opacity: 1 }, itemStyle: { color, opacity: 1 } }, markLine: thresholds[name] == null ? undefined : { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: theme.warning, type: "dashed", opacity: .7 }, data: [{ yAxis: thresholds[name] }] }, markArea: index === 0 && title === "Utilization" ? { silent: true, itemStyle: { color: theme.warning, opacity: .1 }, data: warningWindows(rows, series, thresholds) } : undefined };
    }),
  };
}

function chartTooltip(params: unknown, dimensions: string[], percentChart: boolean): string {
  const entries = (Array.isArray(params) ? params : [params]).filter((entry): entry is { axisValue?: number; marker?: string; seriesName?: string; value?: unknown } => entry != null && typeof entry === "object");
  const time = entries[0]?.axisValue;
  const heading = typeof time === "number" ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(time) : "Sample";
  const values = entries.flatMap((entry) => {
    const index = dimensions.indexOf(entry.seriesName ?? "");
    const value = Array.isArray(entry.value) && index >= 0 ? entry.value[index] : entry.value;
    return typeof value === "number" && Number.isFinite(value) ? [`${entry.marker ?? ""} ${entry.seriesName ?? "Metric"}  ${value.toFixed(1)}${percentChart ? "%" : ""}`] : [];
  });
  return values.length === 0 ? `${heading}\nCollection gap — no sample recorded` : [heading, ...values].join("\n");
}

function readTheme(target: HTMLElement): ChartTheme {
  const probe = document.createElement("i"); probe.className = "host-monitor__theme"; target.append(probe);
  const style = getComputedStyle(probe); const theme = { foreground: style.color, muted: style.borderTopColor, border: style.borderRightColor, surface: style.backgroundColor, cpu: style.borderBottomColor, memory: style.outlineColor, disk: style.textDecorationColor, load: style.caretColor, warning: style.borderLeftColor }; probe.remove(); return theme;
}
function percent(value: number | null | undefined): string { return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`; }
function percentNumber(part: number | null | undefined, whole: number | null | undefined): number | null { return part == null || whole == null || whole <= 0 ? null : Math.max(0, Math.min(100, part / whole * 100)); }
function ratio(part: number | null | undefined, whole: number | null | undefined): string { return percent(percentNumber(part, whole)); }
function bytes(value: number | null | undefined): string | undefined { return value == null ? undefined : value < 1_073_741_824 ? `${(value / 1_048_576).toFixed(1)} MiB` : `${(value / 1_073_741_824).toFixed(1)} GiB`; }
function growth(value: number | null | undefined, prefix?: string): string | undefined {
  if (value == null || !Number.isFinite(value)) return prefix;
  const direction = value >= 0 ? "+" : "−";
  return `${prefix == null ? "" : `${prefix} · `}${direction}${bytes(Math.abs(value))}/day`;
}
function number(value: number | null | undefined): string { return value == null ? "—" : value.toFixed(1); }
function rateNumber(value: number | null | undefined, suffix: string): string { return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(value >= 10 ? 0 : 2)}${suffix}`; }
function signedBytes(value: number | null | undefined): string { return value == null ? "—" : `${value >= 0 ? "+" : "−"}${bytes(Math.abs(value))}`; }
function uptime(seconds: number): string { const days = Math.floor(seconds / 86_400); const hours = Math.floor(seconds % 86_400 / 3_600); return days > 0 ? `${days}d ${hours}h` : `${hours}h`; }
function shortTime(value: number): string { return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(value); }
function rangeLabel(hours: number): string { return hours < 24 ? `${hours} hour${hours === 1 ? "" : "s"}` : hours < 168 ? `${hours / 24} days` : hours === 168 ? "7 days" : "30 days"; }
function isOver(value: number | null | undefined, threshold: number | undefined): boolean { return value != null && threshold != null && value >= threshold; }
function warningWindows(rows: Array<Array<number | null>>, series: string[], thresholds: Record<string, number>): Array<Array<{ xAxis: number }>> {
  const windows: Array<Array<{ xAxis: number }>> = [];
  let startedAt: number | null = null;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const time = row[0];
    if (time == null) continue;
    const over = series.some((name, seriesIndex) => thresholds[name] != null && (row[seriesIndex + 1] ?? Number.NEGATIVE_INFINITY) >= thresholds[name]);
    if (over && startedAt == null) startedAt = time;
    if (!over && startedAt != null) { windows.push([{ xAxis: startedAt }, { xAxis: time }]); startedAt = null; }
  }
  if (startedAt != null && rows.at(-1)?.[0] != null) windows.push([{ xAxis: startedAt }, { xAxis: rows.at(-1)![0]! + 30_000 }]);
  return windows;
}

function withChartGaps(rows: Array<Array<number | null>>): Array<Array<number | null>> {
  const deltas = rows.slice(1).map((row, index) => (row[0] ?? 0) - (rows[index]?.[0] ?? 0)).filter((delta) => delta > 0).sort((left, right) => left - right);
  const median = deltas.length === 0 ? 30_000 : deltas[Math.floor(deltas.length / 2)]!;
  const maxGap = Math.max(90_000, median * 3);
  const result: Array<Array<number | null>> = [];
  for (const row of rows) {
    const previous = result.at(-1);
    if (previous != null && row[0] != null && previous[0] != null && row[0] - previous[0] > maxGap) result.push([previous[0] + 1, ...Array(row.length - 1).fill(null)]);
    result.push(row);
  }
  return result;
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "host-monitor",
    title: "Host Monitor",
    icon: "Activity",
    path: "host-monitor",
    component: HostMonitorPanel,
  });
});
