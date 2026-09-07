import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

import {
  DASHBOARD_METRICS,
  DASHBOARD_PANEL_LIMIT,
  DASHBOARD_VISUALIZATIONS,
  isCompleteDashboardConfig,
  supportsVisualization,
} from "./dashboard-config.ts";

const timestamp = z.number().int().nonnegative();
const bytes = z.number().int().nonnegative();
const percent = z.number().min(0).max(100);
const byteRate = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();

export const capacitySchema = z.object({
  totalBytes: bytes,
  usedBytes: bytes,
  availableBytes: bytes,
  usagePercent: percent,
}).strict();

export const machineSnapshotSchema = z.object({
  sampledAtMs: timestamp,
  durationMs: z.number().int().nonnegative(),
  system: z.object({
    hostname: z.string().min(1),
    osName: z.string().min(1),
    platform: z.string().min(1),
    arch: z.string().min(1),
    kernelRelease: z.string().min(1),
    kernelVersion: z.string().min(1),
    uptimeSeconds: z.number().nonnegative(),
    bootedAtMs: timestamp,
  }).strict(),
  network: z.object({
    receiveBytesPerSecond: byteRate,
    sendBytesPerSecond: byteRate,
  }).strict().superRefine((network, context) => {
    if ((network.receiveBytesPerSecond === null) !== (network.sendBytesPerSecond === null)) {
      context.addIssue({ code: "custom", message: "Network rates must be available together." });
    }
  }),
  cpu: z.object({
    model: z.string(),
    logicalCores: z.number().int().positive(),
    usagePercent: percent,
    loadAverage: z.tuple([
      z.number().nonnegative(),
      z.number().nonnegative(),
      z.number().nonnegative(),
    ]).nullable(),
  }).strict(),
  memory: capacitySchema,
  swap: capacitySchema.nullable(),
  disk: capacitySchema.extend({ path: z.string().min(1) }).strict().nullable(),
  issues: z.array(z.object({
    metric: z.enum(["system", "network", "cpu", "memory", "swap", "disk"]),
    message: z.string().min(1),
  }).strict()).max(16),
}).strict();

export type MachineSnapshot = z.infer<typeof machineSnapshotSchema>;

export const processSortBySchema = z.enum(["cpu", "memory", "name"]);
export const processTerminationModeSchema = z.enum(["graceful", "force"]);
export const processOwnerCategorySchema = z.enum(["same-user", "different-user", "unknown"]);
export const processBlockedReasonSchema = z.enum([
  "elevated-session",
  "ancestry-unavailable",
  "system-process",
  "monitor-process",
  "monitor-ancestor",
  "different-owner",
  "unknown-owner",
  "identity-unavailable",
  "mode-unsupported",
  "unsupported-platform",
]);

const opaqueProcessIdentitySchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u, "Invalid opaque process identity.");

export const processRowSchema = z.object({
  pid: z.number().int().nonnegative(),
  name: z.string().min(1).max(120),
  identity: opaqueProcessIdentitySchema.nullable(),
  cpuPercent: percent,
  rssBytes: bytes,
  memoryPercent: percent,
  startedAtMs: timestamp.nullable(),
  ownerCategory: processOwnerCategorySchema,
  allowedTerminationModes: z.array(processTerminationModeSchema).max(2)
    .refine((modes) => new Set(modes).size === modes.length, { message: "Termination modes must be unique." }),
  blockedReason: processBlockedReasonSchema.nullable(),
}).strict().superRefine((row, context) => {
  if ((row.blockedReason === null) !== (row.allowedTerminationModes.length > 0)) {
    context.addIssue({ code: "custom", message: "A process must have either allowed termination modes or a blocked reason." });
  }
  if (row.identity === null && row.blockedReason === null) {
    context.addIssue({ code: "custom", message: "A process without a lifetime identity cannot be actionable." });
  }
});

export type ProcessSortBy = z.infer<typeof processSortBySchema>;
export type ProcessTerminationMode = z.infer<typeof processTerminationModeSchema>;
export type ProcessOwnerCategory = z.infer<typeof processOwnerCategorySchema>;
export type ProcessBlockedReason = z.infer<typeof processBlockedReasonSchema>;
export type ProcessRow = z.infer<typeof processRowSchema>;

const processPlatformSchema = z.enum(["linux", "darwin", "win32"]);
const hostProcessListSchema = z.object({
  sampledAtMs: timestamp,
  platform: processPlatformSchema,
  elevated: z.boolean(),
  totalCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  processes: z.array(processRowSchema).max(200),
}).strict().superRefine((result, context) => {
  if (result.totalCount < result.processes.length) {
    context.addIssue({ code: "custom", message: "The process total cannot be smaller than the returned page." });
  }
  if (result.truncated !== (result.totalCount > result.processes.length)) {
    context.addIssue({ code: "custom", message: "The process truncated flag must match the returned page." });
  }
});

