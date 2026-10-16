import type { Dashboard, MachineRow } from "../contract.ts";
import { networkRateSummary } from "./network-presentation.ts";
import {
  thresholdToneAccessibleLabel,
  thresholdToneForReading,
  type ThresholdTone,
} from "./threshold-presentation.ts";
import {
  DEFAULT_HEALTH_THRESHOLDS,
  sameHealthThresholds,
  type HealthThresholds,
} from "./thresholds.ts";

const SURFACE_ID = "host-monitor-sidebar-popover";
const TOGGLE_EVENT = "host-monitor:toggle-popover";
const NAV_EVENT = "host-monitor:navigate";
const NAV_ITEMS_SELECTOR = '[data-testid="plugin-nav-sidebar-items"]';
const NAV_ROW_ATTRIBUTE = "data-host-monitor-nav-row";
const TRIGGER_ATTRIBUTE = "data-host-monitor-trigger";
const FOOTER_ACTION_ID = "machines";
const AUTO_REFRESH_MS = 30_000;
const PREFERENCES_REFRESH_MS = 5_000;
const NATIVE_OPEN_POLL_MS = 750;
const DRAG_THRESHOLD_PX = 8;
const FLOATING_WIDTH_PX = 352;
const VIEWPORT_PADDING_PX = 8;
const THRESHOLD_COLORS_CACHE_KEY =
  "bb:host-monitor:sidebar:threshold-colors";
const SIDEBAR_PREFERENCES_CACHE_KEY =
  "bb:host-monitor:sidebar:preferences:v1";
const FLOATING_POSITION_CACHE_KEY =
  "bb:host-monitor:sidebar:floating-position:v1";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

let nextFloatingZIndex = 70;

export type HostMonitorSidebarRequestKind = "dashboard" | "refresh";
export type HostMonitorSurfaceMode = "closed" | "popover" | "floating";
export type HostMonitorTriggerStatus =
  | "attention"
  | "critical"
  | "empty"
  | "error"
  | "healthy"
  | "loading"
  | "offline";

type HostMonitorFocusTarget =
  | "close"
  | "float"
  | "move"
  | "open"
  | "refresh"
  | "retry";

interface RpcEnvelope<T> {
  ok: boolean;
  result?: T;
}

export interface HostMonitorCounts {
  total: number;
  connected: number;
  offline: number;
  attention: number;
}

export interface HostMonitorPoint {
  x: number;
  y: number;
}

export interface HostMonitorFloatingPosition {
  left: number;
  top: number;
}

export interface HostMonitorFloatingSize {
  width: number;
  height: number;
}

export interface HostMonitorViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface DragGesture {
  pointerId: number;
  source: "trigger" | "window";
  start: HostMonitorPoint;
  latest: HostMonitorPoint;
  grabOffset: HostMonitorPoint;
  engaged: boolean;
  captureTarget: HTMLElement | null;
}

export interface HostMonitorSidebarSummary {
  counts: HostMonitorCounts;
  status: HostMonitorTriggerStatus;
  label: string;
}

export interface HostMonitorSidebarRpcRequest {
  url: string;
  body: string;
}

export interface HostMonitorSidebarPreferences {
  sidebarThresholdColors: boolean;
  thresholds: HealthThresholds;
}

export interface HostMonitorSidebarMetricTones {
  cpu: ThresholdTone;
  memory: ThresholdTone;
}

export function hostMonitorSidebarRpcRequest(
  pluginId: string,
  kind: HostMonitorSidebarRequestKind,
): HostMonitorSidebarRpcRequest {
  return {
    url: `/api/v1/plugins/${pluginId}/rpc/${kind}`,
    body: kind === "refresh" ? JSON.stringify({ hostId: null }) : "null",
  };
}

export function hostMonitorSidebarPreferencesRpcRequest(
  pluginId: string,
): HostMonitorSidebarRpcRequest {
  return {
    url: `/api/v1/plugins/${pluginId}/rpc/getPreferences`,
    body: "null",
  };
}

export function hostMonitorNativeOpenRpcRequest(
  pluginId: string,
): HostMonitorSidebarRpcRequest {
  return {
    url: `/api/v1/plugins/${pluginId}/rpc/claimNativeOpen`,
    body: "null",
  };
}

export function isBbDesktopWindow(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "bbDesktop" in value
  );
}

export function resolveHostMonitorSidebarThresholdColors(
  value: unknown,
  fallback: boolean,
): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fallback;
  }
  const candidate = value as Partial<HostMonitorSidebarPreferences>;
  return typeof candidate.sidebarThresholdColors === "boolean"
    ? candidate.sidebarThresholdColors
    : fallback;
}

function isHealthThresholds(value: unknown): value is HealthThresholds {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<HealthThresholds>;
  return (
    typeof candidate.attentionPercent === "number" &&
    Number.isFinite(candidate.attentionPercent) &&
    candidate.attentionPercent >= 1 &&
    candidate.attentionPercent < 100 &&
    typeof candidate.criticalPercent === "number" &&
    Number.isFinite(candidate.criticalPercent) &&
    candidate.criticalPercent > 1 &&
    candidate.criticalPercent <= 100 &&
    candidate.attentionPercent < candidate.criticalPercent
  );
}

export function resolveHostMonitorSidebarPreferences(
  value: unknown,
  fallback: HostMonitorSidebarPreferences,
): HostMonitorSidebarPreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fallback;
  }
  const candidate = value as Partial<HostMonitorSidebarPreferences>;
  return {
    sidebarThresholdColors:
      typeof candidate.sidebarThresholdColors === "boolean"
        ? candidate.sidebarThresholdColors
        : fallback.sidebarThresholdColors,
    thresholds: isHealthThresholds(candidate.thresholds)
      ? candidate.thresholds
      : fallback.thresholds,
  };
}

export function parseHostMonitorSidebarPreferencesCache(
  value: string | null,
): HostMonitorSidebarPreferences | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    const fallback: HostMonitorSidebarPreferences = {
      sidebarThresholdColors: true,
      thresholds: DEFAULT_HEALTH_THRESHOLDS,
    };
    const resolved = resolveHostMonitorSidebarPreferences(parsed, fallback);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      typeof (parsed as Partial<HostMonitorSidebarPreferences>)
        .sidebarThresholdColors !== "boolean" ||
      !isHealthThresholds(
        (parsed as Partial<HostMonitorSidebarPreferences>).thresholds,
      )
    ) {
      return null;
    }
    return resolved;
  } catch {
    return null;
  }
}

export function parseHostMonitorSidebarThresholdColorsCache(
  value: string | null,
): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export function hostMonitorSidebarMetricTones(
  cpuPercent: number | null,
  memoryPercent: number | null,
  isFresh = true,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
): HostMonitorSidebarMetricTones {
  return {
    cpu: thresholdToneForReading(cpuPercent, isFresh, thresholds),
    memory: thresholdToneForReading(memoryPercent, isFresh, thresholds),
  };
}

export function hostMonitorDragThresholdExceeded(
  start: HostMonitorPoint,
  current: HostMonitorPoint,
  threshold = DRAG_THRESHOLD_PX,
): boolean {
  if (!Number.isFinite(threshold) || threshold < 0) return false;
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

export function parseHostMonitorFloatingPositionCache(
  value: string | null,
): HostMonitorFloatingPosition | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const candidate = parsed as Partial<HostMonitorFloatingPosition>;
    if (
      typeof candidate.left !== "number" ||
      !Number.isFinite(candidate.left) ||
      typeof candidate.top !== "number" ||
      !Number.isFinite(candidate.top)
    ) {
      return null;
    }
    return { left: candidate.left, top: candidate.top };
  } catch {
    return null;
  }
}

