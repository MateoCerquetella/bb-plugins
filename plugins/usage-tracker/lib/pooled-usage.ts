import { z } from "zod";
import {
  clampPercent,
  providerIdForWireId,
  type PooledAccountUsage,
  type ProviderId,
  type ProviderUsage,
  type UsageSnapshot,
  type UsageWindow,
} from "./usage.ts";

/**
 * Reads per-account usage from the Account Pooler plugin through its
 * `provider-usage.v1` RPC source. bb's own usage endpoint only sees the
 * host-local login, so with several pooled accounts it reports one of them.
 */
export const ACCOUNT_POOL_PLUGIN_ID = "account-pool";
const LIST_METHOD = "provider-usage.v1.listResources";
const GET_METHOD = "provider-usage.v1.getResource";
const POOL_TIMEOUT_MS = 5_000;

const scopeSchema = z.union([
  z.object({ kind: z.literal("shared") }),
  z.object({ kind: z.literal("host"), hostId: z.string(), hostName: z.string() }),
]);

const listResourcesSchema = z.object({
  label: z.string().optional(),
  resources: z.array(
    z.object({
      id: z.string().min(1),
      providerId: z.string().min(1),
      label: z.string().min(1),
      scope: scopeSchema,
    }),
  ),
});

const planSchema = z
  .object({ id: z.string(), multiplier: z.number().nullable() })
  .nullable()
  .optional();

const identitySchema = {
  plan: planSchema,
  accountEmail: z.string().nullable(),
  planLabel: z.string().nullable(),
};

const poolWindowSchema = z.object({
  kind: z.enum(["five-hour", "daily", "weekly", "custom"]).catch("custom"),
  id: z.string().min(1),
  label: z.string().min(1),
  usedPercent: z.number().finite(),
  resetsAt: z.string().nullable(),
  model: z.string().nullable().optional(),
  cost: z
    .object({ usedUsdCents: z.number(), limitUsdCents: z.number() })
    .nullable()
    .optional(),
});

const getResourceSchema = z.object({
  observedAt: z.number().nullable(),
  usage: z.discriminatedUnion("status", [
    z.object({
      status: z.literal("ok"),
      ...identitySchema,
      windows: z.array(poolWindowSchema),
    }),
    z.object({ status: z.literal("not_installed"), ...identitySchema }),
    z.object({ status: z.literal("unauthenticated"), ...identitySchema }),
    z.object({ status: z.literal("expired"), ...identitySchema }),
    z.object({
      status: z.literal("error"),
      ...identitySchema,
      message: z.string(),
    }),
  ]),
});

export type PoolResourceList = z.infer<typeof listResourcesSchema>;
export type PoolResourceUsage = z.infer<typeof getResourceSchema>;
type PoolWindow = z.infer<typeof poolWindowSchema>;

export interface PoolRpcSdk {
  plugins: {
    callRpc<TOutput>(args: {
      pluginId: string;
      method: string;
      input?: Record<string, string | boolean>;
      outputSchema: z.ZodType<TOutput>;
    }): Promise<TOutput>;
  };
}

/** Pooled account usage plus the weight its plan carries in combined totals. */
export interface PooledAccount {
  usage: PooledAccountUsage;
  weight: number;
  poolWindows: PoolWindow[];
}

export type PooledAccountsByProvider = Map<ProviderId, PooledAccount[]>;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Account Pooler timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function toUsageWindow(window: PoolWindow): UsageWindow {
  return {
    label: window.label,
    usedPercent: window.usedPercent,
    barPercent: clampPercent(window.usedPercent),
    resetsAt: window.resetsAt,
    cost: window.cost ?? null,
  };
}

function accountMessage(usage: PoolResourceUsage["usage"]): string | null {
  switch (usage.status) {
    case "ok":
      return null;
    case "not_installed":
      return "This account is unavailable in Account Pooler.";
    case "unauthenticated":
      return "Sign-in required. Re-add this account in Account Pooler.";
    case "expired":
      return "Session expired. Refresh this account in Account Pooler.";
    case "error":
      return usage.message.trim() || "Usage is unavailable.";
  }
}

export function pooledAccountFromResource(
  resource: PoolResourceList["resources"][number],
  result: PoolResourceUsage | Error,
): PooledAccount {
  if (result instanceof Error) {
    return {
      usage: {
        id: resource.id,
        label: resource.label,
        status: "error",
        accountEmail: null,
        planLabel: null,
        message: result.message || "Usage is unavailable.",
        observedAt: null,
        windows: [],
      },
      weight: 1,
      poolWindows: [],
    };
  }

  const { usage } = result;
  const poolWindows = usage.status === "ok" ? usage.windows : [];
  const multiplier = usage.plan?.multiplier;
  return {
    usage: {
      id: resource.id,
      label: resource.label,
      status: usage.status,
      accountEmail: usage.accountEmail,
      planLabel: usage.planLabel,
      message: accountMessage(usage),
      observedAt:
        result.observedAt === null
          ? null
          : new Date(result.observedAt).toISOString(),
      windows: poolWindows.map(toUsageWindow),
    },
    weight:
      typeof multiplier === "number" && multiplier > 0 ? multiplier : 1,
    poolWindows,
  };
}

