import {
  loadPoolAccountRecords,
  preferredPoolAccountIds,
  type PoolAccountRecord,
} from "./pool-routing.ts";
import {
  applyPooledAccounts,
  loadPooledAccounts,
  withTimeout,
  type PoolRpcSdk,
} from "./pooled-usage.ts";
import {
  dedupeByAccountEmail,
  normalizeUsage,
  providerIdForWireId,
  type ProviderId,
  type ProviderUsage,
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
    count?(args?: {
      groupBy?: "provider";
      status?: "active" | "starting";
    }): Promise<{
      total: number;
      groups?: Array<{ key: string | null; count: number }>;
    }>;
  };
  hosts: {
    list(args?: { signal?: AbortSignal }): Promise<UsageHost[]>;
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

export interface UsageHost {
  id: string;
  name: string;
  status: "connected" | "disconnected";
  lastSeenAt: number | null;
}

/** One machine's raw readings. A null host id marks readings not tied to a machine. */
interface UsageSource {
  host: { id: string | null; name: string | null; lastSeenAt: number | null };
  response: RawUsageResponse;
}

type MachineReading = { host: UsageSource["host"]; snapshot: UsageSnapshot };

const HOST_USAGE_TIMEOUT_MS = 8_000;

/** Connected machines only, so an offline machine's accounts stay hidden until it reconnects. */
async function connectedHosts(sdk: UsageSdk): Promise<UsageSource["host"][]> {
  try {
    return (await sdk.hosts.list()).filter((host) => host.status === "connected");
  } catch {
    // The host list is unreadable: fall back to the primary machine.
    return [{ id: null, name: null, lastSeenAt: null }];
  }
}

export async function loadUsageSnapshot(
  sdk: UsageSdk,
  fetchedAt = new Date(),
  overrides: Promise<RawUsageResponse> = Promise.resolve({}),
  poolAccounts: Promise<PoolAccountRecord[]> = loadPoolAccountRecords(),
): Promise<UsageSnapshot> {
  const plugins = sdk.plugins;
  const [hosts, overridden, pooled, routedAccounts] = await Promise.all([
    connectedHosts(sdk),
    overrides,
    plugins === undefined ? null : loadPooledAccounts({ plugins }),
    poolAccounts,
  ]);
  const readings = await Promise.all(
    hosts.map(async (host) => {
      const response = await withTimeout(
        loadRawUsage(sdk, host.id),
        HOST_USAGE_TIMEOUT_MS,
      ).catch(() => null);
      return response === null ? null : { host, response };
    }),
  );
  const snapshot = applyPooledAccounts(
    mergeAccountSources(
      readings.filter((reading): reading is UsageSource => reading !== null),
      overridden,
      fetchedAt,
    ),
    pooled,
    preferredPoolAccountIds(routedAccounts),
  );
  const activity = await loadInUseProviderIds(sdk, routedAccounts);
  return markProvidersInUse(snapshot, activity.ids, activity.complete);
}

const freshness = (host: UsageSource["host"]): number => host.lastSeenAt ?? 0;

/**
 * Merges every connected machine's readings into one account list per provider.
 * The same email on two machines shows once, from the most recently seen machine.
 * Local overrides (the Keychain read) fill a provider only when no machine reports it healthy.
 */
function mergeAccountSources(
  sources: readonly UsageSource[],
  overridden: RawUsageResponse,
  fetchedAt: Date,
): UsageSnapshot {
  const machines: MachineReading[] = sources.map((source) => ({
    host: source.host,
    snapshot: normalizeUsage(source.response, source.host, fetchedAt),
  }));
  const local = normalizeUsage(overridden, { id: null, name: null }, fetchedAt);
  return {
    fetchedAt: fetchedAt.toISOString(),
    host: { id: null, name: null },
    providers: local.providers.map((provider) =>
      mergeProvider(provider.id, machines, provider),
    ),
  };
}

function mergeProvider(
  providerId: ProviderId,
  machines: readonly MachineReading[],
  local: ProviderUsage,
): ProviderUsage {
  const candidates = machines
    .map(({ host, snapshot }) => ({
      host,
      provider: snapshot.providers.find((provider) => provider.id === providerId)!,
    }))
    .sort((a, b) => freshness(b.host) - freshness(a.host));
  const healthy = candidates.filter(({ provider }) => provider.status === "ok");
  if (healthy.length === 0) {
    // Keychain read wins over unhealthy machines; otherwise show the freshest status.
    return local.status === "ok" ? local : (candidates[0]?.provider ?? local);
  }

  const accounts = dedupeByAccountEmail(healthy, ({ host, provider }) => ({
    email: provider.accountEmail,
    ok: true,
    freshness: freshness(host),
  }));
  const best = accounts[0]!;
  if (accounts.length === 1) return best.provider;
  return {
    ...best.provider,
    accounts: accounts.map(({ host, provider }) => ({
      id: host.id ?? "local",
      label: host.name ?? "This machine",
      status: provider.status,
      accountEmail: provider.accountEmail,
      planLabel: provider.planLabel,
      message: provider.message,
      observedAt: null,
      windows: provider.windows,
    })),
  };
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
