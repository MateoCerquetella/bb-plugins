import {
  clampPercent,
  formatCurrencyAmount,
  formatUsedPercent,
  providerStatusLabel,
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

export interface SidebarUsageOverviewItem {
  provider: ProviderUsage;
  selection: SidebarUsagePrimarySelection;
}

export interface AverageProviderUsage {
  percent: number | null;
  count: number;
  names: string[];
}

export function averageProviderUsage(
  items: readonly SidebarUsageOverviewItem[],
): AverageProviderUsage {
  const available = items.filter((item) => item.selection.window !== null && item.provider.balance === undefined);
  if (available.length === 0) {
    return { percent: null, count: 0, names: [] };
  }
  const percent =
    available.reduce(
      (sum, item) =>
        sum + clampPercent(item.selection.window?.usedPercent ?? 0),
      0,
    ) / available.length;
  return {
    percent,
    count: available.length,
    names: available.map((item) => item.provider.name),
  };
}

/** One overview row per account; a provider with at most one account stays one row. */
export function accountUsageRows(provider: ProviderUsage): ProviderUsage[] {
  const accounts = provider.accounts ?? [];
  if (accounts.length <= 1) return [provider];
  return accounts.map((account) => ({
    ...provider,
    name: `${provider.name} · ${account.accountEmail ?? account.label}`,
    status: account.status,
    accountEmail: account.accountEmail,
    planLabel: account.planLabel,
    message: account.message,
    windows: account.windows,
    resetCredits: account.resetCredits ?? null,
    accounts: undefined,
  }));
}

/** Drops providers with no usable window; keeps them all while none has data, so loading and error states stay visible. */
export function itemsWithUsageData(
  items: readonly SidebarUsageOverviewItem[],
): SidebarUsageOverviewItem[] {
  const withData = items.filter((item) => item.selection.window !== null);
  return withData.length > 0 ? withData : [...items];
}

/** Usage resets available across the given account rows. */
export function totalResetCredits(rows: readonly ProviderUsage[]): number {
  return rows.reduce((sum, row) => sum + (row.resetCredits?.availableCount ?? 0), 0);
}

export function highestSidebarUsagePrimary(
  items: readonly SidebarUsageOverviewItem[],
): SidebarUsageOverviewItem | null {
  let highest: SidebarUsageOverviewItem | null = null;
  for (const item of items) {
    if (item.selection.window === null) continue;
    if (
      highest === null ||
      item.selection.window.usedPercent >
        (highest.selection.window?.usedPercent ?? Number.NEGATIVE_INFINITY)
    ) {
      highest = item;
    }
  }
  return highest;
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
  const matching = (
    predicate: (window: { label: string; kind?: string }) => boolean,
  ) => {
    const candidates = provider.windows.filter((window) => predicate(window));
    return (provider.id === "antigravity"
      ? [...candidates].sort((a, b) => b.usedPercent - a.usedPercent)
      : candidates)[0] ?? null;
  };
  return {
    fiveHour: matching(
      (window) => window.kind === "five-hour" || isFiveHourLabel(window.label),
    ),
    weekly: matching(
      (window) => window.kind === "weekly" || isWeeklyLabel(window.label),
    ),
  };
}

export function sidebarUsageDetailRows(
  provider: ProviderUsage,
): SidebarUsageDetailRow[] {
  if (provider.id === "antigravity") {
    return provider.windows.map((window) => ({ label: window.label, window }));
  }
  if (provider.id === "deepSeek") {
    if (provider.balance === undefined) return [];
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

    const reportedWindow = currentProvider.windows[0] ?? null;
    if (reportedWindow !== null) {
      return {
        window: reportedWindow,
        actualKind: compactLimit,
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

    const reportedWindow = lastKnownProvider.windows[0] ?? null;
    if (reportedWindow !== null) {
      return {
        window: reportedWindow,
        actualKind: compactLimit,
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

/** DeepSeek without a budget reads as its balance; every other provider reads as a percentage. */
export function sidebarUsagePrimaryReading(
  provider: ProviderUsage,
  selection: SidebarUsagePrimarySelection,
): string {
  if (
    provider.id === "deepSeek" &&
    selection.window === null &&
    provider.balance !== undefined
  ) {
    return formatCurrencyAmount(
      provider.balance.total,
      provider.balance.currency,
    );
  }
  return sidebarUsagePrimarySelectionSummary(selection);
}

export function sidebarUsagePrimaryAccessibleText(
  providerName: string,
  compactLimit: CompactLimitOption,
  selection: SidebarUsagePrimarySelection,
  expanded = false,
  provider?: Pick<ProviderUsage, "id" | "status" | "balance">,
): string {
  const prefix = `${providerName} compact usage: ${compactLimit} configured`;
  const action = `${expanded ? "Close" : "Open"} ${providerName} usage details.`;
  if (provider?.id === "deepSeek") {
    if (selection.window !== null) {
      const stale = selection.fallback === "last-known" ? "last-known " : "";
      return `${providerName} ${stale}topped-up balance: ${sidebarUsagePrimarySelectionSummary(selection)} used. ${action}`;
    }
    if (provider.status !== "ok") {
      if (provider.balance !== undefined) {
        return `${providerName} last-known balance: ${formatCurrencyAmount(provider.balance.total, provider.balance.currency)} available. ${action}`;
      }
      return `${providerName}: ${providerStatusLabel(provider.status)}. ${action}`;
    }
    if (provider.balance !== undefined) {
      return `${providerName} balance: ${formatCurrencyAmount(provider.balance.total, provider.balance.currency)} available; no topped-up budget configured. ${action}`;
    }
    return `${providerName} balance: no topped-up budget configured. ${action}`;
  }
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
  if (previous === undefined) return current;
  // A healthy DeepSeek reading is complete: an empty window list means no
  // budget is configured, not that the provider temporarily failed.
  if (
    current.id === "deepSeek" &&
    current.status === "ok" &&
    current.balance !== undefined
  ) {
    return current;
  }
  if (previous.windows.length === 0) {
    return current.balance === undefined && previous.balance !== undefined
      ? { ...current, balance: previous.balance }
      : current;
  }

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

  if (current.balance === undefined && previous.balance !== undefined) {
    return { ...current, windows, balance: previous.balance };
  }
  return { ...current, windows };
}
