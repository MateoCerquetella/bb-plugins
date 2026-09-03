import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const sampleSchema = z.object({
  collectedAt: z.number().int().nonnegative(),
  cpuPercent: z.number().nullable(),
  cpu5mPercent: z.number().nullable(),
  memoryUsedBytes: z.number().nullable(),
  memoryTotalBytes: z.number().nullable(),
  diskUsedBytes: z.number().nullable(),
  diskTotalBytes: z.number().nullable(),
  load1: z.number().nullable(),
  load5: z.number().nullable(),
}).strict();
const directorySchema = z.object({
  id: z.string(), label: z.string(), bytes: z.number().nonnegative(), growthBytesPerDay: z.number().nullable(),
}).strict();
const thresholdsSchema = z.object({ cpu: z.number(), ram: z.number(), disk: z.number() }).strict();
const memoryProcessSchema = z.object({
  pid: z.number().int().nonnegative(), startTime: z.number().nonnegative(), name: z.string(), workload: z.string(), workloadDetail: z.string().nullable(), rssBytes: z.number().nonnegative(),
  rssDeltaBytes: z.number().nullable(), minorFaultsPerSecond: z.number().nullable(), majorFaultsPerSecond: z.number().nullable(),
}).strict();
const memoryDiagnosticsSchema = z.object({
  collectedAt: z.number().int().nonnegative(), processDetailsCollectedAt: z.number().int().nonnegative().nullable(), sampleIntervalMs: z.number().int().nonnegative().nullable(),
  pressureSomePercent: z.number().nullable(), pressureFullPercent: z.number().nullable(),
  swapInPagesPerSecond: z.number().nullable(), swapOutPagesPerSecond: z.number().nullable(),
  refaultPagesPerSecond: z.number().nullable(), reclaimPagesPerSecond: z.number().nullable(), bbCgroupMemoryBytes: z.number().nullable(),
  processes: z.array(memoryProcessSchema).max(12),
}).strict();

export const rpcContract = defineRpcContract({
  snapshot: {
    input: z.object({ rangeHours: z.number().int().min(1).max(24 * 30) }).strict(),
    output: z.object({
      hostName: z.string(),
      platform: z.string(),
      uptimeSeconds: z.number().nonnegative(),
      latest: sampleSchema.nullable(),
      samples: z.array(sampleSchema),
      thresholds: thresholdsSchema,
      diskGrowthBytesPerDay: z.number().nullable(),
      directories: z.array(directorySchema),
      memoryDiagnostics: memoryDiagnosticsSchema.nullable(),
      processDetailsEnabled: z.boolean(),
      lastError: z.string().nullable(),
      collectorErrors: z.array(z.string()),
    }).strict(),
  },
});

export type HostMonitorSnapshot = z.infer<typeof rpcContract.snapshot.output>;
