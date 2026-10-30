import assert from "node:assert/strict";
import test from "node:test";
import { accountUsageRows, itemsWithUsageData, type SidebarUsageOverviewItem } from "../lib/sidebar-usage.ts";
import type { ProviderUsage, UsageWindow } from "../lib/usage.ts";

const weekly = (usedPercent: number): UsageWindow => ({
  label: "Weekly limit",
  usedPercent,
  barPercent: usedPercent,
  resetsAt: null,
  cost: null,
});

const provider: ProviderUsage = {
  id: "claudeCode",
  name: "Claude Code",
  status: "ok",
  accountEmail: null,
  planLabel: null,
  message: null,
  windows: [],
};

test("keeps a provider with at most one account as a single row", () => {
  assert.deepEqual(accountUsageRows(provider), [provider]);
});

test("expands each account into its own row with its own windows", () => {
  const rows = accountUsageRows({
    ...provider,
    accounts: [
      {
        id: "a",
        label: "Mac",
        status: "ok",
        accountEmail: "a@example.com",
        planLabel: "Max",
        message: null,
        observedAt: null,
        windows: [weekly(10)],
      },
      {
        id: "b",
        label: "NUC",
        status: "ok",
        accountEmail: null,
        planLabel: "Pro",
        message: null,
        observedAt: null,
        windows: [weekly(70)],
      },
    ],
  });
  assert.deepEqual(
    rows.map((row) => [row.name, row.windows[0]?.usedPercent]),
    [
      ["Claude Code · a@example.com", 10],
      ["Claude Code · NUC", 70],
    ],
  );
  assert.equal(rows[0]?.accounts, undefined);
});

test("shows only providers with usable data, or all of them while none has data", () => {
  const withData: SidebarUsageOverviewItem = {
    provider,
    selection: { window: weekly(10), actualKind: "Weekly", fallback: "none" },
  };
  const noData: SidebarUsageOverviewItem = {
    provider,
    selection: { window: null, actualKind: null, fallback: "unavailable" },
  };
  assert.deepEqual(itemsWithUsageData([withData, noData]), [withData]);
  assert.deepEqual(itemsWithUsageData([noData]), [noData]);
});
