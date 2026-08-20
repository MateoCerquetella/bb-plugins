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

export function sidebarUsageWindows(
  provider: ProviderUsage,
): SidebarUsageWindows {
  return {
    fiveHour:
      provider.windows.find((window) => isFiveHourLabel(window.label)) ?? null,
    weekly:
      provider.windows.find((window) => isWeeklyLabel(window.label)) ?? null,
  };
}

export function sidebarUsageSummary(provider: ProviderUsage): string {
  const { fiveHour, weekly } = sidebarUsageWindows(provider);
  const fiveHourValue =
    fiveHour === null ? "—" : formatUsedPercent(fiveHour.usedPercent);
  const weeklyValue =
    weekly === null ? "—" : formatUsedPercent(weekly.usedPercent);
  return `${fiveHourValue}% 5h · ${weeklyValue}% wk`;
}

export function sidebarUsagePrimaryWindow(
  provider: ProviderUsage,
  compactLimit: CompactLimitOption,
): UsageWindow | null {
  const { fiveHour, weekly } = sidebarUsageWindows(provider);
  return compactLimit === "Weekly"
    ? weekly ?? fiveHour
    : fiveHour ?? weekly;
}

export function sidebarUsagePrimarySummary(
  provider: ProviderUsage,
  compactLimit: CompactLimitOption,
): string {
  const primary = sidebarUsagePrimaryWindow(provider, compactLimit);
  return primary === null ? "—%" : `${formatUsedPercent(primary.usedPercent)}%`;
}

export function mergeLastKnownWindows(
  current: ProviderUsage,
  previous: ProviderUsage | undefined,
): ProviderUsage {
  if (previous === undefined || previous.windows.length === 0) return current;

  const currentPair = sidebarUsageWindows(current);
  const previousPair = sidebarUsageWindows(previous);
  const windows = [...current.windows];

  if (currentPair.fiveHour === null && previousPair.fiveHour !== null) {
    windows.unshift(previousPair.fiveHour);
  }
  if (currentPair.weekly === null && previousPair.weekly !== null) {
    windows.push(previousPair.weekly);
  }

  return { ...current, windows };
}
