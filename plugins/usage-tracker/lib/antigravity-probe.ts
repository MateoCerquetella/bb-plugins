import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import type { ProviderUsage, UsageWindow } from "./usage.ts";

const REFRESH_INTERVAL_MS = 5 * 60_000;
const EXEC_TIMEOUT_MS = 10_000;
const NOT_INSTALLED_MESSAGE = "Antigravity is not installed on this machine.";

let cached: ProviderUsage = unavailableUsage("not_installed");
let refreshInFlight: Promise<void> | null = null;
let intervalStarted = false;

function unavailableUsage(status: "not_installed" | "error", message = NOT_INSTALLED_MESSAGE): ProviderUsage {
  return {
    id: "antigravity",
    name: "Antigravity",
    status,
    accountEmail: null,
    planLabel: null,
    message,
    windows: [],
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) if (typeof record[key] === "string") return record[key] as string;
  return null;
}

function fractionValue(record: Record<string, unknown>): number | null {
  const value = record.remaining_fraction ?? record.remainingFraction;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function normalizeWindow(value: unknown, prefix: string): UsageWindow | null {
  const record = asRecord(value);
  if (record === null) return null;
  const fraction = fractionValue(record);
  if (fraction === null) return null;
  const rawLabel = stringValue(record, "label", "name", "window", "period") ?? "limit";
  const label = rawLabel.toLowerCase().includes("week") ? "Weekly limit" :
    (rawLabel.toLowerCase().includes("5") || rawLabel.toLowerCase().includes("hour") ? "5-hour limit" : rawLabel);
  return {
    label: `${prefix}: ${label}`,
    usedPercent: (1 - fraction) * 100,
    barPercent: Math.min(100, Math.max(0, (1 - fraction) * 100)),
    resetsAt: stringValue(record, "reset_time", "resetTime", "resetsAt", "reset_at"),
    cost: null,
  };
}

/** Normalize the JSON emitted by agy, including its two quota groups. */
export function normalizeAntigravityOutput(output: unknown, accountEmail: string | null = null): ProviderUsage {
  let root = asRecord(output);
  if (typeof root?.response === "string") {
    try {
      root = asRecord(JSON.parse(root.response));
    } catch {
      // Keep the original object so the useful validation error is reported.
    }
  }
  if (root === null) throw new TypeError("Antigravity usage output must be an object");
  const groups = Array.isArray(root.groups)
    ? root.groups
    : Array.isArray(root.quota_groups)
      ? root.quota_groups
      : Array.isArray(root.quotaGroups)
        ? root.quotaGroups
        : [];
  const windows: UsageWindow[] = [];
  for (const groupValue of groups) {
    const group = asRecord(groupValue);
    if (group === null) continue;
    const name = stringValue(group, "name", "label", "group") ?? "";
    const prefix = /gemini/i.test(name) ? "Gemini" : /claude|gpt/i.test(name) ? "Claude/GPT" : name;
    const groupWindows = Array.isArray(group.windows)
      ? group.windows
      : Array.isArray(group.limits)
        ? group.limits
        : Array.isArray(group.quotas)
          ? group.quotas
          : [];
    for (const window of groupWindows) {
      const normalized = normalizeWindow(window, prefix);
      if (normalized !== null) windows.push(normalized);
    }
  }
  if (windows.length === 0) throw new TypeError("Antigravity usage output contained no quota windows");
  return {
    id: "antigravity",
    name: "Antigravity",
    status: "ok",
    accountEmail,
    planLabel: stringValue(root, "plan", "planLabel", "current_tier"),
    message: null,
    windows,
  };
}

async function activeAccountEmail(): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(`${homedir()}/.gemini/google_accounts.json`, "utf8")) as unknown;
    const record = asRecord(parsed);
    const active = record?.active;
    if (typeof active === "string") return active;
    return asRecord(active)?.email && typeof asRecord(active)?.email === "string"
      ? (asRecord(active)?.email as string)
      : null;
  } catch {
    return null;
  }
}

function executeAgy(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("agy", ["-p", "/usage", "--output-format", "json"], { timeout: EXEC_TIMEOUT_MS }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

export async function refreshAntigravityUsage(): Promise<void> {
  if (refreshInFlight !== null) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const output = JSON.parse(await executeAgy()) as unknown;
      cached = normalizeAntigravityOutput(output, await activeAccountEmail());
    } catch (error) {
      cached = unavailableUsage(
        "not_installed",
        error instanceof Error && /ENOENT|not found/i.test(error.message)
          ? NOT_INSTALLED_MESSAGE
          : NOT_INSTALLED_MESSAGE,
      );
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export function getCachedAntigravityUsage(): ProviderUsage {
  if (!intervalStarted) {
    intervalStarted = true;
    const interval = setInterval(() => void refreshAntigravityUsage(), REFRESH_INTERVAL_MS);
    interval.unref?.();
  }
  void refreshAntigravityUsage();
  return cached;
}
