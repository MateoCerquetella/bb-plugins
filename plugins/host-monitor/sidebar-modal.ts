export const HOST_MONITOR_TOGGLE_EVENT = "host-monitor:toggle-mini-modal";
export const HOST_MONITOR_PAGE_PATH = "/plugins/host-monitor/host-monitor";
export const HOST_MONITOR_NAV_ROW_SELECTOR = '[data-sidebar-navigation-item="host-monitor/host-monitor"]';
export const HOST_MONITOR_FOOTER_SELECTOR = '[data-testid="plugin-sidebar-footer-action-host-monitor-host-monitor"]';
export const MINI_MODAL_REFRESH_MS = 10_000;
export const MINI_MODAL_MACHINE_LIMIT = 128;
export const DEFAULT_MINI_MODAL_THRESHOLD = 90;

export type MiniModalMachine = {
  id: string;
  name: string;
  state: string;
  cpuPercent: number | null;
  ramPercent: number | null;
  diskPercent: number | null;
};

export type MiniModalFleet = {
  connected: number;
  total: number;
  thresholds: { cpu: number; ram: number };
  machines: MiniModalMachine[];
};

type FleetEnvelope = { ok?: unknown; result?: unknown };

function boundedText(value: unknown, fallback: string, max = 160): string {
  return typeof value === "string" && value.trim() !== "" ? value.slice(0, max) : fallback;
}

function finitePercent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export function parseMiniModalFleet(value: unknown): MiniModalFleet | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const envelope = value as FleetEnvelope;
  if (envelope.ok !== true || typeof envelope.result !== "object" || envelope.result === null || Array.isArray(envelope.result)) return null;
  const fleet = envelope.result as Record<string, unknown>;
  if (!Array.isArray(fleet.machines)) return null;
  const thresholds = typeof fleet.thresholds === "object" && fleet.thresholds !== null && !Array.isArray(fleet.thresholds)
    ? fleet.thresholds as Record<string, unknown>
    : {};
  const machines: MiniModalMachine[] = [];
  for (const raw of fleet.machines.slice(0, MINI_MODAL_MACHINE_LIMIT)) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const machine = raw as Record<string, unknown>;
    const host = typeof machine.host === "object" && machine.host !== null && !Array.isArray(machine.host)
      ? machine.host as Record<string, unknown>
      : null;
    if (host === null || typeof host.id !== "string" || host.id === "") continue;
    const snapshot = typeof machine.snapshot === "object" && machine.snapshot !== null && !Array.isArray(machine.snapshot)
      ? machine.snapshot as Record<string, unknown>
      : null;
    const cpu = snapshot?.cpu as Record<string, unknown> | undefined;
    const memory = snapshot?.memory as Record<string, unknown> | undefined;
    const disk = snapshot?.disk as Record<string, unknown> | undefined;
    machines.push({
      id: host.id.slice(0, 256),
      name: boundedText(host.name, host.id, 120),
      state: boundedText(machine.sampleState, host.status === "disconnected" ? "offline" : "sampling", 24),
      cpuPercent: finitePercent(cpu?.usagePercent),
      ramPercent: finitePercent(memory?.usagePercent),
      diskPercent: finitePercent(disk?.usagePercent),
    });
  }
  const connected = typeof fleet.connected === "number" && Number.isInteger(fleet.connected) && fleet.connected >= 0 ? fleet.connected : machines.filter((machine) => machine.state !== "offline").length;
  const total = typeof fleet.total === "number" && Number.isInteger(fleet.total) && fleet.total >= 0 ? fleet.total : machines.length;
  return {
    connected,
    total,
    thresholds: {
      cpu: finitePercent(thresholds.cpu) ?? DEFAULT_MINI_MODAL_THRESHOLD,
      ram: finitePercent(thresholds.ram) ?? DEFAULT_MINI_MODAL_THRESHOLD,
    },
    machines,
  };
}

export function miniMetricPresentation(
  label: string,
  value: number | null,
  threshold: number | null,
  isFresh: boolean,
): { guide: "normal" | "over" | "unavailable" | "neutral"; accessibleLabel: string } {
  if (value === null) return { guide: "unavailable", accessibleLabel: `${label} unavailable` };
  const reading = `${label} ${value.toFixed(1)}%`;
  if (!isFresh || threshold === null) return { guide: "neutral", accessibleLabel: reading };
  return value >= threshold
    ? { guide: "over", accessibleLabel: `${reading}, above ${threshold}% guide` }
    : { guide: "normal", accessibleLabel: `${reading}, below ${threshold}% guide` };
}

