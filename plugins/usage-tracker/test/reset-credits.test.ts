import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCodexResetCreditsResponse,
} from "../lib/codex-reset-credits.ts";
import {
  formatResetCredits,
  normalizeUsage,
  withCodexResetCredits,
  withReadOnlyResetCredits,
} from "../lib/usage.ts";
import { accountUsageRows, totalResetCredits } from "../lib/sidebar-usage.ts";

test("reads the authoritative Codex reset count", () => {
  assert.equal(
    normalizeCodexResetCreditsResponse({
      rateLimitResetCredits: { availableCount: 3, credits: null },
    }),
    3,
  );
  assert.equal(
    normalizeCodexResetCreditsResponse({
      rateLimitResetCredits: { availableCount: "4", credits: [] },
    }),
    4,
  );
  assert.equal(
    normalizeCodexResetCreditsResponse({ rateLimitResetCredits: null }),
    null,
  );
  assert.equal(normalizeCodexResetCreditsResponse({}), null);
  assert.equal(
    normalizeCodexResetCreditsResponse({
      rateLimitResetCredits: { availableCount: -1 },
    }),
    null,
  );
});

test("attaches reset availability to Codex only", () => {
  const snapshot = normalizeUsage(
    {
      codex: {
        status: "ok",
        accountEmail: null,
        planLabel: null,
        windows: [],
      },
    },
    { id: null, name: null },
  );
  const enriched = withCodexResetCredits(snapshot, 2);

  assert.deepEqual(enriched.providers[0]?.resetCredits, {
    availableCount: 2,
  });
  assert.equal(enriched.providers[1]?.resetCredits, undefined);
  assert.equal(formatResetCredits(1), "1 reset available");
  assert.equal(formatResetCredits(2), "2 resets available");
});

test("rejects invalid reset counts before they reach the UI", () => {
  const snapshot = normalizeUsage({}, { id: null, name: null });
  assert.throws(
    () => withCodexResetCredits(snapshot, -1),
    /non-negative integers/u,
  );
  assert.throws(
    () => withCodexResetCredits(snapshot, Number.MAX_SAFE_INTEGER + 1),
    /non-negative integers/u,
  );
});

test("adds read-only resets to the matching account row, then totals them", () => {
  const account = (email: string) => ({
    id: email, label: email, status: "ok" as const, accountEmail: email,
    planLabel: null, message: null, observedAt: null, windows: [],
  });
  const base = normalizeUsage(
    { codex: { status: "ok", accountEmail: "a@x.io", planLabel: null, windows: [] } },
    { id: null, name: null },
    new Date(0),
  );
  const codex = base.providers.find((provider) => provider.id === "codex")!;
  const snapshot = {
    ...base,
    providers: [{ ...codex, accounts: [account("a@x.io"), account("B@x.io")] }],
  };
  const local = withCodexResetCredits(snapshot, 3, "a@x.io");
  const merged = withReadOnlyResetCredits(local, "codex", [
    { email: "a@x.io", availableCount: 9 },
    { email: "b@x.io", availableCount: 3 },
  ]);
  const rows = accountUsageRows(merged.providers[0]!);
  assert.deepEqual(rows.map((row) => row.resetCredits), [
    { availableCount: 3 },
    { availableCount: 3, readOnly: true },
  ]);
  assert.equal(totalResetCredits(rows), 6);
});

test("an unnamed reading belongs to the first row only", () => {
  const snapshot = normalizeUsage(
    { claudeCode: undefined, "claude-code": { status: "ok", accountEmail: null, planLabel: null, windows: [] } } as never,
    { id: null, name: null },
    new Date(0),
  );
  const claude = withReadOnlyResetCredits(snapshot, "claudeCode", [{ email: null, availableCount: 1 }]);
  assert.deepEqual(claude.providers.find((p) => p.id === "claudeCode")?.resetCredits, {
    availableCount: 1,
    readOnly: true,
  });
});
