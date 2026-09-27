import assert from "node:assert/strict";
import test from "node:test";
import { inUseProviderIdsFromPool } from "../lib/load-usage.ts";
import {
  currentPoolAccountId,
  parsePoolAccountList,
  preferredPoolAccountIds,
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