export function miniModalPosition(
  trigger: { left: number; top: number },
  viewport: { width: number; height: number },
): { left: number; bottom: number } {
  const width = Math.min(360, Math.max(0, viewport.width - 16));
  return {
    left: Math.max(8, Math.min(trigger.left, viewport.width - width - 8)),
    bottom: Math.max(8, viewport.height - trigger.top + 8),
  };
}

export function toggleHostMonitorMiniModal(): void {
  window.dispatchEvent(new Event(HOST_MONITOR_TOGGLE_EVENT));
}

export function mountHostMonitorMiniModal(pluginId: string, signal: AbortSignal): () => void {
  let modal: HTMLElement | null = null;
  let trigger: HTMLButtonElement | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let request: Promise<void> | null = null;
  let requestController: AbortController | null = null;
  let disposed = false;
  const hiddenNavRows = new Map<HTMLElement, HTMLElement["hidden"]>();

  const findTrigger = (): HTMLButtonElement | null => document.querySelector<HTMLButtonElement>(HOST_MONITOR_FOOTER_SELECTOR)
    ?? Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.getAttribute("aria-label") === "Host Monitor" || button.getAttribute("title") === "Host Monitor")
    ?? null;

  const hideNavRows = (): void => {
    for (const row of document.querySelectorAll<HTMLElement>(HOST_MONITOR_NAV_ROW_SELECTOR)) {
      if (!hiddenNavRows.has(row)) hiddenNavRows.set(row, row.hidden);
      row.hidden = true;
    }
  };

  const openPage = (): boolean => {
    const row = document.querySelector<HTMLElement>(HOST_MONITOR_NAV_ROW_SELECTOR);
    const button = row?.querySelector<HTMLButtonElement>('button:not([disabled])');
    if (button === null || button === undefined) return false;
    button.click();
    return true;
  };

  const position = (): void => {
    if (modal === null || trigger === null) return;
    const next = miniModalPosition(trigger.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
    modal.style.left = `${next.left}px`;
    modal.style.bottom = `${next.bottom}px`;
  };

  const close = (restoreFocus = true): void => {
    if (interval !== null) clearInterval(interval);
    interval = null;
    requestController?.abort();
    requestController = null;
    request = null;
    modal?.remove();
    modal = null;
    if (restoreFocus && trigger?.isConnected) trigger.focus();
    trigger = null;
  };

  const refresh = (): Promise<void> => {
    if (modal === null) return Promise.resolve();
    if (request !== null) return request;
    const status = modal.querySelector<HTMLElement>("[data-host-monitor-mini-status]");
    const rows = modal.querySelector<HTMLElement>("[data-host-monitor-mini-rows]");
    const summary = modal.querySelector<HTMLElement>("[data-host-monitor-mini-summary]");
    const controller = new AbortController();
    requestController = controller;
    if (status !== null) status.textContent = "Refreshing machines…";
    const pending = fetch(`/api/v1/plugins/${encodeURIComponent(pluginId)}/rpc/fleet`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "null",
      signal: controller.signal,
    }).then(async (response) => {
      const fleet = parseMiniModalFleet(await response.json());
      if (!response.ok || fleet === null) throw new Error("Could not load machines.");
      if (modal === null || rows === null || summary === null || status === null) return;
      summary.textContent = `${fleet.connected}/${fleet.total} connected`;
      rows.replaceChildren(...fleet.machines.map((machine) => machineRow(machine, fleet.thresholds)));
      status.textContent = fleet.machines.length === 0 ? "No machines are enrolled in BB." : "Updated now";
    }).catch((error: unknown) => {
      if (modal !== null && status !== null && !(error instanceof DOMException && error.name === "AbortError")) {
        status.textContent = "Could not load machines. Press Refresh to retry.";
      }
    }).finally(() => {
      if (request === pending) request = null;
      if (requestController === controller) requestController = null;
    });
    request = pending;
    return pending;
  };

  const open = (): void => {
    trigger = findTrigger();
    if (trigger === null || modal !== null) return;
    modal = createModal(close, refresh, openPage);
    document.body.append(modal);
    position();
    interval = setInterval(() => { void refresh(); }, MINI_MODAL_REFRESH_MS);
    void refresh();
    modal.querySelector<HTMLButtonElement>("[data-host-monitor-mini-close]")?.focus();
  };

  const toggle = (): void => modal === null ? open() : close();
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && modal !== null) {
      event.preventDefault();
      close();
    }
  };
  const onPointerDown = (event: PointerEvent): void => {
    if (modal !== null && !modal.contains(event.target as Node) && !trigger?.contains(event.target as Node)) close(false);
  };
  const onNavigation = (): void => close(false);

  window.addEventListener(HOST_MONITOR_TOGGLE_EVENT, toggle);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("resize", position);
  window.addEventListener("popstate", onNavigation);
  window.addEventListener("hashchange", onNavigation);
  hideNavRows();
  const navObserver = new MutationObserver(hideNavRows);
  navObserver.observe(document.body, { childList: true, subtree: true });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    close(false);
    window.removeEventListener(HOST_MONITOR_TOGGLE_EVENT, toggle);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("resize", position);
    window.removeEventListener("popstate", onNavigation);
    window.removeEventListener("hashchange", onNavigation);
    navObserver.disconnect();
    for (const [row, wasHidden] of hiddenNavRows) {
      if (row.isConnected) row.hidden = wasHidden;
    }
    hiddenNavRows.clear();
  };
  signal.addEventListener("abort", dispose, { once: true });
  return dispose;
}

