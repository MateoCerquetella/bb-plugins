export const DASHBOARD_METRICS = [
  "cpu",
  "memory",
  "disk",
  "load",
  "network",
  "uptime",
  "system",
  "processes",
] as const;
export const DASHBOARD_VISUALIZATIONS = ["stat", "timeseries", "details", "table"] as const;
export const DASHBOARD_PANEL_LIMIT = 13;

export type DashboardMetric = typeof DASHBOARD_METRICS[number];
export type DashboardVisualization = typeof DASHBOARD_VISUALIZATIONS[number];

export type DashboardPanel = {
  metric: DashboardMetric;
  visualization: DashboardVisualization;
  visible: boolean;
};

export type DashboardConfig = {
  version: 2;
  panels: DashboardPanel[];
};

type ReadonlyDashboardConfig = {
  readonly version: 2;
  readonly panels: readonly Readonly<DashboardPanel>[];
};

export type DashboardMetricDefinition = {
  label: string;
  description: string;
  visualizations: readonly DashboardVisualization[];
};

export const DASHBOARD_CATALOG: Record<DashboardMetric, DashboardMetricDefinition> = {
  cpu: { label: "CPU", description: "Processor utilization", visualizations: ["stat", "timeseries"] },
  memory: { label: "RAM", description: "Memory utilization", visualizations: ["stat", "timeseries"] },
  disk: { label: "Root disk", description: "System volume utilization", visualizations: ["stat", "timeseries"] },
  load: { label: "Load average", description: "One, five, and fifteen minute load", visualizations: ["stat", "timeseries"] },
  network: { label: "Network throughput", description: "Aggregate receive and send rates", visualizations: ["stat", "timeseries"] },
  uptime: { label: "Uptime", description: "Time since the machine booted", visualizations: ["stat"] },
  system: { label: "System", description: "Platform, processor, kernel, and uptime", visualizations: ["details"] },
  processes: { label: "Processes", description: "Live bounded process resource usage and controls", visualizations: ["table"] },
};

export function supportsVisualization(
  metric: DashboardMetric,
  visualization: DashboardVisualization,
): boolean {
  return DASHBOARD_CATALOG[metric].visualizations.includes(visualization);
}
export function dashboardPanelKey(panel: Pick<DashboardPanel, "metric" | "visualization">): string {
  return `${panel.metric}:${panel.visualization}`;
}

export const DASHBOARD_PANEL_CATALOG: readonly Readonly<DashboardPanel>[] =
  DASHBOARD_METRICS.flatMap((metric) =>
    DASHBOARD_CATALOG[metric].visualizations.map((visualization) => ({
      metric,
      visualization,
      visible: !(
        (metric === "network" && visualization === "stat") ||
        metric === "uptime"
      ),
    })),
  );

const CATALOG_KEYS = new Set(DASHBOARD_PANEL_CATALOG.map(dashboardPanelKey));

export const DEFAULT_DASHBOARD_CONFIG: ReadonlyDashboardConfig = {
  version: 2,
  panels: DASHBOARD_PANEL_CATALOG,
};

export function cloneDashboardConfig(config: ReadonlyDashboardConfig): DashboardConfig {
  return { version: 2, panels: config.panels.map((panel) => ({ ...panel })) };
}

export function defaultDashboardConfig(): DashboardConfig {
  return cloneDashboardConfig(DEFAULT_DASHBOARD_CONFIG);
}

export function isCompleteDashboardConfig(config: ReadonlyDashboardConfig): boolean {
  return config.panels.length === DASHBOARD_PANEL_CATALOG.length &&
    new Set(config.panels.map(dashboardPanelKey)).size === DASHBOARD_PANEL_CATALOG.length &&
    config.panels.every((panel) => CATALOG_KEYS.has(dashboardPanelKey(panel)));
}

