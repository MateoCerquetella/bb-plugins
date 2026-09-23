import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const ROUTER_LOG =
  process.env.JEV_ROUTER_LOG ??
  `${process.env.HOME ?? ""}/.codex/codex-router/jev-router-live.jsonl`;

const routeSchema = z
  .object({
    at: z.string(),
    model: z.string(),
    effort: z.string(),
    speed: z.string().optional(),
    status: z.number().optional(),
    fallback: z.string().nullable().optional(),
    errored: z.boolean().optional(),
    step: z.string().optional(),
    task: z.string().optional(),
  })
  .passthrough();

export type Route = z.infer<typeof routeSchema>;

const executionSchema = z.object({
  providerId: z.string(),
  model: z.string(),
  reasoningLevel: z.string(),
  at: z.number(),
});
const switchSchema = z.object({
  from: z.string(),
  to: z.string(),
  provider: z.string(),
  reasoningLevel: z.string(),
  at: z.number(),
});

export const rpcContract = defineRpcContract({
  colors: {
    input: z.object({ model: z.string().trim().min(1).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }),
    output: z.record(z.string(), z.string()),
  },
  latest: {
    input: z.object({ threadId: z.string().min(1) }),
    output: z.object({
      route: routeSchema.nullable(),
      previousModel: z.string().nullable(),
      execution: executionSchema.nullable(),
      previousExecutionModel: z.string().nullable(),
      switches: z.array(switchSchema),
      display: z.object({
        showThreadRoute: z.boolean(),
        showSwitchHistory: z.boolean(),
        modelColors: z.record(z.string(), z.string()),
      }),
      logPath: z.string(),
      checkedAt: z.string(),
      error: z.string().nullable(),
    }),
  },
});

async function latestExecution(bb: BbPluginApi, threadId: string) {
  const [thread, events] = await Promise.all([
    bb.sdk.threads.get({ threadId }),
    bb.sdk.threads.events.list({
      threadId,
      types: ["client/turn/requested"],
      order: "desc",
      limit: "100",
    }),
  ]);
  const providerId = thread.providerId;
  const requested: Array<z.infer<typeof executionSchema>> = [];

  for (const event of events) {
    const data = event.data as {
      providerId?: unknown;
      execution?: {
        providerId?: unknown;
        model?: unknown;
        reasoningLevel?: unknown;
      };
    };
    const model = data.execution?.model;
    const reasoningLevel = data.execution?.reasoningLevel;
    if (typeof model !== "string") continue;
    const eventProvider =
      typeof data.execution?.providerId === "string"
        ? data.execution.providerId
        : typeof data.providerId === "string"
          ? data.providerId
          : providerId;
    requested.push({
      providerId: eventProvider,
      model,
      reasoningLevel: typeof reasoningLevel === "string" ? reasoningLevel : "",
      at: event.createdAt,
    });
  }
  requested.reverse();
  const latest = requested.at(-1) ?? null;
  const switches: Array<z.infer<typeof switchSchema>> = [];
  for (let index = 1; index < requested.length; index += 1) {
    const from = requested[index - 1]!;
    const to = requested[index]!;
    if (from.model !== to.model || from.providerId !== to.providerId) {
      switches.push({
        from: from.model,
        to: to.model,
        provider: to.providerId,
        reasoningLevel: to.reasoningLevel,
        at: to.at,
      });
    }
  }
  return {
    execution: latest,
    previousExecutionModel: requested.length > 1 ? requested.at(-2)!.model : null,
    switches,
  };
}

function scopeForProviderThread(providerThreadId: string): string {
  return createHash("sha256")
    .update(`prompt:${providerThreadId}`)
    .digest("hex")
    .slice(0, 16);
}

async function providerThreadId(
  bb: BbPluginApi,
  threadId: string,
): Promise<string | null> {
  const events = await bb.sdk.threads.events.list({
    threadId,
    order: "desc",
    limit: "100",
  });
  for (const event of events) {
    const data = event.data as { providerThreadId?: unknown };
    if (
      typeof data.providerThreadId === "string" &&
      data.providerThreadId.length > 0
    ) {
      return data.providerThreadId;
    }
  }
  return null;
}

