import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { loadUsageSnapshot } from "./lib/load-usage.ts";
import {
  COMPACT_LIMIT_OPTIONS,
  enabledSidebarProviderIds,
  normalizeCompactLimitOption,
  SIDEBAR_PROVIDER_IDS,
} from "./lib/preferences.ts";
import { PROVIDER_IDS } from "./lib/usage.ts";

const costSchema = z
  .object({
    usedUsdCents: z.number().finite(),
    limitUsdCents: z.number().finite(),
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
  })
  .strict();

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
    compactLimit: {
      type: "select",
      label: "Compact limit",
      description: "Choose which limit the compact percentage and bar show.",
      options: [...COMPACT_LIMIT_OPTIONS],
      default: "Weekly",
    },
  });

  bb.rpc.register(usageRpcContract, {
    async getPreferences() {
      const preferences = await settings.get();
      return {
        enabledProviderIds: enabledSidebarProviderIds(preferences),
        compactLimit: normalizeCompactLimitOption(preferences.compactLimit),
      };
    },
    getUsage({ threadId }) {
      return loadUsageSnapshot(bb.sdk, threadId);
    },
  });
}
