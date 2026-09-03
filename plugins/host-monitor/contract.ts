import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

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

export const hostContract = defineRpcContract({
  snapshot: {
    input: z.object({ cpuSampleMs: z.number().int().min(100).max(1_000) }).strict(),
    output: machineSnapshotSchema,
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
