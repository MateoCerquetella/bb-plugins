import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import { z } from "zod";
import type { RawProviderUsage, RawUsageWindow } from "./usage.ts";

const execFileAsync = promisify(execFile);
const KEYCHAIN_TIMEOUT_MS = 10_000;
const USAGE_FETCH_TIMEOUT_MS = 15_000;
const USAGE_RESPONSE_MAX_BYTES = 1024 * 1024;
const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

// Claude Code stores its OAuth credentials under "Claude Code-credentials",
// suffixed with a hash of CLAUDE_CONFIG_DIR when that variable is set. Only
// services of that shape are read, so the setting cannot send an unrelated
// Keychain secret to Anthropic.
const CLAUDE_KEYCHAIN_SERVICE_PATTERN =
  /^Claude Code-credentials(?:-[0-9a-f]{8})?$/u;

const credentialsSchema = z.object({
  claudeAiOauth: z.object({
    accessToken: z.string().min(1).max(16_384),
    expiresAt: z.number().finite().nullish(),
    subscriptionType: z.string().trim().max(64).nullish(),
    rateLimitTier: z.string().trim().max(128).nullish(),
  }),
});

type ClaudeCredentials = z.infer<typeof credentialsSchema>["claudeAiOauth"];

const usageWindowSchema = z.object({
  utilization: z.number().finite().nullish(),
  resets_at: z.string().max(128).nullish(),
});

const scopedLimitSchema = z
  .object({
    kind: z.string().max(64),
    scope: z
      .object({
        model: z
          .object({
            display_name: z.string().trim().min(1).max(100).nullish(),
          })
          .nullish(),
      })
      .nullish(),
    percent: z.number().finite().nullish(),
    resets_at: z.string().max(128).nullish(),
  })
  .passthrough();

const usageResponseSchema = z
  .object({
    five_hour: usageWindowSchema.nullish(),
    seven_day: usageWindowSchema.nullish(),
    limits: z
      .array(scopedLimitSchema.nullable().catch(null))
      .max(100)
      .nullish()
      .catch([]),
  })
  .passthrough();

export interface ClaudeKeychainUsageDeps {
  platform: NodeJS.Platform;
  readKeychainSecret(service: string): Promise<string | null>;
  fetch: typeof fetch;
  now(): number;
}

async function readKeychainSecret(service: string): Promise<string | null> {
  const argumentSets = [
    ["find-generic-password", "-s", service, "-a", os.userInfo().username, "-w"],
    ["find-generic-password", "-s", service, "-w"],
  ];
  for (const args of argumentSets) {
    try {
      const { stdout } = await execFileAsync("security", args, {
        timeout: KEYCHAIN_TIMEOUT_MS,
      });
      if (stdout.trim()) return stdout.trim();
    } catch {
      // Try the next lookup; a missing item is reported as unauthenticated.
    }
  }
  return null;
}

const defaultDeps: ClaudeKeychainUsageDeps = {
  platform: process.platform,
  readKeychainSecret,
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
};

export function isClaudeKeychainService(service: string): boolean {
  return (
    !/[\r\n\u2028\u2029]/u.test(service) &&
    CLAUDE_KEYCHAIN_SERVICE_PATTERN.test(service)
  );
}

export function parseClaudeCredentials(raw: string): ClaudeCredentials | null {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  if (/^(?:[0-9a-f]{2})+$/iu.test(trimmed)) {
    candidates.push(Buffer.from(trimmed, "hex").toString("utf8"));
  }
  for (const candidate of candidates) {
    try {
      const parsed = credentialsSchema.safeParse(JSON.parse(candidate));
      if (parsed.success) return parsed.data.claudeAiOauth;
    } catch {
      // Not JSON in this encoding.
    }
  }
  return null;
}

function planLabel(credentials: ClaudeCredentials): string | null {
  const maxMatch = (credentials.rateLimitTier ?? "").match(/max_(\d+)x/u);
  if (maxMatch) return `Max (${maxMatch[1]}x)`;
  const subscription = credentials.subscriptionType;
  return subscription
    ? subscription.charAt(0).toUpperCase() + subscription.slice(1)
    : null;
}

function resetIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function usageWindow(
  value: z.infer<typeof usageWindowSchema> | null | undefined,
  label: string,
): RawUsageWindow | null {
  if (!value || value.utilization == null) return null;
  return {
    label,
    usedPercent: value.utilization,
    resetsAt: resetIso(value.resets_at),
  };
}

