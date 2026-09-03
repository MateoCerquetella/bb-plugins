import {
  formatUsedPercent,
  type ProviderUsage,
  type UsageWindow,
} from "./usage.ts";
import type { CompactLimitOption } from "./preferences.ts";

export interface SidebarUsageWindows {
  fiveHour: UsageWindow | null;
  weekly: UsageWindow | null;
}

export interface SidebarUsageDetailRow {
  label: string;
  window: UsageWindow | null;
}

export type SidebarUsagePrimaryFallback =
  | "none"
  | "current-alternative"
  | "last-known"
  | "unavailable";

export interface SidebarUsagePrimarySelection {
  window: UsageWindow | null;
  actualKind: CompactLimitOption | null;
  fallback: SidebarUsagePrimaryFallback;
}

function isFiveHourLabel(label: string): boolean {
  const normalized = label.toLowerCase();
  return (
    normalized.includes("five") ||
    normalized.includes("5 hour") ||
    normalized.includes("5-hour") ||
    normalized.includes("current session")
  );
}

function isWeeklyLabel(label: string): boolean {
  const normalized = label.toLowerCase();
  return (
    normalized.includes("week") ||
    normalized.includes("seven day") ||
    normalized.includes("7 day") ||
    normalized.includes("7-day")
  );
}

function isCodexProWithoutFiveHourLimit(
  provider: ProviderUsage,
  windows: SidebarUsageWindows,
): boolean {
  return (
    provider.id === "codex" &&
    provider.status === "ok" &&
    windows.fiveHour === null &&
    provider.planLabel !== null &&
    /\bpro(?:lite)?\b/iu.test(provider.planLabel)
  );
}

export function sidebarUsageWindows(
  provider: ProviderUsage,
): SidebarUsageWindows {
  const matching = (predicate: (label: string) => boolean) => {
    const candidates = provider.windows.filter((window) => predicate(window.label));
    return (provider.id === "antigravity"
      ? [...candidates].sort((a, b) => b.usedPercent - a.usedPercent)
      : candidates)[0] ?? null;
  };

  return {
    fiveHour:
      matching((label) => isFiveHourLabel(label)),
    weekly:
      matching((label) => isWeeklyLabel(label)),
  };
}

export function sidebarUsageDetailRows(
  provider: ProviderUsage,
): SidebarUsageDetailRow[] {
  if (provider.id === "antigravity") {
    return provider.windows.map((window) => ({
      label: window.label,
      window,
    }));
  }
  const pair = sidebarUsageWindows(provider);
  const selected = new Set<UsageWindow>();
  if (pair.fiveHour !== null) selected.add(pair.fiveHour);
  if (pair.weekly !== null) selected.add(pair.weekly);

  return [
    ...(isCodexProWithoutFiveHourLimit(provider, pair)
      ? []
      : [{ label: "5-hour limit", window: pair.fiveHour }]),
    { label: "Weekly limit", window: pair.weekly },
    ...provider.windows
      .filter((window) => !selected.has(window))
      .map((window) => ({ label: window.label, window })),
  ];
}

export function sidebarUsageSummary(provider: ProviderUsage): string {
  const { fiveHour, weekly } = sidebarUsageWindows(provider);
  const fiveHourValue =
    fiveHour === null ? "—" : formatUsedPercent(fiveHour.usedPercent);
  const weeklyValue =
    weekly === null ? "—" : formatUsedPercent(weekly.usedPercent);
  return `${fiveHourValue}% 5h · ${weeklyValue}% wk`;
}

function windowForKind(
  windows: SidebarUsageWindows,
  kind: CompactLimitOption,
): UsageWindow | null {
  return kind === "Weekly" ? windows.weekly : windows.fiveHour;
}

function alternateKind(kind: CompactLimitOption): CompactLimitOption {
  return kind === "Weekly" ? "Five-hour" : "Weekly";
}

