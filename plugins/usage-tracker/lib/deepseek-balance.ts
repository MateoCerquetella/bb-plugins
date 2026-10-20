import { z } from "zod";
import type { ProviderUsage, UsageWindow } from "./usage.ts";

export const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";
export const DEEPSEEK_TIMEOUT_MS = 4_000;
export const DEEPSEEK_BASELINE_KEY = "deepSeekToppedUpBaseline";

export const DEEPSEEK_MISSING_KEY_MESSAGE =
  "Add a DeepSeek API key in Settings → Plugins → Usage Tracker, or set DEEPSEEK_API_KEY.";
export const DEEPSEEK_REJECTED_KEY_MESSAGE =
  "The DeepSeek API key was rejected. Check the key and try again.";
export const DEEPSEEK_REQUEST_FAILED_MESSAGE =
  "DeepSeek balance could not be loaded.";
export const DEEPSEEK_INVALID_RESPONSE_MESSAGE =
  "DeepSeek returned an unexpected balance response.";

const amountSchema = z
  .union([z.string(), z.number()])
  .transform((value) => Number(value))
  .pipe(z.number().finite().nonnegative());

const balanceInfoSchema = z
  .object({
    currency: z.string().trim().min(1),
    total_balance: amountSchema,
    granted_balance: amountSchema,
    topped_up_balance: amountSchema,
  })
  .passthrough();

const balancePayloadSchema = z
  .object({
    is_available: z.boolean(),
    balance_infos: z.array(balanceInfoSchema).min(1),
  })
  .passthrough();

export interface DeepSeekBalanceInfo {
  currency: string;
  total: number;
  granted: number;
  toppedUp: number;
}

export interface DeepSeekBalance {
  available: boolean;
  info: DeepSeekBalanceInfo;
}

export interface DeepSeekHttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type DeepSeekFetch = (
  url: string,
  init: {
    method: "GET";
    headers: Record<string, string>;
    signal: AbortSignal;
  },
) => Promise<DeepSeekHttpResponse>;

export interface DeepSeekBaselineStore {
  read(): Promise<number | null>;
  write(baseline: number): Promise<void>;
}

export interface DeepSeekProviderOptions {
  apiKey: string;
  /** Explicit user budget; wins over the persisted baseline when positive. */
  budget: number | null;
  /** Persists an automatic baseline when no explicit budget is configured. */
  baselineStore?: DeepSeekBaselineStore;
  fetch?: DeepSeekFetch;
  signal?: AbortSignal;
  /** Override the network deadline; tests use a small value. */
  timeoutMs?: number;
}

/** Parse the documented balance payload; the first currency entry is the account's. */
export function parseDeepSeekBalance(payload: unknown): DeepSeekBalance {
  const parsed = balancePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new TypeError(DEEPSEEK_INVALID_RESPONSE_MESSAGE);
  }
  const info = parsed.data.balance_infos[0]!;
  return {
    available: parsed.data.is_available,
    info: {
      currency: info.currency,
      total: info.total_balance,
      granted: info.granted_balance,
      toppedUp: info.topped_up_balance,
    },
  };
}

/** Prefer the secret setting; fall back to the server environment. */
export function resolveDeepSeekApiKey(
  settingsKey: string,
  envKey: string | undefined,
): string {
  return settingsKey.trim() || (envKey ?? "").trim();
}

/** Read the optional budget setting. Empty or non-positive values disable the percentage. */
export function parseDeepSeekBudget(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const budget = Number(value.trim());
  return Number.isFinite(budget) && budget > 0 ? budget : null;
}

/**
 * Resolve the budget baseline. An explicit budget always wins; otherwise the
 * first positive topped-up balance is stored and later top-ups raise it. KV
 * failures are non-fatal so a successful balance fetch still renders.
 */
