export const PALETTE_PRESET_OPTIONS = [
  "Default",
  "High contrast",
  "Colorblind-friendly",
  "Custom",
] as const;

export const STATUS_DISPLAY_OPTIONS = ["Icons", "Verbose"] as const;
export type StatusDisplay = (typeof STATUS_DISPLAY_OPTIONS)[number];

export const ROW_DENSITY_OPTIONS = ["Comfortable", "Compact"] as const;
export const CHILD_EXPANSION_OPTIONS = ["Expanded", "Collapsed"] as const;

export type PalettePreset = (typeof PALETTE_PRESET_OPTIONS)[number];
export type RowDensity = "comfortable" | "compact";

export const SEMANTIC_COLOR_ROLES = [
  "working",
  "workflow",
  "agent",
  "command",
  "plan",
  "goal",
  "waiting",
  "unread",
  "error",
  "inactive",
  "stale",
  "prReview",
  "prChecks",
  "prReady",
  "prMerged",
  "prDraft",
  "prBlocked",
  "prClosed",
] as const;

export type SemanticColorRole = (typeof SEMANTIC_COLOR_ROLES)[number];
export type SemanticPalette = Readonly<Record<SemanticColorRole, string>>;

export interface DocksidePreferences {
  palettePreset: PalettePreset;
  colors: SemanticPalette;
  density: RowDensity;
  statusDisplay: StatusDisplay;
  defaultChildrenExpanded: boolean;
  showProviderIcons: boolean;
  showPullRequestMetadata: boolean;
  showRelativeTime: boolean;
}

export const CUSTOM_COLOR_DEFAULTS = {
  working: "#D99B00",
  workflow: "#8B5CF6",
  agent: "#0891B2",
  command: "#EA6A20",
  plan: "#6366F1",
  goal: "#DB3F8D",
  waiting: "#F58220",
  unread: "#34A853",
  error: "#D94B4B",
  inactive: "#A1A8B3",
  stale: "#69717D",
  prReview: "#3B82F6",
  prChecks: "#F59E0B",
  prReady: "#22C55E",
  prMerged: "#A855F7",
  prDraft: "#94A3B8",
  prBlocked: "#EF4444",
  prClosed: "#64748B",
} as const satisfies SemanticPalette;

const DEFAULT_PALETTE = {
  working: "#D99B00",
  workflow: "#8B5CF6",
  agent: "#0891B2",
  command: "#EA6A20",
  plan: "#6366F1",
  goal: "#DB3F8D",
  waiting: "#F58220",
  unread: "#34A853",
  error: "var(--destructive, #EF4444)",
  inactive: "color-mix(in srgb, var(--muted-foreground, #A1A8B3) 72%, transparent)",
  stale: "color-mix(in srgb, var(--muted-foreground, #69717D) 50%, transparent)",
  prReview: "var(--primary, #3B82F6)",
  prChecks: "var(--warning-text, var(--warning, #F59E0B))",
  prReady: "#34A853",
  prMerged: "var(--pr-merged, #A855F7)",
  prDraft: "var(--muted-foreground, #94A3B8)",
  prBlocked: "var(--destructive, #EF4444)",
  prClosed: "var(--muted-foreground, #64748B)",
} as const satisfies SemanticPalette;

const HIGH_CONTRAST_PALETTE = {
  working: "#00C853",
  workflow: "#AA55FF",
  agent: "#00B8D4",
  command: "#FF6D00",
  plan: "#536DFE",
  goal: "#FF4081",
  waiting: "#FFAB00",
  unread: "#2979FF",
  error: "#FF1744",
  inactive: "#B0B5BD",
  stale: "#666B73",
  prReview: "#2979FF",
  prChecks: "#FFAB00",
  prReady: "#00C853",
  prMerged: "#D500F9",
  prDraft: "#A0A0A0",
  prBlocked: "#FF1744",
  prClosed: "#707070",
} as const satisfies SemanticPalette;

const COLORBLIND_FRIENDLY_PALETTE = {
  working: "#009E73",
  workflow: "#CC79A7",
  agent: "#56B4E9",
  command: "#E69F00",
  plan: "#0072B2",
  goal: "#F0E442",
  waiting: "#E69F00",
  unread: "#0072B2",
  error: "#D55E00",
  inactive: "#999999",
  stale: "#565656",
  prReview: "#56B4E9",
  prChecks: "#E69F00",
  prReady: "#009E73",
  prMerged: "#CC79A7",
  prDraft: "#999999",
  prBlocked: "#D55E00",
  prClosed: "#4D4D4D",
} as const satisfies SemanticPalette;