export function selectSidebarUsagePrimary(
  currentProvider: ProviderUsage | undefined,
  lastKnownProvider: ProviderUsage | undefined,
  compactLimit: CompactLimitOption,
): SidebarUsagePrimarySelection {
  const alternative = alternateKind(compactLimit);

  if (currentProvider !== undefined) {
    const currentWindows = sidebarUsageWindows(currentProvider);
    const preferredWindow = windowForKind(currentWindows, compactLimit);
    if (preferredWindow !== null) {
      return {
        window: preferredWindow,
        actualKind: compactLimit,
        fallback: "none",
      };
    }

    const alternativeWindow = windowForKind(currentWindows, alternative);
    if (alternativeWindow !== null) {
      return {
        window: alternativeWindow,
        actualKind: alternative,
        fallback: "current-alternative",
      };
    }
  }

  if (lastKnownProvider !== undefined) {
    const lastKnownWindows = sidebarUsageWindows(lastKnownProvider);
    const preferredWindow = windowForKind(lastKnownWindows, compactLimit);
    if (preferredWindow !== null) {
      return {
        window: preferredWindow,
        actualKind: compactLimit,
        fallback: "last-known",
      };
    }

    const alternativeWindow = windowForKind(lastKnownWindows, alternative);
    if (alternativeWindow !== null) {
      return {
        window: alternativeWindow,
        actualKind: alternative,
        fallback: "last-known",
      };
    }
  }

  return { window: null, actualKind: null, fallback: "unavailable" };
}

export function sidebarUsagePrimarySelectionSummary(
  selection: SidebarUsagePrimarySelection,
): string {
  return selection.window === null
    ? "—%"
    : `${formatUsedPercent(selection.window.usedPercent)}%`;
}

export function sidebarUsagePrimaryAccessibleText(
  providerName: string,
  compactLimit: CompactLimitOption,
  selection: SidebarUsagePrimarySelection,
  expanded = false,
): string {
  const prefix = `${providerName} compact usage: ${compactLimit} configured`;
  const action = `${expanded ? "Close" : "Open"} ${providerName} usage details.`;
  if (selection.window === null || selection.actualKind === null) {
    return `${prefix}; no usage window is available. ${action}`;
  }

  const actual = `${selection.actualKind} ${sidebarUsagePrimarySelectionSummary(selection)}`;
  switch (selection.fallback) {
    case "none":
      return `${prefix}; showing ${actual}. ${action}`;
    case "current-alternative":
      return `${prefix}; showing ${actual} as fallback because ${compactLimit} is not currently reported. ${action}`;
    case "last-known":
      return `${prefix}; showing last-known ${actual} as fallback because no current usage window is reported. ${action}`;
    case "unavailable":
      return `${prefix}; no usage window is available. ${action}`;
  }
}

export function sidebarUsagePrimaryWindow(
  provider: ProviderUsage,
  compactLimit: CompactLimitOption,
): UsageWindow | null {
  return selectSidebarUsagePrimary(provider, undefined, compactLimit).window;
}

export function sidebarUsagePrimarySummary(
  provider: ProviderUsage,
  compactLimit: CompactLimitOption,
): string {
  return sidebarUsagePrimarySelectionSummary(
    selectSidebarUsagePrimary(provider, undefined, compactLimit),
  );
}

export function mergeLastKnownWindows(
  current: ProviderUsage,
  previous: ProviderUsage | undefined,
): ProviderUsage {
  if (previous === undefined || previous.windows.length === 0) return current;

  const currentPair = sidebarUsageWindows(current);
  const previousPair = sidebarUsageWindows(previous);
  const windows = [...current.windows];
  const handledPrevious = new Set<UsageWindow>();
  const hidesFiveHourLimit = isCodexProWithoutFiveHourLimit(
    current,
    currentPair,
  );

  if (previousPair.fiveHour !== null) {
    handledPrevious.add(previousPair.fiveHour);
    if (currentPair.fiveHour === null && !hidesFiveHourLimit) {
      windows.unshift(previousPair.fiveHour);
    }
  }
  if (previousPair.weekly !== null) {
    const alreadyHandled = handledPrevious.has(previousPair.weekly);
    handledPrevious.add(previousPair.weekly);
    if (currentPair.weekly === null && !alreadyHandled) {
      windows.push(previousPair.weekly);
    }
  }

  const currentLabels = new Set(windows.map((window) => window.label));
  for (const window of previous.windows) {
    if (handledPrevious.has(window) || currentLabels.has(window.label)) continue;
    windows.push(window);
    currentLabels.add(window.label);
  }

  return { ...current, windows };
}
