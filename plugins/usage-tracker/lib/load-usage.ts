import {
  loadPoolAccountRecords,
  preferredPoolAccountIds,
  type PoolAccountRecord,
} from "./pool-routing.ts";
import {
  applyPooledAccounts,
  loadPooledAccounts,
  type PoolRpcSdk,
} from "./pooled-usage.ts";
import {
  normalizeUsage,
  providerIdForWireId,
  type ProviderId,
  type RawProviderId,
  type RawUsageResponse,
  type UsageSnapshot,
} from "./usage.ts";

const SUPPLEMENTAL_PROVIDER_IDS = [
  "acp-grok",
  "acp-cursor",
  "acp-opencode",
] as const satisfies readonly RawProviderId[];

export interface UsageSdk {
  threads: {
    get(args: { threadId: string }): Promise<{ environmentId: string | null }>;
    count?(args: {
      groupBy?: "provider";
      status?: "active" | "starting";
    }): Promise<{
      total: number;
      groups?: Array<{ key: string | null; count: number }>;
    }>;
  };
  environments: {
    get(args: { environmentId: string }): Promise<{ hostId: string }>;
  };
  hosts: {
    get(args: { hostId: string }): Promise<{ name: string }>;
  };
  system: {
    usageLimits(args?: {
      hostId?: string;
      providerId?: string;
    }): Promise<RawUsageResponse>;
  };
  /** Present in the plugin runtime; lets pooled accounts replace local usage. */
  plugins?: PoolRpcSdk["plugins"];
}

export async function resolveThreadHostId(
  sdk: Pick<UsageSdk, "threads" | "environments">,
  threadId: string,
): Promise<string | null> {
  const thread = await sdk.threads.get({ threadId });
  if (thread.environmentId === null) return null;

  try {
    const environment = await sdk.environments.get({
      environmentId: thread.environmentId,
    });
    return environment.hostId;
  } catch {
    return null;
  }
}

async function resolveHostName(
  sdk: Pick<UsageSdk, "hosts">,
  hostId: string | null,
): Promise<string | null> {
  if (hostId === null) return null;
  try {
    return (await sdk.hosts.get({ hostId })).name;
  } catch {
    return null;
  }
}

export async function loadUsageSnapshot(
  sdk: UsageSdk,
  threadId: string | null,
  fetchedAt = new Date(),
  overrides: Promise<RawUsageResponse> = Promise.resolve({}),
  poolAccounts: Promise<PoolAccountRecord[]> = loadPoolAccountRecords(),
): Promise<UsageSnapshot> {
  const hostId =
    threadId === null ? null : await resolveThreadHostId(sdk, threadId);
  const plugins = sdk.plugins;
  const [response, hostName, pooled, routedAccounts, overridden] =
    await Promise.all([
      loadRawUsage(sdk, hostId),
      resolveHostName(sdk, hostId),
      plugins === undefined ? null : loadPooledAccounts({ plugins }, hostId),
      poolAccounts,
      overrides,
    ]);

  const snapshot = applyPooledAccounts(
    normalizeUsage(
      { ...response, ...overridden },
      { id: hostId, name: hostName },
      fetchedAt,
    ),
    pooled,
    preferredPoolAccountIds(routedAccounts),
  );
  const activity = await loadInUseProviderIds(sdk, routedAccounts);
  return markProvidersInUse(snapshot, activity.ids, activity.complete);
}

export function inUseProviderIdsFromPool(
  accounts: readonly PoolAccountRecord[],
): Set<ProviderId> {
  const ids = new Set<ProviderId>();
  for (const account of accounts) {
    if (account.inFlight <= 0) continue;
    if (account.provider === "claude") ids.add("claudeCode");
    if (account.provider === "codex") ids.add("codex");
  }
  return ids;
}

export function markProvidersInUse(
  snapshot: UsageSnapshot,
  inUseIds: ReadonlySet<ProviderId>,
  complete = true,
): UsageSnapshot {
  return {
    ...snapshot,
    providers: snapshot.providers.map((provider) => {
      const inUse = inUseIds.has(provider.id);
      if (inUse || complete) return { ...provider, inUse };
      const { inUse: _unknownActivity, ...rest } = provider;
      return rest;
    }),
  };
}

async function loadInUseProviderIds(
  sdk: UsageSdk,
  poolAccounts: readonly PoolAccountRecord[],
): Promise<{ ids: Set<ProviderId>; complete: boolean }> {
  const ids = inUseProviderIdsFromPool(poolAccounts);
  const count = sdk.threads.count;
  if (count === undefined) return { ids, complete: false };
  let complete = true;
  for (const status of ["active", "starting"] as const) {
    try {
      const counted = await count({ groupBy: "provider", status });
      let attributedCount = 0;
      for (const group of counted.groups ?? []) {
        if (group.count <= 0 || group.key === null) continue;
        const providerId = providerIdForWireId(group.key);
        if (providerId !== null) {
          ids.add(providerId);
          attributedCount += group.count;
        }
      }
      if (attributedCount < counted.total) complete = false;
    } catch {
      complete = false;
    }
  }
  return { ids, complete };
}

async function loadRawUsage(
  sdk: UsageSdk,
  hostId: string | null,
): Promise<RawUsageResponse> {
  const bulk =
    hostId === null
      ? await sdk.system.usageLimits()
      : await sdk.system.usageLimits({ hostId });
  const missing = SUPPLEMENTAL_PROVIDER_IDS.filter(
    (providerId) => bulk[providerId] === undefined,
  );
  if (missing.length === 0) return bulk;
  const extras = await Promise.all(
    missing.map(async (providerId) => {
      try {
        return hostId === null
          ? await sdk.system.usageLimits({ providerId })
          : await sdk.system.usageLimits({ hostId, providerId });
      } catch {
        return {} as RawUsageResponse;
      }
    }),
  );
  return Object.assign({}, bulk, ...extras);
}
