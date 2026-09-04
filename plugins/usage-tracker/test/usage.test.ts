import assert from "node:assert/strict";
import test from "node:test";
import {
  loadUsageSnapshot,
  resolveThreadHostId,
  type UsageSdk,
} from "../lib/load-usage.ts";
import {
  clampPercent,
  formatCost,
  formatFetchedAt,
  formatResetTime,
  formatUsedPercent,
  normalizeUsage,
  providerStatusLabel,
  usageLevel,
  type RawProviderUsage,
  type RawUsageResponse,
} from "../lib/usage.ts";
import {
  highestSidebarUsagePrimary,
  mergeLastKnownWindows,
  selectSidebarUsagePrimary,
  sidebarUsageDetailRows,
  sidebarUsagePrimaryAccessibleText,
  sidebarUsagePrimarySummary,
  sidebarUsagePrimaryWindow,
  sidebarUsageSummary,
  sidebarUsageWindows,
} from "../lib/sidebar-usage.ts";
import {
  enabledSidebarProviderIds,
  normalizeCompactLimitOption,
} from "../lib/preferences.ts";
import { providerMark } from "../lib/provider-marks.ts";

function healthyResponse(): RawUsageResponse {
  return {
    codex: {
      status: "ok",
      accountEmail: "mateo@example.com",
      planLabel: "Plus",
      windows: [
        {
          label: "Weekly limit",
          usedPercent: 17.25,
          resetsAt: "2026-08-17T00:44:00.000Z",
        },
        {
          label: "Five-hour limit",
          usedPercent: 120,
          resetsAt: null,
          cost: { usedUsdCents: 125, limitUsdCents: 500 },
        },
      ],
    },
    "claude-code": { status: "expired" },
    "acp-cursor": { status: "unauthenticated" },
    "acp-grok": { status: "not_installed" },
    "acp-opencode": { status: "unauthenticated" },
  };
}

function healthyProvider(
  label: string,
  usedPercent: number,
): RawProviderUsage {
  return {
    status: "ok",
    accountEmail: null,
    planLabel: "Test",
    windows: [{ label, usedPercent, resetsAt: null }],
  };
}

function makeSdk(overrides: Partial<UsageSdk> = {}): UsageSdk {
  return {
    threads: {
      async get() {
        return { environmentId: "env_1" };
      },
    },
    environments: {
      async get() {
        return { hostId: "host_1" };
      },
    },
    hosts: {
      async get() {
        return { name: "Mateo's MacBook" };
      },
    },
    system: {
      async usageLimits() {
        return healthyResponse();
      },
    },
    ...overrides,
  };
}

function providerWithFable() {
  const provider = normalizeUsage(
    healthyResponse(),
    { id: null, name: null },
  ).providers[0]!;
  const { fiveHour, weekly } = sidebarUsageWindows(provider);
  if (fiveHour === null || weekly === null) {
    assert.fail("provider fixture must contain canonical windows");
  }

  return {
    ...provider,
    windows: [
      {
        ...fiveHour,
        label: "Current session",
        usedPercent: 39,
        barPercent: 39,
      },
      { ...weekly, usedPercent: 21, barPercent: 21 },
      {
        label: "Fable",
        usedPercent: 21,
        barPercent: 21,
        resetsAt: null,
        cost: null,
      },
    ],
  };
}

test("enables sidebar providers independently in display order", () => {
  assert.deepEqual(
    enabledSidebarProviderIds({
      enableClaudeCode: true,
      enableCodex: true,
      enableGrok: true,
      enableOpenCode: true,
    }),
    ["claudeCode", "codex", "grok", "openCode"],
  );
  assert.deepEqual(
    enabledSidebarProviderIds({
      enableClaudeCode: true,
      enableCodex: false,
      enableGrok: false,
      enableOpenCode: false,
    }),
    ["claudeCode"],
  );
  assert.deepEqual(
    enabledSidebarProviderIds({
      enableClaudeCode: false,
      enableCodex: true,
      enableGrok: false,
      enableOpenCode: false,
    }),
    ["codex"],
  );
  assert.deepEqual(
    enabledSidebarProviderIds({
      enableClaudeCode: true,
      enableCodex: true,
      enableGrok: false,
      enableOpenCode: true,
    }),
    ["claudeCode", "codex", "openCode"],
  );
  assert.deepEqual(
    enabledSidebarProviderIds({
      enableClaudeCode: false,
      enableCodex: false,
      enableGrok: false,
      enableOpenCode: false,
    }),
    [],
  );
});