export async function resolveDeepSeekBudget(
  toppedUp: number,
  explicitBudget: number | null,
  store: DeepSeekBaselineStore | undefined,
): Promise<number | null> {
  if (explicitBudget !== null) return explicitBudget;
  if (store === undefined) return null;

  let stored: number | null = null;
  try {
    const value = await store.read();
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      stored = value;
    }
  } catch {
    stored = null;
  }

  if (stored === null && !(Number.isFinite(toppedUp) && toppedUp > 0)) {
    return null;
  }
  const baseline = stored === null ? toppedUp : Math.max(stored, toppedUp);
  if (baseline !== stored) {
    try {
      await store.write(baseline);
    } catch {
      // A failed write leaves the current reading usable.
    }
  }
  return baseline;
}

/** Share of the topped-up budget already spent; 100% means the balance reached 0. */
export function deepSeekBudgetPercent(
  total: number,
  budget: number | null,
): number | null {
  if (budget === null || !Number.isFinite(budget) || budget <= 0) return null;
  if (!Number.isFinite(total)) return null;
  return Math.min(100, Math.max(0, ((budget - total) / budget) * 100));
}

function unavailableProvider(
  status: "unauthenticated" | "error",
  message: string,
): ProviderUsage {
  return {
    id: "deepSeek",
    name: "DeepSeek",
    status,
    accountEmail: null,
    planLabel: null,
    message,
    windows: [],
    inUse: false,
  };
}

function providerFromBalance(
  balance: DeepSeekBalance,
  budget: number | null,
  metric: number,
  budgetSource: "explicit" | "toppedUp" | null,
): ProviderUsage {
  const usedPercent = deepSeekBudgetPercent(metric, budget);
  const windows: UsageWindow[] =
    usedPercent === null
      ? []
      : [
          {
            label: "Balance budget",
            usedPercent,
            barPercent: usedPercent,
            resetsAt: null,
            cost: null,
            kind: "custom",
          },
        ];
  return {
    id: "deepSeek",
    name: "DeepSeek",
    status: "ok",
    accountEmail: null,
    planLabel: null,
    message: null,
    windows,
    inUse: false,
    balance: {
      currency: balance.info.currency,
      total: balance.info.total,
      granted: balance.info.granted,
      toppedUp: balance.info.toppedUp,
      available: balance.available,
      budget,
      budgetSource,
      usedPercent,
    },
  };
}

function timeoutSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

/** Load one DeepSeek provider record. Never throws and never exposes the key. */
export async function loadDeepSeekProvider(
  options: DeepSeekProviderOptions,
): Promise<ProviderUsage> {
  const apiKey = options.apiKey.trim();
  if (apiKey === "") {
    return unavailableProvider("unauthenticated", DEEPSEEK_MISSING_KEY_MESSAGE);
  }

  const request = options.fetch ?? (fetch as DeepSeekFetch);
  let response: DeepSeekHttpResponse;
  try {
    response = await request(DEEPSEEK_BALANCE_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: timeoutSignal(options.signal, options.timeoutMs ?? DEEPSEEK_TIMEOUT_MS),
    });
  } catch {
    return unavailableProvider("error", DEEPSEEK_REQUEST_FAILED_MESSAGE);
  }

  if (response.status === 401 || response.status === 403) {
    return unavailableProvider("unauthenticated", DEEPSEEK_REJECTED_KEY_MESSAGE);
  }
  if (!response.ok) {
    return unavailableProvider(
      "error",
      `DeepSeek returned HTTP ${response.status}.`,
    );
  }

  try {
    const balance = parseDeepSeekBalance(await response.json());
    const budget = await resolveDeepSeekBudget(
      balance.info.toppedUp,
      options.budget,
      options.baselineStore,
    );
    return providerFromBalance(
      balance,
      budget,
      options.budget === null ? balance.info.toppedUp : balance.info.total,
      budget === null
        ? null
        : options.budget === null
          ? "toppedUp"
          : "explicit",
    );
  } catch {
    return unavailableProvider("error", DEEPSEEK_INVALID_RESPONSE_MESSAGE);
  }
}
