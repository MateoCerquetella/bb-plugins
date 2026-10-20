import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  consumeCodexRateLimitResetCredit,
  readCodexResetCredits,
} from "./lib/codex-reset-credits.ts";
import { readClaudeUsageFromKeychain } from "./lib/claude-keychain-usage.ts";
import {
  DEEPSEEK_BASELINE_KEY,
  loadDeepSeekProvider,
  parseDeepSeekBudget,
  resolveDeepSeekApiKey,
  type DeepSeekBaselineStore,
} from "./lib/deepseek-balance.ts";
import { loadUsageSnapshot } from "./lib/load-usage.ts";
import { getCachedAntigravityUsage } from "./lib/antigravity-probe.ts";
import { createResetActionGate, type ResetPrepareResult } from "./lib/reset-action-gate.ts";
import { PROVIDER_IDS, withCodexResetCredits } from "./lib/usage.ts";
import {
  loadPoolAccountRecords,
  poolOwnsProvider,
  switchPoolAccount,
} from "./lib/pool-routing.ts";
import {
  COMPACT_LIMIT_OPTIONS,
  enabledSidebarProviderIds,
  normalizeCompactLimitOption,
  SIDEBAR_PROVIDER_IDS,
} from "./lib/preferences.ts";

const costSchema = z
  .object({
    usedUsdCents: z.number().finite(),
    limitUsdCents: z.number().finite(),
  })
  .strict();

const resetCreditsSchema = z
  .object({
    availableCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

const usageWindowSchema = z
  .object({
    label: z.string(),
    usedPercent: z.number().finite(),
    barPercent: z.number().finite().min(0).max(100),
    resetsAt: z.string().nullable(),
    cost: costSchema.nullable(),
    kind: z.enum(["five-hour", "daily", "weekly", "custom"]).optional(),
  })
  .strict();

const providerStatusSchema = z.enum(["ok", "not_installed", "unauthenticated", "expired", "error"]);

const providerBalanceSchema = z
  .object({
    currency: z.string().min(1),
    total: z.number().finite(),
    granted: z.number().finite(),
    toppedUp: z.number().finite(),
    available: z.boolean(),
    budget: z.number().finite().nullable(),
    budgetSource: z.enum(["explicit", "toppedUp"]).nullable(),
    usedPercent: z.number().finite().min(0).max(100).nullable(),
  })
  .strict();

const pooledAccountSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    status: providerStatusSchema,
    accountEmail: z.string().nullable(),
    planLabel: z.string().nullable(),
    message: z.string().nullable(),
    observedAt: z.string().nullable(),
    windows: z.array(usageWindowSchema),
  })
  .strict();

const providerSchema = z
  .object({
    id: z.enum(PROVIDER_IDS),
    name: z.string(),
    status: providerStatusSchema,
    accountEmail: z.string().nullable(),
    planLabel: z.string().nullable(),
    message: z.string().nullable(),
    windows: z.array(usageWindowSchema),
    balance: providerBalanceSchema.optional(),
    resetCredits: resetCreditsSchema.nullable().optional(),
    accounts: z.array(pooledAccountSchema).optional(),
    currentAccountId: z.string().optional(),
    inUse: z.boolean().optional(),
  })
  .strict();

const resetPrepareResultSchema: z.ZodType<ResetPrepareResult> = z.union([
  z
    .object({
      outcome: z.literal("ready"),
      confirmationToken: z.string().min(1),
      expiresAtMs: z.number().int().nonnegative(),
      availableCount: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      outcome: z.enum(["unavailable", "no-credit"]),
      message: z.string().min(1),
    })
    .strict(),
]);

const resetConsumptionOutcomeSchema = z.enum([
  "reset",
  "nothingToReset",
  "noCredit",
  "alreadyRedeemed",
  "confirmation-invalid",
  "confirmation-expired",
]);