/**
 * Lists every pooled account and its cached usage. Returns null when the
 * Account Pooler is missing, disabled, or unresponsive so callers fall back
 * to bb's host-local usage.
 */
export async function loadPooledAccounts(
  sdk: PoolRpcSdk,
  hostId: string | null,
): Promise<PooledAccountsByProvider | null> {
  let list: PoolResourceList;
  try {
    list = await withTimeout(
      sdk.plugins.callRpc({
        pluginId: ACCOUNT_POOL_PLUGIN_ID,
        method: LIST_METHOD,
        input: {},
        outputSchema: listResourcesSchema,
      }),
      POOL_TIMEOUT_MS,
    );
  } catch {
    return null;
  }

  const resources = list.resources.filter(
    (resource) =>
      providerIdForWireId(resource.providerId) !== null &&
      (resource.scope.kind === "shared" ||
        resource.scope.hostId === hostId),
  );
  const results = await Promise.all(
    resources.map((resource) =>
      withTimeout(
        sdk.plugins.callRpc({
          pluginId: ACCOUNT_POOL_PLUGIN_ID,
          method: GET_METHOD,
          input: { resourceId: resource.id, refresh: false },
          outputSchema: getResourceSchema,
        }),
        POOL_TIMEOUT_MS,
      ).catch((error: unknown) =>
        error instanceof Error ? error : new Error("Usage is unavailable."),
      ),
    ),
  );

  const byProvider: PooledAccountsByProvider = new Map();
  resources.forEach((resource, index) => {
    const providerId = providerIdForWireId(resource.providerId);
    if (providerId === null) return;
    const accounts = byProvider.get(providerId) ?? [];
    accounts.push(pooledAccountFromResource(resource, results[index]!));
    byProvider.set(providerId, accounts);
  });
  return byProvider;
}

function windowKey(window: PoolWindow): string {
  return window.kind === "custom"
    ? `custom:${window.id}`
    : `${window.kind}:${window.model ?? ""}`;
}

function windowRank(window: PoolWindow): number {
  if (window.model != null) return 2;
  if (window.kind === "five-hour") return 0;
  if (window.kind === "weekly") return 1;
  return 2;
}

/**
 * Combines matching windows across healthy accounts into one plan-weighted
 * reading: the share of the pool's total capacity already used. Each combined
 * window resets when its earliest account resets.
 */
export function combinePooledWindows(
  accounts: readonly PooledAccount[],
): UsageWindow[] {
  const groups = new Map<
    string,
    { first: PoolWindow; weightedUsed: number; weight: number; resets: string[] }
  >();
  for (const account of accounts) {
    if (account.usage.status !== "ok") continue;
    for (const window of account.poolWindows) {
      const key = windowKey(window);
      const group = groups.get(key) ?? {
        first: window,
        weightedUsed: 0,
        weight: 0,
        resets: [],
      };
      group.weightedUsed += window.usedPercent * account.weight;
      group.weight += account.weight;
      if (window.resetsAt !== null) group.resets.push(window.resetsAt);
      groups.set(key, group);
    }
  }

  return [...groups.values()]
    .map((group, order) => ({ group, order }))
    .sort(
      (a, b) =>
        windowRank(a.group.first) - windowRank(b.group.first) ||
        a.order - b.order,
    )
    .map(({ group }) => {
      const usedPercent =
        Math.round((group.weightedUsed / group.weight) * 10) / 10;
      const resetsAt =
        group.resets
          .filter((value) => !Number.isNaN(Date.parse(value)))
          .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
      return {
        label: group.first.label,
        usedPercent,
        barPercent: clampPercent(usedPercent),
        resetsAt,
        cost: null,
      };
    });
}

function sharedValue(values: readonly (string | null)[]): string | null {
  const first = values[0] ?? null;
  return values.every((value) => value === first) ? first : null;
}

export function pooledProviderUsage(
  provider: ProviderUsage,
  accounts: readonly PooledAccount[],
): ProviderUsage {
  const healthy = accounts.filter((account) => account.usage.status === "ok");
  const unavailableCount = accounts.length - healthy.length;
  const status = healthy.length > 0 ? "ok" : accounts[0]!.usage.status;
  return {
    ...provider,
    status,
    accountEmail:
      accounts.length === 1 ? accounts[0]!.usage.accountEmail : null,
    planLabel: sharedValue(accounts.map((account) => account.usage.planLabel)),
    message:
      status === "ok"
        ? unavailableCount === 0
          ? null
          : `${unavailableCount} of ${accounts.length} pooled accounts unavailable.`
        : (accounts[0]!.usage.message ?? "Pooled usage is unavailable."),
    windows: accounts.length === 1
      ? accounts[0]!.usage.windows
      : combinePooledWindows(accounts),
    accounts: accounts.map((account) => account.usage),
  };
}

/** Replaces host-local usage with pooled usage for providers the pool serves. */
export function applyPooledAccounts(
  snapshot: UsageSnapshot,
  pooled: PooledAccountsByProvider | null,
): UsageSnapshot {
  if (pooled === null) return snapshot;
  return {
    ...snapshot,
    providers: snapshot.providers.map((provider) => {
      const accounts = pooled.get(provider.id);
      return accounts === undefined || accounts.length === 0
        ? provider
        : pooledProviderUsage(provider, accounts);
    }),
  };
}
