import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LineChart } from "echarts/charts";
import { AriaComponent, DatasetComponent, GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { definePluginApp, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";

import { expectedSampleInterval, withChartGaps } from "./chart-data.ts";
import type { DashboardConfig, DashboardPanel, Fleet, HistoryPoint, MachineHistory, MachineRow, RangeHours, rpcContract } from "./contract.ts";
import {
  DASHBOARD_CATALOG,
  addDashboardPanel,
  availableDashboardPanels,
  changeDashboardPanelVisualization,
  cloneDashboardConfig,
  dashboardPanelKey,
  moveDashboardPanel,
  removeDashboardPanel,
} from "./dashboard-config.ts";
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

type MetricChart = {
  dimensions: string[];
  rows: Array<Array<number | null>>;
  series: string[];
  thresholds: Record<string, number>;
  percentChart: boolean;
  valueFormatter?: (value: number | null | undefined) => string;
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
  const [historyLoading, setHistoryLoading] = useState(false);
  const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig | null>(null);
  const [dashboardDraft, setDashboardDraft] = useState<DashboardConfig | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [editingDashboard, setEditingDashboard] = useState(false);
  const [savingDashboard, setSavingDashboard] = useState(false);
  const historyRequest = useRef(0);
  const dashboardRequest = useRef(0);
  const selectedHost = useRef<string | null>(null);
  selectedHost.current = selectedHostId;

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

  const loadHistory = useCallback(async () => {
    if (selectedHostId == null) {
      setHistory(null);
      setHistoryLoading(false);
      return;
    }
    const request = ++historyRequest.current;
    setHistoryLoading(true);
    try {
      const next = await rpc.call("machineHistory", { hostId: selectedHostId, rangeHours });
      if (historyRequest.current === request) {
        setHistory(next);
        setError(null);
      }
    } catch (cause) {
      if (historyRequest.current === request) {
        setHistory(null);
        setError(cause instanceof Error ? cause.message : "Could not load machine history.");
      }
    } finally {
      if (historyRequest.current === request) setHistoryLoading(false);
    }
  }, [rangeHours, rpc, selectedHostId]);

  const loadDashboardConfig = useCallback(async () => {
    if (selectedHostId == null) {
      setDashboardConfig(null);
      setDashboardDraft(null);
      setDashboardLoading(false);
      return;
    }
    const request = ++dashboardRequest.current;
    setDashboardLoading(true);
    try {
      const next = await rpc.call("dashboardConfig", { hostId: selectedHostId });
      if (dashboardRequest.current === request) {
        setDashboardConfig(next);
        setDashboardDraft(cloneDashboardConfig(next));
        setDashboardError(null);
      }
    } catch (cause) {
      if (dashboardRequest.current === request) {
        setDashboardConfig(null);
        setDashboardDraft(null);
        setDashboardError(cause instanceof Error ? cause.message : "Could not load this dashboard configuration.");
      }
    } finally {
      if (dashboardRequest.current === request) setDashboardLoading(false);
    }
  }, [rpc, selectedHostId]);

  useEffect(() => { void loadFleet(); }, [loadFleet]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);
  useEffect(() => {
    setEditingDashboard(false);
    setSavingDashboard(false);
    setDashboardError(null);
    setDashboardConfig(null);
    setDashboardDraft(null);
    void loadDashboardConfig();
  }, [loadDashboardConfig]);
  useRealtime(REALTIME_CHANNEL, useCallback(() => {
    void loadFleet();
    void loadHistory();
  }, [loadFleet, loadHistory]));

  const refreshAll = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const next = await rpc.call("refresh", { hostId: null });
      setFleet(next);
      await loadHistory();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh the fleet.");
    } finally {
      setRefreshing(false);
    }
  }, [loadHistory, refreshing, rpc]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleMachines = useMemo(() => {
    if (fleet == null || normalizedQuery === "") return fleet?.machines ?? [];
    return fleet.machines.filter((machine) =>
      [machine.host.name, machine.host.id, machine.snapshot?.system.osName, machine.snapshot?.system.platform]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)),
    );
  }, [fleet, normalizedQuery]);

  const selected = fleet?.machines.find((machine) => machine.host.id === selectedHostId) ?? null;
  const points = history?.hostId === selectedHostId && history.rangeHours === rangeHours ? history.points : [];

  const saveDashboard = useCallback(async () => {
    if (selectedHostId == null || dashboardDraft == null || savingDashboard) return;
    const hostId = selectedHostId;
    setSavingDashboard(true);
    setDashboardError(null);
    try {
      const saved = await rpc.call("saveDashboardConfig", { hostId, config: dashboardDraft });
      if (selectedHost.current !== hostId) return;
      setDashboardConfig(saved);
      setDashboardDraft(cloneDashboardConfig(saved));
      setEditingDashboard(false);
    } catch (cause) {
      setDashboardError(cause instanceof Error ? cause.message : "Could not save this dashboard configuration.");
    } finally {
      setSavingDashboard(false);
    }
  }, [dashboardDraft, rpc, savingDashboard, selectedHostId]);

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

      <MachineDashboard
        config={dashboardConfig}
        configError={dashboardError}
        configLoading={dashboardLoading}
        draft={dashboardDraft}
        editing={editingDashboard}
        historyLoading={historyLoading}
        machine={selected}
        onCancelEdit={() => {
          setDashboardDraft(dashboardConfig == null ? null : cloneDashboardConfig(dashboardConfig));
          setDashboardError(null);
          setEditingDashboard(false);
        }}
        onChangeDraft={setDashboardDraft}
        onEdit={() => {
          if (dashboardConfig != null) setDashboardDraft(cloneDashboardConfig(dashboardConfig));
          setDashboardError(null);
          setEditingDashboard(true);
        }}
        onSave={() => void saveDashboard()}
        points={points}
        rangeHours={rangeHours}
        saving={savingDashboard}
        thresholds={fleet?.thresholds ?? { cpu: 90, ram: 90, disk: 90 }}
      />
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
        <small>{machine.receivedAtMs == null ? "No sample yet" : relativeTime(machine.receivedAtMs)}</small>
      </footer>
    </button>
  );
});

