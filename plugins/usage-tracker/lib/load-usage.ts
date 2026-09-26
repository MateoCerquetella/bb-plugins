import {
  applyPooledAccounts,
  loadPooledAccounts,
  type PoolRpcSdk,
} from "./pooled-usage.ts";
import {
  normalizeUsage,
  type RawUsageResponse,
  type UsageSnapshot,
} from "./usage.ts";

export interface UsageSdk {
  threads: {
    get(args: { threadId: string }): Promise<{ environmentId: string | null }>;
  };
  environments: {
    get(args: { environmentId: string }): Promise<{ hostId: string }>;
  };
  hosts: {
    get(args: { hostId: string }): Promise<{ name: string }>;
  };
  system: {
    usageLimits(args?: { hostId?: string }): Promise<RawUsageResponse>;
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
): Promise<UsageSnapshot> {
  const hostId =
    threadId === null ? null : await resolveThreadHostId(sdk, threadId);
  const plugins = sdk.plugins;
  const [response, hostName, pooled, overridden] = await Promise.all([
    hostId === null
      ? sdk.system.usageLimits()
      : sdk.system.usageLimits({ hostId }),
    resolveHostName(sdk, hostId),
    plugins === undefined ? null : loadPooledAccounts({ plugins }, hostId),
    overrides,
  ]);

  return applyPooledAccounts(
    normalizeUsage({ ...response, ...overridden }, { id: hostId, name: hostName }, fetchedAt),
    pooled,
  );
}
