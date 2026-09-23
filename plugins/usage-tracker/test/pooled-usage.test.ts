import assert from "node:assert/strict";
import test from "node:test";
import { loadUsageSnapshot, type UsageSdk } from "../lib/load-usage.ts";
import {
  applyPooledAccounts,
  combinePooledWindows,
  loadPooledAccounts,
  pooledAccountFromResource,
  type PoolRpcSdk,
  type PoolResourceUsage,
} from "../lib/pooled-usage.ts";
import { normalizeUsage } from "../lib/usage.ts";
import { sidebarUsageWindows } from "../lib/sidebar-usage.ts";

type Resource = {
  id: string;
  providerId: string;
  label: string;
  scope: { kind: "shared" } | { kind: "host"; hostId: string; hostName: string };
};

function claudeUsage(
  email: string,
  fiveHour: number,
  weekly: number,
  weeklyResetsAt: string,
  multiplier: number | null = 20,
): PoolResourceUsage {
  return {
    observedAt: Date.parse("2026-09-23T12:00:00.000Z"),
    usage: {
      status: "ok",
      plan: { id: "max", multiplier },
      accountEmail: email,
      planLabel: "Max (20x)",
      windows: [
        {
          kind: "five-hour",
          id: "five-hour",
          label: "Five-hour limit",
          usedPercent: fiveHour,
          resetsAt: "2026-09-23T20:00:00.000Z",
          model: null,
          cost: null,
        },
        {
          kind: "weekly",
          id: "weekly",
          label: "Weekly limit",
          usedPercent: weekly,
          resetsAt: weeklyResetsAt,
          model: null,
          cost: null,
        },
        {
          kind: "weekly",
          id: "weekly:fable",
          label: "Weekly · fable",
          usedPercent: weekly / 2,
          resetsAt: weeklyResetsAt,
          model: "fable",
          cost: null,
        },
      ],
    },
  };
}

const RESOURCES: Resource[] = [
  { id: "a", providerId: "claude-code", label: "a@example.com", scope: { kind: "shared" } },
  { id: "b", providerId: "claude-code", label: "b@example.com", scope: { kind: "shared" } },
  { id: "c", providerId: "codex", label: "c@example.com", scope: { kind: "shared" } },
];

function fakePoolSdk(
  usage: Record<string, PoolResourceUsage | Error>,
  resources: Resource[] = RESOURCES,
): PoolRpcSdk & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    plugins: {
      async callRpc({ pluginId, method, input, outputSchema }) {
        calls.push(`${pluginId}:${method}:${input?.resourceId ?? ""}`);
        if (method === "provider-usage.v1.listResources") {
          return outputSchema.parse({ label: "Account Pooler", resources });
        }
        const result = usage[String(input?.resourceId)];
        if (result === undefined || result instanceof Error) {
          throw result ?? new Error("missing");
        }
        return outputSchema.parse(result);
      },
    },
  };
}

test("combines pooled windows as a plan-weighted share with the earliest reset", () => {
  const accounts = [
    pooledAccountFromResource(
      RESOURCES[0]!,
      claudeUsage("a@example.com", 4, 37, "2026-09-24T18:00:00.000Z"),
    ),
    pooledAccountFromResource(
      RESOURCES[1]!,
      claudeUsage("b@example.com", 0, 57, "2026-09-28T11:00:00.000Z"),
    ),
  ];
  const windows = combinePooledWindows(accounts);
  assert.deepEqual(
    windows.map((window) => [window.label, window.usedPercent, window.resetsAt]),
    [
      ["Five-hour limit", 2, "2026-09-23T20:00:00.000Z"],
      ["Weekly limit", 47, "2026-09-24T18:00:00.000Z"],
      ["Weekly · fable", 23.5, "2026-09-24T18:00:00.000Z"],
    ],
  );

  const mixed = combinePooledWindows([
    pooledAccountFromResource(
      RESOURCES[0]!,
      claudeUsage("a@example.com", 0, 90, "2026-09-24T18:00:00.000Z", 5),
    ),
    pooledAccountFromResource(
      RESOURCES[1]!,
      claudeUsage("b@example.com", 0, 10, "2026-09-28T11:00:00.000Z", 20),
    ),
  ]);
  assert.equal(mixed[1]!.usedPercent, 26);
});