export function clampHostMonitorFloatingPosition(
  position: HostMonitorFloatingPosition,
  size: HostMonitorFloatingSize,
  viewport: HostMonitorViewport,
  padding = VIEWPORT_PADDING_PX,
): HostMonitorFloatingPosition {
  const inset = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  const minLeft = viewport.left + inset;
  const minTop = viewport.top + inset;
  const maxLeft = Math.max(
    minLeft,
    viewport.left + viewport.width - Math.max(0, size.width) - inset,
  );
  const maxTop = Math.max(
    minTop,
    viewport.top + viewport.height - Math.max(0, size.height) - inset,
  );
  return {
    left: Math.min(Math.max(position.left, minLeft), maxLeft),
    top: Math.min(Math.max(position.top, minTop), maxTop),
  };
}

export function hostMonitorFloatingDropPosition(
  point: HostMonitorPoint,
  size: HostMonitorFloatingSize,
  viewport: HostMonitorViewport,
): HostMonitorFloatingPosition {
  return clampHostMonitorFloatingPosition(
    { left: point.x - 24, top: point.y - 16 },
    size,
    viewport,
  );
}

/** Poll quickly while metrics are visible and cheaply while the surface is shut. */
export function hostMonitorSidebarRefreshDelay(
  mode: HostMonitorSurfaceMode,
  dashboardRefreshIntervalMs: number | null,
): number {
  if (mode === "closed") return AUTO_REFRESH_MS;
  const requested =
    dashboardRefreshIntervalMs !== null &&
    Number.isFinite(dashboardRefreshIntervalMs)
      ? dashboardRefreshIntervalMs
      : 10_000;
  return Math.min(60_000, Math.max(5_000, Math.round(requested)));
}