test("normalizes compact limit preferences to the weekly default", () => {
  assert.equal(normalizeCompactLimitOption("Weekly"), "Weekly");
  assert.equal(normalizeCompactLimitOption("Five-hour"), "Five-hour");
  assert.equal(normalizeCompactLimitOption(undefined), "Weekly");
  assert.equal(normalizeCompactLimitOption("unexpected"), "Weekly");
});

test("normalizes providers in stable order with every usage window", () => {
  const snapshot = normalizeUsage(
    healthyResponse(),
    { id: "host_1", name: "Mateo's MacBook" },
    new Date("2026-08-11T17:00:00.000Z"),
  );

  assert.equal(snapshot.fetchedAt, "2026-08-11T17:00:00.000Z");
  assert.deepEqual(
    snapshot.providers.map((provider) => provider.id),
    ["codex", "claudeCode", "cursor", "grok", "openCode"],
  );
  assert.equal(snapshot.providers[0]?.windows.length, 2);
  assert.equal(snapshot.providers[0]?.windows[0]?.barPercent, 17.25);
  assert.equal(snapshot.providers[0]?.windows[1]?.usedPercent, 120);
  assert.equal(snapshot.providers[0]?.windows[1]?.barPercent, 100);
  assert.deepEqual(snapshot.providers[0]?.windows[1]?.cost, {
    usedUsdCents: 125,
    limitUsdCents: 500,
  });
  assert.equal(snapshot.providers[1]?.status, "expired");
  assert.match(snapshot.providers[1]?.message ?? "", /`claude`/);
  assert.equal(snapshot.providers[2]?.status, "unauthenticated");
  assert.match(snapshot.providers[2]?.message ?? "", /cursor-agent login/);
});

test("keeps current provider wire-key windows intact", () => {
  const snapshot = normalizeUsage(
    {
      codex: healthyProvider("Codex weekly", 11),
      "claude-code": healthyProvider("Claude Fable", 22),
      "acp-cursor": healthyProvider("Cursor monthly", 33),
      "acp-grok": healthyProvider("Grok session", 44),
      "acp-opencode": healthyProvider("OpenCode monthly", 55),
    },
    { id: null, name: null },
  );

  assert.deepEqual(
    snapshot.providers.map((provider) => [
      provider.id,
      provider.status,
      provider.windows.map((window) => [window.label, window.usedPercent]),
    ]),
    [
      ["codex", "ok", [["Codex weekly", 11]]],
      ["claudeCode", "ok", [["Claude Fable", 22]]],
      ["cursor", "ok", [["Cursor monthly", 33]]],
      ["grok", "ok", [["Grok session", 44]]],
      ["openCode", "ok", [["OpenCode monthly", 55]]],
    ],
  );
});

test("keeps healthy legacy provider windows intact", () => {
  const snapshot = normalizeUsage(
    {
      codex: healthyProvider("Codex legacy", 10),
      claudeCode: healthyProvider("Claude legacy", 20),
      cursor: healthyProvider("Cursor legacy", 30),
      grok: healthyProvider("Grok legacy", 40),
      openCode: healthyProvider("OpenCode legacy", 50),
    },
    { id: null, name: null },
  );

  assert.deepEqual(
    snapshot.providers.map((provider) =>
      provider.windows.map((window) => window.label),
    ),
    [
      ["Codex legacy"],
      ["Claude legacy"],
      ["Cursor legacy"],
      ["Grok legacy"],
      ["OpenCode legacy"],
    ],
  );
});

test("accepts legacy provider keys and normalizes explicit statuses", () => {
  const response: RawUsageResponse = {
    codex: { status: "not_installed" },
    claudeCode: {
      status: "error",
      message: "Provider timed out",
      planLabel: "Max",
      accountEmail: "account@example.com",
    },
    cursor: { status: "expired" },
  };

  const snapshot = normalizeUsage(response, { id: null, name: null });
  assert.equal(snapshot.providers[0]?.message, "Codex is not installed on this machine.");
  assert.deepEqual(snapshot.providers[1], {
    id: "claudeCode",
    name: "Claude Code",
    status: "error",
    accountEmail: "account@example.com",
    planLabel: "Max",
    message: "Provider timed out",
    windows: [],
  });
  assert.equal(providerStatusLabel("not_installed"), "Not installed");
  assert.equal(providerStatusLabel("error"), "Unavailable");
});

