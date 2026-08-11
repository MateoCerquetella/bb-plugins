export const PROVIDER_IDS = ["codex", "claudeCode", "cursor"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];
export type ProviderStatus =
  | "ok"
  | "not_installed"
  | "unauthenticated"
  | "expired"
  | "error";

export interface UsageCost {
  usedUsdCents: number;
  limitUsdCents: number;
}

export interface RawUsageWindow {
  label: string;
  usedPercent: number;
  resetsAt: string | null;
  cost?: UsageCost;
}

export interface RawHealthyProviderUsage {
  status: "ok";
  accountEmail: string | null;
  planLabel: string | null;
  windows: RawUsageWindow[];
}

export type RawProviderUsage =
  | RawHealthyProviderUsage
  | { status: "not_installed" }
  | { status: "unauthenticated" }
  | { status: "expired" }
  | {
      status: "error";
      message: string;
      planLabel?: string | null;
      accountEmail?: string | null;
    };

export interface RawUsageResponse {
  codex: RawProviderUsage;
  claudeCode: RawProviderUsage;
  cursor: RawProviderUsage;
}

export interface UsageWindow {
  label: string;
  usedPercent: number;
  barPercent: number;
  resetsAt: string | null;
  cost: UsageCost | null;
}

export interface ProviderUsage {
  id: ProviderId;
  name: string;
  status: ProviderStatus;
  accountEmail: string | null;
  planLabel: string | null;
  message: string | null;
  windows: UsageWindow[];
}

export interface UsageSnapshot {
  fetchedAt: string;
  host: {
    id: string | null;
    name: string | null;
  };
  providers: ProviderUsage[];
}

interface ProviderDefinition {
  id: ProviderId;
  name: string;
  loginCommand: string;
}

const PROVIDERS: readonly ProviderDefinition[] = [
  { id: "codex", name: "Codex", loginCommand: "codex login" },
  { id: "claudeCode", name: "Claude Code", loginCommand: "claude" },
  { id: "cursor", name: "Cursor", loginCommand: "cursor-agent login" },
];

export const REQUEST_ERROR_MESSAGE =
  "Usage could not be loaded. Check the agent session and try again.";

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError("Usage percentages must be finite numbers");
  }
  return Math.min(100, Math.max(0, value));
}

function finiteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

function statusMessage(
  provider: ProviderDefinition,
  usage: Exclude<RawProviderUsage, RawHealthyProviderUsage>,
): string {
  switch (usage.status) {
    case "not_installed":
      return `${provider.name} is not installed on this machine.`;
    case "unauthenticated":
      return `Sign in with \`${provider.loginCommand}\`, then refresh usage.`;
    case "expired":
      return `The ${provider.name} session expired. Run \`${provider.loginCommand}\`, then refresh usage.`;
    case "error":
      return usage.message.trim() || `${provider.name} usage is unavailable.`;
  }
}

function normalizeProvider(
  definition: ProviderDefinition,
  usage: RawProviderUsage,
): ProviderUsage {
  if (usage.status !== "ok") {
    return {
      id: definition.id,
      name: definition.name,
      status: usage.status,
      accountEmail: usage.status === "error" ? (usage.accountEmail ?? null) : null,
      planLabel: usage.status === "error" ? (usage.planLabel ?? null) : null,
      message: statusMessage(definition, usage),
      windows: [],
    };
  }

  return {
    id: definition.id,
    name: definition.name,
    status: "ok",
    accountEmail: usage.accountEmail,
    planLabel: usage.planLabel,
    message: null,
    windows: usage.windows.map((window) => ({
      label: window.label,
      usedPercent: finiteNumber(window.usedPercent, "usedPercent"),
      barPercent: clampPercent(window.usedPercent),
      resetsAt: window.resetsAt,
      cost:
        window.cost === undefined
          ? null
          : {
              usedUsdCents: finiteNumber(
                window.cost.usedUsdCents,
                "usedUsdCents",
              ),
              limitUsdCents: finiteNumber(
                window.cost.limitUsdCents,
                "limitUsdCents",
              ),
            },
    })),
  };
}

export function normalizeUsage(
  response: RawUsageResponse,
  host: UsageSnapshot["host"],
  fetchedAt = new Date(),
): UsageSnapshot {
  return {
    fetchedAt: fetchedAt.toISOString(),
    host,
    providers: PROVIDERS.map((provider) =>
      normalizeProvider(provider, response[provider.id]),
    ),
  };
}

export function formatUsedPercent(value: number, locale?: string): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatResetTime(
  value: string | null,
  locale?: string,
): string {
  if (value === null) return "Reset unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Reset unavailable";
  return `Resets ${new Intl.DateTimeFormat(locale, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}

export function formatFetchedAt(value: string, locale?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Updated recently";
  return `Updated ${new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}

export function formatCost(cost: UsageCost, locale?: string): string {
  const format = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  });
  return `${format.format(cost.usedUsdCents / 100)} of ${format.format(cost.limitUsdCents / 100)}`;
}

export function providerStatusLabel(status: ProviderStatus): string {
  switch (status) {
    case "ok":
      return "Available";
    case "not_installed":
      return "Not installed";
    case "unauthenticated":
      return "Sign in required";
    case "expired":
      return "Session expired";
    case "error":
      return "Unavailable";
  }
}