const COLOR_SETTING_KEYS: Readonly<Record<SemanticColorRole, string>> = {
  working: "workingColor",
  workflow: "workflowColor",
  agent: "agentColor",
  command: "commandColor",
  plan: "planColor",
  goal: "goalColor",
  waiting: "waitingColor",
  unread: "unreadColor",
  error: "errorColor",
  inactive: "idleColor",
  stale: "staleColor",
  prReview: "prReviewColor",
  prChecks: "prChecksColor",
  prReady: "prReadyColor",
  prMerged: "prMergedColor",
  prDraft: "prDraftColor",
  prBlocked: "prBlockedColor",
  prClosed: "prClosedColor",
};

const HEX_COLOR = /^#[0-9A-F]{6}$/i;

export function resolveDocksidePreferences(
  values: Readonly<Record<string, string | boolean>> | undefined,
): DocksidePreferences {
  const palettePreset = readOption(
    values?.palettePreset,
    PALETTE_PRESET_OPTIONS,
    "Default",
  );
  const colors = resolvePalette(palettePreset, values);

  return {
    palettePreset,
    colors,
    statusDisplay: readOption(values?.statusDisplay, STATUS_DISPLAY_OPTIONS, "Icons"),
    density:
      readOption(values?.rowDensity, ROW_DENSITY_OPTIONS, "Comfortable") ===
      "Compact"
        ? "compact"
        : "comfortable",
    defaultChildrenExpanded:
      readOption(
        values?.defaultChildExpansion,
        CHILD_EXPANSION_OPTIONS,
        "Expanded",
      ) === "Expanded",
    showProviderIcons: readBoolean(values?.showProviderIcons, true),
    showPullRequestMetadata: readBoolean(
      values?.showPullRequestMetadata,
      true,
    ),
    showRelativeTime: readBoolean(values?.showRelativeTime, true),
  };
}

function resolvePalette(
  preset: PalettePreset,
  values: Readonly<Record<string, string | boolean>> | undefined,
): SemanticPalette {
  switch (preset) {
    case "High contrast":
      return HIGH_CONTRAST_PALETTE;
    case "Colorblind-friendly":
      return COLORBLIND_FRIENDLY_PALETTE;
    case "Custom":
      return Object.fromEntries(
        SEMANTIC_COLOR_ROLES.map((role) => [
          role,
          readHex(values?.[COLOR_SETTING_KEYS[role]], CUSTOM_COLOR_DEFAULTS[role]),
        ]),
      ) as Record<SemanticColorRole, string>;
    case "Default":
      return DEFAULT_PALETTE;
  }
}

function readHex(value: string | boolean | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toUpperCase();
  return HEX_COLOR.test(normalized) ? normalized : fallback;
}

function readBoolean(value: string | boolean | undefined, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readOption<const Options extends readonly string[]>(
  value: string | boolean | undefined,
  options: Options,
  fallback: Options[number],
): Options[number] {
  return typeof value === "string" && options.includes(value)
    ? (value as Options[number])
    : fallback;
}

export function docksidePreferenceStyle(
  preferences: DocksidePreferences,
): Readonly<Record<string, string>> {
  const { colors } = preferences;
  return {
    "--dockside-status-working": colors.working,
    "--dockside-status-workflow": colors.workflow,
    "--dockside-status-agent": colors.agent,
    "--dockside-status-command": colors.command,
    "--dockside-status-plan": colors.plan,
    "--dockside-status-goal": colors.goal,
    "--dockside-status-waiting": colors.waiting,
    "--dockside-status-unread": colors.unread,
    "--dockside-status-error": colors.error,
    "--dockside-status-inactive": colors.inactive,
    "--dockside-status-stale": colors.stale,
    "--dockside-pr-review": colors.prReview,
    "--dockside-pr-checks": colors.prChecks,
    "--dockside-pr-ready": colors.prReady,
    "--dockside-pr-merged": colors.prMerged,
    "--dockside-pr-draft": colors.prDraft,
    "--dockside-pr-blocked": colors.prBlocked,
    "--dockside-pr-closed": colors.prClosed,
  };
}
