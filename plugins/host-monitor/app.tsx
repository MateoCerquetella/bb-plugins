import "./app.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { toast } from "sonner";
import {
  definePluginApp,
  experimental_useAppPanel as useAppPanel,
  experimental_useFixedTabTarget as useFixedTabTarget,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  useSettings,
  type ExperimentalPluginFixedTabReference,
  type JsonValue,
} from "@get-bb/plugin-sdk/app";
import type {
  Dashboard,
  MachineRow,
  PreparedTermination,
  ProcessListResult,
  ProcessRow,
  ProcessSortBy,
  ProcessTerminationMode,
  rpcContract,
} from "./contract";
import {
  fleetCounts,
  machineBadgePresentation,
  machineMatchesFleetFilter,
  type FleetFilter,
} from "./lib/fleet-presentation";
import {
  FLEET_VIEW_STORAGE_KEY,
  parseFleetViewPreference,
  readFleetViewPreference,
  writeFleetViewPreference,
  type FleetViewMode,
} from "./lib/fleet-view-preference";
import { primaryIpAddressPresentation } from "./lib/ip-address-presentation";
import { networkRateSummary } from "./lib/network-presentation";
import {
  blockedProcessReason,
  filterProcessRows,
  processActionPresentation,
  processOwnerLabel,
  sortProcessRows,
  summarizeProcessRows,
} from "./lib/process-presentation";
import { usePortalScopeProps } from "./lib/portal-scope";
import {
  thresholdColorsEnabled,
  thresholdToneAccessibleLabel,
  thresholdToneForReading,
  type ThresholdTone,
} from "./lib/threshold-presentation";
import {
  hostIdFromFleetSubPath,
  mountHostMonitorSidebar,
  toggleHostMonitorPopover,
} from "./lib/sidebar-host-monitor";

type RpcClient = ReturnType<typeof useRpc<typeof rpcContract>>;
type RequestKind = "dashboard" | "refresh-all" | "refresh-host";
type HealthThresholds = Dashboard["thresholds"];

interface DashboardViewState {
  dashboard: Dashboard | null;
  requestKind: RequestKind | null;
  requestHostId: string | null;
  error: string | null;
}

interface InspectTarget extends Record<string, JsonValue> {
  hostId: string;
}

interface ProcessesTarget extends Record<string, JsonValue> {
  hostId: string;
  initialSort: "cpu" | "memory";
}

const RECONCILE_INTERVAL_MS = 30_000;
const CONTROL_BUTTON_CLASS =
  "inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input bg-transparent px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

function getClientStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const inspectTargetContract = {
  validate(value: JsonValue): value is InspectTarget {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false;
    }
    return (
      Object.keys(value).length === 1 &&
      "hostId" in value &&
      typeof value.hostId === "string" &&
      value.hostId.length > 0
    );
  },
};

const INSPECT_TAB = {
  panelId: "machines",
  id: "inspect",
  experimental_target: inspectTargetContract,
} satisfies ExperimentalPluginFixedTabReference<InspectTarget>;

const processesTargetContract = {
  validate(value: JsonValue): value is ProcessesTarget {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false;
    }
    return (
      Object.keys(value).length === 2 &&
      "hostId" in value &&
      typeof value.hostId === "string" &&
      value.hostId.length > 0 &&
      "initialSort" in value &&
      (value.initialSort === "cpu" || value.initialSort === "memory")
    );
  },
};

const PROCESSES_TAB = {
  panelId: "machines",
  id: "processes",
  experimental_target: processesTargetContract,
} satisfies ExperimentalPluginFixedTabReference<ProcessesTarget>;

let dashboardState: DashboardViewState = {
  dashboard: null,
  requestKind: null,
  requestHostId: null,
  error: null,
};
let activeRequest: Promise<void> | null = null;
let requestSequence = 0;
const dashboardListeners = new Set<() => void>();

function getDashboardState(): DashboardViewState {
  return dashboardState;
}

function subscribeDashboard(listener: () => void): () => void {
  dashboardListeners.add(listener);
  return () => dashboardListeners.delete(listener);
}

function setDashboardState(next: DashboardViewState): void {
  dashboardState = next;
  for (const listener of dashboardListeners) listener();
}

