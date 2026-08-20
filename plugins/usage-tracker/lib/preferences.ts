export const SIDEBAR_PROVIDER_IDS = ["claudeCode", "codex"] as const;
export const COMPACT_LIMIT_OPTIONS = ["Weekly", "Five-hour"] as const;

export type SidebarProviderId = (typeof SIDEBAR_PROVIDER_IDS)[number];
export type CompactLimitOption = (typeof COMPACT_LIMIT_OPTIONS)[number];

export function normalizeCompactLimitOption(
  value: unknown,
): CompactLimitOption {
  return COMPACT_LIMIT_OPTIONS.find((option) => option === value) ?? "Weekly";
}

export interface UsageTrackerPreferences {
  enableClaudeCode: boolean;
  enableCodex: boolean;
  compactLimit: CompactLimitOption;
}

export function enabledSidebarProviderIds(
  preferences: Pick<
    UsageTrackerPreferences,
    "enableClaudeCode" | "enableCodex"
  >,
): SidebarProviderId[] {
  return SIDEBAR_PROVIDER_IDS.filter((providerId) =>
    providerId === "claudeCode"
      ? preferences.enableClaudeCode
      : preferences.enableCodex,
  );
}