test("prefers current provider keys over legacy aliases", () => {
  const response: RawUsageResponse = {
    codex: healthyProvider("Codex current", 10),
    "claude-code": healthyProvider("Claude current", 20),
    claudeCode: healthyProvider("Claude legacy", 21),
    "acp-cursor": healthyProvider("Cursor current", 30),
    cursor: healthyProvider("Cursor legacy", 31),
    "acp-grok": healthyProvider("Grok current", 40),
    "acp-opencode": healthyProvider("OpenCode current", 50),
  };

  const snapshot = normalizeUsage(response, { id: null, name: null });
  assert.deepEqual(
    snapshot.providers.map((provider) =>
      provider.windows.map((window) => [window.label, window.usedPercent]),
    ),
    [
      [["Codex current", 10]],
      [["Claude current", 20]],
      [["Cursor current", 30]],
      [["Grok current", 40]],
      [["OpenCode current", 50]],
    ],
  );
});

test("isolates an omitted provider response", () => {
  const response = healthyResponse();
  delete response["acp-cursor"];

  const snapshot = normalizeUsage(response, { id: null, name: null });
  assert.deepEqual(
    snapshot.providers.map((provider) => provider.status),
    ["ok", "expired", "error", "not_installed", "unauthenticated"],
  );
  assert.equal(snapshot.providers[0]?.windows.length, 2);
  assert.deepEqual(snapshot.providers[2], {
    id: "cursor",
    name: "Cursor",
    status: "error",
    accountEmail: null,
    planLabel: null,
    message: "Cursor usage was not reported by bb.",
    windows: [],
  });
});

test("normalizes Grok and OpenCode and isolates an omitted new provider", () => {
  const response: RawUsageResponse = {
    codex: healthyProvider("Codex weekly", 11),
    "claude-code": healthyProvider("Claude weekly", 22),
    "acp-cursor": healthyProvider("Cursor monthly", 33),
    "acp-grok": healthyProvider("Grok session", 44),
  };

  const snapshot = normalizeUsage(response, { id: null, name: null });
  assert.deepEqual(
    snapshot.providers.map((provider) => [
      provider.id,
      provider.status,
      provider.windows[0]?.label ?? null,
    ]),
    [
      ["codex", "ok", "Codex weekly"],
      ["claudeCode", "ok", "Claude weekly"],
      ["cursor", "ok", "Cursor monthly"],
      ["grok", "ok", "Grok session"],
      ["openCode", "error", null],
    ],
  );
  assert.equal(
    snapshot.providers[4]?.message,
    "OpenCode usage was not reported by bb.",
  );
});

test("clamps progress geometry and rejects non-finite values", () => {
  assert.equal(clampPercent(-3), 0);
  assert.equal(clampPercent(45.5), 45.5);
  assert.equal(clampPercent(140), 100);
  assert.throws(() => clampPercent(Number.NaN), /finite/);

  const response = healthyResponse();
  const codex = response.codex;
  if (codex?.status !== "ok") assert.fail("codex fixture must be healthy");
  codex.windows[0]!.usedPercent = Number.POSITIVE_INFINITY;
  assert.throws(
    () => normalizeUsage(response, { id: null, name: null }),
    /finite/,
  );
});

test("classifies exact usage warning and critical thresholds", () => {
  assert.equal(usageLevel(null), "normal");
  assert.equal(usageLevel(-1), "normal");
  assert.equal(usageLevel(79.9), "normal");
  assert.equal(usageLevel(80), "warning");
  assert.equal(usageLevel(94.9), "warning");
  assert.equal(usageLevel(95), "critical");
  assert.equal(usageLevel(140), "critical");
  assert.throws(() => usageLevel(Number.NaN), /finite/);
});

