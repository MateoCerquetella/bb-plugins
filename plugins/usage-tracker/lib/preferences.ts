export const SIDEBAR_PROVIDER_IDS = [
  "claudeCode",
  "codex",
  "grok",
  "openCode",
  "antigravity",
] as const;
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
  enableGrok: boolean;
  enableOpenCode: boolean;
  enableAntigravity?: boolean;
  compactLimit: CompactLimitOption;
}

type ProviderPreferenceKey = keyof Pick<
  UsageTrackerPreferences,
  "enableClaudeCode" | "enableCodex" | "enableGrok" | "enableOpenCode" | "enableAntigravity"
>;

const PROVIDER_PREFERENCE_KEYS: Readonly<
  Record<SidebarProviderId, ProviderPreferenceKey>
> = {
  claudeCode: "enableClaudeCode",
  codex: "enableCodex",
  grok: "enableGrok",
  openCode: "enableOpenCode",
  antigravity: "enableAntigravity",
};

export function enabledSidebarProviderIds(
  preferences: Pick<
    UsageTrackerPreferences,
    "enableClaudeCode" | "enableCodex" | "enableGrok" | "enableOpenCode" | "enableAntigravity"
  >,
): SidebarProviderId[] {
  return SIDEBAR_PROVIDER_IDS.filter(
    (providerId) => preferences[PROVIDER_PREFERENCE_KEYS[providerId]] === true,
  );
}