export function normalizeDashboardConfig(value: unknown): DashboardConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return defaultDashboardConfig();
  const record = value as Record<string, unknown>;
  const rawPanels = Array.isArray(record.panels) ? record.panels : [];
  const ordered: DashboardPanel[] = [];
  const seen = new Set<string>();

  for (const raw of rawPanels.slice(0, DASHBOARD_PANEL_LIMIT)) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const panel = raw as Record<string, unknown>;
    if (
      typeof panel.metric !== "string" ||
      typeof panel.visualization !== "string" ||
      !DASHBOARD_METRICS.includes(panel.metric as DashboardMetric) ||
      !DASHBOARD_VISUALIZATIONS.includes(panel.visualization as DashboardVisualization)
    ) continue;
    const candidate = {
      metric: panel.metric as DashboardMetric,
      visualization: panel.visualization as DashboardVisualization,
      visible: record.version === 2 ? panel.visible === true : true,
    };
    const key = dashboardPanelKey(candidate);
    if (!CATALOG_KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    ordered.push(candidate);
  }

  for (const catalogPanel of DASHBOARD_PANEL_CATALOG) {
    const key = dashboardPanelKey(catalogPanel);
    if (seen.has(key)) continue;
    ordered.push({
      ...catalogPanel,
      visible:
        record.version === 1
          ? catalogPanel.metric === "system" || catalogPanel.metric === "processes"
          : catalogPanel.visible,
    });
  }
  return { version: 2, panels: ordered };
}

export function visibleDashboardPanels(config: ReadonlyDashboardConfig): DashboardPanel[] {
  return config.panels.filter((panel) => panel.visible).map((panel) => ({ ...panel }));
}

export function availableDashboardPanels(config: ReadonlyDashboardConfig): DashboardPanel[] {
  return config.panels.filter((panel) => !panel.visible).map((panel) => ({ ...panel }));
}

export function addDashboardPanel(config: ReadonlyDashboardConfig, panel: Readonly<DashboardPanel>): DashboardConfig {
  const index = config.panels.findIndex((current) => dashboardPanelKey(current) === dashboardPanelKey(panel));
  return index < 0 ? cloneDashboardConfig(config) : setDashboardPanelVisibility(config, index, true);
}

export function removeDashboardPanel(config: ReadonlyDashboardConfig, index: number): DashboardConfig {
  return setDashboardPanelVisibility(config, index, false);
}

export function setDashboardPanelVisibility(
  config: ReadonlyDashboardConfig,
  index: number,
  visible: boolean,
): DashboardConfig {
  if (index < 0 || index >= config.panels.length) return cloneDashboardConfig(config);
  return {
    version: 2,
    panels: config.panels.map((panel, current) =>
      current === index ? { ...panel, visible } : { ...panel }),
  };
}

export function moveDashboardPanel(
  config: ReadonlyDashboardConfig,
  from: number,
  to: number,
): DashboardConfig {
  if (from < 0 || from >= config.panels.length || to < 0 || to >= config.panels.length || from === to) {
    return cloneDashboardConfig(config);
  }
  const panels = config.panels.map((panel) => ({ ...panel }));
  const [moved] = panels.splice(from, 1);
  if (moved != null) panels.splice(to, 0, moved);
  return { version: 2, panels };
}

export function changeDashboardPanelVisualization(
  config: ReadonlyDashboardConfig,
  index: number,
  visualization: DashboardVisualization,
): DashboardConfig {
  const current = config.panels[index];
  if (current === undefined || current.visualization === visualization) return cloneDashboardConfig(config);
  const replacementIndex = config.panels.findIndex(
    (panel) => panel.metric === current.metric && panel.visualization === visualization,
  );
  if (replacementIndex < 0) return cloneDashboardConfig(config);
  return {
    version: 2,
    panels: config.panels.map((panel, currentIndex) => {
      if (currentIndex === index) return { ...panel, visible: false };
      if (currentIndex === replacementIndex) return { ...panel, visible: current.visible };
      return { ...panel };
    }),
  };
}