test("provides Grok and layered OpenCode provider marks", () => {
  const grok = providerMark("grok");
  const openCode = providerMark("openCode");
  assert.equal(grok.title, "Grok Build");
  assert.match(grok.path ?? "", /^M13\.2371/u);
  assert.equal(openCode.title, "OpenCode");
  assert.equal(openCode.paths?.length, 2);
  assert.equal(openCode.paths?.[0]?.fillOpacity, 0.45);
});

test("formats reset, update, percentage, and cost copy safely", () => {
  assert.equal(formatResetTime(null), "Reset unavailable");
  assert.equal(formatResetTime("not-a-date"), "Reset unavailable");
  assert.match(
    formatResetTime("2026-08-17T00:44:00.000Z", "en-US"),
    /^Resets /,
  );
  assert.equal(formatFetchedAt("bad"), "Updated recently");
  assert.match(formatFetchedAt("2026-08-11T17:00:00.000Z", "en-US"), /^Updated /);
  assert.equal(formatUsedPercent(Number.NaN), "—");
  assert.equal(formatUsedPercent(17.25, "en-US"), "17.3");
  assert.equal(
    formatCost({ usedUsdCents: 125, limitUsdCents: 500 }, "en-US"),
    "$1.25 of $5.00",
  );
});

test("selects the configured compact usage window", () => {
  const provider = normalizeUsage(
    healthyResponse(),
    { id: null, name: null },
  ).providers[0]!;
  const windows = sidebarUsageWindows(provider);

  assert.equal(windows.fiveHour?.label, "Five-hour limit");
  assert.equal(windows.weekly?.label, "Weekly limit");
  assert.equal(sidebarUsageSummary(provider), "120% 5h · 17.3% wk");
  assert.equal(
    sidebarUsagePrimaryWindow(provider, "Weekly")?.label,
    "Weekly limit",
  );
  assert.equal(sidebarUsagePrimarySummary(provider, "Weekly"), "17.3%");
  assert.equal(
    sidebarUsagePrimaryWindow(provider, "Five-hour")?.label,
    "Five-hour limit",
  );
  assert.equal(sidebarUsagePrimarySummary(provider, "Five-hour"), "120%");
});

test("selects the highest available compact usage for an overview summary", () => {
  const snapshot = normalizeUsage(
    {
      codex: healthyProvider("Weekly limit", 80),
      "claude-code": healthyProvider("Weekly limit", 79.9),
      "acp-grok": healthyProvider("Weekly limit", 95),
      "acp-opencode": healthyProvider("Weekly limit", 96),
    },
    { id: null, name: null },
  );
  const items = snapshot.providers
    .filter((provider) => provider.id !== "cursor")
    .map((provider) => ({
      provider,
      selection: selectSidebarUsagePrimary(provider, provider, "Weekly"),
    }));

  const highest = highestSidebarUsagePrimary(items);
  assert.equal(highest?.provider.id, "openCode");
  assert.equal(highest?.selection.window?.usedPercent, 96);
  assert.equal(
    highestSidebarUsagePrimary(
      items.map((item) => ({
        ...item,
        selection: { window: null, actualKind: null, fallback: "unavailable" },
      })),
    ),
    null,
  );
});

test("keeps additional provider windows in expanded details only", () => {
  const provider = providerWithFable();
  const rows = sidebarUsageDetailRows(provider);

  assert.deepEqual(
    rows.map((row) => [row.label, row.window?.label ?? null]),
    [
      ["5-hour limit", "Current session"],
      ["Weekly limit", "Weekly limit"],
      ["Fable", "Fable"],
    ],
  );
  assert.strictEqual(rows[2]?.window, provider.windows[2]);
  assert.equal(sidebarUsagePrimarySummary(provider, "Weekly"), "21%");
  assert.equal(sidebarUsagePrimarySummary(provider, "Five-hour"), "39%");

  const secondFiveHour = {
    ...provider.windows[0]!,
    usedPercent: 55,
    barPercent: 55,
  };
  const duplicateLabelProvider = {
    ...provider,
    windows: [...provider.windows, secondFiveHour],
  };
  const duplicateRows = sidebarUsageDetailRows(duplicateLabelProvider);
  assert.equal(duplicateRows.length, 4);
  assert.strictEqual(duplicateRows[3]?.window, secondFiveHour);
});