async function latestRoute(
  bb: BbPluginApi,
  threadId: string,
): Promise<{
  route: Route | null;
  previousModel: string | null;
  routeSwitches: Array<z.infer<typeof switchSchema>>;
  logPath: string;
  checkedAt: string;
  error: string | null;
}> {
  const checkedAt = new Date().toISOString();
  try {
    const providerId = await providerThreadId(bb, threadId);
    if (providerId === null) {
      return {
        route: null,
        previousModel: null,
        routeSwitches: [],
        logPath: ROUTER_LOG,
        checkedAt,
        error: "This thread has no Codex session yet.",
      };
    }
    const scope = scopeForProviderThread(providerId);
    const text = await readFile(ROUTER_LOG, "utf8");
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const history: Route[] = [];
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        const candidate = JSON.parse(lines[index]!) as {
          cache_scope?: unknown;
        };
        if (candidate.cache_scope !== scope) continue;
        const route = routeSchema.parse(candidate);
        history.push(route);
      } catch {
        // A write can leave the last line temporarily partial.
      }
    }
    if (history.length > 0) {
      history.reverse();
      const latest = history.at(-1)!;
      const routeSwitches: Array<z.infer<typeof switchSchema>> = [];
      for (let index = 1; index < history.length; index += 1) {
        const from = history[index - 1]!;
        const to = history[index]!;
        if (from.model === to.model) continue;
        routeSwitches.push({
          from: from.model,
          to: to.model,
          provider: "jev",
          reasoningLevel: to.effort,
          at: Date.parse(to.at),
        });
      }
      return {
        route: latest,
        previousModel: routeSwitches.at(-1)?.from ?? null,
        routeSwitches,
        logPath: ROUTER_LOG,
        checkedAt,
        error: null,
      };
    }
    return {
      route: null,
      previousModel: null,
      routeSwitches: [],
      logPath: ROUTER_LOG,
      checkedAt,
      error: "No Jev route recorded for this thread yet.",
    };
  } catch (cause) {
    return {
      route: null,
      previousModel: null,
      routeSwitches: [],
      logPath: ROUTER_LOG,
      checkedAt,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export default function plugin(bb: BbPluginApi) {
  const colorOptions = [
    "Red",
    "Orange",
    "Yellow",
    "Green",
    "Blue",
    "Violet",
    "Pink",
    "Sky",
    "Amber",
  ];
  const settings = bb.settings.define({
    showThreadRoute: {
      type: "boolean",
      label: "Show the latest model used in every thread",
      default: true,
    },
    showSwitchHistory: {
      type: "boolean",
      label: "Show the previous model when a thread switches",
      default: true,
    },
    lunaColor: {
      type: "select",
      label: "Luna color",
      options: colorOptions,
      default: "Sky",
    },
    solColor: {
      type: "select",
      label: "Sol color",
      options: colorOptions,
      default: "Amber",
    },
    astraColor: {
      type: "select",
      label: "Astra color",
      options: colorOptions,
      default: "Violet",
    },
  });

  bb.rpc.register(rpcContract, {
    colors: async ({ model, color }) => {
      if (model && color) await bb.storage.kv.set(`color:${model.toLowerCase()}`, color);
      const keys = await bb.storage.kv.list();
      const colors: Record<string, string> = {};
      for (const key of keys) {
        if (!key.startsWith("color:")) continue;
        const value = await bb.storage.kv.get<string>(key);
        if (value) colors[key.slice(6)] = value;
      }
      return colors;
    },
    latest: async ({ threadId }) => {
      const [execution, display] = await Promise.all([
        latestExecution(bb, threadId),
        settings.get(),
      ]);
      const route =
        execution.execution?.model === "jev/auto"
          ? await latestRoute(bb, threadId)
          : {
              route: null,
              previousModel: null,
              routeSwitches: [],
              logPath: ROUTER_LOG,
              checkedAt: new Date().toISOString(),
              error: null,
            };
      const switches =
        execution.execution?.model === "jev/auto"
          ? route.routeSwitches
          : execution.switches;
      return {
        ...route,
        ...execution,
        switches,
        display: {
          showThreadRoute: display.showThreadRoute,
          showSwitchHistory: display.showSwitchHistory,
          modelColors: {
            luna: display.lunaColor,
            sol: display.solColor,
            astra: display.astraColor,
            ...await (async () => {
              const colors: Record<string, string> = {};
              for (const key of await bb.storage.kv.list()) {
                if (key.startsWith("color:")) colors[key.slice(6)] = (await bb.storage.kv.get<string>(key))!;
              }
              return colors;
            })(),
          },
        },
      };
    },
  });
}