test("orders the overall weekly window ahead of model-specific windows", () => {
  const modelFirst = claudeUsage("a@example.com", 1, 40, "2026-09-24T18:00:00.000Z");
  if (modelFirst.usage.status !== "ok") throw new Error("expected ok");
  modelFirst.usage.windows.reverse();
  const windows = combinePooledWindows([
    pooledAccountFromResource(RESOURCES[0]!, modelFirst),
  ]);
  const provider = {
    id: "claudeCode" as const,
    name: "Claude Code",
    status: "ok" as const,
    accountEmail: null,
    planLabel: null,
    message: null,
    windows,
  };
  assert.equal(sidebarUsageWindows(provider).weekly?.label, "Weekly limit");
  assert.equal(sidebarUsageWindows(provider).fiveHour?.label, "Five-hour limit");
});

test("loads every pooled account and replaces host-local usage per provider", async () => {
  const sdk = fakePoolSdk({
    a: claudeUsage("a@example.com", 4, 37, "2026-09-24T18:00:00.000Z"),
    b: claudeUsage("b@example.com", 0, 57, "2026-09-28T11:00:00.000Z"),
    c: new Error("Codex quota refresh failed"),
  });
  const pooled = await loadPooledAccounts(sdk, "host_1");
  const snapshot = applyPooledAccounts(
    normalizeUsage(
      {
        "claude-code": {
          status: "ok",
          accountEmail: "a@example.com",
          planLabel: "Max",
          windows: [{ label: "Weekly limit", usedPercent: 37, resetsAt: null }],
        },
        codex: { status: "unauthenticated" },
      },
      { id: "host_1", name: "Mac" },
      new Date("2026-09-23T12:00:00.000Z"),
    ),
    pooled,
  );

  const claude = snapshot.providers.find((provider) => provider.id === "claudeCode")!;
  assert.equal(claude.status, "ok");
  assert.equal(claude.accountEmail, null);
  assert.equal(claude.planLabel, "Max (20x)");
  assert.deepEqual(
    claude.accounts?.map((account) => [account.accountEmail, account.windows[1]?.usedPercent]),
    [
      ["a@example.com", 37],
      ["b@example.com", 57],
    ],
  );
  assert.equal(sidebarUsageWindows(claude).weekly?.usedPercent, 47);

  const codex = snapshot.providers.find((provider) => provider.id === "codex")!;
  assert.equal(codex.status, "error");
  assert.equal(codex.message, "Codex quota refresh failed");
  assert.equal(codex.accounts?.length, 1);

  const grok = snapshot.providers.find((provider) => provider.id === "grok")!;
  assert.equal(grok.accounts, undefined);
});

test("skips accounts scoped to another host", async () => {
  const sdk = fakePoolSdk(
    { a: claudeUsage("a@example.com", 4, 37, "2026-09-24T18:00:00.000Z") },
    [
      RESOURCES[0]!,
      {
        id: "z",
        providerId: "claude-code",
        label: "z@example.com",
        scope: { kind: "host", hostId: "host_2", hostName: "Other" },
      },
    ],
  );
  const pooled = await loadPooledAccounts(sdk, "host_1");
  assert.deepEqual(
    pooled?.get("claudeCode")?.map((account) => account.usage.id),
    ["a"],
  );
  assert.equal(sdk.calls.some((call) => call.endsWith(":z")), false);
});

test("falls back to host-local usage when the Account Pooler is unavailable", async () => {
  const localResponse = {
    "claude-code": {
      status: "ok" as const,
      accountEmail: "local@example.com",
      planLabel: "Max",
      windows: [{ label: "Weekly limit", usedPercent: 12, resetsAt: null }],
    },
  };
  const sdk: UsageSdk = {
    threads: { get: async () => ({ environmentId: null }) },
    environments: { get: async () => ({ hostId: "host_1" }) },
    hosts: { get: async () => ({ name: "Mac" }) },
    system: { usageLimits: async () => localResponse },
    plugins: {
      callRpc: async () => {
        throw new Error("plugin account-pool is disabled");
      },
    },
  };
  const snapshot = await loadUsageSnapshot(sdk, null);
  const claude = snapshot.providers.find((provider) => provider.id === "claudeCode")!;
  assert.equal(claude.accountEmail, "local@example.com");
  assert.equal(claude.accounts, undefined);
  assert.equal(claude.windows[0]?.usedPercent, 12);
});
