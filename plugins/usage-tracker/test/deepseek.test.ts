import assert from "node:assert/strict";
import test from "node:test";
import {
  DEEPSEEK_INVALID_RESPONSE_MESSAGE,
  DEEPSEEK_MISSING_KEY_MESSAGE,
  DEEPSEEK_REJECTED_KEY_MESSAGE,
  DEEPSEEK_REQUEST_FAILED_MESSAGE,
  DEEPSEEK_TIMEOUT_MS,
  deepSeekBudgetPercent,
  loadDeepSeekProvider,
  parseDeepSeekBalance,
  parseDeepSeekBudget,
  resolveDeepSeekApiKey,
  type DeepSeekFetch,
  type DeepSeekHttpResponse,
} from "../lib/deepseek-balance.ts";
import { enabledSidebarProviderIds } from "../lib/preferences.ts";
import { providerMark } from "../lib/provider-marks.ts";
import {
  averageProviderUsage,
  mergeLastKnownWindows,
  selectSidebarUsagePrimary,
  sidebarUsageDetailRows,
  sidebarUsagePrimaryAccessibleText,
  sidebarUsagePrimaryReading,
  sidebarUsagePrimarySelectionSummary,
} from "../lib/sidebar-usage.ts";
import type { ProviderUsage } from "../lib/usage.ts";

const documentedPayload = {
  is_available: true,
  balance_infos: [
    {
      currency: "USD",
      total_balance: "12.00",
      granted_balance: "2.00",
      topped_up_balance: "10.00",
    },
  ],
};

function httpResponse(
  status: number,
  body: unknown,
  ok = status >= 200 && status < 300,
): DeepSeekHttpResponse {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}

function fetchReturning(body: unknown, status = 200): DeepSeekFetch {
  return async () => httpResponse(status, body);
}

async function provider(
  body: unknown = documentedPayload,
  budget: number | null = 20,
): Promise<ProviderUsage> {
  return loadDeepSeekProvider({
    apiKey: "sk-test",
    budget,
    fetch: fetchReturning(body),
  });
}

test("parses the documented balance payload", () => {
  assert.deepEqual(parseDeepSeekBalance(documentedPayload), {
    available: true,
    info: { currency: "USD", total: 12, granted: 2, toppedUp: 10 },
  });
});

test("uses the first currency entry and accepts numeric balances", () => {
  const parsed = parseDeepSeekBalance({
    is_available: false,
    balance_infos: [
      {
        currency: "CNY",
        total_balance: 8.5,
        granted_balance: 0,
        topped_up_balance: 8.5,
      },
      {
        currency: "USD",
        total_balance: "99",
        granted_balance: "0",
        topped_up_balance: "99",
      },
    ],
  });
  assert.deepEqual(parsed.info, {
    currency: "CNY",
    total: 8.5,
    granted: 0,
    toppedUp: 8.5,
  });
  assert.equal(parsed.available, false);
});

test("rejects malformed balances", () => {
  assert.throws(() => parseDeepSeekBalance(null), TypeError);
  assert.throws(() => parseDeepSeekBalance({ is_available: true }), TypeError);
  assert.throws(
    () =>
      parseDeepSeekBalance({
        is_available: true,
        balance_infos: [
          {
            currency: "USD",
            total_balance: "not-a-number",
            granted_balance: "0",
            topped_up_balance: "0",
          },
        ],
      }),
    TypeError,
  );
  assert.throws(
    () =>
      parseDeepSeekBalance({
        is_available: true,
        balance_infos: [
          {
            currency: "USD",
            total_balance: "-1",
            granted_balance: "0",
            topped_up_balance: "0",
          },
        ],
      }),
    TypeError,
  );
});

test("computes budget consumption and reaches 100% at zero balance", () => {
  assert.equal(deepSeekBudgetPercent(12, 20), 40);
  assert.equal(deepSeekBudgetPercent(0, 20), 100);
  assert.equal(deepSeekBudgetPercent(25, 20), 0);
  assert.equal(deepSeekBudgetPercent(12, null), null);
  assert.equal(deepSeekBudgetPercent(12, 0), null);
  assert.equal(deepSeekBudgetPercent(Number.NaN, 20), null);
});

test("parses the optional budget setting", () => {
  assert.equal(parseDeepSeekBudget("20"), 20);
  assert.equal(parseDeepSeekBudget(" 20.5 "), 20.5);
  assert.equal(parseDeepSeekBudget(""), null);
  assert.equal(parseDeepSeekBudget("0"), null);
  assert.equal(parseDeepSeekBudget("-5"), null);
  assert.equal(parseDeepSeekBudget("abc"), null);
  assert.equal(parseDeepSeekBudget(undefined), null);
});

test("measures the entered topped-up amount", async () => {
  const result = await provider(
    {
      is_available: true,
      balance_infos: [
        {
          currency: "USD",
          total_balance: "2.78",
          granted_balance: "0",
          topped_up_balance: "2.78",
        },
      ],
    },
    5,
  );
  assert.equal(result.balance?.budget, 5);
  assert.equal(Math.round(result.balance?.usedPercent ?? 0), 44);
});