test("falls back when the configured compact window is unavailable", () => {
  const provider = normalizeUsage(
    healthyResponse(),
    { id: null, name: null },
  ).providers[0]!;
  const weeklyOnly = {
    ...provider,
    windows: provider.windows.filter(
      (window) => window.label === "Weekly limit",
    ),
  };
  const fiveHourOnly = {
    ...provider,
    windows: provider.windows.filter(
      (window) => window.label === "Five-hour limit",
    ),
  };

  assert.equal(sidebarUsagePrimarySummary(weeklyOnly, "Five-hour"), "17.3%");
  assert.equal(sidebarUsagePrimarySummary(fiveHourOnly, "Weekly"), "120%");
});

test("hides the Codex Pro five-hour row when it is not reported", () => {
  const response = healthyResponse();
  const codex = response.codex;
  if (codex === undefined || codex.status !== "ok") {
    assert.fail("Codex fixture must be healthy");
  }

  const current = normalizeUsage(
    {
      ...response,
      codex: {
        ...codex,
        planLabel: "Prolite",
        windows: [codex.windows[0]!],
      },
    },
    { id: null, name: null },
  ).providers[0]!;
  const previous = normalizeUsage(
    response,
    { id: null, name: null },
  ).providers[0]!;
  const merged = mergeLastKnownWindows(current, previous);

  assert.equal(sidebarUsageWindows(merged).fiveHour, null);
  assert.deepEqual(
    sidebarUsageDetailRows(merged).map((row) => row.label),
    ["Weekly limit"],
  );
});

test("prefers a fresh alternative before merged last-known compact windows", () => {
  const previous = normalizeUsage(
    healthyResponse(),
    { id: null, name: null },
  ).providers[0]!;
  const weekly = sidebarUsageWindows(previous).weekly!;
  const fiveHour = sidebarUsageWindows(previous).fiveHour!;

  const currentWeekly = {
    ...previous,
    windows: [{ ...weekly, usedPercent: 23, barPercent: 23 }],
  };
  const mergedWeekly = mergeLastKnownWindows(currentWeekly, previous);
  const fiveHourSelection = selectSidebarUsagePrimary(
    currentWeekly,
    mergedWeekly,
    "Five-hour",
  );

  assert.equal(fiveHourSelection.actualKind, "Weekly");
  assert.equal(fiveHourSelection.fallback, "current-alternative");
  assert.equal(fiveHourSelection.window?.usedPercent, 23);
  assert.equal(fiveHourSelection.window?.barPercent, 23);
  assert.equal(sidebarUsageWindows(mergedWeekly).fiveHour?.usedPercent, 120);

  const currentFiveHour = {
    ...previous,
    windows: [{ ...fiveHour, usedPercent: 42, barPercent: 42 }],
  };
  const mergedFiveHour = mergeLastKnownWindows(currentFiveHour, previous);
  const weeklySelection = selectSidebarUsagePrimary(
    currentFiveHour,
    mergedFiveHour,
    "Weekly",
  );

  assert.equal(weeklySelection.actualKind, "Five-hour");
  assert.equal(weeklySelection.fallback, "current-alternative");
  assert.equal(weeklySelection.window?.usedPercent, 42);
  assert.equal(weeklySelection.window?.barPercent, 42);
  assert.equal(sidebarUsageWindows(mergedFiveHour).weekly?.usedPercent, 17.25);
});

