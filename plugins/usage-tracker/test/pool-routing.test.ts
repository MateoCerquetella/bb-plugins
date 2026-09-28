import assert from "node:assert/strict";
import test from "node:test";
import { inUseProviderIdsFromPool } from "../lib/load-usage.ts";
import {
  currentPoolAccountId,
  parsePoolAccountList,
  preferredPoolAccountIds,
  switchPoolAccount,
} from "../lib/pool-routing.ts";

const payload = {
  accounts: [
    {
      id: "disabled",
      provider: "claude",
      email: "old@example.com",
      label: "Old",
      enabled: false,
      status: "disabled",
      priority: 100,
      lastUsedAt: null,
      inFlight: 0,
    },
    {
      id: "current",
      provider: "claude",
      email: "now@example.com",
      label: "Now",
      enabled: true,
      status: "ready",
      priority: 50,
      lastUsedAt: 50,
      inFlight: 1,
    },
    {
      id: "codex-a",
      provider: "codex",
      email: "codex@example.com",
      label: "Codex",
      enabled: true,
      status: "ready",
      priority: 25,
      lastUsedAt: 10,
      inFlight: 0,
    },
  ],
};

test("selects the in-flight enabled Account Pooler account as current", () => {
  const accounts = parsePoolAccountList(payload);
  assert.equal(currentPoolAccountId(accounts, "claude"), "current");
  assert.deepEqual(preferredPoolAccountIds(accounts), {
    claudeCode: "current",
    codex: "codex-a",
  });
  assert.deepEqual([...inUseProviderIdsFromPool(accounts)], ["claudeCode"]);
});

test("serializes overlapping account switches", async () => {
  const accounts = parsePoolAccountList({
    accounts: [
      payload.accounts[2],
      {
        ...payload.accounts[2],
        id: "codex-b",
        label: "Codex B",
        enabled: false,
      },
    ],
  });
  let active = 0;
  let maximumActive = 0;
  const run = async (): Promise<string> => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    return "";
  };

  await Promise.all([
    switchPoolAccount("codex", "codex-a", {
      loadAccounts: async () => accounts,
      run,
    }),
    switchPoolAccount("codex", "codex-b", {
      loadAccounts: async () => accounts,
      run,
    }),
  ]);

  assert.equal(maximumActive, 1);
});

test("restores account state after a partial switch failure", async () => {
  const accounts = parsePoolAccountList({
    accounts: [
      payload.accounts[2],
      {
        ...payload.accounts[2],
        id: "codex-b",
        label: "Codex B",
        enabled: false,
      },
    ],
  });
  const calls: string[][] = [];
  let failed = false;

  await assert.rejects(
    () =>
      switchPoolAccount("codex", "codex-b", {
        loadAccounts: async () => accounts,
        run: async (args) => {
          calls.push(args);
          if (!failed && args[1] === "priority") {
            failed = true;
            throw new Error("priority failed");
          }
          return "";
        },
      }),
    /priority failed/u,
  );

  assert.deepEqual(calls.slice(-5), [
    ["account", "reorder", "codex", "codex-a", "codex-b"],
    ["account", "priority", "codex-a", "25"],
    ["account", "enable", "codex-a"],
    ["account", "priority", "codex-b", "25"],
    ["account", "disable", "codex-b"],
  ]);
});