test("uses the official DeepSeek glyph", () => {
  const mark = providerMark("deepSeek");
  assert.equal(mark.viewBox, "0 0 24 24");
  assert.equal(mark.paths, undefined);
  assert.match(mark.path ?? "", /^M23\.748 4\.651/u);
});

test("builds an ok provider with a budget window", async () => {
  const result = await provider();
  assert.equal(result.id, "deepSeek");
  assert.equal(result.name, "DeepSeek");
  assert.equal(result.status, "ok");
  assert.deepEqual(result.balance, {
    currency: "USD",
    total: 12,
    granted: 2,
    toppedUp: 10,
    available: true,
    budget: 20,
    usedPercent: 40,
  });
  assert.deepEqual(result.windows.map((window) => window.label), [
    "Topped up balance",
  ]);
  assert.equal(result.windows[0]?.usedPercent, 40);
  assert.equal(result.windows[0]?.barPercent, 40);
  assert.equal(result.inUse, false);
  assert.doesNotMatch(JSON.stringify(result), /sk-test/u);
});

test("reads the balance amount when no budget is configured", async () => {
  const result = await provider(documentedPayload, null);
  assert.equal(result.status, "ok");
  assert.equal(result.balance?.usedPercent, null);
  assert.deepEqual(result.windows, []);
  const selection = selectSidebarUsagePrimary(result, undefined, "Weekly");
  assert.equal(sidebarUsagePrimarySelectionSummary(selection), "—%");
  assert.match(sidebarUsagePrimaryReading(result, selection), /12\.00/u);
});

test("reports a missing key without calling DeepSeek", async () => {
  let called = false;
  const result = await loadDeepSeekProvider({
    apiKey: "   ",
    budget: 20,
    fetch: async () => {
      called = true;
      return httpResponse(200, documentedPayload);
    },
  });
  assert.equal(called, false);
  assert.equal(result.status, "unauthenticated");
  assert.equal(result.message, DEEPSEEK_MISSING_KEY_MESSAGE);
  assert.match(
    sidebarUsagePrimaryAccessibleText(
      "DeepSeek",
      "Weekly",
      selectSidebarUsagePrimary(result, undefined, "Weekly"),
      false,
      result,
    ),
    /DeepSeek: Sign in required/u,
  );
});

test("maps rejected keys to unauthenticated without echoing the key", async () => {
  for (const status of [401, 403]) {
    const result = await loadDeepSeekProvider({
      apiKey: "sk-secret-value",
      budget: null,
      fetch: fetchReturning({ error: "nope" }, status),
    });
    assert.equal(result.status, "unauthenticated");
    assert.equal(result.message, DEEPSEEK_REJECTED_KEY_MESSAGE);
    assert.doesNotMatch(JSON.stringify(result), /sk-secret-value/u);
  }
});

test("maps other HTTP failures to an error", async () => {
  const result = await loadDeepSeekProvider({
    apiKey: "sk-test",
    budget: null,
    fetch: fetchReturning({ error: "boom" }, 500),
  });
  assert.equal(result.status, "error");
  assert.equal(result.message, "DeepSeek returned HTTP 500.");
});

test("aborts a hanging balance request at a short deadline", async () => {
  assert.ok(DEEPSEEK_TIMEOUT_MS <= 5_000);
  const keepAlive = setTimeout(() => {}, 100);
  const result = await loadDeepSeekProvider({
    apiKey: "sk-test",
    budget: null,
    timeoutMs: 10,
    fetch: (_url, init) =>
      new Promise<DeepSeekHttpResponse>((_resolve, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      }),
  });
  clearTimeout(keepAlive);
  assert.equal(result.status, "error");
  assert.equal(result.message, DEEPSEEK_REQUEST_FAILED_MESSAGE);
});

test("maps network and payload failures to an error", async () => {
  const network = await loadDeepSeekProvider({
    apiKey: "sk-test",
    budget: null,
    fetch: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(network.status, "error");
  assert.equal(network.message, DEEPSEEK_REQUEST_FAILED_MESSAGE);

  const malformed = await loadDeepSeekProvider({
    apiKey: "sk-test",
    budget: null,
    fetch: fetchReturning({ unexpected: true }),
  });
  assert.equal(malformed.status, "error");
  assert.equal(malformed.message, DEEPSEEK_INVALID_RESPONSE_MESSAGE);

  const brokenJson = await loadDeepSeekProvider({
    apiKey: "sk-test",
    budget: null,
    fetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        throw new Error("bad json");
      },
    }),
  });
  assert.equal(brokenJson.status, "error");
  assert.equal(brokenJson.message, DEEPSEEK_INVALID_RESPONSE_MESSAGE);
});

test("is opt-in and appended after the existing providers", () => {
  const base = {
    enableClaudeCode: true,
    enableCodex: true,
    enableCursor: true,
    enableGrok: true,
    enableOpenCode: true,
    enableAntigravity: true,
  };
  assert.deepEqual(enabledSidebarProviderIds(base), [
    "claudeCode",
    "codex",
    "cursor",
    "grok",
    "openCode",
    "antigravity",
  ]);
  assert.deepEqual(
    enabledSidebarProviderIds({ ...base, enableDeepSeek: true }),
    [
      "claudeCode",
      "codex",
      "cursor",
      "grok",
      "openCode",
      "antigravity",
      "deepSeek",
    ],
  );
});