const processTerminationCandidateSchema = z.object({
  pid: z.number().int().nonnegative(),
  name: z.string().min(1).max(120),
  identity: opaqueProcessIdentitySchema,
  mode: processTerminationModeSchema,
  cpuPercent: percent,
  rssBytes: bytes,
  memoryPercent: percent,
  startedAtMs: timestamp.nullable(),
}).strict();

const terminationBlockedSchema = z.object({
  outcome: z.literal("blocked"),
  reason: processBlockedReasonSchema,
  message: z.string().min(1).max(240),
}).strict();

const terminationUnavailableSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("not-found"), message: z.string().min(1).max(240) }).strict(),
  z.object({ outcome: z.literal("identity-changed"), message: z.string().min(1).max(240) }).strict(),
]);

const hostPrepareTerminationResultSchema = z.union([
  z.object({ outcome: z.literal("ready"), process: processTerminationCandidateSchema }).strict(),
  terminationBlockedSchema,
  terminationUnavailableSchema,
]);

const hostExecuteTerminationResultSchema = z.union([
  z.object({ outcome: z.literal("signal-sent"), message: z.string().min(1).max(240) }).strict(),
  z.object({ outcome: z.literal("still-running"), message: z.string().min(1).max(240) }).strict(),
  terminationBlockedSchema,
  terminationUnavailableSchema,
  z.object({ outcome: z.literal("signal-failed"), message: z.string().min(1).max(240) }).strict(),
]);

export const hostContract = defineRpcContract({
  snapshot: {
    input: z.object({ cpuSampleMs: z.number().int().min(100).max(1_000) }).strict(),
    output: machineSnapshotSchema,
  },
  listProcesses: {
    input: z.object({ sortBy: processSortBySchema, limit: z.number().int().min(1).max(200) }).strict(),
    output: hostProcessListSchema,
  },
  inspectProcessTermination: {
    input: z.object({
      pid: z.number().int().nonnegative(),
      identity: opaqueProcessIdentitySchema,
      mode: processTerminationModeSchema,
    }).strict(),
    output: hostPrepareTerminationResultSchema,
  },
  terminateProcess: {
    input: z.object({
      pid: z.number().int().nonnegative(),
      identity: opaqueProcessIdentitySchema,
      mode: processTerminationModeSchema,
    }).strict(),
    output: hostExecuteTerminationResultSchema,
  },
});

const hostSummarySchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().min(1),
  status: z.enum(["connected", "disconnected"]),
  lastSeenAt: timestamp.nullable(),
}).strict();

const sampleStateSchema = z.enum(["fresh", "stale", "sampling", "error", "offline"]);
const thresholdsSchema = z.object({ cpu: percent, ram: percent, disk: percent }).strict();

const machineRowSchema = z.object({
  host: hostSummarySchema,
  sampleState: sampleStateSchema,
  snapshot: machineSnapshotSchema.nullable(),
  receivedAtMs: timestamp.nullable(),
  error: z.string().nullable(),
}).strict();

const fleetSchema = z.object({
  generatedAtMs: timestamp,
  refreshIntervalMs: z.number().int().positive(),
  refreshing: z.boolean(),
  connected: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  thresholds: thresholdsSchema,
  machines: z.array(machineRowSchema),
}).strict();

const historyPointSchema = z.object({
  collectedAtMs: timestamp,
  cpuPercent: percent.nullable(),
  memoryPercent: percent.nullable(),
  diskPercent: percent.nullable(),
  receiveBytesPerSecond: byteRate,
  sendBytesPerSecond: byteRate,
  load1: z.number().nonnegative().nullable(),
  load5: z.number().nonnegative().nullable(),
  load15: z.number().nonnegative().nullable(),
}).strict();

const rangeHoursSchema = z.union([
  z.literal(1), z.literal(6), z.literal(24), z.literal(24 * 7), z.literal(24 * 30),
]);

export const dashboardPanelSchema = z.object({
  metric: z.enum(DASHBOARD_METRICS),
  visualization: z.enum(DASHBOARD_VISUALIZATIONS),
  visible: z.boolean(),
}).strict().superRefine((panel, context) => {
  if (!supportsVisualization(panel.metric, panel.visualization)) {
    context.addIssue({
      code: "custom",
      path: ["visualization"],
      message: `${panel.metric} does not support ${panel.visualization}.`,
    });
  }
});