test("describes configured, actual, and fallback compact windows accessibly", () => {
  const previous = normalizeUsage(
    healthyResponse(),
    { id: null, name: null },
  ).providers[0]!;
  const weekly = sidebarUsageWindows(previous).weekly!;
  const fiveHour = sidebarUsageWindows(previous).fiveHour!;
  const exactWeekly = selectSidebarUsagePrimary(previous, previous, "Weekly");
  const exactFiveHour = selectSidebarUsagePrimary(
    previous,
    previous,
    "Five-hour",
  );
  const weeklyText = sidebarUsagePrimaryAccessibleText(
    "Codex",
    "Weekly",
    exactWeekly,
  );
  const fiveHourText = sidebarUsagePrimaryAccessibleText(
    "Codex",
    "Five-hour",
    exactFiveHour,
  );

  assert.notEqual(weeklyText, fiveHourText);
  assert.match(weeklyText, /Weekly configured; showing Weekly 17\.3%/u);
  assert.match(weeklyText, /Open Codex usage details\./u);
  assert.match(
    sidebarUsagePrimaryAccessibleText(
      "Codex",
      "Weekly",
      exactWeekly,
      true,
    ),
    /Close Codex usage details\./u,
  );
  assert.match(
    fiveHourText,
    /Five-hour configured; showing Five-hour 120%/u,
  );

  const currentWeekly = {
    ...previous,
    windows: [{ ...weekly, usedPercent: 23, barPercent: 23 }],
  };
  const currentFiveHour = {
    ...previous,
    windows: [{ ...fiveHour, usedPercent: 42, barPercent: 42 }],
  };
  const weeklyFallbackText = sidebarUsagePrimaryAccessibleText(
    "Codex",
    "Five-hour",
    selectSidebarUsagePrimary(
      currentWeekly,
      mergeLastKnownWindows(currentWeekly, previous),
      "Five-hour",
    ),
  );
  const fiveHourFallbackText = sidebarUsagePrimaryAccessibleText(
    "Codex",
    "Weekly",
    selectSidebarUsagePrimary(
      currentFiveHour,
      mergeLastKnownWindows(currentFiveHour, previous),
      "Weekly",
    ),
  );

  assert.notEqual(weeklyFallbackText, fiveHourFallbackText);
  assert.match(
    weeklyFallbackText,
    /Five-hour configured; showing Weekly 23% as fallback/u,
  );
  assert.match(
    fiveHourFallbackText,
    /Weekly configured; showing Five-hour 42% as fallback/u,
  );

  const lastKnownText = sidebarUsagePrimaryAccessibleText(
    "Codex",
    "Weekly",
    selectSidebarUsagePrimary(
      { ...previous, windows: [] },
      previous,
      "Weekly",
    ),
  );
  assert.notEqual(lastKnownText, weeklyText);
  assert.match(
    lastKnownText,
    /Weekly configured; showing last-known Weekly 17\.3% as fallback/u,
  );
});

test("keeps last-known sidebar windows through partial and failed refreshes", () => {
  const previous = normalizeUsage(
    healthyResponse(),
    { id: null, name: null },
  ).providers[0]!;
  const partial = {
    ...previous,
    windows: previous.windows.filter((window) => window.label === "Weekly limit"),
  };
  const failed = { ...partial, status: "error" as const, message: "Rate limited" };

  assert.equal(
    sidebarUsageSummary(mergeLastKnownWindows(partial, previous)),
    "120% 5h · 17.3% wk",
  );
  assert.equal(
    sidebarUsageSummary(mergeLastKnownWindows(failed, previous)),
    "120% 5h · 17.3% wk",
  );
  const lastKnownSelection = selectSidebarUsagePrimary(
    { ...previous, windows: [] },
    previous,
    "Weekly",
  );
  assert.equal(lastKnownSelection.actualKind, "Weekly");
  assert.equal(lastKnownSelection.fallback, "last-known");
  assert.equal(lastKnownSelection.window?.usedPercent, 17.25);
});