function useDashboardState(): DashboardViewState {
  return useSyncExternalStore(
    subscribeDashboard,
    getDashboardState,
    getDashboardState,
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function requestDashboard(
  rpc: RpcClient,
  kind: RequestKind,
  hostId: string | null = null,
): Promise<void> {
  if (activeRequest !== null) return activeRequest;

  const sequence = ++requestSequence;
  setDashboardState({
    ...dashboardState,
    requestKind: kind,
    requestHostId: hostId,
    error: dashboardState.dashboard === null ? null : dashboardState.error,
  });

  const request = (async () => {
    try {
      const dashboard =
        kind === "dashboard"
          ? await rpc.call("dashboard")
          : await rpc.call("refresh", {
              hostId: kind === "refresh-all" ? null : hostId,
            });
      if (sequence !== requestSequence) return;
      setDashboardState({
        dashboard,
        requestKind: kind,
        requestHostId: hostId,
        error: null,
      });
    } catch (cause) {
      if (sequence !== requestSequence) return;
      setDashboardState({
        ...dashboardState,
        requestKind: kind,
        requestHostId: hostId,
        error: errorMessage(cause),
      });
    } finally {
      if (sequence === requestSequence) {
        activeRequest = null;
        setDashboardState({
          ...dashboardState,
          requestKind: null,
          requestHostId: null,
        });
      }
    }
  })();
  activeRequest = request;
  return request;
}

function RefreshIcon({ active = false }: { active?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="host-monitor-refresh-icon size-3.5"
      data-active={active ? "true" : "false"}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.7-2.5L20 11M4 13l2.2 4.5A7 7 0 0 0 18 15"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
      <path
        d="m9 5 7 7-7 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CardsIcon() {
  return (
    <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 24 24">
      <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" width="7" x="3" y="3" />
      <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" width="7" x="14" y="3" />
      <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" width="7" x="3" y="14" />
      <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" width="7" x="14" y="14" />
    </svg>
  );
}

function RowsIcon() {
  return (
    <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 24 24">
      <rect height="4" rx="1.25" stroke="currentColor" strokeWidth="1.7" width="18" x="3" y="4" />
      <rect height="4" rx="1.25" stroke="currentColor" strokeWidth="1.7" width="18" x="3" y="10" />
      <rect height="4" rx="1.25" stroke="currentColor" strokeWidth="1.7" width="18" x="3" y="16" />
    </svg>
  );
}

function EyeIcon({ revealed }: { revealed: boolean }) {
  return (
    <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 24 24">
      <path
        d="M3.5 12s3.1-5 8.5-5 8.5 5 8.5 5-3.1 5-8.5 5-8.5-5-8.5-5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.7" />
      {!revealed ? (
        <path
          d="m4 4 16 16"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
      ) : null}
    </svg>
  );
}

function AlertIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M10.25 4.65 3.4 17a2 2 0 0 0 1.75 3h13.7a2 2 0 0 0 1.75-3L13.75 4.65a2 2 0 0 0-3.5 0Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path d="M12 9v4.25M12 16.5v.1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function ProcessesIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M4 7.5h16M4 12h16M4 16.5h16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <circle cx="7" cy="7.5" fill="currentColor" r="1" />
      <circle cx="12.5" cy="12" fill="currentColor" r="1" />
      <circle cx="17" cy="16.5" fill="currentColor" r="1" />
    </svg>
  );
}

function SearchIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <circle cx="10.5" cy="10.5" r="5.75" stroke="currentColor" strokeWidth="1.7" />
      <path d="m15 15 4.25 4.25" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function ShieldIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M12 3.75 19 6.5v4.85c0 4.35-2.65 7.45-7 8.9-4.35-1.45-7-4.55-7-8.9V6.5l7-2.75Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path d="M9.5 12.1 11.25 14l3.5-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

function EndProcessIcon({ className = "size-3" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function Spinner({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={`host-monitor-spinner ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <path d="M12 4a8 8 0 0 1 8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

const percentWhole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const percentPrecise = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const byteNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

function formatPercent(value: number): string {
  const formatter = value > 0 && value < 10 ? percentPrecise : percentWhole;
  return `${formatter.format(value)}%`;
}

function boundedPercent(percent: number | null): number | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  return Math.min(100, Math.max(0, percent));
}

function metricAccessibleText(
  label: string,
  percent: number | null,
  tone: ThresholdTone,
): string {
  if (percent === null) return `${label}: unavailable`;
  const value = formatPercent(percent);
  if (tone === "attention" || tone === "critical") {
    return `${label}: ${value}, ${thresholdToneAccessibleLabel(tone)} for this reading`;
  }
  if (tone === "neutral") {
    return `${label}: ${value}, ${thresholdToneAccessibleLabel(tone)}`;
  }
  return `${label}: ${value}`;
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1_024 && unitIndex < units.length - 1) {
    value /= 1_024;
    unitIndex += 1;
  }
  return `${byteNumber.format(value)} ${units[unitIndex]}`;
}

function formatByteUsage(usedBytes: number, totalBytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"] as const;
  let divisor = 1;
  let unitIndex = 0;
  while (totalBytes / divisor >= 1_024 && unitIndex < units.length - 1) {
    divisor *= 1_024;
    unitIndex += 1;
  }
  return `${byteNumber.format(usedBytes / divisor)} / ${byteNumber.format(totalBytes / divisor)} ${units[unitIndex]}`;
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.floor(seconds)}s`;
}

function formatRelativeTime(timestamp: number | null): string {
  if (timestamp === null) return "never";
  const seconds = Math.floor(Math.max(0, Date.now() - timestamp) / 1_000);
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function HealthBadge({
  machine,
  showIndicator = true,
}: {
  machine: MachineRow;
  showIndicator?: boolean;
}) {
  const presentation = machineBadgePresentation(machine);
  return (
    <span
      className="host-monitor-health-badge"
      data-tone={presentation.tone}
    >
      {presentation.busy ? (
        <Spinner className="size-2.5" />
      ) : showIndicator ? (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-70" />
      ) : null}
      {presentation.label}
    </span>
  );
}

function MetricRuler({
  isFresh,
  label,
  percent,
  thresholds,
}: {
  isFresh: boolean;
  label: string;
  percent: number | null;
  thresholds: HealthThresholds;
}) {
  const bounded = boundedPercent(percent);
  const tone = thresholdToneForReading(percent, isFresh, thresholds);
  const accessibleText = metricAccessibleText(label, bounded, tone);
  return (
    <div
      className="host-monitor-metric-ruler"
      data-tone={tone}
    >
      <span className="sr-only">{accessibleText}</span>
      <span
        aria-hidden="true"
        className="host-monitor-metric-ruler__percentage font-mono text-xs font-medium"
      >
        {bounded === null ? "—" : formatPercent(bounded)}
      </span>
      <span aria-hidden="true" className="relative mt-1 block h-1 rounded-full bg-muted">
        {bounded !== null ? (
          <span
            className="absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-current"
            style={{ left: `calc(${bounded}% - 3px)` }}
          />
        ) : null}
      </span>
    </div>
  );
}

function CardMetric({
  detail,
  isFresh,
  label,
  percent,
  thresholds,
}: {
  detail?: string;
  isFresh: boolean;
  label: string;
  percent: number | null;
  thresholds: HealthThresholds;
}) {
  const bounded = boundedPercent(percent);
  const tone = thresholdToneForReading(percent, isFresh, thresholds);
  const accessibleText = metricAccessibleText(label, bounded, tone);

  return (
    <span
      className="host-monitor-host-card__metric"
      data-tone={tone}
    >
      <span className="sr-only">
        {detail === undefined ? accessibleText : `${accessibleText}; ${detail} used`}
      </span>
      <span
        aria-hidden="true"
        className="host-monitor-host-card__metric-heading"
      >
        <span className="host-monitor-host-card__metric-label">{label}</span>
        <span className="host-monitor-host-card__metric-value">
          {bounded === null ? "—" : formatPercent(bounded)}
        </span>
        <span
          aria-hidden="true"
          className="host-monitor-host-card__metric-detail"
          data-empty={detail === undefined ? "true" : "false"}
          title={detail}
        >
          {detail ?? "\u00a0"}
        </span>
      </span>
      <span aria-hidden="true" className="host-monitor-host-card__metric-rail">
        {bounded === null ? null : (
          <span
            className="host-monitor-host-card__metric-fill"
            style={{ width: `${bounded}%` }}
          />
        )}
      </span>
    </span>
  );
}

function machinePercent(machine: MachineRow, metric: "cpu" | "memory" | "disk"): number | null {
  if (machine.snapshot === null) return null;
  if (metric === "cpu") return machine.snapshot.cpu.usagePercent;
  if (metric === "memory") return machine.snapshot.memory.usagePercent;
  return machine.snapshot.disk?.usagePercent ?? null;
}

function machineSampleLabel(machine: MachineRow): string {
  if (machine.sampleState === "offline") return `last seen ${formatRelativeTime(machine.host.lastSeenAt)}`;
  if (machine.snapshot === null) return machine.sampleState === "sampling" ? "sampling" : "no sample";
  const age = formatRelativeTime(machine.snapshot.sampledAtMs);
  if (machine.sampleState === "stale") return `stale · ${age}`;
  if (machine.sampleState === "error") return `last known · ${age}`;
  return age;
}

function cardSampleLabel(machine: MachineRow): string {
  const label = machineSampleLabel(machine);
  if (machine.sampleState === "fresh" && machine.snapshot !== null) {
    return `Updated ${label}`;
  }
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function machineDescription(machine: MachineRow): string {
  if (machine.snapshot !== null) {
    return `${machine.snapshot.system.osName} · ${machine.snapshot.system.arch}`;
  }
  return machine.host.status === "connected"
    ? "Connected · waiting for telemetry"
    : "Disconnected · no live telemetry";
}

function MachineIdentity({ machine }: { machine: MachineRow }) {
  const statusTone = machineBadgePresentation(machine).tone;
  const description = machineDescription(machine);
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className="host-monitor-machine-identity__status"
        data-connected={machine.host.status === "connected" ? "true" : "false"}
        data-tone={statusTone}
      />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{machine.host.name}</span>
        <span className="block truncate text-[11px] text-muted-foreground" title={description}>{description}</span>
      </span>
    </span>
  );
}

function CardMachineIdentity({ machine }: { machine: MachineRow }) {
  const description = machineDescription(machine);

  return (
    <span className="host-monitor-host-card__identity">
      <span
        aria-hidden="true"
        className="host-monitor-host-card__status"
        data-connected={machine.host.status === "connected" ? "true" : "false"}
      />
      <span className="host-monitor-host-card__identity-copy">
        <span className="host-monitor-host-card__name">
          {machine.host.name}
        </span>
        <span className="host-monitor-host-card__system" title={description}>
          {description}
        </span>
      </span>
    </span>
  );
}

function IpAddressValue({
  machine,
  revealed,
  className = "",
}: {
  machine: MachineRow;
  revealed: boolean;
  className?: string;
}) {
  const presentation = primaryIpAddressPresentation(
    machine.snapshot?.network.primaryIpAddress ?? null,
    revealed,
  );

  return (
    <span
      className={`flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground ${className}`}
      data-ip-address-state={presentation.state}
    >
      <span aria-hidden="true" className="shrink-0 uppercase tracking-wider">
        IP
      </span>
      <span
        aria-hidden="true"
        className={`min-w-0 font-mono text-[11px] text-foreground/75 ${
          presentation.state === "revealed" ? "break-all" : "truncate"
        }`}
        title={
          presentation.state === "revealed"
            ? presentation.displayText
            : undefined
        }
      >
        {presentation.displayText}
      </span>
      <span className="sr-only">{presentation.accessibleText}</span>
    </span>
  );
}

function IpAddressVisibilityToggle({
  revealed,
  onChange,
}: {
  revealed: boolean;
  onChange(revealed: boolean): void;
}) {
  const label = revealed ? "Hide IP addresses" : "Show IP addresses";

  return (
    <button
      aria-controls="host-monitor-fleet-results"
      aria-label={label}
      aria-pressed={revealed}
      className={CONTROL_BUTTON_CLASS}
      onClick={() => onChange(!revealed)}
      title={label}
      type="button"
    >
      <EyeIcon revealed={revealed} />
      <span className="hidden sm:inline">{revealed ? "Hide IPs" : "Show IPs"}</span>
    </button>
  );
}

function NetworkRateValue({ machine }: { machine: MachineRow }) {
  const network = networkRateSummary(
    machine.snapshot?.network.receiveBytesPerSecond ?? null,
    machine.snapshot?.network.sendBytesPerSecond ?? null,
  );

  return (
    <span
      className="grid min-w-0 gap-0.5 text-[11px] text-muted-foreground"
      data-network-state={network.available ? "available" : "unavailable"}
      title={network.accessibleText}
    >
      <span className="sr-only">{network.accessibleText}</span>
      <span
        aria-hidden="true"
        className="host-monitor-network-rate flex min-w-0 items-center gap-1.5"
        data-network-direction="down"
      >
        <span className="host-monitor-network-rate__arrow shrink-0">↓</span>
        <span className="host-monitor-network-rate__value truncate font-mono">
          {network.receive}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="host-monitor-network-rate flex min-w-0 items-center gap-1.5"
        data-network-direction="up"
      >
        <span className="host-monitor-network-rate__arrow shrink-0">↑</span>
        <span className="host-monitor-network-rate__value truncate font-mono">
          {network.send}
        </span>
      </span>
    </span>
  );
}

function FleetHeader() {
  const rpc = useRpc<typeof rpcContract>();
  const state = useDashboardState();
  const connection = useRealtimeConnectionState();
  const counts = fleetCounts(state.dashboard);
  const busy = state.requestKind !== null;

  useEffect(() => {
    void requestDashboard(rpc, "dashboard");
  }, [rpc]);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <output className="sr-only">
        {connection === "connected" ? "Live updates connected" : "Live updates reconnecting"}
      </output>
      <span className="hidden truncate text-xs text-muted-foreground sm:inline">
        {state.dashboard === null ? "Loading hosts…" : `${counts.connected}/${counts.total} connected`}
      </span>
      <button
        aria-label="Refresh all host metrics"
        className={CONTROL_BUTTON_CLASS}
        disabled={busy}
        onClick={() => void requestDashboard(rpc, "refresh-all")}
        title="Refresh all host metrics"
        type="button"
      >
        <RefreshIcon active={state.requestKind === "refresh-all"} />
        <span className="hidden sm:inline">{state.requestKind === "refresh-all" ? "Refreshing…" : "Refresh"}</span>
      </button>
    </div>
  );
}

function FleetSidebarAccessory() {
  const rpc = useRpc<typeof rpcContract>();
  const state = useDashboardState();
  const counts = fleetCounts(state.dashboard);
  const critical =
    state.dashboard?.machines.filter(
      (machine) => machineBadgePresentation(machine).tone === "critical",
    ).length ?? 0;
  useEffect(() => {
    if (state.dashboard === null) void requestDashboard(rpc, "dashboard");
  }, [rpc, state.dashboard]);

  if (state.dashboard === null) return <Spinner className="size-3" />;
  if (counts.attention > 0) {
    const label =
      critical > 0
        ? `${counts.attention} hosts need attention, including ${critical} critical`
        : `${counts.attention} hosts need attention`;
    return (
      <output
        aria-label={label}
        className="host-monitor-sidebar-accessory"
        title={label}
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
        <span aria-hidden="true">{counts.attention}</span>
      </output>
    );
  }
  const allHealthy =
    counts.total > 0 &&
    state.dashboard.machines.every(
      (machine) => machineBadgePresentation(machine).tone === "healthy",
    );
  const label =
    counts.total === 0
      ? "No hosts enrolled"
      : allHealthy
        ? `${counts.connected} of ${counts.total} hosts connected, all healthy`
        : `${counts.connected} of ${counts.total} hosts connected`;
  return (
    <output
      aria-label={label}
      className="host-monitor-sidebar-accessory"
      title={label}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      <span aria-hidden="true">{counts.connected}/{counts.total}</span>
    </output>
  );
}

function FilterPill({ active, count, label, onClick }: { active: boolean; count: number; label: string; onClick(): void }) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
        active ? "border-foreground/20 bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
      <span className="font-mono text-[10px] opacity-70">{count}</span>
    </button>
  );
}

function FleetViewToggle({
  mode,
  onChange,
}: {
  mode: FleetViewMode;
  onChange(mode: FleetViewMode): void;
}) {
  return (
    <fieldset
      aria-label="Host layout"
      className="host-monitor-view-toggle m-0 inline-flex h-8 min-w-0 items-center rounded-md border border-border bg-muted/35 p-0.5"
    >
      <button
        aria-label="Show hosts as cards"
        aria-pressed={mode === "cards"}
        className="host-monitor-view-toggle__button"
        onClick={() => onChange("cards")}
        title="Cards"
        type="button"
      >
        <CardsIcon />
        <span>Cards</span>
      </button>
      <button
        aria-label="Show hosts as rows"
        aria-pressed={mode === "rows"}
        className="host-monitor-view-toggle__button"
        onClick={() => onChange("rows")}
        title="Rows"
        type="button"
      >
        <RowsIcon />
        <span>Rows</span>
      </button>
    </fieldset>
  );
}

function FleetSkeleton({ mode }: { mode: FleetViewMode }) {
  if (mode === "cards") {
    return (
      <output
        aria-busy="true"
        aria-label="Loading hosts"
        className="host-monitor-card-grid"
      >
        <span className="sr-only">Loading hosts…</span>
        {Array.from({ length: 4 }, (_, index) => (
          <span
            key={index}
            className="host-monitor-card-skeleton"
          >
            <span className="host-monitor-card-skeleton__header">
              <span className="host-monitor-skeleton block size-2 shrink-0 rounded-full" />
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="host-monitor-skeleton block h-3.5 w-3/5 rounded" />
                <span className="host-monitor-skeleton block h-2.5 w-2/5 rounded" />
              </span>
              <span className="host-monitor-skeleton block h-5 w-16 rounded-full" />
            </span>
            <span className="host-monitor-card-skeleton__metadata">
              <span className="host-monitor-skeleton block h-2.5 w-24 rounded" />
              <span className="host-monitor-skeleton block h-2.5 w-16 rounded" />
            </span>
            <span className="host-monitor-card-skeleton__metrics">
              {Array.from({ length: 3 }, (_, metricIndex) => (
                <span key={metricIndex} className="host-monitor-card-skeleton__metric">
                  <span className="host-monitor-skeleton block h-2 w-8 rounded" />
                  <span className="host-monitor-skeleton block h-4 w-12 rounded" />
                  <span className="host-monitor-skeleton block h-2 w-16 rounded" />
                  <span className="host-monitor-skeleton block h-[3px] w-full rounded-full" />
                </span>
              ))}
            </span>
            <span className="host-monitor-card-skeleton__footer">
              <span className="host-monitor-skeleton block h-2 w-14 rounded" />
              <span className="host-monitor-card-skeleton__network">
                <span className="space-y-1.5">
                  <span className="host-monitor-skeleton block h-2 w-12 rounded" />
                  <span className="host-monitor-skeleton block h-3 w-16 rounded" />
                </span>
                <span className="space-y-1.5">
                  <span className="host-monitor-skeleton block h-2 w-10 rounded" />
                  <span className="host-monitor-skeleton block h-3 w-16 rounded" />
                </span>
              </span>
            </span>
          </span>
        ))}
      </output>
    );
  }

  return (
    <output aria-busy="true" aria-label="Loading hosts" className="block rounded-lg border border-border bg-card">
      <span className="sr-only">Loading hosts…</span>
      {Array.from({ length: 4 }, (_, index) => (
        <span key={index} className="flex items-center gap-4 border-b border-border p-4 last:border-b-0">
          <span className="host-monitor-skeleton block h-4 w-36 rounded" />
          <span className="host-monitor-skeleton ml-auto block h-4 w-16 rounded" />
          <span className="host-monitor-skeleton block h-4 w-16 rounded" />
          <span className="host-monitor-skeleton block h-4 w-16 rounded" />
        </span>
      ))}
    </output>
  );
}

function ErrorNotice({
  hasLastKnown,
  rpc,
}: {
  hasLastKnown: boolean;
  rpc: RpcClient;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
      <AlertIcon className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {hasLastKnown
          ? "Couldn’t update hosts. Last-known readings remain visible."
          : "Couldn’t load hosts. Try again."}
      </span>
      <button className="cursor-pointer font-medium hover:underline" onClick={() => void requestDashboard(rpc, "dashboard")} type="button">Retry</button>
    </div>
  );
}

function EmptyFleet() {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm font-medium text-foreground">No hosts enrolled</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">Enrolled hosts will appear here automatically.</p>
    </div>
  );
}

function FleetCardGrid({
  machines,
  onInspect,
  selectedHostId,
  showIpAddresses,
  thresholds,
}: {
  machines: MachineRow[];
  onInspect(machine: MachineRow): void;
  selectedHostId: string | null;
  showIpAddresses: boolean;
  thresholds: HealthThresholds;
}) {
  return (
    <ul className="host-monitor-card-grid">
      {machines.map((machine) => {
        const selected = selectedHostId === machine.host.id;
        const network = networkRateSummary(
          machine.snapshot?.network.receiveBytesPerSecond ?? null,
          machine.snapshot?.network.sendBytesPerSecond ?? null,
        );
        const sampleLabel = cardSampleLabel(machine);
        return (
          <li key={machine.host.id} className="min-w-0">
            <button
              aria-current={selected ? "true" : undefined}
              className="host-monitor-host-card"
              onClick={() => onInspect(machine)}
              type="button"
            >
              <span className="host-monitor-host-card__header">
                <CardMachineIdentity machine={machine} />
                <span className="host-monitor-host-card__header-actions">
                  <HealthBadge machine={machine} showIndicator={false} />
                  <span className="host-monitor-host-card__details">
                    <ChevronIcon />
                  </span>
                </span>
              </span>
              <span className="host-monitor-host-card__metadata">
                <IpAddressValue
                  className="host-monitor-host-card__ip"
                  machine={machine}
                  revealed={showIpAddresses}
                />
                <span aria-hidden="true" className="host-monitor-host-card__separator" />
                <span
                  className="host-monitor-host-card__sample"
                  title={sampleLabel}
                >
                  {sampleLabel}
                </span>
              </span>

              <span className="host-monitor-host-card__metrics">
                {(["cpu", "memory", "disk"] as const).map((metric) => (
                  <CardMetric
                    isFresh={machine.sampleState === "fresh"}
                    key={metric}
                    label={metric === "cpu" ? "CPU" : metric === "memory" ? "RAM" : "Disk"}
                    detail={
                      metric === "memory" && machine.snapshot !== null
                        ? formatByteUsage(
                            machine.snapshot.memory.usedBytes,
                            machine.snapshot.memory.totalBytes,
                          )
                        : undefined
                    }
                    percent={machinePercent(machine, metric)}
                    thresholds={thresholds}
                  />
                ))}
              </span>

              <span className="host-monitor-host-card__footer">
                <span
                  className="host-monitor-host-card__network"
                  data-network-state={network.available ? "available" : "unavailable"}
                >
                  <span className="sr-only">{network.accessibleText}</span>
                  <span aria-hidden="true" className="host-monitor-host-card__network-label">Network</span>
                  <span aria-hidden="true" className="host-monitor-host-card__network-rates">
                    <span className="host-monitor-host-card__network-lane">
                      <span className="host-monitor-host-card__network-direction">Download</span>
                      <span
                        className="host-monitor-network-rate host-monitor-host-card__network-rate"
                        data-network-direction="down"
                      >
                        <span className="host-monitor-network-rate__arrow">↓</span>
                        <span className="host-monitor-network-rate__value font-mono">{network.receive}</span>
                      </span>
                    </span>
                    <span className="host-monitor-host-card__network-lane">
                      <span className="host-monitor-host-card__network-direction">Upload</span>
                      <span
                        className="host-monitor-network-rate host-monitor-host-card__network-rate"
                        data-network-direction="up"
                      >
                        <span className="host-monitor-network-rate__arrow">↑</span>
                        <span className="host-monitor-network-rate__value font-mono">{network.send}</span>
                      </span>
                    </span>
                  </span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function DesktopFleetTable({ machines, onInspect, selectedHostId, showIpAddresses, thresholds }: { machines: MachineRow[]; onInspect(machine: MachineRow): void; selectedHostId: string | null; showIpAddresses: boolean; thresholds: HealthThresholds }) {
  return (
    <div className="host-monitor-desktop-fleet overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full table-fixed border-collapse text-left">
        <thead className="bg-muted/35 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="w-[27%] px-4 py-2.5 font-medium" scope="col">Host</th>
            <th className="w-[11%] px-3 py-2.5 font-medium" scope="col">CPU</th>
            <th className="w-[11%] px-3 py-2.5 font-medium" scope="col">Memory</th>
            <th className="w-[11%] px-3 py-2.5 font-medium" scope="col">Disk</th>
            <th className="w-[19%] px-3 py-2.5 font-medium" scope="col">Network</th>
            <th className="w-[14%] px-3 py-2.5 font-medium" scope="col">Sample</th>
            <th className="w-[7%] px-3 py-2.5"><span className="sr-only">Inspect</span></th>
          </tr>
        </thead>
        <tbody>
          {machines.map((machine) => {
            const selected = selectedHostId === machine.host.id;
            return (
              <tr key={machine.host.id} className={`border-t border-border transition-colors hover:bg-accent/40 ${selected ? "bg-accent/50" : ""}`}>
                <td className="px-4 py-3">
                  <button aria-current={selected ? "true" : undefined} className="block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={() => onInspect(machine)} type="button">
                    <MachineIdentity machine={machine} />
                    <IpAddressValue
                      className="mt-1 pl-[1.125rem]"
                      machine={machine}
                      revealed={showIpAddresses}
                    />
                  </button>
                </td>
                <td className="px-3 py-3"><MetricRuler isFresh={machine.sampleState === "fresh"} label="CPU" percent={machinePercent(machine, "cpu")} thresholds={thresholds} /></td>
                <td className="px-3 py-3"><MetricRuler isFresh={machine.sampleState === "fresh"} label="Memory" percent={machinePercent(machine, "memory")} thresholds={thresholds} /></td>
                <td className="px-3 py-3"><MetricRuler isFresh={machine.sampleState === "fresh"} label="Disk" percent={machinePercent(machine, "disk")} thresholds={thresholds} /></td>
                <td className="px-3 py-3"><NetworkRateValue machine={machine} /></td>
                <td className="px-3 py-3">
                  <span className="flex min-w-0 flex-col items-start gap-1">
                    <HealthBadge machine={machine} />
                    <span className="block max-w-full truncate text-[11px] text-muted-foreground" title={machineSampleLabel(machine)}>{machineSampleLabel(machine)}</span>
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  <button aria-label={`View ${machine.host.name} details`} className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={() => onInspect(machine)} type="button"><ChevronIcon /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompactFleetList({ machines, onInspect, selectedHostId, showIpAddresses, thresholds }: { machines: MachineRow[]; onInspect(machine: MachineRow): void; selectedHostId: string | null; showIpAddresses: boolean; thresholds: HealthThresholds }) {
  return (
    <ul className="host-monitor-compact-fleet overflow-hidden rounded-lg border border-border bg-card">
      {machines.map((machine) => {
        const selected = selectedHostId === machine.host.id;
        return (
          <li key={machine.host.id} className="border-b border-border last:border-b-0">
            <button aria-current={selected ? "true" : undefined} className={`w-full cursor-pointer p-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring ${selected ? "bg-accent/50" : ""}`} onClick={() => onInspect(machine)} type="button">
              <span className="flex items-start justify-between gap-3">
                <MachineIdentity machine={machine} />
                <span className="flex shrink-0 items-center gap-1.5"><HealthBadge machine={machine} /><ChevronIcon /></span>
              </span>
              <IpAddressValue
                className="mt-1 pl-[1.125rem]"
                machine={machine}
                revealed={showIpAddresses}
              />
              <span className="mt-3 grid grid-cols-3 gap-4">
                <span><span className="block text-[10px] uppercase text-muted-foreground">CPU</span><MetricRuler isFresh={machine.sampleState === "fresh"} label="CPU" percent={machinePercent(machine, "cpu")} thresholds={thresholds} /></span>
                <span><span className="block text-[10px] uppercase text-muted-foreground">Memory</span><MetricRuler isFresh={machine.sampleState === "fresh"} label="Memory" percent={machinePercent(machine, "memory")} thresholds={thresholds} /></span>
                <span><span className="block text-[10px] uppercase text-muted-foreground">Disk</span><MetricRuler isFresh={machine.sampleState === "fresh"} label="Disk" percent={machinePercent(machine, "disk")} thresholds={thresholds} /></span>
              </span>
              <span className="mt-3 flex min-w-0 items-start justify-between gap-3 border-t border-border pt-2.5">
                <span
                  aria-hidden="true"
                  className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground"
                >
                  Network
                </span>
                <NetworkRateValue machine={machine} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function FleetMatrix({ subPath }: { subPath: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const settings = useSettings();
  const state = useDashboardState();
  const connection = useRealtimeConnectionState();
  const previousConnection = useRef(connection);
  const panel = useAppPanel();
  const [filter, setFilter] = useState<FleetFilter>("all");
  const [viewMode, setViewMode] = useState<FleetViewMode>(() =>
    readFleetViewPreference(getClientStorage()),
  );
  const [showIpAddresses, setShowIpAddresses] = useState(false);
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const openedRouteTarget = useRef<string | null>(null);
  const routeHostId = useMemo(() => hostIdFromFleetSubPath(subPath), [subPath]);
  const showThresholdColors = thresholdColorsEnabled(
    settings.values,
    settings.isLoading,
  );

  const reconcile = useCallback(() => {
    void requestDashboard(rpc, "dashboard");
  }, [rpc]);

  useEffect(() => {
    reconcile();
    const interval = window.setInterval(reconcile, RECONCILE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [reconcile]);
  useRealtime("machines-changed", reconcile);
  useEffect(() => {
    const previous = previousConnection.current;
    previousConnection.current = connection;
    if (previous === "reconnecting" && connection === "connected") reconcile();
  }, [connection, reconcile]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === FLEET_VIEW_STORAGE_KEY || event.key === null) {
        setViewMode(parseFleetViewPreference(event.newValue));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const counts = fleetCounts(state.dashboard);
  const machines = useMemo(() => {
    const all = state.dashboard?.machines ?? [];
    return all.filter((machine) => machineMatchesFleetFilter(machine, filter));
  }, [filter, state.dashboard]);

  const inspect = useCallback((machine: MachineRow) => {
    const accepted = panel.openFixedTab({
      surface: { kind: "current" },
      tab: INSPECT_TAB,
      target: { hostId: machine.host.id },
    });
    if (accepted) setSelectedHostId(machine.host.id);
  }, [panel]);

  useEffect(() => {
    if (
      routeHostId === null ||
      routeHostId === openedRouteTarget.current ||
      state.dashboard === null
    ) return;
    const machine = state.dashboard.machines.find(
      (candidate) => candidate.host.id === routeHostId,
    );
    if (machine === undefined) return;
    openedRouteTarget.current = routeHostId;
    inspect(machine);
  }, [inspect, routeHostId, state.dashboard]);

  const selectViewMode = useCallback((nextMode: FleetViewMode) => {
    setViewMode(nextMode);
    writeFleetViewPreference(nextMode, getClientStorage());
  }, []);

  return (
    <main
      className="host-monitor-dashboard host-monitor-fleet h-full overflow-y-auto"
      data-host-monitor-threshold-colors={showThresholdColors ? "true" : "false"}
    >
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-5">
        {connection !== "connected" ? (
          <output className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"><Spinner />Live updates are reconnecting. Last-known readings are shown.</output>
        ) : null}
        {state.dashboard !== null && state.error !== null ? (
          <ErrorNotice hasLastKnown rpc={rpc} />
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Host filter">
            <FilterPill active={filter === "all"} count={counts.total} label="All" onClick={() => setFilter("all")} />
            <FilterPill active={filter === "attention"} count={counts.attention} label="Attention" onClick={() => setFilter("attention")} />
            <FilterPill active={filter === "offline"} count={counts.offline} label="Offline" onClick={() => setFilter("offline")} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="text-xs text-muted-foreground">{counts.connected} connected · select a host for details</p>
            <IpAddressVisibilityToggle
              onChange={setShowIpAddresses}
              revealed={showIpAddresses}
            />
            <FleetViewToggle mode={viewMode} onChange={selectViewMode} />
          </div>
        </div>
        <div id="host-monitor-fleet-results">
          {state.dashboard === null ? (
            state.error !== null && state.requestKind === null ? (
              <ErrorNotice hasLastKnown={false} rpc={rpc} />
            ) : (
              <FleetSkeleton mode={viewMode} />
            )
          ) : state.dashboard.machines.length === 0 ? (
            <EmptyFleet />
          ) : machines.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">No hosts match this filter.</div>
          ) : viewMode === "cards" ? (
            <FleetCardGrid
              machines={machines}
              onInspect={inspect}
              selectedHostId={selectedHostId}
              showIpAddresses={showIpAddresses}
              thresholds={state.dashboard.thresholds}
            />
          ) : (
            <>
              <DesktopFleetTable
                machines={machines}
                onInspect={inspect}
                selectedHostId={selectedHostId}
                showIpAddresses={showIpAddresses}
                thresholds={state.dashboard.thresholds}
              />
              <CompactFleetList
                machines={machines}
                onInspect={inspect}
                selectedHostId={selectedHostId}
                showIpAddresses={showIpAddresses}
                thresholds={state.dashboard.thresholds}
              />
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function TelemetryGauge({
  isFresh,
  label,
  percent,
  thresholds,
}: {
  isFresh: boolean;
  label: string;
  percent: number | null;
  thresholds: HealthThresholds;
}) {
  const bounded = boundedPercent(percent);
  const tone = thresholdToneForReading(percent, isFresh, thresholds);
  const accessibleText = metricAccessibleText(label, bounded, tone);
  const circumference = 2 * Math.PI * 26;
  const offset = bounded === null ? circumference : circumference * (1 - bounded / 100);
  return (
    <div
      className="host-monitor-telemetry-gauge"
      data-tone={tone}
    >
      <span className="sr-only">{accessibleText}</span>
      <div className="relative aspect-square w-full max-w-24">
        <svg aria-hidden="true" className="size-full -rotate-90" viewBox="0 0 64 64">
          <circle className="text-muted" cx="32" cy="32" fill="none" r="26" stroke="currentColor" strokeWidth="5" />
          <circle className="host-monitor-gauge" cx="32" cy="32" fill="none" r="26" stroke="currentColor" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" strokeWidth="5" />
        </svg>
        <span
          aria-hidden="true"
          className="host-monitor-telemetry-gauge__percentage absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold"
        >
          {bounded === null ? "—" : formatPercent(bounded)}
        </span>
      </div>
      <span aria-hidden="true" className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

function DetailItem({
  label,
  labelClassName = "uppercase tracking-wider",
  value,
  title,
  valueClassName = "",
  valueNetworkDirection,
}: {
  label: string;
  labelClassName?: string;
  value: string;
  title?: string;
  valueClassName?: string;
  valueNetworkDirection?: "down" | "up";
}) {
  return (
    <div className="min-w-0 border-b border-border py-2.5 last:border-b-0">
      <dt className={`break-words text-[10px] text-muted-foreground ${labelClassName}`}>{label}</dt>
      <dd
        className={`mt-0.5 break-words text-xs text-foreground ${valueClassName}`}
        data-network-direction={valueNetworkDirection}
        title={title ?? value}
      >
        {value}
      </dd>
    </div>
  );
}

function NetworkRateDetails({ machine }: { machine: MachineRow }) {
  const network = networkRateSummary(
    machine.snapshot?.network.receiveBytesPerSecond ?? null,
    machine.snapshot?.network.sendBytesPerSecond ?? null,
  );
  const unavailable = "Unavailable";

  return (
    <>
      <DetailItem
        label="Network receive"
        value={network.available ? `↓ ${network.receive}` : unavailable}
        valueClassName="host-monitor-network-detail"
        valueNetworkDirection={network.available ? "down" : undefined}
      />
      <DetailItem
        label="Network send"
        value={network.available ? `↑ ${network.send}` : unavailable}
        valueClassName="host-monitor-network-detail"
        valueNetworkDirection={network.available ? "up" : undefined}
      />
    </>
  );
}

function IpAddressDetail({
  hostName,
  primaryIpAddress,
  revealed,
  onChange,
}: {
  hostName: string;
  primaryIpAddress: string | null;
  revealed: boolean;
  onChange(revealed: boolean): void;
}) {
  const presentation = primaryIpAddressPresentation(
    primaryIpAddress,
    revealed,
  );
  const actionLabel = revealed
    ? `Hide IP address for ${hostName}`
    : `Show IP address for ${hostName}`;

  return (
    <div className="min-w-0 border-b border-border py-2.5 last:border-b-0">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        IP address
      </dt>
      <dd className="mt-0.5 flex min-w-0 items-center justify-between gap-3">
        <span
          className={`min-w-0 font-mono text-xs text-foreground ${
            presentation.state === "revealed" ? "break-all" : "truncate"
          }`}
          title={
            presentation.state === "revealed"
              ? presentation.displayText
              : undefined
          }
        >
          <span aria-hidden="true">{presentation.displayText}</span>
          <span className="sr-only">{presentation.accessibleText}</span>
        </span>
        {presentation.state === "unavailable" ? null : (
          <button
            aria-label={actionLabel}
            aria-pressed={revealed}
            className="inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => onChange(!revealed)}
            title={actionLabel}
            type="button"
          >
            <EyeIcon revealed={revealed} />
            {revealed ? "Hide" : "Show"}
          </button>
        )}
      </dd>
    </div>
  );
}

type ProcessListOk = Extract<ProcessListResult, { outcome: "ok" }>;
type PreparedTerminationReady = Extract<
  PreparedTermination,
  { outcome: "ready" }
>;
type ForceDialogContext = "platform" | "persisted";

const PROCESS_POLL_INTERVAL_MS = 5_000;
const PROCESS_PAGE_LIMIT = 200;
const PROCESS_SKELETON_ROWS = [
  "process-skeleton-1",
  "process-skeleton-2",
  "process-skeleton-3",
  "process-skeleton-4",
  "process-skeleton-5",
  "process-skeleton-6",
  "process-skeleton-7",
] as const;

function ProcessSortIcon({ active, descending }: { active: boolean; descending: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`host-monitor-process-sort-icon size-3 transition-opacity ${active ? "opacity-100" : "opacity-0"}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d={descending ? "m7 14 5 5 5-5M12 5v14" : "m7 10 5-5 5 5M12 5v14"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ProcessTableSortHeader({
  active,
  children,
  direction,
  disabled,
  onClick,
}: {
  active: boolean;
  children: string;
  direction: "ascending" | "descending";
  disabled: boolean;
  onClick(): void;
}) {
  const directionLabel =
    direction === "descending" ? "highest first" : "A to Z";
  return (
    <th
      aria-sort={active ? direction : undefined}
      className="host-monitor-process-table__sortable"
      scope="col"
    >
      <button
        aria-label={`Sort by ${children}, ${directionLabel}${active ? ", selected" : ""}`}
        className="host-monitor-process-column-sort"
        data-active={active ? "true" : "false"}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {children}
        <ProcessSortIcon active={active} descending={direction === "descending"} />
      </button>
    </th>
  );
}

function ProcessSortButton({
  active,
  children,
  disabled,
  direction,
  onClick,
}: {
  active: boolean;
  children: string;
  disabled?: boolean;
  direction: "ascending" | "descending";
  onClick(): void;
}) {
  return (
    <button
      aria-label={`${children}, ${direction === "descending" ? "highest first" : "A to Z"}${active ? ", selected" : ""}`}
      aria-pressed={active}
      className="host-monitor-process-sort"
      data-active={active ? "true" : "false"}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
      <ProcessSortIcon active={active} descending={direction === "descending"} />
    </button>
  );
}

function ProcessListSkeleton() {
  return (
    <output
      aria-label="Loading processes"
      className="host-monitor-process-skeleton"
    >
      {PROCESS_SKELETON_ROWS.map((rowId) => (
        <span className="host-monitor-process-skeleton__row" key={rowId}>
          <span className="host-monitor-process-skeleton__line host-monitor-process-skeleton__line--name" />
          <span className="host-monitor-process-skeleton__line" />
          <span className="host-monitor-process-skeleton__line" />
          <span className="host-monitor-process-skeleton__line host-monitor-process-skeleton__line--action" />
        </span>
      ))}
    </output>
  );
}

function ProcessStateMessage({
  action,
  message,
  title,
}: {
  action?: ReactNode;
  message: string;
  title: string;
}) {
  return (
    <div className="host-monitor-process-state">
      <ProcessesIcon className="size-5" />
      <strong>{title}</strong>
      <p>{message}</p>
      {action}
    </div>
  );
}

function ProcessAction({
  actionsBusy,
  onPrepare,
  pending,
  row,
}: {
  actionsBusy: boolean;
  onPrepare(row: ProcessRow, mode: ProcessTerminationMode, trigger: HTMLElement): void;
  pending: boolean;
  row: ProcessRow;
}) {
  const action = processActionPresentation(row);
  if (action.disabled) {
    return (
      <button
        aria-disabled="true"
        aria-label={`${row.name}, PID ${row.pid}: ${action.reason}`}
        className="host-monitor-process-action"
        data-protected="true"
        title={action.reason ?? undefined}
        type="button"
      >
        <ShieldIcon />
        <span className="sr-only">{action.label}</span>
      </button>
    );
  }
  return (
    <button
      aria-label={`${action.label} ${row.name}, PID ${row.pid}`}
      className="host-monitor-process-action"
      data-protected="false"
      disabled={actionsBusy}
      onClick={(event) => {
        if (action.mode !== null) {
          onPrepare(row, action.mode, event.currentTarget);
        }
      }}
      title={action.reason ?? `${action.label} ${row.name}`}
      type="button"
    >
      {pending ? <Spinner className="size-3" /> : <EndProcessIcon />}
      {pending ? "Checking…" : action.label}
    </button>
  );
}

function ProcessMetric({
  detail,
  maximum,
  value,
}: {
  detail?: string;
  maximum: number;
  value: number;
}) {
  const relativeWidth =
    maximum > 0 ? Math.max(0, Math.min(100, (value / maximum) * 100)) : 0;
  return (
    <span className="host-monitor-process-metric">
      <span className="host-monitor-process-metric__readout">
        <strong>{formatPercent(value)}</strong>
        {detail === undefined ? null : <small>{detail}</small>}
      </span>
      <span aria-hidden="true" className="host-monitor-process-metric__track">
        <span style={{ width: `${relativeWidth}%` }} />
      </span>
    </span>
  );
}

function ProcessSummaryStrip({ rows, totalCount }: { rows: ProcessRow[]; totalCount: number }) {
  const summary = summarizeProcessRows(rows);
  const actionableCount = rows.length - summary.protectedCount;
  return (
    <dl aria-label="Process summary" className="host-monitor-process-summary">
      <div>
        <dt>Shown</dt>
        <dd>
          <strong>{rows.length}</strong>
          <span>{rows.length === totalCount ? "processes" : `of ${totalCount} total`}</span>
        </dd>
      </div>
      <div>
        <dt>Top CPU</dt>
        <dd>
          <span className="host-monitor-process-summary__name" title={summary.topCpu?.name}>
            {summary.topCpu?.name ?? "—"}
          </span>
          <strong>{summary.topCpu === null ? "—" : formatPercent(summary.topCpu.cpuPercent)}</strong>
        </dd>
      </div>
      <div>
        <dt>Top RAM</dt>
        <dd>
          <span className="host-monitor-process-summary__name" title={summary.topMemory?.name}>
            {summary.topMemory?.name ?? "—"}
          </span>
          <strong>{summary.topMemory === null ? "—" : formatPercent(summary.topMemory.memoryPercent)}</strong>
        </dd>
      </div>
      <div>
        <dt>Actions</dt>
        <dd>
          <strong>{actionableCount}</strong>
          <span>available · {summary.protectedCount} protected</span>
        </dd>
      </div>
    </dl>
  );
}

function ProcessRows({
  actionsBusy,
  maximumCpu,
  maximumMemory,
  onPrepare,
  onSort,
  pendingIdentity,
  rows,
  sortBy,
  sortDisabled,
}: {
  actionsBusy: boolean;
  maximumCpu: number;
  maximumMemory: number;
  onPrepare(row: ProcessRow, mode: ProcessTerminationMode, trigger: HTMLElement): void;
  onSort(sort: ProcessSortBy): void;
  pendingIdentity: string | null;
  rows: ProcessRow[];
  sortBy: ProcessSortBy;
  sortDisabled: boolean;
}) {
  return (
    <>
      <div className="host-monitor-process-table">
        <table>
          <thead>
            <tr>
              <ProcessTableSortHeader
                active={sortBy === "name"}
                direction="ascending"
                disabled={sortDisabled}
                onClick={() => onSort("name")}
              >
                Process
              </ProcessTableSortHeader>
              <ProcessTableSortHeader
                active={sortBy === "cpu"}
                direction="descending"
                disabled={sortDisabled}
                onClick={() => onSort("cpu")}
              >
                CPU
              </ProcessTableSortHeader>
              <ProcessTableSortHeader
                active={sortBy === "memory"}
                direction="descending"
                disabled={sortDisabled}
                onClick={() => onSort("memory")}
              >
                RAM
              </ProcessTableSortHeader>
              <th scope="col"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.pid}:${row.identity ?? "protected"}`}>
                <th aria-label={`${row.name}, PID ${row.pid}`} scope="row">
                  <span className="host-monitor-process-primary">
                    <span aria-hidden="true" className="host-monitor-process-rank">{String(index + 1).padStart(2, "0")}</span>
                    <span className="host-monitor-process-identity">
                      <span className="host-monitor-process-name" title={row.name}>{row.name}</span>
                      <span className="host-monitor-process-pid">PID {row.pid} · {processOwnerLabel(row.ownerCategory)}</span>
                      {row.blockedReason === null ? null : (
                        <span className="host-monitor-process-protected-reason">
                          {blockedProcessReason(row.blockedReason)}
                        </span>
                      )}
                    </span>
                  </span>
                </th>
                <td>
                  <ProcessMetric maximum={maximumCpu} value={row.cpuPercent} />
                </td>
                <td>
                  <ProcessMetric
                    detail={formatBytes(row.rssBytes)}
                    maximum={maximumMemory}
                    value={row.memoryPercent}
                  />
                </td>
                <td className="host-monitor-process-action-cell">
                  <ProcessAction
                    actionsBusy={actionsBusy}
                    onPrepare={onPrepare}
                    pending={row.identity !== null && pendingIdentity === row.identity}
                    row={row}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ol className="host-monitor-process-list">
        {rows.map((row, index) => (
          <li key={`${row.pid}:${row.identity ?? "protected"}`}>
            <span aria-hidden="true" className="host-monitor-process-rank">{String(index + 1).padStart(2, "0")}</span>
            <div className="host-monitor-process-list__body">
              <div className="host-monitor-process-list__header">
                <span className="min-w-0">
                  <span className="host-monitor-process-name" title={row.name}>{row.name}</span>
                  <span className="host-monitor-process-pid">PID {row.pid} · {processOwnerLabel(row.ownerCategory)}</span>
                  {row.blockedReason === null ? null : (
                    <span className="host-monitor-process-protected-reason">
                      {blockedProcessReason(row.blockedReason)}
                    </span>
                  )}
                </span>
                <ProcessAction
                  actionsBusy={actionsBusy}
                  onPrepare={onPrepare}
                  pending={row.identity !== null && pendingIdentity === row.identity}
                  row={row}
                />
              </div>
              <dl className="host-monitor-process-list__metrics">
                <div><dt>CPU</dt><dd><ProcessMetric maximum={maximumCpu} value={row.cpuPercent} /></dd></div>
                <div><dt>RAM</dt><dd><ProcessMetric detail={formatBytes(row.rssBytes)} maximum={maximumMemory} value={row.memoryPercent} /></dd></div>
              </dl>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

function ProcessTerminationDialog({
  challenge,
  executing,
  fallbackFocus,
  forceContext,
  onCancel,
  onExecute,
  returnFocus,
}: {
  challenge: PreparedTerminationReady | null;
  executing: boolean;
  fallbackFocus: RefObject<HTMLElement | null>;
  forceContext: ForceDialogContext | null;
  onCancel(): void;
  onExecute(): void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const scopeProps = usePortalScopeProps();
  const force = challenge?.process.mode === "force";
  const description = force
    ? forceContext === "persisted"
      ? "The process did not exit after a graceful request. Force stop can discard unsaved work and leave dependent work incomplete."
      : "This platform only supports a force stop. Unsaved work can be lost immediately."
    : "Ask the process to exit gracefully. If it remains running, Host Monitor will offer a separate force-stop confirmation.";

  return (
    <AlertDialog.Root
      onOpenChange={(open) => {
        if (!open && !executing) onCancel();
      }}
      open={challenge !== null}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          {...scopeProps}
          className="host-monitor-process-dialog__overlay"
        />
        <AlertDialog.Content
          {...scopeProps}
          aria-busy={executing}
          className="host-monitor-process-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const preferred = returnFocus.current;
            const preferredDisabled =
              preferred instanceof HTMLButtonElement
                ? preferred.disabled || preferred.getAttribute("aria-disabled") === "true"
                : preferred?.getAttribute("aria-disabled") === "true";
            if (preferred?.isConnected && !preferredDisabled) preferred.focus();
            else if (fallbackFocus.current?.isConnected) fallbackFocus.current.focus();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          {challenge === null ? null : (
            <>
              <div className="host-monitor-process-dialog__icon" data-force={force ? "true" : "false"}>
                <AlertIcon />
              </div>
              <div className="min-w-0">
                <AlertDialog.Title className="host-monitor-process-dialog__title">
                  {force ? "Force stop process?" : "End process?"}
                </AlertDialog.Title>
                <AlertDialog.Description className="host-monitor-process-dialog__description">
                  {description}
                </AlertDialog.Description>
              </div>
              <dl className="host-monitor-process-dialog__facts">
                <div><dt>Host</dt><dd>{challenge.host.name}</dd></div>
                <div><dt>Process</dt><dd>{challenge.process.name}</dd></div>
                <div><dt>PID</dt><dd>{challenge.process.pid}</dd></div>
                <div><dt>CPU</dt><dd>{formatPercent(challenge.process.cpuPercent)}</dd></div>
                <div><dt>Memory</dt><dd>{formatPercent(challenge.process.memoryPercent)} · {formatBytes(challenge.process.rssBytes)}</dd></div>
              </dl>
              <p className="host-monitor-process-dialog__freshness">
                Checked just now · confirmation expires at {new Date(challenge.expiresAtMs).toLocaleTimeString()}
              </p>
              <div className="host-monitor-process-dialog__actions">
                <AlertDialog.Cancel asChild>
                  <button
                    className="host-monitor-process-dialog__cancel"
                    disabled={executing}
                    ref={cancelRef}
                    type="button"
                  >
                    Cancel
                  </button>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <button
                    className="host-monitor-process-dialog__confirm"
                    data-force={force ? "true" : "false"}
                    disabled={executing}
                    onClick={(event) => {
                      event.preventDefault();
                      onExecute();
                    }}
                    type="button"
                  >
                    {executing ? <Spinner className="size-3.5" /> : null}
                    {executing ? "Sending…" : force ? "Force stop" : "End process"}
                  </button>
                </AlertDialog.Action>
              </div>
            </>
          )}
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function ProcessesPanel() {
  const rpc = useRpc<typeof rpcContract>();
  const dashboard = useDashboardState();
  const targetState = useFixedTabTarget(PROCESSES_TAB);
  const target = targetState?.target ?? null;
  const targetHostId = target?.hostId ?? null;
  const targetInitialSort = target?.initialSort ?? null;
  const [sortBy, setSortBy] = useState<ProcessSortBy>(
    () => target?.initialSort ?? "cpu",
  );
  const [processQuery, setProcessQuery] = useState("");
  const [result, setResult] = useState<ProcessListResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingIdentity, setPendingIdentity] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<PreparedTerminationReady | null>(null);
  const [forceContext, setForceContext] = useState<ForceDialogContext | null>(null);
  const [executing, setExecuting] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const targetGeneration = useRef(0);
  const listGeneration = useRef(0);
  const listInFlight = useRef(false);
  const listQueued = useRef(false);
  const listParams = useRef<{
    generation: number;
    hostId: string | null;
    sortBy: ProcessSortBy;
  }>({ generation: 0, hostId: targetHostId, sortBy });
  const prepareInFlight = useRef(false);
  const prepareSequence = useRef(0);
  const executeSequence = useRef(0);
  const consumedTokens = useRef(new Set<string>());
  const returnFocus = useRef<HTMLElement | null>(null);
  const fallbackFocus = useRef<HTMLElement | null>(null);
  const actionBusy = pendingIdentity !== null || challenge !== null || executing;
  const destructiveActionsBusy = actionBusy || loading;
  const actionBusyRef = useRef(actionBusy);
  actionBusyRef.current = actionBusy;
  listParams.current = {
    generation: listGeneration.current,
    hostId: targetHostId,
    sortBy,
  };

  const loadProcesses = useCallback(async function loadProcessesNow(): Promise<ProcessListResult | null> {
    if (listInFlight.current) {
      listQueued.current = true;
      return null;
    }
    const params = { ...listParams.current };
    if (params.hostId === null) return null;
    listInFlight.current = true;
    setLoading(true);
    try {
      const next = await rpc.call("listProcesses", {
        hostId: params.hostId,
        limit: PROCESS_PAGE_LIMIT,
        sortBy: params.sortBy,
      });
      if (
        params.generation === listGeneration.current &&
        params.hostId === listParams.current.hostId &&
        params.sortBy === listParams.current.sortBy
      ) {
        setResult(next);
        setRequestError(null);
      }
      return next;
    } catch {
      if (
        params.generation === listGeneration.current &&
        params.hostId === listParams.current.hostId &&
        params.sortBy === listParams.current.sortBy
      ) {
        setRequestError("Host Monitor could not reach the process service.");
      }
      return null;
    } finally {
      const current =
        params.generation === listGeneration.current &&
        params.hostId === listParams.current.hostId &&
        params.sortBy === listParams.current.sortBy;
      if (current) setLoading(false);
      listInFlight.current = false;
      if (listQueued.current) {
        listQueued.current = false;
        const queued = listParams.current;
        if (
          !actionBusyRef.current &&
          queued.hostId !== null &&
          queued.generation === listGeneration.current
        ) {
          window.queueMicrotask(() => void loadProcessesNow());
        }
      }
    }
  }, [rpc]);

  useEffect(() => {
    targetGeneration.current += 1;
    listGeneration.current += 1;
    prepareSequence.current += 1;
    executeSequence.current += 1;
    prepareInFlight.current = false;
    listQueued.current = false;
    listParams.current = {
      generation: listGeneration.current,
      hostId: targetHostId,
      sortBy: targetInitialSort ?? listParams.current.sortBy,
    };
    setResult(null);
    setRequestError(null);
    setLoading(false);
    setChallenge(null);
    setPendingIdentity(null);
    setExecuting(false);
    setProcessQuery("");
    if (targetInitialSort !== null) setSortBy(targetInitialSort);
    return () => {
      targetGeneration.current += 1;
      listGeneration.current += 1;
      prepareSequence.current += 1;
      executeSequence.current += 1;
      prepareInFlight.current = false;
      listQueued.current = false;
    };
  }, [targetHostId, targetInitialSort]);

  useEffect(() => {
    if (targetHostId === null) return;
    void loadProcesses();
    const interval = window.setInterval(() => {
      if (!actionBusyRef.current) void loadProcesses();
    }, PROCESS_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [loadProcesses, sortBy, targetHostId]);

  const prepareTermination = useCallback(async (
    row: ProcessRow,
    mode: ProcessTerminationMode,
    trigger: HTMLElement,
    context: ForceDialogContext | null = mode === "force" ? "platform" : null,
  ) => {
    if (
      targetHostId === null ||
      row.identity === null ||
      prepareInFlight.current
    ) return;
    if (listInFlight.current) {
      const message = "Wait for the current process refresh to finish.";
      setAnnouncement(message);
      toast.info(message);
      return;
    }
    const sequence = ++prepareSequence.current;
    const generation = targetGeneration.current;
    const hostId = targetHostId;
    prepareInFlight.current = true;
    returnFocus.current = trigger;
    setPendingIdentity(row.identity);
    try {
      const prepared = await rpc.call("prepareProcessTermination", {
        hostId,
        identity: row.identity,
        mode,
        pid: row.pid,
      });
      if (
        sequence !== prepareSequence.current ||
        generation !== targetGeneration.current
      ) return;
      if (prepared.outcome === "ready") {
        setForceContext(context);
        setChallenge(prepared);
        setAnnouncement(`${prepared.process.name} is ready for confirmation.`);
      } else {
        setAnnouncement(prepared.message);
        toast.error(prepared.message);
        void loadProcesses();
      }
    } catch {
      if (
        sequence !== prepareSequence.current ||
        generation !== targetGeneration.current
      ) return;
      const message = "Host Monitor could not safely check this process.";
      setAnnouncement(message);
      toast.error(message);
    } finally {
      if (sequence === prepareSequence.current) {
        prepareInFlight.current = false;
        if (generation === targetGeneration.current) setPendingIdentity(null);
      }
    }
  }, [loadProcesses, rpc, targetHostId]);

  const executeTermination = useCallback(async () => {
    if (challenge === null || executing) return;
    const token = challenge.confirmationToken;
    if (consumedTokens.current.has(token)) return;
    consumedTokens.current.add(token);
    const sequence = ++executeSequence.current;
    const generation = targetGeneration.current;
    setExecuting(true);
    try {
      const executed = await rpc.call("executeProcessTermination", {
        confirmationToken: token,
      });
      if (
        sequence !== executeSequence.current ||
        generation !== targetGeneration.current
      ) return;
      if (executed.outcome === "still-running" && challenge.process.mode === "graceful") {
        const forceRow: ProcessRow = {
          ...challenge.process,
          allowedTerminationModes: ["force"],
          blockedReason: null,
          ownerCategory: "same-user",
        };
        setChallenge(null);
        setAnnouncement(executed.message);
        toast.warning(executed.message);
        await prepareTermination(forceRow, "force", returnFocus.current ?? document.body, "persisted");
        return;
      }

      setExecuting(false);
      setChallenge(null);
      setAnnouncement(executed.message);
      if (executed.outcome === "signal-sent") {
        toast.info(executed.message);
      } else if (executed.outcome === "outcome-unknown") {
        toast.warning(executed.message);
      } else {
        toast.error(executed.message);
      }
      await loadProcesses();
    } catch {
      if (
        sequence !== executeSequence.current ||
        generation !== targetGeneration.current
      ) return;
      const message =
        "Host Monitor could not confirm whether the stop request completed. Refresh before trying again.";
      setExecuting(false);
      setChallenge(null);
      setAnnouncement(`Process outcome unknown. ${message}`);
      toast.warning(message);
      await loadProcesses();
    } finally {
      consumedTokens.current.delete(token);
      if (
        sequence === executeSequence.current &&
        generation === targetGeneration.current
      ) setExecuting(false);
    }
  }, [challenge, executing, loadProcesses, prepareTermination, rpc]);

  const selectSort = useCallback((nextSort: ProcessSortBy) => {
    setSortBy(nextSort);
    setAnnouncement(
      nextSort === "name"
        ? "Sorted by Process, A to Z."
        : `Sorted by ${nextSort === "cpu" ? "CPU" : "RAM"}, highest first.`,
    );
  }, []);

  const okResult: ProcessListOk | null = result?.outcome === "ok" ? result : null;
  const sortedRows = useMemo(
    () => sortProcessRows(okResult?.processes ?? [], sortBy),
    [okResult?.processes, sortBy],
  );
  const rows = useMemo(
    () => filterProcessRows(sortedRows, processQuery),
    [processQuery, sortedRows],
  );
  const maximumCpu = useMemo(
    () => Math.max(0, ...sortedRows.map((row) => row.cpuPercent)),
    [sortedRows],
  );
  const maximumMemory = useMemo(
    () => Math.max(0, ...sortedRows.map((row) => row.memoryPercent)),
    [sortedRows],
  );
  const knownHostName =
    dashboard.dashboard?.machines.find(
      (machine) => machine.host.id === targetHostId,
    )?.host.name ?? null;
  const hostName = okResult?.host.name ?? knownHostName ?? "Selected host";
  const firstLoad = result === null && requestError === null;

  if (target === null) {
    return (
      <section className="host-monitor-processes" ref={fallbackFocus} tabIndex={-1}>
        <ProcessStateMessage
          message="Open Processes from a specific host. Host Monitor never guesses which machine to control."
          title="Choose a host first"
        />
      </section>
    );
  }

  return (
    <section
      aria-label={`Processes on ${hostName}`}
      className="host-monitor-processes"
      ref={fallbackFocus}
      tabIndex={-1}
    >
      <output aria-live="polite" className="sr-only">{announcement}</output>
      <header className="host-monitor-processes__header">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <ProcessesIcon className="size-4 shrink-0 text-muted-foreground" />
            <h2
              className="truncate text-sm font-semibold text-foreground"
            >
              {hostName}
            </h2>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {okResult === null
              ? "Live processes"
              : `${okResult.totalCount} processes · sampled ${formatRelativeTime(okResult.sampledAtMs)}`}
          </p>
        </div>
        <button
          aria-label={`Refresh processes on ${hostName}`}
          className={CONTROL_BUTTON_CLASS}
          disabled={loading || actionBusy}
          onClick={() => void loadProcesses()}
          title="Refresh processes"
          type="button"
        >
          <RefreshIcon active={loading} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </header>

      <div className="host-monitor-processes__toolbar">
        <label className="host-monitor-process-search">
          <SearchIcon />
          <span className="sr-only">Search shown processes by name or PID</span>
          <input
            aria-keyshortcuts="Escape"
            onChange={(event) => setProcessQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && processQuery.length > 0) {
                event.preventDefault();
                setProcessQuery("");
              }
            }}
            placeholder={okResult?.truncated ? "Search shown processes" : "Search name or PID"}
            type="search"
            value={processQuery}
          />
        </label>
        {processQuery.length > 0 ? (
          <button
            aria-label="Clear process search"
            className="host-monitor-process-search__clear"
            onClick={() => setProcessQuery("")}
            type="button"
          >
            Clear
          </button>
        ) : null}
        <fieldset
          aria-label="Sort processes; Process is A to Z, CPU and RAM are highest first"
          className="host-monitor-process-sort-group"
        >
          <ProcessSortButton active={sortBy === "name"} direction="ascending" disabled={actionBusy} onClick={() => selectSort("name")}>Process</ProcessSortButton>
          <ProcessSortButton active={sortBy === "cpu"} direction="descending" disabled={actionBusy} onClick={() => selectSort("cpu")}>CPU</ProcessSortButton>
          <ProcessSortButton active={sortBy === "memory"} direction="descending" disabled={actionBusy} onClick={() => selectSort("memory")}>RAM</ProcessSortButton>
        </fieldset>
        <output aria-live="polite" className="host-monitor-processes__toolbar-status">
          {loading && okResult !== null ? <><Spinner className="size-3" />Updating</> : null}
          {!loading && processQuery.length > 0 && okResult !== null
            ? `${rows.length} ${rows.length === 1 ? "match" : "matches"}`
            : null}
        </output>
      </div>

      <div className="host-monitor-processes__content">
        {requestError !== null && okResult !== null ? (
          <div className="host-monitor-process-notice" role="alert">
            <AlertIcon className="size-3.5 shrink-0" />
            <span>Could not refresh processes: {requestError}</span>
          </div>
        ) : null}
        {okResult?.elevated ? (
          <output className="host-monitor-process-notice">
            <AlertIcon className="size-3.5 shrink-0" />
            <span>Process actions are protected while Host Monitor is running with elevated privileges.</span>
          </output>
        ) : null}

        {firstLoad ? (
          <ProcessListSkeleton />
        ) : result !== null && result.outcome !== "ok" ? (
          <ProcessStateMessage
            action={
              <button className={CONTROL_BUTTON_CLASS} onClick={() => void loadProcesses()} type="button">
                Try again
              </button>
            }
            message={result.message}
            title={
              result.outcome === "offline"
                ? "Host is offline"
                : result.outcome === "unsupported"
                  ? "Processes are unsupported"
                  : result.outcome === "not-found"
                    ? "Host not found"
                    : "Processes unavailable"
            }
          />
        ) : okResult !== null && sortedRows.length === 0 ? (
          <ProcessStateMessage
            message="No user-visible processes were reported by this host."
            title="No processes to show"
          />
        ) : okResult !== null ? (
          <div className="host-monitor-process-surface">
            <ProcessSummaryStrip rows={sortedRows} totalCount={okResult.totalCount} />
            {rows.length === 0 ? (
              <ProcessStateMessage
                action={
                  <button className={CONTROL_BUTTON_CLASS} onClick={() => setProcessQuery("")} type="button">
                    Clear search
                  </button>
                }
                message={`No shown process matches “${processQuery.trim()}”.`}
                title="No matching processes"
              />
            ) : (
              <ProcessRows
                actionsBusy={destructiveActionsBusy}
                maximumCpu={maximumCpu}
                maximumMemory={maximumMemory}
                onPrepare={(row, mode, trigger) => void prepareTermination(row, mode, trigger)}
                onSort={selectSort}
                pendingIdentity={pendingIdentity}
                rows={rows}
                sortBy={sortBy}
                sortDisabled={actionBusy}
              />
            )}
            {okResult.truncated ? (
              <p className="host-monitor-processes__truncated">
                Search covers these {okResult.processes.length} shown processes; {okResult.totalCount} exist on the host.
              </p>
            ) : null}
          </div>
        ) : requestError !== null ? (
          <ProcessStateMessage
            action={<button className={CONTROL_BUTTON_CLASS} onClick={() => void loadProcesses()} type="button">Try again</button>}
            message={requestError}
            title="Could not load processes"
          />
        ) : null}
      </div>

      <ProcessTerminationDialog
        challenge={challenge}
        executing={executing}
        fallbackFocus={fallbackFocus}
        forceContext={forceContext}
        onCancel={() => {
          setChallenge(null);
          setForceContext(null);
          setAnnouncement("Process action cancelled.");
          void loadProcesses();
        }}
        onExecute={() => void executeTermination()}
        returnFocus={returnFocus}
      />
    </section>
  );
}

function InspectorEmpty({ message }: { message: string }) {
  return <div className="flex h-full min-h-48 items-center justify-center text-center text-sm text-muted-foreground">{message}</div>;
}

function MachineInspector() {
  const rpc = useRpc<typeof rpcContract>();
  const settings = useSettings();
  const state = useDashboardState();
  const panel = useAppPanel();
  const targetState = useFixedTabTarget(INSPECT_TAB);
  const activeHostId =
    targetState?.target.hostId ?? state.dashboard?.machines[0]?.host.id ?? null;
  const [revealedIpHostId, setRevealedIpHostId] = useState<string | null>(null);
  const showIpAddress =
    activeHostId !== null && revealedIpHostId === activeHostId;
  const showThresholdColors = thresholdColorsEnabled(
    settings.values,
    settings.isLoading,
  );

  useEffect(() => {
    if (state.dashboard === null) void requestDashboard(rpc, "dashboard");
  }, [rpc, state.dashboard]);
  useEffect(() => {
    if (revealedIpHostId !== null && revealedIpHostId !== activeHostId) {
      setRevealedIpHostId(null);
    }
  }, [activeHostId, revealedIpHostId]);

  if (state.dashboard === null) {
    return (
      <section
        className="host-monitor-inspector h-full"
        data-host-monitor-threshold-colors={showThresholdColors ? "true" : "false"}
      >
        <InspectorEmpty message="Loading host telemetry…" />
      </section>
    );
  }
  const machine = state.dashboard.machines.find((candidate) => candidate.host.id === activeHostId) ?? null;
  if (machine === null) {
    return (
      <section
        className="host-monitor-inspector h-full"
        data-host-monitor-threshold-colors={showThresholdColors ? "true" : "false"}
      >
        <InspectorEmpty message="Select a host to inspect its telemetry." />
      </section>
    );
  }
  const snapshot = machine.snapshot;
  const refreshing = state.requestKind === "refresh-host" && state.requestHostId === machine.host.id;
  const openProcesses = (initialSort: "cpu" | "memory") => {
    panel.openFixedTab({
      surface: { kind: "current" },
      tab: PROCESSES_TAB,
      target: { hostId: machine.host.id, initialSort },
    });
  };

  return (
    <section
      className="host-monitor-inspector space-y-4"
      data-host-monitor-threshold-colors={showThresholdColors ? "true" : "false"}
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground">{machine.host.name}</h2>
            <HealthBadge machine={machine} />
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{snapshot ? `${snapshot.system.osName} · ${snapshot.system.arch}` : machine.host.status === "connected" ? "Connected · waiting for telemetry" : "Disconnected · no live telemetry"}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          <button
            aria-label={`View processes on ${machine.host.name}`}
            className={CONTROL_BUTTON_CLASS}
            onClick={() => openProcesses("cpu")}
            title="View processes"
            type="button"
          >
            <ProcessesIcon />
            <span className="hidden sm:inline">Processes</span>
          </button>
          <button aria-label={`Refresh ${machine.host.name}`} className={CONTROL_BUTTON_CLASS} disabled={state.requestKind !== null} onClick={() => void requestDashboard(rpc, "refresh-host", machine.host.id)} title="Refresh this host" type="button"><RefreshIcon active={refreshing} /></button>
        </span>
      </header>

      {machine.alert !== null ? (
        <div
          className="host-monitor-threshold-alert"
          data-tone={
            machine.sampleState !== "fresh"
              ? "neutral"
              : machine.health === "critical"
                ? "critical"
                : "attention"
          }
          role="alert"
        >
          <AlertIcon className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{machine.alert.message}</span>
          {machine.alert.metric === "cpu" || machine.alert.metric === "memory" ? (
            <button
              className="host-monitor-threshold-alert__action"
              onClick={() => openProcesses(machine.alert?.metric === "memory" ? "memory" : "cpu")}
              type="button"
            >
              View {machine.alert.metric === "memory" ? "memory" : "CPU"} processes
            </button>
          ) : null}
        </div>
      ) : null}
      {machine.error !== null ? <p className="text-xs text-destructive">{machine.error}</p> : null}

      {snapshot === null ? (
        <InspectorEmpty message={machine.sampleState === "offline" ? `This host is offline. Last seen ${formatRelativeTime(machine.host.lastSeenAt)}.` : "Waiting for the first telemetry sample."} />
      ) : (
        <>
          <div className="host-monitor-gauge-grid grid grid-cols-3 gap-2 rounded-lg border border-border bg-card p-3">
            <TelemetryGauge isFresh={machine.sampleState === "fresh"} label="CPU" percent={snapshot.cpu.usagePercent} thresholds={state.dashboard.thresholds} />
            <TelemetryGauge isFresh={machine.sampleState === "fresh"} label="Memory" percent={snapshot.memory.usagePercent} thresholds={state.dashboard.thresholds} />
            <TelemetryGauge isFresh={machine.sampleState === "fresh"} label="Disk" percent={snapshot.disk?.usagePercent ?? null} thresholds={state.dashboard.thresholds} />
          </div>

          <dl className="rounded-lg border border-border bg-card px-3">
            <DetailItem label="Memory" value={`${formatBytes(snapshot.memory.usedBytes)} used · ${formatBytes(snapshot.memory.availableBytes)} available`} />
            <DetailItem label="System volume" value={snapshot.disk ? `${formatBytes(snapshot.disk.usedBytes)} used · ${formatBytes(snapshot.disk.availableBytes)} free` : "Unavailable"} />
            {(snapshot.extraDisks ?? []).map((extraDisk) => (
              <DetailItem key={extraDisk.path} label={extraDisk.path} labelClassName="font-mono" value={extraDisk.capacity ? `${formatPercent(extraDisk.capacity.usagePercent)} · ${formatBytes(extraDisk.capacity.usedBytes)} used · ${formatBytes(extraDisk.capacity.availableBytes)} free` : "Unavailable"} />
            ))}
            <DetailItem label="Load · 1 / 5 / 15 min" value={snapshot.cpu.loadAverage ? snapshot.cpu.loadAverage.map((value) => value.toFixed(2)).join(" / ") : "Unavailable"} />
            <DetailItem label="Swap" value={snapshot.swap ? `${formatPercent(snapshot.swap.usagePercent)} · ${formatBytes(snapshot.swap.usedBytes)} used` : "Not configured"} />
            <DetailItem label="Uptime" value={`${formatDuration(snapshot.system.uptimeSeconds)} · rebooted ${formatRelativeTime(snapshot.system.bootedAtMs)}`} title={`Rebooted ${formatDate(snapshot.system.bootedAtMs)}`} />
            <DetailItem label="Processor" value={`${snapshot.cpu.logicalCores} logical cores · ${snapshot.cpu.model || "Unknown model"}`} />
            <DetailItem label="Kernel" value={snapshot.system.kernelRelease} />
            <NetworkRateDetails machine={machine} />
            <IpAddressDetail
              hostName={machine.host.name}
              onChange={(revealed) =>
                setRevealedIpHostId(revealed ? machine.host.id : null)
              }
              primaryIpAddress={snapshot.network.primaryIpAddress}
              revealed={showIpAddress}
            />
            {snapshot.system.hostname !== machine.host.name ? <DetailItem label="Hostname" value={snapshot.system.hostname} /> : null}
          </dl>

          {snapshot.issues.length > 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Partial readings</p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {snapshot.issues.map((issue) => <li key={`${issue.metric}:${issue.message}`}>{issue.message}</li>)}
              </ul>
            </div>
          ) : null}

          <p className="text-right text-[10px] text-muted-foreground">{machine.sampleState === "stale" || machine.sampleState === "error" ? "Last known" : "Sampled"} {formatRelativeTime(snapshot.sampledAtMs)}</p>
        </>
      )}
    </section>
  );
}

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "host-monitor-sidebar",
    mount: ({ pluginId, signal }) => mountHostMonitorSidebar(pluginId, signal),
  });
  app.slots.sidebarFooterAction({
    id: "machines",
    title: "Host Monitor",
    icon: "Terminal",
    run: toggleHostMonitorPopover,
  });
  app.slots.navPanel({
    id: "machines",
    title: "Host Monitor",
    icon: "Terminal",
    path: "machines",
    component: FleetMatrix,
    headerContent: FleetHeader,
    experimental_sidebarAccessory: FleetSidebarAccessory,
    fixedTabs: [
      {
        ...INSPECT_TAB,
        title: "Host details",
        icon: "Terminal",
        component: MachineInspector,
        layout: "padded",
      },
      {
        ...PROCESSES_TAB,
        title: "Processes",
        icon: "Activity",
        component: ProcessesPanel,
        layout: "flush",
      },
    ],
  });
});