function CardValue({ label, value, warning }: { label: string; value: string; warning: boolean }) {
  return <div data-warning={warning}><dt>{label}</dt><dd>{value}</dd></div>;
}

function MachineDashboard({
  config,
  configError,
  configLoading,
  draft,
  editing,
  historyLoading,
  machine,
  onCancelEdit,
  onChangeDraft,
  onEdit,
  onSave,
  points,
  rangeHours,
  saving,
  thresholds,
}: {
  config: DashboardConfig | null;
  configError: string | null;
  configLoading: boolean;
  draft: DashboardConfig | null;
  editing: boolean;
  historyLoading: boolean;
  machine: MachineRow | null;
  onCancelEdit(): void;
  onChangeDraft(config: DashboardConfig): void;
  onEdit(): void;
  onSave(): void;
  points: HistoryPoint[];
  rangeHours: RangeHours;
  saving: boolean;
  thresholds: Fleet["thresholds"];
}) {
  if (machine == null) {
    return <section className="host-monitor__dashboard host-monitor__dashboard--empty"><p>Select a machine to inspect its dashboard.</p></section>;
  }
  const snapshot = machine.snapshot;

  return (
    <section className="host-monitor__dashboard" aria-labelledby="machine-heading">
      <header className="host-monitor__machine-heading">
        <div>
          <span className="host-monitor__state-dot" data-state={machine.sampleState} aria-hidden="true" />
          <div><h2 id="machine-heading">{machine.host.name}</h2><p>{snapshot == null ? machine.host.id : `${snapshot.system.osName} · ${snapshot.system.arch}`}</p></div>
        </div>
        <div className="host-monitor__machine-actions">
          <span>{sampleStateLabel(machine)}{machine.receivedAtMs == null ? "" : ` · received ${relativeTime(machine.receivedAtMs)}`}{historyLoading ? " · loading history…" : ""}</span>
          {!editing && <button className="host-monitor__button host-monitor__button--outline" disabled={configLoading || config == null} onClick={onEdit} type="button">Edit dashboard</button>}
        </div>
      </header>

      {machine.error != null && <p className="host-monitor__inline-status" role="status">{machine.error}</p>}
      {snapshot?.issues.map((issue) => <p className="host-monitor__inline-status host-monitor__inline-status--quiet" role="status" key={`${issue.metric}:${issue.message}`}>{issue.metric}: {issue.message}</p>)}
      {configError != null && <p className="host-monitor__inline-status" role="status">{configError}</p>}

      {editing && draft != null && (
        <DashboardEditor config={draft} onCancel={onCancelEdit} onChange={onChangeDraft} onSave={onSave} saving={saving} />
      )}

      {configLoading && config == null ? (
        <p className="host-monitor__empty" role="status">Loading dashboard configuration…</p>
      ) : config == null ? null : (
        <div className="host-monitor__panel-grid">
          {config.panels.map((panel) => (
            <MetricPanel
              key={`${panel.metric}:${panel.visualization}`}
              machine={machine}
              panel={panel}
              points={points}
              rangeHours={rangeHours}
              thresholds={thresholds}
            />
          ))}
        </div>
      )}

      <dl className="host-monitor__facts">
        <Fact label="Processor" value={snapshot?.cpu.model || "Unavailable"} />
        <Fact label="Platform" value={snapshot == null ? "Unavailable" : `${snapshot.system.platform} · ${snapshot.system.arch}`} />
        <Fact label="Kernel" value={snapshot?.system.kernelRelease ?? "Unavailable"} />
      </dl>
    </section>
  );
}