function scopedWindows(
  limits: (z.infer<typeof scopedLimitSchema> | null)[] | null | undefined,
): RawUsageWindow[] {
  const windows: RawUsageWindow[] = [];
  const seen = new Set<string>();
  for (const limit of limits ?? []) {
    const label = limit?.scope?.model?.display_name;
    if (
      limit == null ||
      limit.kind !== "weekly_scoped" ||
      label == null ||
      limit.percent == null ||
      seen.has(label.toLowerCase())
    ) {
      continue;
    }
    seen.add(label.toLowerCase());
    windows.push({
      label,
      usedPercent: limit.percent,
      resetsAt: resetIso(limit.resets_at),
    });
  }
  return windows;
}

export function normalizeClaudeUsageResponse(
  raw: unknown,
  credentials: ClaudeCredentials,
): RawProviderUsage {
  const plan = planLabel(credentials);
  const parsed = usageResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Claude usage response was malformed.",
      planLabel: plan,
    };
  }
  const windows = [
    usageWindow(parsed.data.five_hour, "Current session"),
    usageWindow(parsed.data.seven_day, "Weekly limit"),
    ...scopedWindows(parsed.data.limits),
  ].filter((window): window is RawUsageWindow => window !== null);
  if (
    windows.length === 0 ||
    parsed.data.five_hour == null ||
    parsed.data.seven_day == null ||
    parsed.data.five_hour.utilization == null ||
    parsed.data.seven_day.utilization == null
  ) {
    return {
      status: "error",
      message: "Claude usage response was malformed.",
      planLabel: plan,
    };
  }
  return {
    status: "ok",
    // The account email lives in the matching config dir, not the Keychain.
    accountEmail: null,
    planLabel: plan,
    windows,
  };
}

async function readBoundedBody(response: Response): Promise<string | null> {
  if (response.body === null) {
    const body = await response.text();
    return Buffer.byteLength(body, "utf8") <= USAGE_RESPONSE_MAX_BYTES
      ? body
      : null;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > USAGE_RESPONSE_MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Reads Claude Code usage with the credentials stored under an explicit
 * Keychain service, for installs where CLAUDE_CONFIG_DIR changes the service
 * name that BB looks up by default.
 */
export async function readClaudeUsageFromKeychain(
  service: string,
  deps: ClaudeKeychainUsageDeps = defaultDeps,
): Promise<RawProviderUsage> {
  if (deps.platform !== "darwin") {
    return {
      status: "error",
      message: "The Claude Keychain service setting is only supported on macOS.",
    };
  }
  if (!isClaudeKeychainService(service)) {
    return {
      status: "error",
      message:
        "The Claude Keychain service must be `Claude Code-credentials` or `Claude Code-credentials-<8 lowercase hex characters>`.",
    };
  }
  let secret: string | null;
  try {
    secret = await deps.readKeychainSecret(service);
  } catch {
    return {
      status: "error",
      message: "The Claude Keychain item could not be read.",
    };
  }
  const credentials = secret === null ? null : parseClaudeCredentials(secret);
  if (credentials === null) return { status: "unauthenticated" };
  if (credentials.expiresAt != null && deps.now() >= credentials.expiresAt) {
    return { status: "expired" };
  }
  try {
    const response = await deps.fetch(CLAUDE_USAGE_URL, {
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "anthropic-beta": "oauth-2025-04-20",
      },
      signal: AbortSignal.timeout(USAGE_FETCH_TIMEOUT_MS),
    });
    if (response.status === 401) return { status: "expired" };
    if (!response.ok) {
      return {
        status: "error",
        message:
          response.status === 429
            ? "Anthropic temporarily throttled this usage check. This does not mean your Claude limit is exhausted. Try again later."
            : `Claude usage request failed (HTTP ${response.status}).`,
        planLabel: planLabel(credentials),
      };
    }
    const body = await readBoundedBody(response);
    if (body === null) {
      return {
        status: "error",
        message: "Claude usage response was too large.",
        planLabel: planLabel(credentials),
      };
    }
    return normalizeClaudeUsageResponse(JSON.parse(body), credentials);
  } catch {
    return {
      status: "error",
      message: "Claude usage could not be loaded.",
      planLabel: planLabel(credentials),
    };
  }
}
