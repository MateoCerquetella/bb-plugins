import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createResetSources } from "../lib/reset-sources.ts";
import { normalizeUsage } from "../lib/usage.ts";

const account = (email: string) => ({
  id: email, label: email, status: "ok" as const, accountEmail: email,
  planLabel: null, message: null, observedAt: null, windows: [],
});

test("reads Codex resets on each connected machine and caches them", async () => {
  const calls: string[] = [];
  const bb = {
    sdk: {
      hosts: {
        list: async () => [
          { id: "h1", name: "A", status: "connected" },
          { id: "h2", name: "B", status: "connected" },
          { id: "h3", name: "C", status: "disconnected" },
        ],
      },
    },
    hosts: {
      experimental_client: () => ({
        call: async (_method: string, _input: null, { hostId }: { hostId: string }) => {
          calls.push(hostId);
          // h2's Codex login has no email, so its count cannot be matched to a row.
          return hostId === "h1"
            ? { availableCount: 2, accountEmail: "B@x.io" }
            : { availableCount: 5, accountEmail: null };
        },
      }),
    },
  } as never;
  const base = normalizeUsage(
    { codex: { status: "ok", accountEmail: "a@x.io", planLabel: null, windows: [] } },
    { id: null, name: null },
    new Date(0),
  );
  const codex = base.providers.find((provider) => provider.id === "codex")!;
  const snapshot = {
    ...base,
    providers: [{ ...codex, accounts: [account("a@x.io"), account("b@x.io")] }],
  };

  // No Claude login here, so the Claude reader stays offline.
  process.env.CLAUDE_CONFIG_DIR = mkdtempSync(path.join(tmpdir(), "claude-"));
  const sources = createResetSources(bb);
  const result = await sources.apply(snapshot);
  assert.deepEqual(
    result.providers[0]!.accounts?.map((row) => row.resetCredits),
    [null, { availableCount: 2, readOnly: true }],
  );
  assert.deepEqual([...calls].sort(), ["h1", "h2"]);

  await sources.apply(snapshot);
  assert.equal(calls.filter((hostId) => hostId === "h1").length, 1);
});
