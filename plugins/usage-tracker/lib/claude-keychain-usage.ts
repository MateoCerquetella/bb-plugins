import { execFile, spawn } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import { z } from "zod";
import type { RawProviderUsage, RawUsageWindow } from "./usage.ts";

const execFileAsync = promisify(execFile);
const KEYCHAIN_TIMEOUT_MS = 10_000;
const USAGE_FETCH_TIMEOUT_MS = 15_000;
const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

// Claude Code stores its OAuth credentials under "Claude Code-credentials",
// suffixed with a hash of CLAUDE_CONFIG_DIR when that variable is set. Only
// services of that shape are read, so the setting cannot send an unrelated
// Keychain secret to Anthropic.
const CLAUDE_KEYCHAIN_SERVICE_PATTERN = /^Claude Code-credentials(?:-[0-9a-f]+)?$/u;

const credentialsSchema = z.object({
  claudeAiOauth: z.object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1).nullish(),
    expiresAt: z.number().nullish(),
    subscriptionType: z.string().nullish(),
    rateLimitTier: z.string().nullish(),
  }).passthrough(),
}).passthrough();

type ClaudeCredentials = z.infer<typeof credentialsSchema>["claudeAiOauth"];

const usageWindowSchema = z.object({
  utilization: z.number().nullish(),
  resets_at: z.string().nullish(),
});

const scopedLimitSchema = z
  .object({
    kind: z.string(),
    scope: z
      .object({
        model: z
          .object({ display_name: z.string().trim().min(1).nullish() })
          .nullish(),
      })
      .nullish(),
    percent: z.number().nullish(),
    resets_at: z.string().nullish(),
  })
  .passthrough();

const usageResponseSchema = z
  .object({
    five_hour: usageWindowSchema.nullish(),
    seven_day: usageWindowSchema.nullish(),
    limits: z
      .array(scopedLimitSchema.nullable().catch(null))
      .nullish()
      .catch([]),
  })
  .passthrough();

export interface ClaudeKeychainUsageDeps {
  platform: NodeJS.Platform;
  readKeychainSecret(service: string): Promise<string | null>;
  writeKeychainSecret(service: string, secret: string): Promise<void>;
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
  writeKeychainSecret,
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
};

async function writeKeychainSecret(service: string, secret: string): Promise<void> {
  // Interactive stdin keeps credentials out of process arguments and error objects.
  const encoded = secret.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"');
  let account = "";
  try {
    await execFileAsync("/usr/bin/security", [
      "find-generic-password", "-s", service, "-a", os.userInfo().username,
    ], { timeout: KEYCHAIN_TIMEOUT_MS });
    const username = os.userInfo().username;
    if (!/^[a-zA-Z0-9._-]+$/u.test(username)) throw new Error("Unsupported account");
    account = ` -a "${username}"`;
  } catch {
    // Match the service-only fallback used by the reader.
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn("/usr/bin/security", ["-i"], {
      stdio: ["pipe", "ignore", "ignore"],
      timeout: KEYCHAIN_TIMEOUT_MS,
    });
    child.on("error", () => reject(new Error("Keychain update failed")));
    child.on("close", code => code === 0 ? resolve() : reject(new Error("Keychain update failed")));
    child.stdin.on("error", () => reject(new Error("Keychain update failed")));
    child.stdin.end(`add-generic-password -U -s "${service}"${account} -w "${encoded}"\nquit\n`);
  });
  const stored = await readKeychainSecret(service);
  const parsed = stored === null ? null : parseCredentialDocument(stored);
  if (JSON.stringify(parsed) !== JSON.stringify(parseCredentialDocument(secret))) {
    throw new Error("Keychain update could not be verified");
  }
}

export function isClaudeKeychainService(service: string): boolean {
  return CLAUDE_KEYCHAIN_SERVICE_PATTERN.test(service);
}

export function parseClaudeCredentials(raw: string): ClaudeCredentials | null {
  return parseCredentialDocument(raw)?.claudeAiOauth ?? null;
}

function parseCredentialDocument(raw: string): z.infer<typeof credentialsSchema> | null {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  if (/^(?:[0-9a-f]{2})+$/iu.test(trimmed)) {
    candidates.push(Buffer.from(trimmed, "hex").toString("utf8"));
  }
  for (const candidate of candidates) {
    try {
      const parsed = credentialsSchema.safeParse(JSON.parse(candidate));
      if (parsed.success) return parsed.data;
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
  return {
    status: "ok",
    // The account email lives in the matching config dir, not the Keychain.
    accountEmail: null,
    planLabel: plan,
    windows: [
      usageWindow(parsed.data.five_hour, "Current session"),
      usageWindow(parsed.data.seven_day, "Weekly limit"),
      ...scopedWindows(parsed.data.limits),
    ].filter((window): window is RawUsageWindow => window !== null),
  };
}

/**
 * Reads Claude Code usage with the credentials stored under an explicit
 * Keychain service, for installs where CLAUDE_CONFIG_DIR changes the service
 * name that BB looks up by default.
 */
const inFlight = new Map<string, Promise<RawProviderUsage>>();

export function readClaudeUsageFromKeychain(
  service: string,
  deps: ClaudeKeychainUsageDeps = defaultDeps,
): Promise<RawProviderUsage> {
  if (deps !== defaultDeps) return readUsage(service, deps);
  const existing = inFlight.get(service);
  if (existing) return existing;
  const pending = readUsage(service, deps).finally(() => inFlight.delete(service));
  inFlight.set(service, pending);
  return pending;
}

async function readUsage(
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
        "The Claude Keychain service must look like `Claude Code-credentials` or `Claude Code-credentials-<hash>`.",
    };
  }
  const secret = await deps.readKeychainSecret(service);
  const document = secret === null ? null : parseCredentialDocument(secret);
  if (document === null) return { status: "unauthenticated" };
  let credentials = document.claudeAiOauth;
  try {
    const refresh = async (): Promise<boolean> => {
      if (!credentials.refreshToken) return false;
      const response = await deps.fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: credentials.refreshToken,
          client_id: CLIENT_ID,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(USAGE_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error("Refresh failed");
      const tokens = z.object({
        access_token: z.string().min(1),
        refresh_token: z.string().min(1).optional(),
        expires_in: z.number().positive().finite(),
      }).parse(await response.json());
      credentials = {
        ...credentials,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? credentials.refreshToken,
        expiresAt: deps.now() + tokens.expires_in * 1000,
      };
      await deps.writeKeychainSecret(service, JSON.stringify({
        ...document, claudeAiOauth: credentials,
      }));
      return true;
    };
    let refreshed = false;
    if (credentials.expiresAt != null && deps.now() >= credentials.expiresAt) {
      refreshed = await refresh();
      if (!refreshed) return { status: "expired" };
    }
    const request = () => deps.fetch(CLAUDE_USAGE_URL, {
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "anthropic-beta": "oauth-2025-04-20",
      },
      signal: AbortSignal.timeout(USAGE_FETCH_TIMEOUT_MS),
      redirect: "error",
    });
    let response = await request();
    if (response.status === 401 && !refreshed && await refresh()) response = await request();
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
    return normalizeClaudeUsageResponse(await response.json(), credentials);
  } catch {
    return {
      status: "error",
      message: "Claude usage or credential refresh failed. Refresh this account in Claude Code and try again.",
      planLabel: planLabel(credentials),
    };
  }
}
