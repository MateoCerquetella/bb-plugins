import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAntigravityOutput } from "../lib/antigravity-probe.ts";
import { enabledSidebarProviderIds } from "../lib/preferences.ts";
import {
  sidebarUsageDetailRows,
  sidebarUsagePrimarySummary,
} from "../lib/sidebar-usage.ts";

test("adds Antigravity without removing the v0.1.6 providers", () => {
  assert.deepEqual(
    enabledSidebarProviderIds({
      enableClaudeCode: true,
      enableCodex: true,
      enableGrok: true,
      enableOpenCode: true,
      enableAntigravity: true,
    }),
    ["claudeCode", "codex", "grok", "openCode", "antigravity"],
  );
});

test("normalizes Antigravity quota groups", () => {
  const provider = normalizeAntigravityOutput({
    plan: "Google AI Pro",
    groups: [
      {
        name: "Gemini Models",
        windows: [
          { label: "5h", remaining_fraction: 0.875 },
          { label: "weekly", remaining_fraction: 0.61 },
        ],
      },
      {
        name: "Claude and GPT models",
        windows: [
          { label: "5h", remaining_fraction: 0.42 },
          { label: "weekly", remaining_fraction: 0.93 },
        ],
      },
    ],
  });

  assert.equal(provider.status, "ok");
  assert.deepEqual(provider.windows.map((window) => window.label), [
    "Gemini: 5-hour limit",
    "Gemini: Weekly limit",
    "Claude/GPT: 5-hour limit",
    "Claude/GPT: Weekly limit",
  ]);
  assert.equal(sidebarUsagePrimarySummary(provider, "Five-hour"), "58%");
  assert.equal(sidebarUsagePrimarySummary(provider, "Weekly"), "39%");
  assert.equal(sidebarUsageDetailRows(provider).length, 4);
});

test("normalizes agy command-data buckets", () => {
  const provider = normalizeAntigravityOutput({
    command: {
      data: {
        groups: [
          {
            name: "Gemini Models",
            buckets: [
              { name: "Weekly Limit Remaining", remaining_fraction: 0.86 },
            ],
          },
        ],
      },
    },
  });

  assert.equal(provider.windows[0]?.label, "Gemini: Weekly limit");
  assert.ok(Math.abs((provider.windows[0]?.usedPercent ?? 0) - 14) < 1e-12);
});
