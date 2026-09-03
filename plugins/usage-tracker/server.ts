import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  consumeCodexRateLimitResetCredit,
  readCodexResetCredits,
} from "./lib/codex-reset-credits.ts";
import { loadUsageSnapshot } from "./lib/load-usage.ts";
import { getCachedAntigravityUsage } from "./lib/antigravity-probe.ts";
import {
  createResetActionGate,
  type ResetPrepareResult,
} from "./lib/reset-action-gate.ts";
import {
  PROVIDER_IDS,
  withCodexResetCredits,
} from "./lib/usage.ts";
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
    availableCount: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

const usageWindowSchema = z
  .object({
    label: z.string(),
    usedPercent: z.number().finite(),
    barPercent: z.number().finite().min(0).max(100),
    resetsAt: z.string().nullable(),
    cost: costSchema.nullable(),
  })
  .strict();

const providerSchema = z
  .object({
    id: z.enum(PROVIDER_IDS),
    name: z.string(),
    status: z.enum([
      "ok",
      "not_installed",
      "unauthenticated",
      "expired",
      "error",
    ]),
    accountEmail: z.string().nullable(),
    planLabel: z.string().nullable(),
    message: z.string().nullable(),
    windows: z.array(usageWindowSchema),
    resetCredits: resetCreditsSchema.nullable().optional(),
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
    input: z
      .object({ threadId: z.string().trim().min(1).nullable() })
      .strict(),
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
  consumeReset: {
    input: z
      .object({
        confirmationToken: z.string().trim().min(1).max(128),
      })
      .strict(),
    output: z
      .object({ outcome: resetConsumptionOutcomeSchema })
      .strict(),
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
    enableCodex: {
      type: "boolean",
      label: "Enable Codex",
      description: "Show Codex usage in the sidebar footer.",
      default: true,
    },
    enableAntigravity: {
      type: "boolean",
      label: "Enable Antigravity",
      description: "Show Google Antigravity usage in the sidebar footer.",
      default: false,
    },
    compactLimit: {
      type: "select",
      label: "Compact limit",
      description: "Choose which limit the compact percentage and bar show.",
      options: [...COMPACT_LIMIT_OPTIONS],
      default: "Weekly",
    },
  });

  const resetGate = createResetActionGate(
    consumeCodexRateLimitResetCredit,
  );

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
      const snapshot = await loadUsageSnapshot(bb.sdk, threadId);
      const preferences = await settings.get();
      const antigravity = preferences.enableAntigravity
        ? getCachedAntigravityUsage()
        : snapshot.providers.find((provider) => provider.id === "antigravity");
      const providers = antigravity === undefined
        ? snapshot.providers
        : snapshot.providers.map((provider) =>
            provider.id === "antigravity" ? antigravity : provider,
          );
      const codexIsAvailable = snapshot.providers.some(
        (provider) => provider.id === "codex" && provider.status === "ok",
      );
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
  });
}