function MetricPanel({
  machine,
  panel,
  points,
  rangeHours,
  thresholds,
}: {
  machine: MachineRow;
  panel: DashboardPanel;
  points: HistoryPoint[];
  rangeHours: RangeHours;
  thresholds: Fleet["thresholds"];
}) {
  const snapshot = machine.snapshot;
  const definition = DASHBOARD_CATALOG[panel.metric];
  if (panel.visualization === "stat") {
    const reading = metricStat(machine, panel.metric, thresholds);
    return <StatPanel detail={reading.detail} label={definition.label} value={reading.value} warning={reading.warning} />;
  }

  const interval = expectedSampleInterval(rangeHours);
  const chart = metricChart(panel.metric, points, thresholds);
  return (
    <Chart
      description={`${definition.description} history for ${machine.host.name}`}
      dimensions={chart.dimensions}
      percentChart={chart.percentChart}
      rows={withChartGaps(chart.rows, interval)}
      series={chart.series}
      thresholds={chart.thresholds}
      title={definition.label}
      valueFormatter={chart.valueFormatter}
    />
  );
}

function metricStat(machine: MachineRow, metric: DashboardPanel["metric"], thresholds: Fleet["thresholds"]) {
  const snapshot = machine.snapshot;
  if (metric === "cpu") return { value: percent(snapshot?.cpu.usagePercent), detail: snapshot == null ? "Unavailable" : `${snapshot.cpu.logicalCores} logical cores`, warning: isOver(snapshot?.cpu.usagePercent, thresholds.cpu) };
  if (metric === "memory") return { value: percent(snapshot?.memory.usagePercent), detail: snapshot == null ? "Unavailable" : `${bytes(snapshot.memory.usedBytes)} / ${bytes(snapshot.memory.totalBytes)}`, warning: isOver(snapshot?.memory.usagePercent, thresholds.ram) };
  if (metric === "disk") return { value: percent(snapshot?.disk?.usagePercent), detail: snapshot?.disk == null ? "Unavailable" : `${bytes(snapshot.disk.availableBytes)} free`, warning: isOver(snapshot?.disk?.usagePercent, thresholds.disk) };
  if (metric === "load") return { value: number(snapshot?.cpu.loadAverage?.[1]), detail: snapshot?.cpu.loadAverage == null ? "Unavailable" : snapshot.cpu.loadAverage.map(number).join(" / "), warning: false };
  if (metric === "network") return { value: `↓ ${rate(snapshot?.network.receiveBytesPerSecond)}`, detail: `↑ ${rate(snapshot?.network.sendBytesPerSecond)}`, warning: false };
  return { value: snapshot == null ? "—" : uptime(snapshot.system.uptimeSeconds), detail: snapshot == null ? "Unavailable" : "Since last boot", warning: false };
}

function metricChart(metric: DashboardPanel["metric"], points: HistoryPoint[], thresholds: Fleet["thresholds"]): MetricChart {
  if (metric === "cpu") return { dimensions: ["time", "CPU"], rows: points.map((point) => [point.collectedAtMs, point.cpuPercent]), series: ["CPU"], thresholds: { CPU: thresholds.cpu }, percentChart: true };
  if (metric === "memory") return { dimensions: ["time", "RAM"], rows: points.map((point) => [point.collectedAtMs, point.memoryPercent]), series: ["RAM"], thresholds: { RAM: thresholds.ram }, percentChart: true };
  if (metric === "disk") return { dimensions: ["time", "Disk"], rows: points.map((point) => [point.collectedAtMs, point.diskPercent]), series: ["Disk"], thresholds: { Disk: thresholds.disk }, percentChart: true };
  if (metric === "load") return { dimensions: ["time", "1m", "5m", "15m"], rows: points.map((point) => [point.collectedAtMs, point.load1, point.load5, point.load15]), series: ["1m", "5m", "15m"], thresholds: {}, percentChart: false };
  return { dimensions: ["time", "Receive", "Send"], rows: points.map((point) => [point.collectedAtMs, point.receiveBytesPerSecond, point.sendBytesPerSecond]), series: ["Receive", "Send"], thresholds: {}, percentChart: false, valueFormatter: rate };
}