export function hostMonitorTriggerRectIsVisible(
  rect: Pick<DOMRect, "bottom" | "left" | "right" | "top">,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return (
    rect.right > rect.left &&
    rect.bottom > rect.top &&
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < viewportWidth &&
    rect.top < viewportHeight
  );
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function iconPath(pathData: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", pathData);
  svg.append(path);
  return svg;
}

function closeGlyph(): SVGSVGElement {
  return iconPath("M7 7l10 10M17 7 7 17");
}

function refreshGlyph(): SVGSVGElement {
  return iconPath(
    "M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.7-2.5L20 11M4 13l2.2 4.5A7 7 0 0 0 18 15",
  );
}

function arrowGlyph(): SVGSVGElement {
  return iconPath("M5 12h14m-5-5 5 5-5 5");
}

function floatGlyph(): SVGSVGElement {
  return iconPath(
    "M14 5h5v5M19 5l-7 7M10 7H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-4",
  );
}

function cachedThresholdColors(): boolean | null {
  try {
    return parseHostMonitorSidebarThresholdColorsCache(
      window.localStorage.getItem(THRESHOLD_COLORS_CACHE_KEY),
    );
  } catch {
    return null;
  }
}

function cachedSidebarPreferences(): HostMonitorSidebarPreferences {
  const fallback: HostMonitorSidebarPreferences = {
    sidebarThresholdColors: cachedThresholdColors() ?? true,
    thresholds: DEFAULT_HEALTH_THRESHOLDS,
  };
  try {
    return (
      parseHostMonitorSidebarPreferencesCache(
        window.localStorage.getItem(SIDEBAR_PREFERENCES_CACHE_KEY),
      ) ?? fallback
    );
  } catch {
    return fallback;
  }
}

function cacheThresholdColors(value: boolean): void {
  try {
    window.localStorage.setItem(THRESHOLD_COLORS_CACHE_KEY, String(value));
  } catch {
    // Storage can be unavailable without breaking the monitor.
  }
}

function cacheSidebarPreferences(value: HostMonitorSidebarPreferences): void {
  cacheThresholdColors(value.sidebarThresholdColors);
  try {
    window.localStorage.setItem(
      SIDEBAR_PREFERENCES_CACHE_KEY,
      JSON.stringify(value),
    );
  } catch {
    // Storage can be unavailable without breaking the monitor.
  }
}

function cachedFloatingPosition(): HostMonitorFloatingPosition | null {
  try {
    return parseHostMonitorFloatingPositionCache(
      window.localStorage.getItem(FLOATING_POSITION_CACHE_KEY),
    );
  } catch {
    return null;
  }
}

function cacheFloatingPosition(position: HostMonitorFloatingPosition): void {
  try {
    window.localStorage.setItem(
      FLOATING_POSITION_CACHE_KEY,
      JSON.stringify(position),
    );
  } catch {
    // Position persistence is optional.
  }
}

function countsFor(dashboard: Dashboard | null): HostMonitorCounts {
  const machines = dashboard?.machines ?? [];
  const connected = machines.filter(
    (machine) => machine.host.status === "connected",
  ).length;
  return {
    total: machines.length,
    connected,
    offline: machines.length - connected,
    attention: machines.filter(
      (machine) => {
        if (machine.sampleState === "sampling") return false;
        return (
          machine.health === "attention" ||
          machine.health === "critical" ||
          machine.sampleState === "stale" ||
          machine.sampleState === "error"
        );
      },
    ).length,
  };
}

function triggerStatus(
  dashboard: Dashboard | null,
  isLoading: boolean,
  hasError: boolean,
): HostMonitorTriggerStatus {
  if (hasError) return "error";
  if (dashboard === null) return isLoading ? "loading" : "empty";
  const counts = countsFor(dashboard);
  if (counts.total === 0) return "empty";
  if (dashboard.machines.some((machine) => machineTone(machine) === "critical")) {
    return "critical";
  }
  if (counts.attention > 0) return "attention";
  if (counts.offline > 0) return "offline";
  return "healthy";
}

function triggerLabel(
  dashboard: Dashboard | null,
  isLoading: boolean,
  hasError: boolean,
): string {
  if (dashboard === null && isLoading) {
    return "Host Monitor · Loading host metrics";
  }
  if (dashboard === null && hasError) {
    return "Host Monitor · Metrics unavailable";
  }
  const counts = countsFor(dashboard);
  const critical =
    dashboard?.machines.filter((machine) => machineTone(machine) === "critical")
      .length ?? 0;
  const attentionOnly = Math.max(0, counts.attention - critical);
  const severity = `${
    critical > 0
      ? ` · ${critical} critical ${critical === 1 ? "host" : "hosts"}`
      : ""
  }${
    attentionOnly > 0
      ? ` · ${attentionOnly} need attention`
      : ""
  }`;
  if (hasError) {
    const fleet =
      counts.total === 0
        ? ""
        : ` · ${counts.connected} of ${counts.total} connected${severity}`;
    return `Host Monitor · Refresh unavailable${fleet}`;
  }
  if (counts.total === 0) return "Host Monitor · No enrolled hosts";
  return `Host Monitor · ${counts.connected} of ${counts.total} connected${severity}`;
}

export function hostMonitorSidebarSummary(
  dashboard: Dashboard | null,
  isLoading: boolean,
  hasError: boolean,
): HostMonitorSidebarSummary {
  return {
    counts: countsFor(dashboard),
    status: triggerStatus(dashboard, isLoading, hasError),
    label: triggerLabel(dashboard, isLoading, hasError),
  };
}

function machineTone(machine: MachineRow): HostMonitorTriggerStatus {
  if (machine.host.status === "disconnected") return "offline";
  if (machine.sampleState === "sampling") return "loading";
  if (
    machine.sampleState === "stale" ||
    machine.sampleState === "error"
  ) {
    return "attention";
  }
  if (machine.health === "critical") return "critical";
  if (machine.health === "attention") return "attention";
  return "healthy";
}

function healthLabel(machine: MachineRow): string {
  if (machine.sampleState === "sampling") return "Sampling";
  if (machine.sampleState === "stale") return "Stale reading";
  if (machine.sampleState === "error") return "Last known";
  const labels: Record<MachineRow["health"], string> = {
    healthy: "Healthy",
    attention: "Attention",
    critical: "Critical",
    offline: "Offline",
    unavailable: "Unavailable",
  };
  return labels[machine.health];
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function compactMetric(
  label: string,
  percent: number | null,
  tone: ThresholdTone,
): HTMLSpanElement {
  const metric = element("span", "host-monitor-sidebar__compact-metric");
  const value = element(
    "strong",
    "host-monitor-sidebar__compact-metric-value",
    formatPercent(percent),
  );
  value.dataset.tone = tone;
  metric.append(
    element("span", "host-monitor-sidebar__compact-metric-label", label),
    value,
  );
  metric.setAttribute(
    "aria-label",
    `${label} ${formatPercent(percent)}, ${thresholdToneAccessibleLabel(tone)} for this reading`,
  );
  return metric;
}

function compactHostRow(
  machine: MachineRow,
  thresholds: HealthThresholds,
): HTMLLIElement {
  const row = element("li", "host-monitor-sidebar__host");
  const dot = element("span", "host-monitor-sidebar__host-status");
  dot.setAttribute("aria-hidden", "true");
  const identity = element("span", "host-monitor-sidebar__host-identity");
  const snapshot = machine.snapshot;
  identity.append(element("strong", undefined, machine.host.name));
  if (snapshot === null) {
    identity.append(
      element(
        "span",
        undefined,
        machine.host.status === "connected"
          ? "Waiting for telemetry"
          : "No live telemetry",
      ),
    );
  } else {
    const tones = hostMonitorSidebarMetricTones(
      snapshot.cpu.usagePercent,
      snapshot.memory.usagePercent,
      machine.sampleState === "fresh",
      thresholds,
    );
    const metrics = element(
      "span",
      "host-monitor-sidebar__compact-metrics",
    );
    metrics.append(
      compactMetric("CPU", snapshot.cpu.usagePercent, tones.cpu),
      element("span", "host-monitor-sidebar__compact-separator", "·"),
      compactMetric("RAM", snapshot.memory.usagePercent, tones.memory),
    );
    identity.append(metrics);
  }
  const state = element("span", "host-monitor-sidebar__host-state");
  state.append(
    element(
      "strong",
      undefined,
      machine.host.status === "connected" ? "Connected" : "Disconnected",
    ),
    element("span", undefined, healthLabel(machine)),
  );
  row.append(dot, identity, state);
  return row;
}

type HostMonitorNetworkDirection = "down" | "up";

interface FloatingMetricOptions {
  tone?: ThresholdTone;
  direction?: HostMonitorNetworkDirection;
}

function floatingMetric(
  label: string,
  value: string,
  options: FloatingMetricOptions = {},
): HTMLSpanElement {
  const metric = element("span", "host-monitor-sidebar__metric");
  const metricValue = element(
    "strong",
    "host-monitor-sidebar__metric-value",
    value,
  );
  if (options.tone !== undefined) metricValue.dataset.tone = options.tone;
  if (options.direction !== undefined) {
    metric.classList.add("host-monitor-sidebar__metric--network");
    metric.dataset.networkDirection = options.direction;
  }
  metric.append(
    element("span", "host-monitor-sidebar__metric-label", label),
    metricValue,
  );
  return metric;
}

function floatingHostRow(
  machine: MachineRow,
  thresholds: HealthThresholds,
): HTMLLIElement {
  const row = element(
    "li",
    "host-monitor-sidebar__host host-monitor-sidebar__host--floating",
  );
  const top = element("div", "host-monitor-sidebar__host-top");
  const identity = element("span", "host-monitor-sidebar__host-name");
  const dot = element("span", "host-monitor-sidebar__host-status");
  dot.setAttribute("aria-hidden", "true");
  identity.append(dot, element("strong", undefined, machine.host.name));
  top.append(
    identity,
    element("span", "host-monitor-sidebar__health", healthLabel(machine)),
  );

  const snapshot = machine.snapshot;
  const cpuPercent = snapshot?.cpu.usagePercent ?? null;
  const memoryPercent = snapshot?.memory.usagePercent ?? null;
  const cpu = formatPercent(cpuPercent);
  const memory = formatPercent(memoryPercent);
  const tones = hostMonitorSidebarMetricTones(
    cpuPercent,
    memoryPercent,
    machine.sampleState === "fresh",
    thresholds,
  );
  const network = networkRateSummary(
    snapshot?.network.receiveBytesPerSecond ?? null,
    snapshot?.network.sendBytesPerSecond ?? null,
  );
  const metrics = element("div", "host-monitor-sidebar__metrics");
  metrics.setAttribute(
    "aria-label",
    `CPU ${cpu}, ${thresholdToneAccessibleLabel(tones.cpu)} for this reading; RAM ${memory}, ${thresholdToneAccessibleLabel(tones.memory)} for this reading; ${network.accessibleText}`,
  );
  metrics.append(
    floatingMetric("CPU", cpu, { tone: tones.cpu }),
    floatingMetric("RAM", memory, { tone: tones.memory }),
    floatingMetric(
      "Down",
      `↓ ${network.receive}`,
      network.available ? { direction: "down" } : {},
    ),
    floatingMetric(
      "Up",
      `↑ ${network.send}`,
      network.available ? { direction: "up" } : {},
    ),
  );
  row.append(top, metrics);
  return row;
}

function summaryCell(label: string, value: string): HTMLDivElement {
  const cell = element("div", "host-monitor-sidebar__summary-cell");
  cell.append(
    element("strong", undefined, value),
    element("span", undefined, label),
  );
  return cell;
}

function loadingBody(): HTMLDivElement {
  const body = element("div", "host-monitor-sidebar__loading");
  body.setAttribute("role", "status");
  body.setAttribute("aria-label", "Loading host metrics");
  for (let index = 0; index < 3; index += 1) {
    const row = element("span", "host-monitor-sidebar__loading-row");
    row.append(
      element("span", "host-monitor-sidebar__skeleton host-monitor-sidebar__skeleton--dot"),
      element("span", "host-monitor-sidebar__skeleton host-monitor-sidebar__skeleton--name"),
      element("span", "host-monitor-sidebar__skeleton host-monitor-sidebar__skeleton--state"),
    );
    body.append(row);
  }
  return body;
}

function emptyBody(): HTMLDivElement {
  const body = element("div", "host-monitor-sidebar__empty");
  body.append(
    element("strong", undefined, "No hosts enrolled"),
    element("p", undefined, "Enrolled hosts will appear here automatically."),
  );
  return body;
}

function errorBody(retry: () => void): HTMLDivElement {
  const body = element("div", "host-monitor-sidebar__error");
  body.setAttribute("role", "alert");
  body.append(
    element("strong", undefined, "Host metrics are unavailable"),
    element("p", undefined, "Couldn’t load host metrics. Try again."),
  );
  const button = element("button", "host-monitor-sidebar__retry", "Try again");
  button.type = "button";
  button.dataset.hostMonitorFocus = "retry";
  button.addEventListener("click", retry);
  body.append(button);
  return body;
}

function dashboardBody(
  dashboard: Dashboard,
  mode: Exclude<HostMonitorSurfaceMode, "closed">,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const counts = countsFor(dashboard);
  const summary = element("div", "host-monitor-sidebar__summary");
  summary.append(
    summaryCell("Connected", `${counts.connected}/${counts.total}`),
    summaryCell("Attention", String(counts.attention)),
    summaryCell("Offline", String(counts.offline)),
  );
  fragment.append(summary);
  const list = element("ul", "host-monitor-sidebar__hosts");
  const rank: Record<HostMonitorTriggerStatus, number> = {
    error: 0,
    critical: 1,
    attention: 2,
    offline: 3,
    loading: 4,
    healthy: 5,
    empty: 6,
  };
  const ordered = [...dashboard.machines].sort(
    (left, right) => rank[machineTone(left)] - rank[machineTone(right)],
  );
  const visible = mode === "floating" ? ordered : ordered.slice(0, 5);
  for (const machine of visible) {
    list.append(
      mode === "floating"
        ? floatingHostRow(machine, dashboard.thresholds)
        : compactHostRow(machine, dashboard.thresholds),
    );
  }
  fragment.append(list);
  if (mode === "popover" && ordered.length > 5) {
    fragment.append(
      element(
        "p",
        "host-monitor-sidebar__more",
        `+${ordered.length - 5} more ${ordered.length - 5 === 1 ? "host" : "hosts"} on the full page`,
      ),
    );
  }
  return fragment;
}

function isDashboard(value: unknown): value is Dashboard {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<Dashboard>;
  return (
    Array.isArray(candidate.machines) &&
    isHealthThresholds(candidate.thresholds)
  );
}

function findFooterTrigger(pluginId: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(
    `[data-testid="plugin-sidebar-footer-action-${pluginId}-${FOOTER_ACTION_ID}"]`,
  );
}

function triggerCanAnchor(button: HTMLButtonElement): boolean {
  if (!button.isConnected) return false;
  if (button.closest('[hidden], [aria-hidden="true"]') !== null) return false;
  if (
    button.closest('[data-collapsible="offcanvas"][data-state="collapsed"]') !==
    null
  ) {
    return false;
  }
  const style = window.getComputedStyle(button);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return hostMonitorTriggerRectIsVisible(
    button.getBoundingClientRect(),
    window.innerWidth,
    window.innerHeight,
  );
}

function clearTrigger(button: HTMLButtonElement): void {
  button.removeAttribute(TRIGGER_ATTRIBUTE);
  button.removeAttribute("data-host-monitor-status");
  button.removeAttribute("data-host-monitor-threshold-colors");
  button.removeAttribute("data-host-monitor-dragging");
  button.removeAttribute("aria-expanded");
  button.removeAttribute("aria-haspopup");
  button.removeAttribute("aria-controls");
  button.setAttribute("aria-label", "Host Monitor");
  button.title = "Host Monitor";
}

function findNavButton(pluginId: string): HTMLButtonElement | null {
  const container = document.querySelector<HTMLElement>(NAV_ITEMS_SELECTOR);
  if (container === null) return null;
  const asset = container.querySelector<HTMLElement>(
    `[data-plugin-icon-asset^="/api/v1/plugins/${pluginId}/assets/icon?"]`,
  );
  const assetButton = asset?.closest<HTMLButtonElement>("button");
  if (assetButton !== undefined && assetButton !== null) return assetButton;
  return (
    Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.trim() === "Host Monitor",
    ) ?? null
  );
}

function directChildContaining(
  container: HTMLElement,
  descendant: HTMLElement,
): HTMLElement | null {
  let candidate = descendant;
  while (
    candidate.parentElement !== null &&
    candidate.parentElement !== container
  ) {
    candidate = candidate.parentElement;
  }
  return candidate.parentElement === container ? candidate : null;
}

export function hostMonitorPanelPath(
  pluginId: string,
  hostId: string | null = null,
): string {
  const root = `/plugins/${pluginId}/machines`;
  return hostId === null
    ? root
    : `${root}/host/${encodeURIComponent(hostId)}`;
}

export function hostIdFromFleetSubPath(subPath: string): string | null {
  const match = /^host\/([^/]+)$/u.exec(subPath);
  if (match === null) return null;
  try {
    const value = decodeURIComponent(match[1] ?? "").trim();
    return value.length > 0 && value.length <= 128 ? value : null;
  } catch {
    return null;
  }
}

function navigateToHostMonitor(
  pluginId: string,
  hostId: string | null = null,
): void {
  const event = new CustomEvent(NAV_EVENT, {
    cancelable: true,
    detail: { pluginId, hostId },
  });
  const unhandled = window.dispatchEvent(event);
  if (unhandled) window.location.assign(hostMonitorPanelPath(pluginId, hostId));
}

export function toggleHostMonitorPopover(): void {
  const event = new Event(TOGGLE_EVENT, { cancelable: true });
  const unhandled = window.dispatchEvent(event);
  if (unhandled) window.location.assign("/plugins/host-monitor/machines");
}

export function mountHostMonitorSidebar(
  pluginId: string,
  signal: AbortSignal,
): () => void {
  let trigger: HTMLButtonElement | null = null;
  let dashboard: Dashboard | null = null;
  let lastError: string | null = null;
  let sidebarPreferences = cachedSidebarPreferences();
  let isLoading = false;
  let isLoadingPreferences = false;
  let surfaceMode: HostMonitorSurfaceMode = "closed";
  let disposed = false;
  let requestController: AbortController | null = null;
  let preferencesController: AbortController | null = null;
  let nativeOpenInFlight = false;
  let ensureFrame: number | null = null;
  let positionFrame: number | null = null;
  let dragFrame: number | null = null;
  let refreshTimer: number | null = null;
  let suppressionTimer: number | null = null;
  let focusAfterRender: HostMonitorFocusTarget | null = null;
  let requestedFocus: HostMonitorFocusTarget | null = null;
  let floatingPosition = cachedFloatingPosition();
  let pendingDropPoint: HostMonitorPoint | null = null;
  let drag: DragGesture | null = null;
  let suppressPointerClick = false;
  const lifecycleController = new AbortController();
  const lifecycleSignal = AbortSignal.any([
    signal,
    lifecycleController.signal,
  ]);
  const markedRows = new Set<HTMLElement>();
  const markedTriggers = new Set<HTMLButtonElement>();

  const surface = element(
    "section",
    "host-monitor-sidebar__popover host-monitor-sidebar__surface",
  );
  surface.id = SURFACE_ID;
  surface.hidden = true;
  surface.tabIndex = -1;
  surface.setAttribute("role", "dialog");
  surface.setAttribute("aria-modal", "false");
  surface.dataset.hostMonitorThresholdColors = String(
    sidebarPreferences.sidebarThresholdColors,
  );
  const ghost = element("div", "host-monitor-sidebar__drag-ghost");
  ghost.hidden = true;
  ghost.setAttribute("aria-hidden", "true");
  ghost.append(
    element("strong", undefined, "Host Monitor"),
    element("span", undefined, "Drop to float"),
  );
  document.body.append(surface, ghost);

  function currentViewport(): HostMonitorViewport {
    const visual = window.visualViewport;
    return visual === null
      ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
      : {
          left: visual.offsetLeft,
          top: visual.offsetTop,
          width: visual.width,
          height: visual.height,
        };
  }

  async function claimNativeOpen(): Promise<void> {
    if (disposed || nativeOpenInFlight || !isBbDesktopWindow(window)) return;
    nativeOpenInFlight = true;
    try {
      const request = hostMonitorNativeOpenRpcRequest(pluginId);
      const response = await fetch(request.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: request.body,
        credentials: "same-origin",
        signal: lifecycleSignal,
      });
      const payload = (await response.json()) as RpcEnvelope<unknown>;
      if (
        response.ok &&
        payload.ok &&
        typeof payload.result === "object" &&
        payload.result !== null &&
        "open" in payload.result &&
        payload.result.open === true
      ) {
        const hostId = "hostId" in payload.result &&
          typeof payload.result.hostId === "string"
          ? payload.result.hostId
          : null;
        navigateToHostMonitor(pluginId, hostId);
      }
    } catch {
      // The native bridge is opportunistic; ordinary Host Monitor UI remains usable.
    } finally {
      nativeOpenInFlight = false;
    }
  }

  function measuredFloatingSize(): HostMonitorFloatingSize {
    const viewport = currentViewport();
    const rect = surface.getBoundingClientRect();
    return {
      width: rect.width,
      height: Math.min(rect.height, Math.max(0, viewport.height - 16)),
    };
  }

  function applyFloatingPosition(
    wanted: HostMonitorFloatingPosition,
    persist: boolean,
  ): void {
    floatingPosition = clampHostMonitorFloatingPosition(
      wanted,
      measuredFloatingSize(),
      currentViewport(),
    );
    surface.style.left = `${floatingPosition.left}px`;
    surface.style.top = `${floatingPosition.top}px`;
    surface.style.bottom = "auto";
    if (persist) cacheFloatingPosition(floatingPosition);
  }

  function defaultFloatingPosition(
    size: HostMonitorFloatingSize,
    viewport: HostMonitorViewport,
  ): HostMonitorFloatingPosition {
    if (trigger !== null && triggerCanAnchor(trigger)) {
      const rect = trigger.getBoundingClientRect();
      if (rect.right + 8 + size.width + 8 <= viewport.left + viewport.width) {
        return clampHostMonitorFloatingPosition(
          { left: rect.right + 8, top: rect.top - 16 },
          size,
          viewport,
        );
      }
    }
    return clampHostMonitorFloatingPosition(
      {
        left: viewport.left + (viewport.width - size.width) / 2,
        top: viewport.top + (viewport.height - size.height) / 2,
      },
      size,
      viewport,
    );
  }

  function positionSurface(): void {
    positionFrame = null;
    if (surfaceMode === "closed") return;
    const viewport = currentViewport();
    const availableWidth = Math.max(0, viewport.width - 16);
    if (surfaceMode === "floating") {
      surface.style.width = `${Math.min(FLOATING_WIDTH_PX, availableWidth)}px`;
      surface.style.maxHeight = `${Math.max(0, viewport.height - 16)}px`;
      const size = measuredFloatingSize();
      let wanted = floatingPosition;
      const commitsDrop = pendingDropPoint !== null;
      if (pendingDropPoint !== null) {
        wanted = hostMonitorFloatingDropPosition(
          pendingDropPoint,
          size,
          viewport,
        );
        pendingDropPoint = null;
      }
      applyFloatingPosition(
        wanted ?? defaultFloatingPosition(size, viewport),
        commitsDrop,
      );
      return;
    }
    if (trigger === null || !triggerCanAnchor(trigger)) {
      closeSurface(false);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(320, availableWidth);
    surface.style.width = `${width}px`;
    surface.style.maxHeight = `${Math.max(0, viewport.height - 16)}px`;
    surface.style.left = `${Math.min(
      Math.max(viewport.left + 8, rect.left),
      viewport.left + viewport.width - width - 8,
    )}px`;
    const height = surface.offsetHeight;
    const above = rect.top - height - 8;
    const top =
      above >= viewport.top + 8
        ? above
        : Math.min(
            Math.max(viewport.top + 8, rect.bottom + 8),
            viewport.top + viewport.height - height - 8,
          );
    surface.style.top = `${Math.max(viewport.top + 8, top)}px`;
    surface.style.bottom = "auto";
  }

  function schedulePosition(): void {
    if (positionFrame !== null || disposed) return;
    positionFrame = window.requestAnimationFrame(positionSurface);
  }

  function scheduleDashboardRefresh(): void {
    if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    refreshTimer = null;
    if (disposed) return;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      void load("dashboard");
    }, hostMonitorSidebarRefreshDelay(
      surfaceMode,
      dashboard?.refreshIntervalMs ?? null,
    ));
  }

  function updateTrigger(): void {
    if (trigger === null) return;
    const summary = hostMonitorSidebarSummary(
      dashboard,
      isLoading,
      lastError !== null,
    );
    trigger.dataset.hostMonitorStatus = summary.status;
    trigger.dataset.hostMonitorThresholdColors = String(
      sidebarPreferences.sidebarThresholdColors,
    );
    trigger.setAttribute(
      "aria-expanded",
      String(surfaceMode !== "closed"),
    );
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-controls", SURFACE_ID);
    const state =
      surfaceMode === "floating"
        ? " · Floating window open"
        : " · Drag to open floating monitor";
    trigger.setAttribute("aria-label", `${summary.label}${state}`);
    trigger.title = `${summary.label}${state}`;
  }

  function render(): void {
    updateTrigger();
    if (surfaceMode === "closed") {
      surface.dataset.mode = "closed";
      surface.hidden = true;
      surface.replaceChildren();
      return;
    }
    const hadFocus = surface.contains(document.activeElement);
    const activeFocus =
      document.activeElement instanceof HTMLElement && hadFocus
        ? document.activeElement.dataset.hostMonitorFocus ?? null
        : null;
    surface.hidden = false;
    surface.dataset.mode = surfaceMode;
    if (surfaceMode === "popover") surface.style.removeProperty("z-index");
    surface.setAttribute(
      "aria-label",
      surfaceMode === "floating"
        ? "Host Monitor floating metrics"
        : "Host Monitor metrics summary",
    );

    const header = element("header", "host-monitor-sidebar__header");
    const heading = element("div", "host-monitor-sidebar__heading");
    if (surfaceMode === "floating") {
      heading.tabIndex = 0;
      heading.setAttribute("role", "group");
      heading.setAttribute("aria-roledescription", "window move handle");
      heading.dataset.hostMonitorWindowHandle = "";
      heading.dataset.hostMonitorFocus = "move";
      heading.setAttribute(
        "aria-label",
        "Move Host Monitor window. Use arrow keys to reposition.",
      );
      heading.title = "Drag or use arrow keys to move";
    }
    const counts = countsFor(dashboard);
    const headingSummary = element(
      "span",
      undefined,
      dashboard === null
        ? isLoading
          ? "Checking metrics on every enrolled host"
          : lastError === null
            ? "Fleet heartbeat"
            : "Metrics unavailable"
        : surfaceMode === "floating"
          ? `${counts.connected} of ${counts.total} connected · drag to move`
          : `${counts.connected} of ${counts.total} connected`,
    );
    heading.append(
      element("strong", undefined, "Host Monitor"),
      headingSummary,
    );
    const actions = element("div", "host-monitor-sidebar__header-actions");
    if (surfaceMode === "popover") {
      const float = element("button", "host-monitor-sidebar__icon-button");
      float.type = "button";
      float.dataset.hostMonitorFocus = "float";
      float.setAttribute("aria-label", "Float monitor");
      float.title = "Float monitor";
      float.append(floatGlyph());
      float.addEventListener("click", () => openFloating(null, true));
      actions.append(float);
    }
    const refresh = element("button", "host-monitor-sidebar__icon-button");
    refresh.type = "button";
    refresh.dataset.loading = String(isLoading);
    refresh.dataset.hostMonitorFocus = "refresh";
    refresh.setAttribute("aria-disabled", String(isLoading));
    refresh.setAttribute(
      "aria-label",
      isLoading ? "Loading host metrics" : "Refresh host metrics",
    );
    refresh.title = "Refresh host metrics";
    refresh.append(refreshGlyph());
    refresh.addEventListener("click", () => {
      if (!isLoading) void load("refresh", "refresh");
    });
    const close = element("button", "host-monitor-sidebar__icon-button");
    close.type = "button";
    close.dataset.hostMonitorFocus = "close";
    close.setAttribute(
      "aria-label",
      surfaceMode === "floating"
        ? "Close floating Host Monitor"
        : "Close Host Monitor summary",
    );
    close.title = "Close";
    close.append(closeGlyph());
    close.addEventListener("click", () => closeSurface(true));
    actions.append(refresh, close);
    header.append(heading, actions);

    const content = element("div", "host-monitor-sidebar__content");
    if (dashboard === null) {
      content.append(
        isLoading
          ? loadingBody()
          : lastError === null
            ? emptyBody()
            : errorBody(() => void load("dashboard", "retry")),
      );
    } else if (dashboard.machines.length === 0) {
      content.append(emptyBody());
    } else {
      if (lastError !== null) {
        const notice = element(
          "p",
          "host-monitor-sidebar__notice",
          "Couldn’t refresh metrics. Showing last-known host metrics.",
        );
        notice.setAttribute("role", "status");
        content.append(notice);
      }
      content.append(dashboardBody(dashboard, surfaceMode));
    }

    const footer = element("footer", "host-monitor-sidebar__footer");
    const open = element(
      "button",
      "host-monitor-sidebar__open",
      "Open Host Monitor",
    );
    open.type = "button";
    open.dataset.hostMonitorFocus = "open";
    open.append(arrowGlyph());
    open.addEventListener("click", () => {
      if (surfaceMode === "popover") closeSurface(false);
      navigateToHostMonitor(pluginId);
    });
    footer.append(open);
    surface.replaceChildren(header, content, footer);
    schedulePosition();

    const focusKey = focusAfterRender ?? requestedFocus ?? activeFocus;
    focusAfterRender = null;
    requestedFocus = null;
    if (focusKey !== null || hadFocus) {
      queueMicrotask(() => {
        if (surfaceMode === "closed" || disposed) return;
        const requested =
          focusKey === null
            ? null
            : surface.querySelector<HTMLElement>(
                `[data-host-monitor-focus="${focusKey}"]`,
              );
        const fallback = surface.querySelector<HTMLElement>(
          '[data-host-monitor-focus="close"]',
        );
        (requested ?? fallback)?.focus();
      });
    }
  }

  function closeSurface(restoreFocus: boolean): void {
    if (surfaceMode === "closed") return;
    if (drag?.source === "window") cancelDrag();
    surfaceMode = "closed";
    pendingDropPoint = null;
    render();
    scheduleDashboardRefresh();
    if (restoreFocus) {
      const candidate = trigger;
      queueMicrotask(() => {
        if (
          !disposed &&
          candidate?.isConnected === true &&
          triggerCanAnchor(candidate)
        ) {
          candidate.focus();
        }
      });
    }
  }

  function openPopover(): boolean {
    if (surfaceMode === "popover") return true;
    if (surfaceMode === "floating") {
      raiseFloating(true);
      return true;
    }
    if (trigger === null || !triggerCanAnchor(trigger)) return false;
    surfaceMode = "popover";
    focusAfterRender = "close";
    render();
    scheduleDashboardRefresh();
    if (dashboard === null && !isLoading) void load("dashboard");
    return true;
  }

  function openFloating(
    dropPoint: HostMonitorPoint | null,
    focusMoveHandle: boolean,
  ): void {
    if (surfaceMode === "floating" && dropPoint === null) {
      raiseFloating(true);
      return;
    }
    if (dropPoint !== null) pendingDropPoint = dropPoint;
    surfaceMode = "floating";
    focusAfterRender = focusMoveHandle ? "move" : null;
    render();
    scheduleDashboardRefresh();
    raiseFloating(false);
    if (dashboard === null && !isLoading) void load("dashboard");
  }

  function raiseFloating(focus: boolean): void {
    if (surfaceMode !== "floating") return;
    nextFloatingZIndex += 1;
    surface.style.zIndex = String(nextFloatingZIndex);
    if (focus) surface.focus({ preventScroll: true });
  }

  async function load(
    kind: HostMonitorSidebarRequestKind,
    focusTarget: HostMonitorFocusTarget | null = null,
  ): Promise<void> {
    if (isLoading || disposed) return;
    requestedFocus = focusTarget;
    isLoading = true;
    lastError = null;
    render();
    requestController = new AbortController();
    const requestSignal = AbortSignal.any([
      lifecycleSignal,
      requestController.signal,
    ]);
    try {
      const request = hostMonitorSidebarRpcRequest(pluginId, kind);
      const response = await fetch(request.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: request.body,
        credentials: "same-origin",
        signal: requestSignal,
      });
      const payload = (await response.json()) as RpcEnvelope<unknown>;
      if (
        !response.ok ||
        !payload.ok ||
        payload.result === undefined ||
        !isDashboard(payload.result)
      ) {
        throw new Error("Host metrics are unavailable.");
      }
      dashboard = payload.result;
      sidebarPreferences = {
        ...sidebarPreferences,
        thresholds: dashboard.thresholds,
      };
      cacheSidebarPreferences(sidebarPreferences);
    } catch {
      if (!requestSignal.aborted) lastError = "Host metrics are unavailable.";
    } finally {
      requestController = null;
      isLoading = false;
      if (!disposed) {
        render();
        scheduleDashboardRefresh();
      }
    }
  }

  async function syncPreferences(): Promise<void> {
    if (isLoadingPreferences || disposed) return;
    isLoadingPreferences = true;
    const controller = new AbortController();
    preferencesController = controller;
    const requestSignal = AbortSignal.any([
      lifecycleSignal,
      controller.signal,
    ]);
    try {
      const request = hostMonitorSidebarPreferencesRpcRequest(pluginId);
      const response = await fetch(request.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: request.body,
        credentials: "same-origin",
        signal: requestSignal,
      });
      const payload = (await response.json()) as RpcEnvelope<unknown>;
      if (!response.ok || !payload.ok || payload.result === undefined) return;
      const next = resolveHostMonitorSidebarPreferences(
        payload.result,
        sidebarPreferences,
      );
      cacheSidebarPreferences(next);
      const colorsChanged =
        next.sidebarThresholdColors !==
        sidebarPreferences.sidebarThresholdColors;
      const thresholdsChanged = !sameHealthThresholds(
        next.thresholds,
        sidebarPreferences.thresholds,
      );
      if (!colorsChanged && !thresholdsChanged) return;
      sidebarPreferences = next;
      if (thresholdsChanged && dashboard !== null) {
        dashboard = { ...dashboard, thresholds: next.thresholds };
      }
      surface.dataset.hostMonitorThresholdColors = String(
        next.sidebarThresholdColors,
      );
      render();
      if (thresholdsChanged) void load("dashboard");
    } catch {
      // Preserve the last-known preference while bb reconnects.
    } finally {
      if (preferencesController === controller) preferencesController = null;
      isLoadingPreferences = false;
    }
  }

  function showGhost(point: HostMonitorPoint): void {
    const viewport = currentViewport();
    const size = {
      width: Math.min(208, Math.max(0, viewport.width - 16)),
      height: Math.min(72, Math.max(0, viewport.height - 16)),
    };
    const position = hostMonitorFloatingDropPosition(point, size, viewport);
    ghost.style.width = `${size.width}px`;
    ghost.style.height = `${size.height}px`;
    ghost.style.zIndex = String(nextFloatingZIndex + 1);
    ghost.style.transform = `translate3d(${position.left}px, ${position.top}px, 0)`;
    ghost.hidden = false;
  }

  function releaseCapture(gesture: DragGesture): void {
    try {
      if (gesture.captureTarget?.hasPointerCapture(gesture.pointerId)) {
        gesture.captureTarget.releasePointerCapture(gesture.pointerId);
      }
    } catch {
      // A remounted trigger may have already lost capture.
    }
  }

  function cancelDrag(): void {
    if (dragFrame !== null) window.cancelAnimationFrame(dragFrame);
    dragFrame = null;
    if (drag !== null) releaseCapture(drag);
    drag = null;
    ghost.hidden = true;
    surface.removeAttribute("data-dragging");
    for (const button of markedTriggers) {
      button.removeAttribute("data-host-monitor-dragging");
    }
  }

  function flushDrag(): void {
    dragFrame = null;
    if (drag === null || !drag.engaged) return;
    if (drag.source === "trigger") {
      showGhost(drag.latest);
      return;
    }
    applyFloatingPosition(
      {
        left: drag.latest.x - drag.grabOffset.x,
        top: drag.latest.y - drag.grabOffset.y,
      },
      false,
    );
  }

  function scheduleDrag(): void {
    if (dragFrame === null) dragFrame = window.requestAnimationFrame(flushDrag);
  }

  function suppressNextPointerClick(): void {
    suppressPointerClick = true;
    if (suppressionTimer !== null) window.clearTimeout(suppressionTimer);
    suppressionTimer = window.setTimeout(() => {
      suppressPointerClick = false;
      suppressionTimer = null;
    }, 0);
  }

  function handleTriggerClick(event: MouseEvent): void {
    if (suppressPointerClick && event.detail > 0) {
      suppressPointerClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (surfaceMode === "floating") raiseFloating(true);
    else if (surfaceMode === "popover") closeSurface(true);
    else if (!openPopover()) navigateToHostMonitor(pluginId);
  }

  function handleTriggerPointerDown(event: PointerEvent): void {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      drag !== null
    ) {
      return;
    }
    const captureTarget = event.currentTarget as HTMLButtonElement;
    drag = {
      pointerId: event.pointerId,
      source: "trigger",
      start: { x: event.clientX, y: event.clientY },
      latest: { x: event.clientX, y: event.clientY },
      grabOffset: { x: 24, y: 16 },
      engaged: false,
      captureTarget,
    };
    try {
      captureTarget.setPointerCapture(event.pointerId);
    } catch {
      // Window-level listeners still finish or cancel the gesture.
    }
  }

  function handleSurfacePointerDown(event: PointerEvent): void {
    if (
      surfaceMode !== "floating" ||
      !event.isPrimary ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      drag !== null ||
      !(event.target instanceof Element) ||
      event.target.closest("[data-host-monitor-window-handle]") === null
    ) {
      return;
    }
    const rect = surface.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      source: "window",
      start: { x: event.clientX, y: event.clientY },
      latest: { x: event.clientX, y: event.clientY },
      grabOffset: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      engaged: false,
      captureTarget: surface,
    };
    try {
      surface.setPointerCapture(event.pointerId);
    } catch {
      // Global listeners still complete the gesture when capture is unavailable.
    }
    raiseFloating(false);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    drag.latest = { x: event.clientX, y: event.clientY };
    if (
      !drag.engaged &&
      !hostMonitorDragThresholdExceeded(drag.start, drag.latest)
    ) {
      return;
    }
    if (!drag.engaged) {
      drag.engaged = true;
      if (drag.source === "trigger") {
        if (surfaceMode === "popover") closeSurface(false);
        drag.captureTarget?.setAttribute("data-host-monitor-dragging", "true");
        try {
          drag.captureTarget?.setPointerCapture(event.pointerId);
        } catch {
          // The global listener remains sufficient after a sidebar remount.
        }
      } else {
        surface.dataset.dragging = "true";
      }
    }
    event.preventDefault();
    scheduleDrag();
  }

  function finishPointer(event: PointerEvent, cancelled: boolean): void {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const gesture = drag;
    gesture.latest = { x: event.clientX, y: event.clientY };
    if (dragFrame !== null) window.cancelAnimationFrame(dragFrame);
    dragFrame = null;
    if (gesture.engaged && !cancelled) {
      if (gesture.source === "trigger") {
        suppressNextPointerClick();
        pendingDropPoint = gesture.latest;
        openFloating(gesture.latest, false);
        schedulePosition();
      } else {
        applyFloatingPosition(
          {
            left: gesture.latest.x - gesture.grabOffset.x,
            top: gesture.latest.y - gesture.grabOffset.y,
          },
          true,
        );
      }
      event.preventDefault();
    }
    releaseCapture(gesture);
    drag = null;
    ghost.hidden = true;
    surface.removeAttribute("data-dragging");
    for (const button of markedTriggers) {
      button.removeAttribute("data-host-monitor-dragging");
    }
  }

  function synchronize(): void {
    ensureFrame = null;
    if (disposed) return;
    const nextTrigger = findFooterTrigger(pluginId);
    if (nextTrigger !== trigger) {
      if (trigger !== null) {
        if (drag?.source === "trigger" && !drag.engaged) cancelDrag();
        trigger.removeEventListener("click", handleTriggerClick, true);
        trigger.removeEventListener(
          "pointerdown",
          handleTriggerPointerDown,
          true,
        );
        clearTrigger(trigger);
        markedTriggers.delete(trigger);
      }
      trigger = nextTrigger;
      if (nextTrigger !== null) {
        markedTriggers.add(nextTrigger);
        nextTrigger.setAttribute(TRIGGER_ATTRIBUTE, "");
        nextTrigger.addEventListener("click", handleTriggerClick, true);
        nextTrigger.addEventListener(
          "pointerdown",
          handleTriggerPointerDown,
          true,
        );
        updateTrigger();
      }
    }
    if (
      surfaceMode === "popover" &&
      (trigger === null || !triggerCanAnchor(trigger))
    ) {
      closeSurface(false);
    } else {
      schedulePosition();
    }
    const navContainer = document.querySelector<HTMLElement>(
      NAV_ITEMS_SELECTOR,
    );
    const navButton = findNavButton(pluginId);
    if (navContainer !== null && navButton !== null) {
      const row = directChildContaining(navContainer, navButton);
      if (row !== null) {
        row.setAttribute(NAV_ROW_ATTRIBUTE, "hidden");
        markedRows.add(row);
      }
    }
  }

  function scheduleSynchronize(): void {
    if (ensureFrame === null && !disposed) {
      ensureFrame = window.requestAnimationFrame(synchronize);
    }
  }

  window.addEventListener(
    TOGGLE_EVENT,
    (event) => {
      event.preventDefault();
      if (surfaceMode === "floating") raiseFloating(true);
      else if (surfaceMode === "popover") closeSurface(true);
      else if (!openPopover()) navigateToHostMonitor(pluginId);
    },
    { signal: lifecycleSignal },
  );
  window.addEventListener(
    NAV_EVENT,
    (event) => {
      event.preventDefault();
      const detail = (event as CustomEvent<unknown>).detail;
      const hostId =
        typeof detail === "object" &&
        detail !== null &&
        "hostId" in detail &&
        typeof detail.hostId === "string"
          ? detail.hostId
          : null;
      if (hostId !== null) {
        window.location.assign(hostMonitorPanelPath(pluginId, hostId));
        return;
      }
      const navButton = findNavButton(pluginId);
      if (navButton !== null) navButton.click();
      else window.location.assign(hostMonitorPanelPath(pluginId));
    },
    { signal: lifecycleSignal },
  );
  surface.addEventListener("pointerdown", handleSurfacePointerDown, {
    signal: lifecycleSignal,
  });
  window.addEventListener("pointermove", handlePointerMove, {
    capture: true,
    signal: lifecycleSignal,
  });
  window.addEventListener(
    "pointerup",
    (event) => finishPointer(event, false),
    { capture: true, signal: lifecycleSignal },
  );
  window.addEventListener(
    "pointercancel",
    (event) => finishPointer(event, true),
    { capture: true, signal: lifecycleSignal },
  );
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (
        surfaceMode === "popover" &&
        event.target instanceof Node &&
        !surface.contains(event.target) &&
        !trigger?.contains(event.target)
      ) {
        closeSurface(false);
      }
    },
    { capture: true, signal: lifecycleSignal },
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        surfaceMode === "floating" &&
        event.target instanceof Element &&
        event.target.closest("[data-host-monitor-window-handle]") !== null &&
        ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)
      ) {
        event.preventDefault();
        event.stopPropagation();
        const amount = event.shiftKey ? 32 : 10;
        const delta = {
          ArrowDown: { left: 0, top: amount },
          ArrowLeft: { left: -amount, top: 0 },
          ArrowRight: { left: amount, top: 0 },
          ArrowUp: { left: 0, top: -amount },
        }[event.key];
        if (delta !== undefined) {
          const rect = surface.getBoundingClientRect();
          const current = floatingPosition ?? { left: rect.left, top: rect.top };
          applyFloatingPosition(
            {
              left: current.left + delta.left,
              top: current.top + delta.top,
            },
            true,
          );
        }
        return;
      }
      if (event.key === "Tab" && surfaceMode === "popover") {
        const controls = Array.from(
          surface.querySelectorAll<HTMLElement>("[data-host-monitor-focus]"),
        ).filter(
          (control) =>
            !(control instanceof HTMLButtonElement && control.disabled) &&
            control.getClientRects().length > 0,
        );
        if (controls.length > 0) {
          const activeIndex = controls.indexOf(
            document.activeElement as HTMLElement,
          );
          const nextIndex = event.shiftKey
            ? activeIndex <= 0
              ? controls.length - 1
              : activeIndex - 1
            : activeIndex === -1 || activeIndex === controls.length - 1
              ? 0
              : activeIndex + 1;
          event.preventDefault();
          event.stopPropagation();
          controls[nextIndex]?.focus();
        }
        return;
      }
      if (
        event.key === "Escape" &&
        (surfaceMode === "popover" ||
          (surfaceMode === "floating" &&
            (surface.contains(document.activeElement) ||
              trigger?.contains(document.activeElement))))
      ) {
        event.preventDefault();
        event.stopPropagation();
        closeSurface(true);
      }
    },
    { capture: true, signal: lifecycleSignal },
  );

  const scheduleAnchorCheck = (): void => {
    scheduleSynchronize();
    schedulePosition();
  };
  window.addEventListener("resize", scheduleAnchorCheck, {
    signal: lifecycleSignal,
  });
  window.visualViewport?.addEventListener("resize", scheduleAnchorCheck, {
    signal: lifecycleSignal,
  });
  window.visualViewport?.addEventListener("scroll", scheduleAnchorCheck, {
    signal: lifecycleSignal,
  });
  document.addEventListener("scroll", scheduleAnchorCheck, {
    capture: true,
    signal: lifecycleSignal,
  });
  document.addEventListener("transitionend", scheduleAnchorCheck, {
    capture: true,
    signal: lifecycleSignal,
  });

  const observer = new MutationObserver((records) => {
    const onlyOwnSurfaceChanged = records.every(
      (record) =>
        record.target === surface ||
        surface.contains(record.target) ||
        record.target === ghost ||
        ghost.contains(record.target),
    );
    if (!onlyOwnSurfaceChanged) scheduleSynchronize();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [
      "aria-hidden",
      "class",
      "data-collapsible",
      "data-state",
      "style",
    ],
    childList: true,
    subtree: true,
  });
  scheduleSynchronize();
  render();
  void load("dashboard");
  void syncPreferences();
  const preferencesInterval = window.setInterval(
    () => void syncPreferences(),
    PREFERENCES_REFRESH_MS,
  );
  const nativeOpenInterval = isBbDesktopWindow(window)
    ? window.setInterval(() => void claimNativeOpen(), NATIVE_OPEN_POLL_MS)
    : null;
  void claimNativeOpen();
  window.addEventListener("focus", () => void syncPreferences(), {
    signal: lifecycleSignal,
  });
  window.addEventListener("blur", cancelDrag, {
    signal: lifecycleSignal,
  });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) cancelDrag();
      else void syncPreferences();
    },
    { signal: lifecycleSignal },
  );

  return () => {
    if (disposed) return;
    disposed = true;
    lifecycleController.abort();
    observer.disconnect();
    cancelDrag();
    if (ensureFrame !== null) window.cancelAnimationFrame(ensureFrame);
    if (positionFrame !== null) window.cancelAnimationFrame(positionFrame);
    if (suppressionTimer !== null) window.clearTimeout(suppressionTimer);
    if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    window.clearInterval(preferencesInterval);
    if (nativeOpenInterval !== null) window.clearInterval(nativeOpenInterval);
    requestController?.abort();
    preferencesController?.abort();
    for (const row of markedRows) row.removeAttribute(NAV_ROW_ATTRIBUTE);
    for (const button of markedTriggers) {
      button.removeEventListener("click", handleTriggerClick, true);
      button.removeEventListener(
        "pointerdown",
        handleTriggerPointerDown,
        true,
      );
      clearTrigger(button);
    }
    markedRows.clear();
    markedTriggers.clear();
    surface.remove();
    ghost.remove();
    trigger = null;
  };
}