test("shows only a balance row and budget-aware accessible text", async () => {
  const result = await provider();
  const rows = sidebarUsageDetailRows(result);
  assert.deepEqual(rows.map((row) => row.label), ["Topped up balance"]);
  const selection = selectSidebarUsagePrimary(result, undefined, "Weekly");
  assert.match(
    sidebarUsagePrimaryAccessibleText(
      "DeepSeek",
      "Weekly",
      selection,
      false,
      result,
    ),
    /topped-up balance: 40% used/u,
  );

  const withoutBudget = await provider(documentedPayload, null);
  assert.deepEqual(sidebarUsageDetailRows(withoutBudget), []);
  assert.match(
    sidebarUsagePrimaryAccessibleText(
      "DeepSeek",
      "Weekly",
      selectSidebarUsagePrimary(withoutBudget, undefined, "Weekly"),
      false,
      withoutBudget,
    ),
    /\$12\.00 available; no topped-up budget configured/u,
  );
});

test("keeps the last known balance through a failed refresh", async () => {
  const previous = await provider();
  const failed: ProviderUsage = {
    id: "deepSeek",
    name: "DeepSeek",
    status: "error",
    accountEmail: null,
    planLabel: null,
    message: DEEPSEEK_REQUEST_FAILED_MESSAGE,
    windows: [],
  };
  const merged = mergeLastKnownWindows(failed, previous);
  assert.deepEqual(merged.balance, previous.balance);
  assert.deepEqual(merged.windows, previous.windows);

  const selection = selectSidebarUsagePrimary(failed, merged, "Weekly");
  assert.equal(selection.fallback, "last-known");
  assert.equal(selection.window?.usedPercent, 40);
  assert.match(
    sidebarUsagePrimaryAccessibleText(
      "DeepSeek",
      "Weekly",
      selection,
      false,
      merged,
    ),
    /last-known topped-up balance: 40% used/u,
  );
});

test("labels a last-known balance when no budget is configured", async () => {
  const previous = await provider(documentedPayload, null);
  const failed: ProviderUsage = {
    id: "deepSeek",
    name: "DeepSeek",
    status: "error",
    accountEmail: null,
    planLabel: null,
    message: DEEPSEEK_REQUEST_FAILED_MESSAGE,
    windows: [],
  };
  const merged = mergeLastKnownWindows(failed, previous);
  const selection = selectSidebarUsagePrimary(failed, merged, "Weekly");
  assert.equal(selection.window, null);
  assert.equal(selection.fallback, "unavailable");
  assert.match(
    sidebarUsagePrimaryAccessibleText(
      "DeepSeek",
      "Weekly",
      selection,
      false,
      merged,
    ),
    /last-known balance: \$12\.00 available/u,
  );
});

test("keeps a balance provider out of the cumulative agent summary", async () => {
  const deepSeek = await provider();
  const codex: ProviderUsage = {
    id: "codex",
    name: "Codex",
    status: "ok",
    accountEmail: null,
    planLabel: null,
    message: null,
    windows: [
      {
        label: "Weekly limit",
        usedPercent: 17,
        barPercent: 17,
        resetsAt: null,
        cost: null,
      },
    ],
    inUse: true,
  };
  const items = [codex, deepSeek].map((provider) => ({
    provider,
    selection: selectSidebarUsagePrimary(provider, provider, "Weekly"),
  }));
  const average = averageProviderUsage(items);
  assert.equal(average.percent, 17);
  assert.deepEqual(average.names, ["Codex"]);
});

test("does not resurrect a removed budget window", async () => {
  const previous = await provider();
  const cleared = await provider(documentedPayload, null);
  const merged = mergeLastKnownWindows(cleared, previous);
  assert.deepEqual(merged.windows, []);
  assert.equal(merged.balance?.usedPercent, null);
});

test("resolves the key from settings before the environment", () => {
  assert.equal(resolveDeepSeekApiKey("  sk-setting  ", "sk-env"), "sk-setting");
  assert.equal(resolveDeepSeekApiKey("", "  sk-env  "), "sk-env");
  assert.equal(resolveDeepSeekApiKey("   ", undefined), "");
});

test("sends the key only as a bearer header to the balance endpoint", async () => {
  const calls: Array<{
    url: string;
    headers: Record<string, string>;
  }> = [];
  const providerFromSpy = await loadDeepSeekProvider({
    apiKey: "sk-secret",
    budget: 20,
    fetch: async (url, init) => {
      calls.push({ url, headers: init.headers });
      return httpResponse(200, documentedPayload);
    },
  });

  assert.deepEqual(calls, [
    {
      url: "https://api.deepseek.com/user/balance",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer sk-secret",
      },
    },
  ]);
  assert.doesNotMatch(JSON.stringify(providerFromSpy), /sk-secret/u);
});
