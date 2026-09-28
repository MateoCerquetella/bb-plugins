import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProviderId } from "./usage.ts";

const execFileAsync = promisify(execFile);
const EXEC_TIMEOUT_MS = 12_000;

export type PoolProvider = "claude" | "codex";

export interface PoolAccountRecord {
  id: string;
  provider: PoolProvider;
  email: string | null;
  label: string;
  enabled: boolean;
  status: string;
  priority: number;
  lastUsedAt: number | null;
  inFlight: number;
}

export function poolProviderFor(providerId: ProviderId): PoolProvider | null {
  if (providerId === "claudeCode") return "claude";
  if (providerId === "codex") return "codex";
  return null;
}

export function currentPoolAccountId(
  accounts: readonly PoolAccountRecord[],
  provider: PoolProvider,
): string | null {
  const mine = accounts.filter((account) => account.provider === provider);
  const enabled = mine.filter((account) => account.enabled);
  const pool = enabled.length > 0 ? enabled : mine;
  const flying = pool
    .filter((account) => account.inFlight > 0)
    .sort((left, right) => (right.lastUsedAt ?? 0) - (left.lastUsedAt ?? 0));
  if (flying[0] !== undefined) return flying[0].id;
  const ready = pool
    .filter((account) => account.status === "ready")
    .sort((left, right) => (right.lastUsedAt ?? 0) - (left.lastUsedAt ?? 0));
  if (ready[0] !== undefined) return ready[0].id;
  const recent = [...pool].sort(
    (left, right) => (right.lastUsedAt ?? 0) - (left.lastUsedAt ?? 0),
  );
  return recent[0]?.id ?? null;
}

export function preferredPoolAccountIds(
  accounts: readonly PoolAccountRecord[],
): Partial<Record<ProviderId, string>> {
  const preferred: Partial<Record<ProviderId, string>> = {};
  const claude = currentPoolAccountId(accounts, "claude");
  const codex = currentPoolAccountId(accounts, "codex");
  if (claude !== null) preferred.claudeCode = claude;
  if (codex !== null) preferred.codex = codex;
  return preferred;
}

export function poolOwnsProvider(
  accounts: readonly PoolAccountRecord[],
  provider: PoolProvider,
): boolean {
  return accounts.some((account) => account.provider === provider);
}

export function parsePoolAccountList(payload: unknown): PoolAccountRecord[] {
  const root =
    payload !== null && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const rows = Array.isArray(root.accounts) ? root.accounts : [];
  const accounts: PoolAccountRecord[] = [];
  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const provider = record.provider;
    if (id === "" || (provider !== "claude" && provider !== "codex")) continue;
    accounts.push({
      id,
      provider,
      email: typeof record.email === "string" ? record.email : null,
      label: typeof record.label === "string" ? record.label : id,
      enabled: record.enabled === true,
      status: typeof record.status === "string" ? record.status : "unknown",
      priority: typeof record.priority === "number" ? record.priority : 100,
      lastUsedAt:
        typeof record.lastUsedAt === "number" ? record.lastUsedAt : null,
      inFlight: typeof record.inFlight === "number" ? record.inFlight : 0,
    });
  }
  return accounts;
}

function bbBin(): string {
  return process.env.BB_CLI && process.env.BB_CLI.length > 0
    ? process.env.BB_CLI
    : "bb";
}

async function runPool(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(bbBin(), ["pool", ...args], {
    timeout: EXEC_TIMEOUT_MS,
    maxBuffer: 2_000_000,
  });
  return stdout;
}

export async function loadPoolAccountRecords(
  run: (args: string[]) => Promise<string> = runPool,
): Promise<PoolAccountRecord[]> {
  try {
    const stdout = await run(["account", "list", "--json"]);
    return parsePoolAccountList(JSON.parse(stdout) as unknown);
  } catch {
    return [];
  }
}

export interface PoolSwitchDependencies {
  loadAccounts?: () => Promise<PoolAccountRecord[]>;
  run?: (args: string[]) => Promise<string>;
}

let switchQueue: Promise<void> = Promise.resolve();

async function restorePoolAccounts(
  provider: PoolProvider,
  accounts: readonly PoolAccountRecord[],
  run: (args: string[]) => Promise<string>,
): Promise<void> {
  const order = accounts.map((account) => account.id);
  if (order.length > 0) {
    await run(["account", "reorder", provider, ...order]);
  }
  for (const account of accounts) {
    await run(["account", "priority", account.id, String(account.priority)]);
    await run([
      "account",
      account.enabled ? "enable" : "disable",
      account.id,
    ]);
  }
}

async function performPoolAccountSwitch(
  providerId: ProviderId,
  accountId: string,
  dependencies: PoolSwitchDependencies,
): Promise<void> {
  const provider = poolProviderFor(providerId);
  if (provider === null) {
    throw new Error("This provider is not routed through Account Pooler.");
  }
  const run = dependencies.run ?? runPool;
  const accounts = await (dependencies.loadAccounts?.() ??
    loadPoolAccountRecords(run));
  const mine = accounts.filter((account) => account.provider === provider);
  if (!mine.some((account) => account.id === accountId)) {
    throw new Error("That account is not in Account Pooler.");
  }
  try {
    await run(["account", "enable", accountId]);
    const order = [
      accountId,
      ...mine.map((account) => account.id).filter((id) => id !== accountId),
    ];
    await run(["account", "reorder", provider, ...order]);
    await run(["account", "priority", accountId, "0"]);
    for (const account of mine) {
      if (account.id === accountId || !account.enabled) continue;
      await run(["account", "disable", account.id]);
    }
  } catch (error) {
    try {
      await restorePoolAccounts(provider, mine, run);
    } catch {
      throw new AggregateError(
        [error],
        "Account switch failed and Account Pooler state could not be restored.",
      );
    }
    throw error;
  }
}

export function switchPoolAccount(
  providerId: ProviderId,
  accountId: string,
  dependencies: PoolSwitchDependencies = {},
): Promise<void> {
  const operation = switchQueue.then(() =>
    performPoolAccountSwitch(providerId, accountId, dependencies),
  );
  switchQueue = operation.catch(() => undefined);
  return operation;
}