function machineRow(machine: MiniModalMachine, thresholds: MiniModalFleet["thresholds"]): HTMLElement {
  const row = document.createElement("li");
  row.className = "host-monitor-mini__machine";
  const heading = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = machine.name;
  const state = document.createElement("span");
  state.textContent = stateLabel(machine.state);
  state.dataset.state = machine.state;
  heading.append(name, state);
  const metrics = document.createElement("dl");
  const isFresh = machine.state === "fresh";
  metrics.append(
    metric("CPU", machine.cpuPercent, thresholds.cpu, isFresh),
    metric("RAM", machine.ramPercent, thresholds.ram, isFresh),
    metric("Disk", machine.diskPercent, null, isFresh),
  );
  row.append(heading, metrics);
  return row;
}

function metric(label: string, value: number | null, threshold: number | null, isFresh: boolean): HTMLElement {
  const wrapper = document.createElement("div");
  const presentation = miniMetricPresentation(label, value, threshold, isFresh);
  wrapper.dataset.guide = presentation.guide;
  wrapper.setAttribute("aria-label", presentation.accessibleLabel);
  const term = document.createElement("dt");
  term.textContent = label;
  const detail = document.createElement("dd");
  detail.textContent = value === null ? "—" : `${value.toFixed(1)}%`;
  wrapper.append(term, detail);
  return wrapper;
}

function stateLabel(state: string): string {
  if (state === "fresh") return "Live";
  if (state === "offline") return "Offline";
  if (state === "error") return "Error";
  if (state === "stale") return "Stale";
  return "Sampling";
}

function createModal(
  close: (restoreFocus?: boolean) => void,
  refresh: () => Promise<void>,
  openPage: () => boolean,
): HTMLElement {
  const modal = document.createElement("section");
  modal.className = "host-monitor-mini";
  modal.dataset.hostMonitorMini = "";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-labelledby", "host-monitor-mini-title");

  const header = document.createElement("header");
  const titles = document.createElement("div");
  const title = document.createElement("h2");
  title.id = "host-monitor-mini-title";
  title.textContent = "Host Monitor";
  const summary = document.createElement("span");
  summary.dataset.hostMonitorMiniSummary = "";
  summary.textContent = "Loading machines…";
  titles.append(title, summary);
  const controls = document.createElement("div");
  const refreshButton = button("Refresh", "host-monitor-mini__quiet");
  refreshButton.addEventListener("click", () => { void refresh(); });
  const closeButton = button("Close", "host-monitor-mini__icon");
  closeButton.dataset.hostMonitorMiniClose = "";
  closeButton.setAttribute("aria-label", "Close Host Monitor");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => close());
  controls.append(refreshButton, closeButton);
  header.append(titles, controls);

  const rows = document.createElement("ul");
  rows.dataset.hostMonitorMiniRows = "";
  const status = document.createElement("p");
  status.dataset.hostMonitorMiniStatus = "";
  status.setAttribute("role", "status");
  status.textContent = "Loading machines…";
  const openButton = button("Open Host Monitor", "host-monitor-mini__open");
  openButton.addEventListener("click", () => {
    if (openPage()) close(false);
    else status.textContent = "The Host Monitor page is unavailable. Reload the plugin and retry.";
  });
  modal.append(header, rows, status, openButton);
  return modal;
}

function button(label: string, className: string): HTMLButtonElement {
  const value = document.createElement("button");
  value.type = "button";
  value.className = className;
  value.textContent = label;
  return value;
}
