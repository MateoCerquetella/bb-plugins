import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { LineChart } from "echarts/charts";
import { AriaComponent, DatasetComponent, GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { definePluginApp, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";

import { Badge } from "./components/ui/badge.tsx";
import { Button } from "./components/ui/button.tsx";
import { Input } from "./components/ui/input.tsx";
import { Skeleton } from "./components/ui/skeleton.tsx";
import { expectedSampleInterval, withChartGaps } from "./chart-data.ts";
import type {
  DashboardConfig,
  DashboardPanel,
  Fleet,
  HistoryPoint,
  MachineHistory,
  MachineRow,
  PreparedTermination,
  ProcessListResult,
  ProcessRow,
  ProcessSortBy,
  ProcessTerminationMode,
  RangeHours,
  rpcContract,
} from "./contract.ts";
import {
  DASHBOARD_CATALOG,
  cloneDashboardConfig,
  dashboardPanelKey,
  defaultDashboardConfig,
  moveDashboardPanel,
  setDashboardPanelVisibility,
  visibleDashboardPanels,
} from "./dashboard-config.ts";
import {
  blockedProcessReason,
  filterProcessRows,
  processOwnerLabel,
  sortProcessRows,
  summarizeProcessRows,
} from "./lib/process-presentation.ts";
import { mountHostMonitorMiniModal, toggleHostMonitorMiniModal } from "./sidebar-modal.ts";
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
const PROCESS_PAGE_LIMIT = 100;
const PROCESS_REFRESH_MS = 10_000;

type PreparedTerminationReady = Extract<PreparedTermination, { outcome: "ready" }>;

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
  const [dashboardAnnouncement, setDashboardAnnouncement] = useState("");
  const historyRequest = useRef(0);
  const dashboardRequest = useRef(0);
  const selectedHost = useRef<string | null>(null);
  selectedHost.current = selectedHostId;

  const dirtyDashboard = editingDashboard && dashboardConfig != null && dashboardDraft != null &&
    JSON.stringify(dashboardConfig) !== JSON.stringify(dashboardDraft);

  useEffect(() => {
    if (!dirtyDashboard) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyDashboard]);

  const loadFleet = useCallback(async () => {
    try {
      const next = await rpc.call("fleet");
      setFleet(next);
      setError(null);
      setSelectedHostId((current) => {
        if (current != null && next.machines.some((machine) => machine.host.id === current)) return current;
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
    setDashboardAnnouncement("");
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
    if (selectedHostId == null || dashboardDraft == null || savingDashboard || !dirtyDashboard) return;
    const hostId = selectedHostId;
    setSavingDashboard(true);
    setDashboardError(null);
    try {
      const saved = await rpc.call("saveDashboardConfig", { hostId, config: dashboardDraft });
      if (selectedHost.current !== hostId) return;
      setDashboardConfig(saved);
      setDashboardDraft(cloneDashboardConfig(saved));
      setEditingDashboard(false);
      setDashboardAnnouncement("Dashboard layout saved.");
    } catch (cause) {
      setDashboardError(cause instanceof Error ? cause.message : "Could not save this dashboard configuration.");
    } finally {
      setSavingDashboard(false);
    }
  }, [dashboardDraft, dirtyDashboard, rpc, savingDashboard, selectedHostId]);

  return (
    <main className="host-monitor">
      <output aria-live="polite" className="host-monitor__sr-only">{dashboardAnnouncement}</output>
      <header className="host-monitor__page-header">
        <div className="host-monitor__page-title">
          <span className="host-monitor__brand-mark" aria-hidden="true">⌁</span>
          <div>
            <h1>Machine monitor</h1>
            <p>{fleet == null ? "Loading enrolled hosts…" : `${fleet.connected} of ${fleet.total} connected · updated ${relativeTime(fleet.generatedAtMs)}`}</p>
          </div>
        </div>
        <div className="host-monitor__page-controls">
          <label className="host-monitor__search">
            <span>Find machine</span>
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, id, or platform" type="search" />
          </label>
          <label className="host-monitor__range">
            <span>History</span>
            <select value={rangeHours} onChange={(event) => setRangeHours(Number(event.target.value) as RangeHours)}>
              {RANGES.map((hours) => <option key={hours} value={hours}>{rangeLabel(hours)}</option>)}
            </select>
          </label>
          <Button disabled={refreshing || fleet?.refreshing === true} onClick={() => void refreshAll()} variant="outline">
            {refreshing || fleet?.refreshing ? "Refreshing…" : "Refresh all"}
          </Button>
        </div>
      </header>

      {error != null && <p className="host-monitor__inline-status" role="status">{error}</p>}

      <section className="host-monitor__fleet" aria-labelledby="fleet-heading">
        <header>
          <div><h2 id="fleet-heading">Hosts</h2><p>Every machine enrolled in BB</p></div>
          <Badge>{visibleMachines.length} of {fleet?.total ?? 0}</Badge>
        </header>
        {fleet == null ? <FleetSkeleton /> : visibleMachines.length === 0 ? (
          <div className="host-monitor__empty">
            <strong>{fleet.total === 0 ? "No machines enrolled" : "No matching machines"}</strong>
            <span>{fleet.total === 0 ? "Connect a machine to BB to begin monitoring." : `Nothing matches “${query.trim()}”.`}</span>
          </div>
        ) : (
          <ul className="host-monitor__machine-grid">
            {visibleMachines.map((machine) => (
              <li key={machine.host.id}>
                <MachineCard
                  disabled={dirtyDashboard && machine.host.id !== selectedHostId}
                  machine={machine}
                  onSelect={() => {
                    if (!dirtyDashboard) setSelectedHostId(machine.host.id);
                    else setDashboardAnnouncement("Save or cancel dashboard changes before switching hosts.");
                  }}
                  selected={machine.host.id === selectedHostId}
                  thresholds={fleet.thresholds}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {dirtyDashboard && (
        <p className="host-monitor__draft-note" role="status">
          Finish or cancel dashboard changes before switching hosts.
        </p>
      )}

      <MachineDashboard
        config={dashboardConfig}
        configError={dashboardError}
        configLoading={dashboardLoading}
        dirty={dirtyDashboard}
        draft={dashboardDraft}
        editing={editingDashboard}
        historyLoading={historyLoading}
        machine={selected}
        onAnnouncement={setDashboardAnnouncement}
        onCancelEdit={() => {
          setDashboardDraft(dashboardConfig == null ? null : cloneDashboardConfig(dashboardConfig));
          setDashboardError(null);
          setEditingDashboard(false);
          setDashboardAnnouncement("Dashboard changes discarded.");
        }}
        onChangeDraft={setDashboardDraft}
        onEdit={() => {
          if (dashboardConfig != null) setDashboardDraft(cloneDashboardConfig(dashboardConfig));
          setDashboardError(null);
          setEditingDashboard(true);
          setDashboardAnnouncement("Dashboard customization opened.");
        }}
        onReset={() => {
          setDashboardDraft(defaultDashboardConfig());
          setDashboardAnnouncement("Draft reset to defaults. Save to persist it.");
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
  disabled,
  machine,
  onSelect,
  selected,
  thresholds,
}: {
  disabled: boolean;
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
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <header>
        <span className="host-monitor__state-dot" data-state={machine.sampleState} aria-hidden="true" />
        <span><strong>{machine.host.name}</strong><small>{snapshot?.system.osName ?? machine.host.id}</small></span>
        <Badge tone={machine.host.status === "connected" ? "success" : "neutral"}>{sampleStateLabel(machine)}</Badge>
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
  dirty,
  draft,
  editing,
  historyLoading,
  machine,
  onAnnouncement,
  onCancelEdit,
  onChangeDraft,
  onEdit,
  onReset,
  onSave,
  points,
  rangeHours,
  saving,
  thresholds,
}: {
  config: DashboardConfig | null;
  configError: string | null;
  configLoading: boolean;
  dirty: boolean;
  draft: DashboardConfig | null;
  editing: boolean;
  historyLoading: boolean;
  machine: MachineRow | null;
  onAnnouncement(message: string): void;
  onCancelEdit(): void;
  onChangeDraft(config: DashboardConfig): void;
  onEdit(): void;
  onReset(): void;
  onSave(): void;
  points: HistoryPoint[];
  rangeHours: RangeHours;
  saving: boolean;
  thresholds: Fleet["thresholds"];
}) {
  if (machine == null) {
    return (
      <section className="host-monitor__dashboard host-monitor__dashboard--empty">
        <div className="host-monitor__empty"><strong>Select a machine</strong><span>Choose a host above to inspect its dashboard.</span></div>
      </section>
    );
  }
  const snapshot = machine.snapshot;
  const renderedConfig = editing && draft != null ? draft : config;
  const panels = renderedConfig == null ? [] : visibleDashboardPanels(renderedConfig);

  return (
    <section className="host-monitor__dashboard" aria-labelledby="machine-heading">
      <header className="host-monitor__machine-heading">
        <div>
          <span className="host-monitor__state-dot" data-state={machine.sampleState} aria-hidden="true" />
          <div>
            <h2 id="machine-heading">{machine.host.name}</h2>
            <p>{snapshot == null ? machine.host.id : `${snapshot.system.osName} · ${snapshot.system.arch}`}</p>
          </div>
        </div>
        <div className="host-monitor__machine-actions">
          <span>{sampleStateLabel(machine)}{machine.receivedAtMs == null ? "" : ` · received ${relativeTime(machine.receivedAtMs)}`}{historyLoading ? " · loading history…" : ""}</span>
          {!editing && <Button disabled={configLoading || config == null} onClick={onEdit} variant="outline">Customize</Button>}
        </div>
      </header>

      {machine.error != null && <p className="host-monitor__inline-status" role="status">{machine.error}</p>}
      {snapshot?.issues.map((issue) => (
        <p className="host-monitor__inline-status host-monitor__inline-status--quiet" role="status" key={`${issue.metric}:${issue.message}`}>
          {issue.metric}: {issue.message}
        </p>
      ))}
      {configError != null && <p className="host-monitor__inline-status" role="status">{configError}</p>}

      {editing && draft != null && (
        <DashboardEditor
          config={draft}
          dirty={dirty}
          onAnnouncement={onAnnouncement}
          onCancel={onCancelEdit}
          onChange={onChangeDraft}
          onReset={onReset}
          onSave={onSave}
          saving={saving}
        />
      )}

      {configLoading && config == null ? (
        <DashboardSkeleton />
      ) : renderedConfig == null ? (
        <div className="host-monitor__empty"><strong>Dashboard unavailable</strong><span>Try refreshing this host.</span></div>
      ) : panels.length === 0 ? (
        <div className="host-monitor__empty"><strong>No widgets shown</strong><span>Customize the dashboard to choose visible metrics.</span></div>
      ) : (
        <div className="host-monitor__panel-grid" data-editing={editing}>
          {panels.map((panel) => (
            <MetricPanel
              key={dashboardPanelKey(panel)}
              machine={machine}
              panel={panel}
              points={points}
              rangeHours={rangeHours}
              thresholds={thresholds}
            />
          ))}
        </div>
      )}
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
  if (panel.metric === "processes") return <ProcessesWidget machine={machine} />;
  if (panel.metric === "system") return <SystemWidget machine={machine} />;
  const definition = DASHBOARD_CATALOG[panel.metric];
  if (panel.visualization === "stat") {
    const reading = metricStat(machine, panel.metric, thresholds);
    return <StatPanel detail={reading.detail} label={definition.label} value={reading.value} warning={reading.warning} />;
  }
  if (panel.metric === "uptime") return null;
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

function metricStat(
  machine: MachineRow,
  metric: Exclude<DashboardPanel["metric"], "system" | "processes">,
  thresholds: Fleet["thresholds"],
) {
  const snapshot = machine.snapshot;
  if (metric === "cpu") return { value: percent(snapshot?.cpu.usagePercent), detail: snapshot == null ? "Unavailable" : `${snapshot.cpu.logicalCores} logical cores`, warning: isOver(snapshot?.cpu.usagePercent, thresholds.cpu) };
  if (metric === "memory") return { value: percent(snapshot?.memory.usagePercent), detail: snapshot == null ? "Unavailable" : `${bytes(snapshot.memory.usedBytes)} / ${bytes(snapshot.memory.totalBytes)}`, warning: isOver(snapshot?.memory.usagePercent, thresholds.ram) };
  if (metric === "disk") return { value: percent(snapshot?.disk?.usagePercent), detail: snapshot?.disk == null ? "Unavailable" : `${bytes(snapshot.disk.availableBytes)} free`, warning: isOver(snapshot?.disk?.usagePercent, thresholds.disk) };
  if (metric === "load") return { value: number(snapshot?.cpu.loadAverage?.[1]), detail: snapshot?.cpu.loadAverage == null ? "Unavailable" : snapshot.cpu.loadAverage.map(number).join(" / "), warning: false };
  if (metric === "network") return { value: `↓ ${rate(snapshot?.network.receiveBytesPerSecond)}`, detail: `↑ ${rate(snapshot?.network.sendBytesPerSecond)}`, warning: false };
  return { value: snapshot == null ? "—" : uptime(snapshot.system.uptimeSeconds), detail: snapshot == null ? "Unavailable" : "Since last boot", warning: false };
}

function metricChart(
  metric: Exclude<DashboardPanel["metric"], "system" | "processes" | "uptime">,
  points: HistoryPoint[],
  thresholds: Fleet["thresholds"],
): MetricChart {
  if (metric === "cpu") return { dimensions: ["time", "CPU"], rows: points.map((point) => [point.collectedAtMs, point.cpuPercent]), series: ["CPU"], thresholds: { CPU: thresholds.cpu }, percentChart: true };
  if (metric === "memory") return { dimensions: ["time", "RAM"], rows: points.map((point) => [point.collectedAtMs, point.memoryPercent]), series: ["RAM"], thresholds: { RAM: thresholds.ram }, percentChart: true };
  if (metric === "disk") return { dimensions: ["time", "Disk"], rows: points.map((point) => [point.collectedAtMs, point.diskPercent]), series: ["Disk"], thresholds: { Disk: thresholds.disk }, percentChart: true };
  if (metric === "load") return { dimensions: ["time", "1m", "5m", "15m"], rows: points.map((point) => [point.collectedAtMs, point.load1, point.load5, point.load15]), series: ["1m", "5m", "15m"], thresholds: {}, percentChart: false };
  return { dimensions: ["time", "Receive", "Send"], rows: points.map((point) => [point.collectedAtMs, point.receiveBytesPerSecond, point.sendBytesPerSecond]), series: ["Receive", "Send"], thresholds: {}, percentChart: false, valueFormatter: rate };
}

function DashboardEditor({
  config,
  dirty,
  onAnnouncement,
  onCancel,
  onChange,
  onReset,
  onSave,
  saving,
}: {
  config: DashboardConfig;
  dirty: boolean;
  onAnnouncement(message: string): void;
  onCancel(): void;
  onChange(config: DashboardConfig): void;
  onReset(): void;
  onSave(): void;
  saving: boolean;
}) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= config.panels.length) return;
    const panel = config.panels[from];
    if (panel == null) return;
    const key = dashboardPanelKey(panel);
    onChange(moveDashboardPanel(config, from, to));
    onAnnouncement(`${DASHBOARD_CATALOG[panel.metric].label} ${presentationLabel(panel)} moved to position ${to + 1} of ${config.panels.length}.`);
    requestAnimationFrame(() => rows.current.get(key)?.focus());
  };

  const drop = (event: ReactDragEvent<HTMLLIElement>, targetIndex: number) => {
    event.preventDefault();
    if (draggedIndex != null) move(draggedIndex, targetIndex);
    setDraggedIndex(null);
  };

  return (
    <section className="host-monitor__editor" aria-labelledby="dashboard-editor-heading">
      <header>
        <div>
          <h3 id="dashboard-editor-heading">Customize dashboard</h3>
          <p>Order and visibility save only for this machine.</p>
        </div>
        <Badge>{config.panels.filter((panel) => panel.visible).length} shown</Badge>
      </header>
      <ol className="host-monitor__editor-list">
        {config.panels.map((panel, index) => {
          const key = dashboardPanelKey(panel);
          const definition = DASHBOARD_CATALOG[panel.metric];
          return (
            <li
              data-dragging={draggedIndex === index}
              data-widget-key={key}
              draggable
              key={key}
              onDragEnd={() => setDraggedIndex(null)}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={(event) => {
                setDraggedIndex(index);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", key);
              }}
              onDrop={(event) => drop(event, index)}
              ref={(node) => {
                if (node == null) rows.current.delete(key);
                else rows.current.set(key, node);
              }}
              tabIndex={-1}
            >
              <button
                aria-label={`Drag ${definition.label} ${presentationLabel(panel)} widget`}
                className="host-monitor__drag-handle"
                tabIndex={-1}
                title="Drag to reorder"
                type="button"
              >⠿</button>
              <label className="host-monitor__visibility">
                <input
                  checked={panel.visible}
                  onChange={(event) => {
                    onChange(setDashboardPanelVisibility(config, index, event.target.checked));
                    onAnnouncement(`${event.target.checked ? "Showing" : "Hiding"} ${definition.label} ${presentationLabel(panel)}.`);
                  }}
                  type="checkbox"
                />
                <span>Show</span>
              </label>
              <span className="host-monitor__editor-name">
                <strong>{definition.label}</strong>
                <small>{definition.description}</small>
              </span>
              <Badge>{presentationLabel(panel)}</Badge>
              <div className="host-monitor__editor-order">
                <Button aria-label={`Move ${definition.label} ${presentationLabel(panel)} earlier`} disabled={index === 0} onClick={() => move(index, index - 1)} size="icon" variant="ghost">↑</Button>
                <Button aria-label={`Move ${definition.label} ${presentationLabel(panel)} later`} disabled={index === config.panels.length - 1} onClick={() => move(index, index + 1)} size="icon" variant="ghost">↓</Button>
              </div>
            </li>
          );
        })}
      </ol>
      <footer className="host-monitor__editor-actions">
        <Button disabled={saving} onClick={onCancel} variant="ghost">Cancel</Button>
        <Button disabled={saving} onClick={onReset} variant="outline">Reset draft</Button>
        <Button disabled={saving || !dirty} onClick={onSave}>{saving ? "Saving…" : "Save layout"}</Button>
      </footer>
    </section>
  );
}

function presentationLabel(panel: Pick<DashboardPanel, "visualization">): string {
  if (panel.visualization === "timeseries") return "Time series";
  if (panel.visualization === "details") return "Details";
  if (panel.visualization === "table") return "Table";
  return "Stat";
}

function StatPanel({ label, value, detail, warning }: { label: string; value: string; detail: string; warning: boolean }) {
  return (
    <article className="host-monitor__stat host-monitor__widget" data-warning={warning}>
      <header><span>{label}</span>{warning && <Badge tone="warning">High</Badge>}</header>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function SystemWidget({ machine }: { machine: MachineRow }) {
  const snapshot = machine.snapshot;
  return (
    <article className="host-monitor__widget host-monitor__system-widget" data-span="wide">
      <header><div><h3>System</h3><p>Host identity and runtime</p></div><Badge>{snapshot == null ? "Unavailable" : snapshot.system.platform}</Badge></header>
      {snapshot == null ? (
        <div className="host-monitor__widget-state"><strong>No system details</strong><span>Waiting for a host sample.</span></div>
      ) : (
        <dl>
          <Fact label="Processor" value={snapshot.cpu.model || "Unavailable"} />
          <Fact label="Platform" value={`${snapshot.system.platform} · ${snapshot.system.arch}`} />
          <Fact label="Kernel" value={snapshot.system.kernelRelease} />
          <Fact label="Uptime" value={uptime(snapshot.system.uptimeSeconds)} />
        </dl>
      )}
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function ProcessesWidget({ machine }: { machine: MachineRow }) {
  const rpc = useRpc<typeof rpcContract>();
  const [sortBy, setSortBy] = useState<ProcessSortBy>("cpu");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ProcessListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingIdentity, setPendingIdentity] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<PreparedTerminationReady | null>(null);
  const [executing, setExecuting] = useState(false);
  const [status, setStatus] = useState("");
  const hostGeneration = useRef(0);
  const listRequest = useRef(0);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const loadProcesses = useCallback(async () => {
    if (machine.host.status !== "connected") return;
    const generation = hostGeneration.current;
    const request = ++listRequest.current;
    setLoading(true);
    setError(null);
    try {
      const next = await rpc.call("listProcesses", {
        hostId: machine.host.id,
        sortBy,
        limit: PROCESS_PAGE_LIMIT,
      });
      if (hostGeneration.current !== generation || listRequest.current !== request) return;
      setResult(next);
      if (next.outcome !== "ok") setStatus(next.message);
      else setStatus(`${next.processes.length} processes refreshed.`);
    } catch (cause) {
      if (hostGeneration.current !== generation || listRequest.current !== request) return;
      setError(cause instanceof Error ? cause.message : "Could not load processes.");
    } finally {
      if (hostGeneration.current === generation && listRequest.current === request) setLoading(false);
    }
  }, [machine.host.id, machine.host.status, rpc, sortBy]);

  useEffect(() => {
    hostGeneration.current += 1;
    listRequest.current += 1;
    setResult(null);
    setError(null);
    setChallenge(null);
    setPendingIdentity(null);
    setStatus("");
    if (machine.host.status !== "connected") return;
    void loadProcesses();
    const timer = window.setInterval(() => void loadProcesses(), PROCESS_REFRESH_MS);
    return () => {
      hostGeneration.current += 1;
      listRequest.current += 1;
      window.clearInterval(timer);
    };
  }, [loadProcesses, machine.host.id, machine.host.status]);

  const prepareTermination = useCallback(async (
    pid: number,
    identity: string,
    mode: ProcessTerminationMode,
  ) => {
    const generation = hostGeneration.current;
    setPendingIdentity(identity);
    setStatus("Rechecking process identity and permissions…");
    try {
      const prepared = await rpc.call("prepareProcessTermination", {
        hostId: machine.host.id,
        pid,
        identity,
        mode,
      });
      if (hostGeneration.current !== generation) return;
      if (prepared.outcome === "ready") {
        setChallenge(prepared);
        setStatus(`${prepared.process.name} is ready for confirmation.`);
      } else {
        setStatus(prepared.message);
        void loadProcesses();
      }
    } catch (cause) {
      if (hostGeneration.current === generation) {
        setStatus(cause instanceof Error ? cause.message : "Could not safely recheck this process.");
      }
    } finally {
      if (hostGeneration.current === generation) setPendingIdentity(null);
    }
  }, [loadProcesses, machine.host.id, rpc]);

  const executeTermination = useCallback(async () => {
    if (challenge == null || executing) return;
    const current = challenge;
    const generation = hostGeneration.current;
    setExecuting(true);
    try {
      const executed = await rpc.call("executeProcessTermination", {
        confirmationToken: current.confirmationToken,
      });
      if (hostGeneration.current !== generation) return;
      setChallenge(null);
      setStatus(executed.message);
      if (executed.outcome === "still-running" && current.process.mode === "graceful") {
        await prepareTermination(current.process.pid, current.process.identity, "force");
      } else {
        void loadProcesses();
      }
    } catch (cause) {
      if (hostGeneration.current === generation) {
        setChallenge(null);
        setStatus(cause instanceof Error ? cause.message : "The process action could not be completed.");
      }
    } finally {
      if (hostGeneration.current === generation) setExecuting(false);
    }
  }, [challenge, executing, loadProcesses, prepareTermination, rpc]);

  const ok = result?.outcome === "ok" ? result : null;
  const sortedRows = useMemo(() => sortProcessRows(ok?.processes ?? [], sortBy), [ok?.processes, sortBy]);
  const rows = useMemo(() => filterProcessRows(sortedRows, query), [query, sortedRows]);
  const summary = useMemo(() => summarizeProcessRows(sortedRows), [sortedRows]);

  return (
    <article className="host-monitor__widget host-monitor__process-widget" data-span="full">
      <output aria-live="polite" className="host-monitor__sr-only">{status}</output>
      <header className="host-monitor__widget-header">
        <div><h3>Processes</h3><p>{ok == null ? "Live process resource usage" : `${ok.totalCount} reported · sampled ${relativeTime(ok.sampledAtMs)}`}</p></div>
        <div className="host-monitor__widget-actions">
          {loading && ok != null && <Badge>Updating</Badge>}
          <Button disabled={loading || executing || machine.host.status !== "connected"} onClick={() => void loadProcesses()} size="sm" variant="outline">Refresh</Button>
        </div>
      </header>

      {machine.host.status !== "connected" ? (
        <ProcessState title="Machine disconnected" message="Reconnect this machine to inspect or control its processes." />
      ) : result == null && loading ? (
        <ProcessSkeleton />
      ) : result != null && result.outcome !== "ok" ? (
        <ProcessState title={result.outcome === "unsupported" ? "Processes unsupported" : "Processes unavailable"} message={result.message} />
      ) : error != null && ok == null ? (
        <ProcessState action={<Button onClick={() => void loadProcesses()} variant="outline">Try again</Button>} title="Could not load processes" message={error} />
      ) : ok != null && sortedRows.length === 0 ? (
        <ProcessState title="No processes to show" message="This host reported no user-visible processes." />
      ) : ok != null ? (
        <>
          <div className="host-monitor__process-toolbar">
            <label>
              <span>Filter processes</span>
              <Input aria-controls="host-monitor-process-list" onChange={(event) => setQuery(event.target.value)} placeholder="Name or PID" type="search" value={query} />
            </label>
            <fieldset aria-label="Sort processes">
              {(["cpu", "memory", "name"] as const).map((sort) => (
                <Button aria-pressed={sortBy === sort} key={sort} onClick={() => setSortBy(sort)} size="sm" variant={sortBy === sort ? "default" : "ghost"}>
                  {sort === "memory" ? "RAM" : sort === "name" ? "Name" : "CPU"}
                </Button>
              ))}
            </fieldset>
            <span>{summary.protectedCount} protected</span>
          </div>
          {rows.length === 0 ? (
            <ProcessState action={<Button onClick={() => setQuery("")} variant="outline">Clear filter</Button>} title="No matching processes" message={`Nothing matches “${query.trim()}”.`} />
          ) : (
            <ProcessRows
              pendingIdentity={pendingIdentity}
              rows={rows}
              sortBy={sortBy}
              onPrepare={(row, mode) => {
                if (row.identity != null) void prepareTermination(row.pid, row.identity, mode);
              }}
            />
          )}
          {ok.truncated && <p className="host-monitor__widget-status">Showing {ok.processes.length} of {ok.totalCount} processes. Filter applies to shown rows.</p>}
          {ok.elevated && <p className="host-monitor__widget-status">Process actions are protected while Host Monitor runs with elevated privileges.</p>}
        </>
      ) : null}
      {(status || error) && <p className="host-monitor__widget-status" role="status">{error ?? status}</p>}

      <AlertDialog.Root open={challenge != null} onOpenChange={(open) => {
        if (!open && !executing) setChallenge(null);
      }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="host-monitor__dialog-overlay" />
          <AlertDialog.Content
            className="host-monitor__dialog"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              requestAnimationFrame(() => cancelRef.current?.focus());
            }}
          >
            {challenge != null && (
              <>
                <Badge tone="destructive">{challenge.process.mode === "force" ? "Force action" : "Process action"}</Badge>
                <AlertDialog.Title>{challenge.process.mode === "force" ? "Force terminate process?" : "Terminate process?"}</AlertDialog.Title>
                <AlertDialog.Description>
                  {challenge.process.mode === "force"
                    ? "Force termination can immediately discard unsaved work and leave dependent work incomplete."
                    : "A graceful termination asks the process to exit. If it remains running, a separate force confirmation will be required."}
                </AlertDialog.Description>
                <dl className="host-monitor__dialog-facts">
                  <Fact label="Host" value={challenge.host.name} />
                  <Fact label="Process" value={challenge.process.name} />
                  <Fact label="PID" value={String(challenge.process.pid)} />
                  <Fact label="CPU" value={percent(challenge.process.cpuPercent)} />
                  <Fact label="RAM" value={`${percent(challenge.process.memoryPercent)} · ${bytes(challenge.process.rssBytes)}`} />
                </dl>
                <p className="host-monitor__dialog-expiry">Freshly checked · expires {new Date(challenge.expiresAtMs).toLocaleTimeString()}</p>
                <div className="host-monitor__dialog-actions">
                  <AlertDialog.Cancel asChild>
                    <Button disabled={executing} ref={cancelRef} variant="outline">Cancel</Button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action asChild>
                    <Button
                      disabled={executing}
                      onClick={(event) => {
                        event.preventDefault();
                        void executeTermination();
                      }}
                      variant="destructive"
                    >
                      {executing ? "Sending…" : challenge.process.mode === "force" ? "Force terminate" : "Terminate process"}
                    </Button>
                  </AlertDialog.Action>
                </div>
              </>
            )}
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </article>
  );
}

function ProcessRows({
  onPrepare,
  pendingIdentity,
  rows,
  sortBy,
}: {
  onPrepare(row: ProcessRow, mode: ProcessTerminationMode): void;
  pendingIdentity: string | null;
  rows: ProcessRow[];
  sortBy: ProcessSortBy;
}) {
  return (
    <div className="host-monitor__process-surfaces" id="host-monitor-process-list">
      <div className="host-monitor__process-table-wrap">
        <table className="host-monitor__process-table">
          <thead><tr>
            <th aria-sort={sortBy === "name" ? "ascending" : "none"}>Process</th>
            <th aria-sort={sortBy === "cpu" ? "descending" : "none"}>CPU</th>
            <th aria-sort={sortBy === "memory" ? "descending" : "none"}>RAM</th>
            <th><span className="host-monitor__sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {rows.map((row) => <ProcessTableRow key={`${row.pid}:${row.identity ?? "protected"}`} onPrepare={onPrepare} pending={pendingIdentity === row.identity} row={row} />)}
          </tbody>
        </table>
      </div>
      <ol className="host-monitor__process-list">
        {rows.map((row) => (
          <li key={`${row.pid}:${row.identity ?? "protected"}`}>
            <ProcessIdentity row={row} />
            <dl><Fact label="CPU" value={percent(row.cpuPercent)} /><Fact label="RAM" value={`${percent(row.memoryPercent)} · ${bytes(row.rssBytes)}`} /></dl>
            <ProcessAction onPrepare={onPrepare} pending={pendingIdentity === row.identity} row={row} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function ProcessTableRow({ onPrepare, pending, row }: { onPrepare(row: ProcessRow, mode: ProcessTerminationMode): void; pending: boolean; row: ProcessRow }) {
  return (
    <tr>
      <td><ProcessIdentity row={row} /></td>
      <td>{percent(row.cpuPercent)}</td>
      <td>{percent(row.memoryPercent)}<small>{bytes(row.rssBytes)}</small></td>
      <td><ProcessAction onPrepare={onPrepare} pending={pending} row={row} /></td>
    </tr>
  );
}

function ProcessIdentity({ row }: { row: ProcessRow }) {
  const reason = blockedProcessReason(row.blockedReason);
  return (
    <span className="host-monitor__process-identity">
      <strong title={row.name}>{row.name}</strong>
      <small>PID {row.pid} · {processOwnerLabel(row.ownerCategory)}</small>
      {reason != null && <Badge>{reason}</Badge>}
    </span>
  );
}

function ProcessAction({ onPrepare, pending, row }: { onPrepare(row: ProcessRow, mode: ProcessTerminationMode): void; pending: boolean; row: ProcessRow }) {
  const mode = row.allowedTerminationModes.includes("graceful")
    ? "graceful"
    : row.allowedTerminationModes.includes("force")
      ? "force"
      : null;
  if (row.identity == null || mode == null || row.blockedReason != null) return null;
  return (
    <Button
      aria-label={`${mode === "force" ? "Force terminate" : "Terminate"} ${row.name}, PID ${row.pid}`}
      disabled={pending}
      onClick={() => onPrepare(row, mode)}
      size="sm"
      variant={mode === "force" ? "destructive" : "outline"}
    >
      {pending ? "Checking…" : mode === "force" ? "Force terminate" : "Terminate"}
    </Button>
  );
}

function ProcessState({ action, message, title }: { action?: React.ReactNode; message: string; title: string }) {
  return <div className="host-monitor__widget-state"><strong>{title}</strong><span>{message}</span>{action}</div>;
}

function ProcessSkeleton() {
  return <div className="host-monitor__process-skeleton" aria-label="Loading processes">{[0, 1, 2, 3].map((index) => <Skeleton key={index} />)}</div>;
}

function FleetSkeleton() {
  return <div className="host-monitor__machine-grid" aria-label="Loading machines">{[0, 1, 2].map((index) => <Skeleton className="host-monitor__machine-skeleton" key={index} />)}</div>;
}

function DashboardSkeleton() {
  return <div className="host-monitor__panel-grid" aria-label="Loading dashboard">{[0, 1, 2, 3].map((index) => <Skeleton className="host-monitor__dashboard-skeleton" key={index} />)}</div>;
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

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "host-monitor-sidebar",
    mount: ({ pluginId, signal }) => mountHostMonitorMiniModal(pluginId, signal),
  });
  app.slots.sidebarFooterAction({
    id: "host-monitor",
    title: "Host Monitor",
    icon: "Terminal",
    run: toggleHostMonitorMiniModal,
  });
  app.slots.navPanel({
    id: "host-monitor",
    title: "Host Monitor",
    icon: "Activity",
    path: "host-monitor",
    component: FleetDashboard,
  });
});