export const dashboardConfigSchema = z.object({
  version: z.literal(2),
  panels: z.array(dashboardPanelSchema).length(DASHBOARD_PANEL_LIMIT),
}).strict().superRefine((config, context) => {
  const keys = new Set<string>();
  for (const [index, panel] of config.panels.entries()) {
    const key = `${panel.metric}:${panel.visualization}`;
    if (keys.has(key)) {
      context.addIssue({ code: "custom", path: ["panels", index], message: "Dashboard panels must be unique." });
    }
    keys.add(key);
  }
  if (!isCompleteDashboardConfig(config)) {
    context.addIssue({ code: "custom", path: ["panels"], message: "Dashboard must contain every supported widget exactly once." });
  }
});

const dashboardHostInputSchema = z.object({ hostId: z.string().min(1).max(256) }).strict();

const processListHostSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().min(1),
  status: z.literal("connected"),
  platform: processPlatformSchema,
}).strict();

export const processListResultSchema = z.union([
  z.object({
    outcome: z.literal("ok"),
    host: processListHostSchema,
    sampledAtMs: timestamp,
    elevated: z.boolean(),
    totalCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    processes: z.array(processRowSchema).max(200),
  }).strict(),
  z.object({
    outcome: z.enum(["not-found", "offline", "unavailable", "unsupported"]),
    message: z.string().min(1).max(240),
  }).strict(),
]);

const preparedTerminationHostSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().min(1),
}).strict();

export const preparedTerminationSchema = z.union([
  z.object({
    outcome: z.literal("ready"),
    confirmationToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/u, "Invalid confirmation token."),
    expiresAtMs: timestamp,
    host: preparedTerminationHostSchema,
    process: processTerminationCandidateSchema,
  }).strict(),
  terminationBlockedSchema,
  terminationUnavailableSchema,
  z.object({ outcome: z.literal("unavailable"), message: z.string().min(1).max(240) }).strict(),
]);

const executedProcessSchema = processTerminationCandidateSchema.pick({ pid: true, name: true, mode: true });

export const executeTerminationResultSchema = z.union([
  z.object({
    outcome: z.literal("signal-sent"),
    host: preparedTerminationHostSchema,
    process: executedProcessSchema,
    message: z.string().min(1).max(240),
  }).strict(),
  z.object({
    outcome: z.literal("still-running"),
    host: preparedTerminationHostSchema,
    process: executedProcessSchema,
    message: z.string().min(1).max(240),
  }).strict(),
  terminationBlockedSchema,
  terminationUnavailableSchema,
  z.object({
    outcome: z.enum(["signal-failed", "confirmation-expired", "confirmation-invalid", "outcome-unknown"]),
    message: z.string().min(1).max(240),
  }).strict(),
]);

export type ProcessListResult = z.infer<typeof processListResultSchema>;
export type PreparedTermination = z.infer<typeof preparedTerminationSchema>;
export type ExecuteTerminationResult = z.infer<typeof executeTerminationResultSchema>;

export const rpcContract = defineRpcContract({
  fleet: { input: z.null(), output: fleetSchema },
  sidebarSummary: {
    input: z.null(),
    output: z.object({ connected: z.number().int().nonnegative(), total: z.number().int().nonnegative() }).strict(),
  },
  machineHistory: {
    input: z.object({ hostId: z.string().min(1).max(256), rangeHours: rangeHoursSchema }).strict(),
    output: z.object({ hostId: z.string(), rangeHours: rangeHoursSchema, points: z.array(historyPointSchema).max(720) }).strict(),
  },
  dashboardConfig: {
    input: dashboardHostInputSchema,
    output: dashboardConfigSchema,
  },
  saveDashboardConfig: {
    input: dashboardHostInputSchema.extend({ config: dashboardConfigSchema }).strict(),
    output: dashboardConfigSchema,
  },
  listProcesses: {
    input: dashboardHostInputSchema.extend({
      sortBy: processSortBySchema,
      limit: z.number().int().min(1).max(200),
    }).strict(),
    output: processListResultSchema,
  },
  prepareProcessTermination: {
    input: dashboardHostInputSchema.extend({
      pid: z.number().int().nonnegative(),
      identity: opaqueProcessIdentitySchema,
      mode: processTerminationModeSchema,
    }).strict(),
    output: preparedTerminationSchema,
  },
  executeProcessTermination: {
    input: z.object({
      confirmationToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/u, "Invalid confirmation token."),
    }).strict(),
    output: executeTerminationResultSchema,
  },
  refresh: {
    input: z.object({ hostId: z.string().min(1).max(256).nullable() }).strict(),
    output: fleetSchema,
  },
});

export type Fleet = z.infer<typeof fleetSchema>;
export type MachineRow = z.infer<typeof machineRowSchema>;
export type HistoryPoint = z.infer<typeof historyPointSchema>;
export type MachineHistory = z.infer<typeof rpcContract.machineHistory.output>;
export type RangeHours = z.infer<typeof rangeHoursSchema>;
export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;
export type DashboardPanel = z.infer<typeof dashboardPanelSchema>;