export const usageRpcContract = defineRpcContract({
  getPreferences: {
    input: z.null(),
    output: z
      .object({
        enabledProviderIds: z.array(z.enum(SIDEBAR_PROVIDER_IDS)),
        compactLimit: z.enum(COMPACT_LIMIT_OPTIONS),
      })
      .strict(),
  },
  getUsage: {
    input: z.object({ threadId: z.string().trim().min(1).nullable() }).strict(),
    output: z
      .object({
        fetchedAt: z.string(),
        host: z
          .object({
            id: z.string().nullable(),
            name: z.string().nullable(),
          })
          .strict(),
        providers: z.array(providerSchema),
      })
      .strict(),
  },
  prepareReset: {
    input: z.null(),
    output: resetPrepareResultSchema,
  },
  selectAccount: {
    input: z
      .object({
        providerId: z.enum(PROVIDER_IDS),
        accountId: z.string().trim().min(1),
      })
      .strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
  consumeReset: {
    input: z
      .object({
        confirmationToken: z.string().trim().min(1).max(128),
      })
      .strict(),
    output: z.object({ outcome: resetConsumptionOutcomeSchema }).strict(),
  },
});

export default function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    enableClaudeCode: {
      type: "boolean",
      label: "Enable Claude Code",
      description: "Show Claude Code usage in the sidebar footer.",
      default: true,
    },
    claudeKeychainService: {
      type: "string",
      label: "Claude Keychain service",
      description:
        "macOS only. Set when Claude Code runs with CLAUDE_CONFIG_DIR, which stores credentials under `Claude Code-credentials-<hash>` instead of BB's default `Claude Code-credentials`. Leave empty to use BB's usage data.",
      default: "",
    },
    enableCodex: {
      type: "boolean",
      label: "Enable Codex",
      description: "Show Codex usage in the sidebar footer.",
      default: true,
    },
    enableCursor: {
      type: "boolean",
      label: "Enable Cursor",
      description: "Show Cursor usage in the sidebar footer.",
      default: true,
    },
    enableGrok: {
      type: "boolean",
      label: "Enable Grok",
      description: "Show Grok usage in the sidebar footer.",
      default: true,
    },
    enableOpenCode: {
      type: "boolean",
      label: "Enable OpenCode",
      description: "Show OpenCode usage in the sidebar footer.",
      default: true,
    },
    enableAntigravity: {
      type: "boolean",
      label: "Enable Antigravity",
      description: "Show Google Antigravity usage in the sidebar footer.",
      default: false,
    },
    enableDeepSeek: {
      type: "boolean",
      label: "Enable DeepSeek",
      description: "Show the DeepSeek API balance in the sidebar footer.",
      default: false,
    },
    deepSeekApiKey: {
      type: "string",
      label: "DeepSeek API key",
      description:
        "Stored in BB's plugin secrets and read only by the plugin server. Leave empty to use DEEPSEEK_API_KEY.",
      secret: true,
      default: "",
    },
    deepSeekBudget: {
      type: "string",
      label: "DeepSeek topped-up balance",
      description:
        "The amount you topped up, in the currency DeepSeek reports. The bar reaches 100% when the balance reaches 0. Leave empty to derive the baseline automatically from the reported topped-up balance.",
      default: "",
    },
    compactLimit: {
      type: "select",
      label: "Compact limit",
      description: "Choose which limit the compact percentage and bar show.",
      options: [...COMPACT_LIMIT_OPTIONS],
      default: "Weekly",
    },
  });

  const resetGate = createResetActionGate(consumeCodexRateLimitResetCredit);

  let lastKnownCodexResetCount: number | null = null;

  bb.rpc.register(usageRpcContract, {
    async getPreferences() {
      const preferences = await settings.get();
      return {
        enabledProviderIds: enabledSidebarProviderIds(preferences),
        compactLimit: normalizeCompactLimitOption(preferences.compactLimit),
      };
    },
    async getUsage({ threadId }) {
      const preferences = await settings.get();
      const claudeKeychainService = preferences.claudeKeychainService.trim();
      const routedAccounts = loadPoolAccountRecords();
      const deepSeekKey = resolveDeepSeekApiKey(
        preferences.deepSeekApiKey,
        process.env.DEEPSEEK_API_KEY,
      );
      const deepSeekBudget = parseDeepSeekBudget(preferences.deepSeekBudget);
      const deepSeekBaselineStore: DeepSeekBaselineStore | undefined =
        deepSeekBudget === null
          ? {
              async read() {
                const value = await bb.storage.kv.get<number>(DEEPSEEK_BASELINE_KEY);
                return typeof value === "number" ? value : null;
              },
              async write(baseline) {
                await bb.storage.kv.set(DEEPSEEK_BASELINE_KEY, baseline);
              },
            }
          : undefined;
      const [snapshot, deepSeek] = await Promise.all([
        loadUsageSnapshot(
          bb.sdk,
          threadId,
          new Date(),
          claudeKeychainService === ""
            ? Promise.resolve({})
            : readClaudeUsageFromKeychain(claudeKeychainService).then((usage) => ({
                "claude-code": usage,
              })),
          routedAccounts,
        ),
        preferences.enableDeepSeek
          ? loadDeepSeekProvider({
              apiKey: deepSeekKey,
              budget: deepSeekBudget,
              baselineStore: deepSeekBaselineStore,
            })
          : Promise.resolve(null),
      ]);
      const providers = [
        ...snapshot.providers.filter(
          (provider) =>
            provider.id !== "antigravity" && provider.id !== "deepSeek",
        ),
        ...(preferences.enableAntigravity ? [getCachedAntigravityUsage()] : []),
        ...(deepSeek === null ? [] : [deepSeek]),
      ];
      const codexIsAvailable =
        snapshot.providers.some(
          (provider) =>
            provider.id === "codex" &&
            provider.status === "ok" &&
            (provider.accounts?.length ?? 0) === 0,
        ) && !poolOwnsProvider(await routedAccounts, "codex");
      if (codexIsAvailable) {
        try {
          lastKnownCodexResetCount = await readCodexResetCredits();
        } catch {
          bb.log.warn("Codex usage reset availability could not be loaded.");
        }
      } else {
        lastKnownCodexResetCount = null;
      }
      resetGate.setAvailableCount(lastKnownCodexResetCount);
      return withCodexResetCredits({ ...snapshot, providers }, lastKnownCodexResetCount);
    },
    prepareReset(): ResetPrepareResult {
      return resetGate.prepare();
    },
    async consumeReset({ confirmationToken }) {
      return {
        outcome: await resetGate.consume(confirmationToken),
      };
    },
    async selectAccount({ providerId, accountId }) {
      if (providerId === "codex") {
        lastKnownCodexResetCount = null;
        resetGate.setAvailableCount(null);
      }
      await switchPoolAccount(providerId, accountId);
      return { ok: true as const };
    },
  });
}
