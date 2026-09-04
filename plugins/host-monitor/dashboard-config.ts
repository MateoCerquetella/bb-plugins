export const DASHBOARD_METRICS = ["cpu", "memory", "disk", "load", "network", "uptime"] as const;
export const DASHBOARD_VISUALIZATIONS = ["stat", "timeseries"] as const;
export const DASHBOARD_PANEL_LIMIT = 12;

export type DashboardMetric = typeof DASHBOARD_METRICS[number];
export type DashboardVisualization = typeof DASHBOARD_VISUALIZATIONS[number];

export type DashboardPanel = {
  metric: DashboardMetric;
  visualization: DashboardVisualization;
};

export type DashboardConfig = {
  version: 1;
  panels: DashboardPanel[];
};

type ReadonlyDashboardConfig = {
  readonly version: 1;
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
};

export const DEFAULT_DASHBOARD_CONFIG: ReadonlyDashboardConfig = {
  version: 1,
  panels: [
    { metric: "cpu", visualization: "stat" },
    { metric: "memory", visualization: "stat" },
    { metric: "disk", visualization: "stat" },
    { metric: "load", visualization: "stat" },
    { metric: "cpu", visualization: "timeseries" },
    { metric: "memory", visualization: "timeseries" },
    { metric: "disk", visualization: "timeseries" },
    { metric: "load", visualization: "timeseries" },
    { metric: "network", visualization: "timeseries" },
  ],
};

export function supportsVisualization(
  metric: DashboardMetric,
  visualization: DashboardVisualization,
): boolean {
  return DASHBOARD_CATALOG[metric].visualizations.includes(visualization);
}

export function cloneDashboardConfig(config: ReadonlyDashboardConfig): DashboardConfig {
  return {
    version: 1,
    panels: config.panels.map((panel) => ({ ...panel })),
  };
}

export function defaultDashboardConfig(): DashboardConfig {
  return cloneDashboardConfig(DEFAULT_DASHBOARD_CONFIG);
}

export function dashboardPanelKey(panel: Readonly<DashboardPanel>): string {
  return `${panel.metric}:${panel.visualization}`;
}

export function availableDashboardPanels(config: ReadonlyDashboardConfig): DashboardPanel[] {
  const configured = new Set(config.panels.map(dashboardPanelKey));
  return DASHBOARD_METRICS.flatMap((metric) =>
    DASHBOARD_CATALOG[metric].visualizations.map((visualization) => ({ metric, visualization })),
  ).filter((panel) => !configured.has(dashboardPanelKey(panel)));
}

export function addDashboardPanel(config: ReadonlyDashboardConfig, panel: Readonly<DashboardPanel>): DashboardConfig {
  if (
    config.panels.length >= DASHBOARD_PANEL_LIMIT ||
    !supportsVisualization(panel.metric, panel.visualization) ||
    config.panels.some((current) => dashboardPanelKey(current) === dashboardPanelKey(panel))
  ) return cloneDashboardConfig(config);
  return { version: 1, panels: [...config.panels.map((current) => ({ ...current })), { ...panel }] };
}

export function removeDashboardPanel(config: ReadonlyDashboardConfig, index: number): DashboardConfig {
  if (config.panels.length <= 1 || index < 0 || index >= config.panels.length) return cloneDashboardConfig(config);
  return { version: 1, panels: config.panels.filter((_, current) => current !== index).map((panel) => ({ ...panel })) };
}

export function moveDashboardPanel(config: ReadonlyDashboardConfig, from: number, to: number): DashboardConfig {
  if (from < 0 || from >= config.panels.length || to < 0 || to >= config.panels.length || from === to) {
    return cloneDashboardConfig(config);
  }
  const panels = config.panels.map((panel) => ({ ...panel }));
  const [moved] = panels.splice(from, 1);
  if (moved != null) panels.splice(to, 0, moved);
  return { version: 1, panels };
}

export function changeDashboardPanelVisualization(
  config: ReadonlyDashboardConfig,
  index: number,
  visualization: DashboardVisualization,
): DashboardConfig {
  const current = config.panels[index];
  if (current === undefined || !supportsVisualization(current.metric, visualization)) return cloneDashboardConfig(config);
  const replacement = { ...current, visualization };
  if (config.panels.some((panel, currentIndex) => currentIndex !== index && dashboardPanelKey(panel) === dashboardPanelKey(replacement))) {
    return cloneDashboardConfig(config);
  }
  return { version: 1, panels: config.panels.map((panel, currentIndex) => currentIndex === index ? replacement : { ...panel }) };
}