function DashboardEditor({
  config,
  onCancel,
  onChange,
  onSave,
  saving,
}: {
  config: DashboardConfig;
  onCancel(): void;
  onChange(config: DashboardConfig): void;
  onSave(): void;
  saving: boolean;
}) {
  const configured = new Set(config.panels.map(dashboardPanelKey));
  const available = availableDashboardPanels(config);
  const [nextKey, setNextKey] = useState(available[0] == null ? "" : `${available[0].metric}:${available[0].visualization}`);
  const effectiveNextKey = available.some((panel) => `${panel.metric}:${panel.visualization}` === nextKey)
    ? nextKey
    : available[0] == null ? "" : `${available[0].metric}:${available[0].visualization}`;

  return (
    <section className="host-monitor__editor" aria-labelledby="dashboard-editor-heading">
      <header>
        <div><h3 id="dashboard-editor-heading">Edit dashboard</h3><p>Panels are saved for this machine only.</p></div>
        <span>{config.panels.length} panels</span>
      </header>
      <ol className="host-monitor__editor-list">
        {config.panels.map((panel, index) => {
          const definition = DASHBOARD_CATALOG[panel.metric];
          return (
            <li key={`${panel.metric}:${panel.visualization}`}>
              <span><strong>{definition.label}</strong><small>{definition.description}</small></span>
              <label><span>Visualization</span><select value={panel.visualization} onChange={(event) => {
                const visualization = event.target.value as DashboardPanel["visualization"];
                onChange(changeDashboardPanelVisualization(config, index, visualization));
              }}>{definition.visualizations.map((visualization) => <option disabled={visualization !== panel.visualization && configured.has(`${panel.metric}:${visualization}`)} key={visualization} value={visualization}>{visualization === "stat" ? "Stat" : "Time series"}</option>)}</select></label>
              <div className="host-monitor__editor-order">
                <button aria-label={`Move ${definition.label} earlier`} className="host-monitor__icon-button" disabled={index === 0} onClick={() => onChange(moveDashboardPanel(config, index, index - 1))} type="button">↑</button>
                <button aria-label={`Move ${definition.label} later`} className="host-monitor__icon-button" disabled={index === config.panels.length - 1} onClick={() => onChange(moveDashboardPanel(config, index, index + 1))} type="button">↓</button>
                <button aria-label={`Remove ${definition.label} ${panel.visualization} panel`} className="host-monitor__button host-monitor__button--ghost" disabled={config.panels.length === 1} onClick={() => onChange(removeDashboardPanel(config, index))} type="button">Remove</button>
              </div>
            </li>
          );
        })}
      </ol>
      {available.length > 0 && (
        <div className="host-monitor__editor-add">
          <label><span>Add metric panel</span><select value={effectiveNextKey} onChange={(event) => setNextKey(event.target.value)}>{available.map((panel) => <option key={`${panel.metric}:${panel.visualization}`} value={`${panel.metric}:${panel.visualization}`}>{DASHBOARD_CATALOG[panel.metric].label} · {panel.visualization === "stat" ? "Stat" : "Time series"}</option>)}</select></label>
          <button className="host-monitor__button host-monitor__button--outline" onClick={() => {
            const panel = available.find((candidate) => `${candidate.metric}:${candidate.visualization}` === effectiveNextKey);
            if (panel != null) onChange(addDashboardPanel(config, panel));
          }} type="button">Add panel</button>
        </div>
      )}
      <footer>
        <button className="host-monitor__button host-monitor__button--ghost" disabled={saving} onClick={onCancel} type="button">Cancel</button>
        <button className="host-monitor__button" disabled={saving} onClick={onSave} type="button">{saving ? "Saving…" : "Save dashboard"}</button>
      </footer>
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

  return <article className="host-monitor__chart"><header><div><h3>{title}</h3><p>{rows.length} points · stats: {series[0]}</p></div><dl><div><dt>Latest</dt><dd>{summary.latest}</dd></div><div><dt>Min</dt><dd>{summary.min}</dd></div><div><dt>Max</dt><dd>{summary.max}</dd></div></dl></header><div ref={target} role="img" aria-label={description} /></article>;
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

function openHostMonitor({ openSettings }: { openSettings(): void }): void {
  openSettings();
}

export default definePluginApp((app) => {
  app.slots.sidebarFooterAction({
    id: "host-monitor",
    title: "Host Monitor",
    icon: "Activity",
    run: openHostMonitor,
  });
  app.slots.settingsSection({
    id: "monitor",
    title: "Host Monitor",
    description: "Live and historical health for every machine enrolled in BB.",
    component: FleetDashboard,
  });
});