test("keeps additional last-known windows without stale duplicates", () => {
  const previous = providerWithFable();
  const { fiveHour, weekly } = sidebarUsageWindows(previous);
  const fable = previous.windows.find((window) => window.label === "Fable");
  if (fiveHour === null || weekly === null || fable === undefined) {
    assert.fail("provider fixture must contain all detail windows");
  }

  const currentWeekly = {
    ...previous,
    windows: [{ ...weekly, usedPercent: 32, barPercent: 32 }],
  };
  const mergedWeekly = mergeLastKnownWindows(currentWeekly, previous);
  assert.deepEqual(
    sidebarUsageDetailRows(mergedWeekly).map((row) => [
      row.label,
      row.window?.usedPercent ?? null,
    ]),
    [
      ["5-hour limit", 39],
      ["Weekly limit", 32],
      ["Fable", 21],
    ],
  );
  assert.strictEqual(
    sidebarUsageDetailRows(mergedWeekly)[2]?.window,
    fable,
  );

  const failed = {
    ...previous,
    status: "error" as const,
    message: "Rate limited",
    windows: [],
  };
  assert.deepEqual(
    sidebarUsageDetailRows(mergeLastKnownWindows(failed, previous)).map(
      (row) => row.window?.label ?? null,
    ),
    ["Current session", "Weekly limit", "Fable"],
  );

  const freshFable = { ...fable, usedPercent: 63, barPercent: 63 };
  const mergedFable = mergeLastKnownWindows(
    { ...previous, windows: [freshFable] },
    previous,
  );
  const mergedFableWindows = mergedFable.windows.filter(
    (window) => window.label === "Fable",
  );
  assert.deepEqual(mergedFableWindows, [freshFable]);
  assert.strictEqual(mergedFableWindows[0], freshFable);

  const canonicalLookingExtra = {
    ...fiveHour,
    label: "Five-hour bonus",
    usedPercent: 12,
    barPercent: 12,
  };
  const currentAlias = {
    ...fiveHour,
    label: "5 hour limit",
    usedPercent: 44,
    barPercent: 44,
  };
  const mergedAlias = mergeLastKnownWindows(
    { ...previous, windows: [currentAlias] },
    { ...previous, windows: [...previous.windows, canonicalLookingExtra] },
  );
  assert.deepEqual(
    sidebarUsageDetailRows(mergedAlias).map((row) => row.window?.label ?? null),
    ["5 hour limit", "Weekly limit", "Fable", "Five-hour bonus"],
  );

});

test("resolves the thread environment host", async () => {
  const sdk = makeSdk();
  assert.equal(await resolveThreadHostId(sdk, "thr_1"), "host_1");
});

test("falls back when a thread has no environment or lookup fails", async () => {
  const noEnvironment = makeSdk({
    threads: {
      async get() {
        return { environmentId: null };
      },
    },
  });
  assert.equal(await resolveThreadHostId(noEnvironment, "thr_1"), null);

  const missingEnvironment = makeSdk({
    environments: {
      async get() {
        throw new Error("environment missing");
      },
    },
  });
  assert.equal(await resolveThreadHostId(missingEnvironment, "thr_1"), null);
});

test("loads usage for the resolved host and tolerates missing host metadata", async () => {
  const calls: Array<{ hostId?: string } | undefined> = [];
  const sdk = makeSdk({
    hosts: {
      async get() {
        throw new Error("host metadata unavailable");
      },
    },
    system: {
      async usageLimits(args) {
        calls.push(args);
        return healthyResponse();
      },
    },
  });

  const snapshot = await loadUsageSnapshot(
    sdk,
    "thr_1",
    new Date("2026-08-11T17:00:00.000Z"),
  );
  assert.deepEqual(calls, [{ hostId: "host_1" }]);
  assert.deepEqual(snapshot.host, { id: "host_1", name: null });
});

test("omits host override for primary-machine fallback", async () => {
  const calls: Array<{ hostId?: string } | undefined> = [];
  const sdk = makeSdk({
    threads: {
      async get() {
        return { environmentId: null };
      },
    },
    system: {
      async usageLimits(args) {
        calls.push(args);
        return healthyResponse();
      },
    },
  });

  const snapshot = await loadUsageSnapshot(sdk, "thr_1");
  assert.deepEqual(calls, [undefined]);
  assert.deepEqual(snapshot.host, { id: null, name: null });
});

test("loads the primary machine directly for the sidebar strip", async () => {
  const calls: Array<{ hostId?: string } | undefined> = [];
  const sdk = makeSdk({
    threads: {
      async get() {
        throw new Error("the primary-machine surface must not resolve a thread");
      },
    },
    system: {
      async usageLimits(args) {
        calls.push(args);
        return healthyResponse();
      },
    },
  });

  const snapshot = await loadUsageSnapshot(sdk, null);
  assert.deepEqual(calls, [undefined]);
  assert.deepEqual(snapshot.host, { id: null, name: null });
});

test("propagates thread and request-level usage failures", async () => {
  const threadFailure = makeSdk({
    threads: {
      async get() {
        throw new Error("thread missing");
      },
    },
  });
  await assert.rejects(() => loadUsageSnapshot(threadFailure, "thr_1"), /thread missing/);

  const usageFailure = makeSdk({
    system: {
      async usageLimits() {
        throw new Error("usage unavailable");
      },
    },
  });
  await assert.rejects(() => loadUsageSnapshot(usageFailure, "thr_1"), /usage unavailable/);
});
