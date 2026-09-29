import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const timestampSchema = z.number().int().nonnegative();
const bytesSchema = z.number().int().nonnegative();
const byteRateSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .nullable();
const percentSchema = z.number().min(0).max(100);

export const healthThresholdsSchema = z
  .object({
    attentionPercent: z.number().min(1).lt(100),
    criticalPercent: z.number().gt(1).max(100),
  })
  .strict()
  .refine(
    ({ attentionPercent, criticalPercent }) =>
      attentionPercent < criticalPercent,
    { message: "Attention threshold must be lower than critical threshold." },
  );

export const capacitySchema = z
  .object({
    totalBytes: bytesSchema,
    usedBytes: bytesSchema,
    availableBytes: bytesSchema,
    usagePercent: percentSchema,
  })
  .strict();

export const MAX_EXTRA_DISK_PATHS = 8;
export const MAX_DISK_PATH_LENGTH = 1_024;

const diskPathSchema = z.string().min(1).max(MAX_DISK_PATH_LENGTH);

// An extra volume stays in the snapshot when it cannot be measured, so the UI
// can show the configured path as unavailable instead of dropping it.
export const extraDiskSchema = z
  .object({
    path: diskPathSchema,
    capacity: capacitySchema.nullable(),
  })
  .strict();

export const ipAddressSchema = z.union([z.ipv4(), z.ipv6()]);

export const networkSnapshotSchema = z
  .object({
    primaryIpAddress: ipAddressSchema.nullable(),
    receiveBytesPerSecond: byteRateSchema,
    sendBytesPerSecond: byteRateSchema,
  })
  .strict()
  .superRefine((network, context) => {
    if (
      (network.receiveBytesPerSecond === null) !==
      (network.sendBytesPerSecond === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Network receive and send rates must be available together.",
      });
    }
  });

export const machineSnapshotSchema = z
  .object({
    sampledAtMs: timestampSchema,
    durationMs: z.number().int().nonnegative(),
    system: z
      .object({
        hostname: z.string().min(1),
        osName: z.string().min(1),
        platform: z.string().min(1),
        arch: z.string().min(1),
        kernelRelease: z.string().min(1),
        kernelVersion: z.string().min(1),
        uptimeSeconds: z.number().nonnegative(),
        bootedAtMs: timestampSchema,
      })
      .strict(),
    network: networkSnapshotSchema,
    cpu: z
      .object({
        model: z.string(),
        logicalCores: z.number().int().positive(),
        usagePercent: percentSchema,
        loadAverage: z
          .tuple([
            z.number().nonnegative(),
            z.number().nonnegative(),
            z.number().nonnegative(),
          ])
          .nullable(),
      })
      .strict(),
    memory: capacitySchema,
    swap: capacitySchema.nullable(),
    disk: capacitySchema
      .extend({
        path: z.string().min(1),
      })
      .strict()
      .nullable(),
    // Optional so snapshots from hosts without configured volumes stay valid.
    extraDisks: z.array(extraDiskSchema).max(MAX_EXTRA_DISK_PATHS).optional(),
    issues: z.array(
      z
        .object({
          metric: z.enum([
            "system",
            "network",
            "cpu",
            "memory",
            "swap",
            "disk",
          ]),
          message: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export type MachineSnapshot = z.infer<typeof machineSnapshotSchema>;
export type ExtraDisk = z.infer<typeof extraDiskSchema>;

export const processSortBySchema = z.enum(["cpu", "memory", "name"]);
export const processTerminationModeSchema = z.enum(["graceful", "force"]);
export const processOwnerCategorySchema = z.enum([
  "same-user",
  "different-user",
  "unknown",
]);
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

const opaqueProcessIdentitySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/u, "Invalid opaque process identity.");

export const processRowSchema = z
  .object({
    pid: z.number().int().nonnegative(),
    name: z.string().min(1).max(120),
    identity: opaqueProcessIdentitySchema.nullable(),
    cpuPercent: percentSchema,
    rssBytes: bytesSchema,
    memoryPercent: percentSchema,
    startedAtMs: timestampSchema.nullable(),
    ownerCategory: processOwnerCategorySchema,
    allowedTerminationModes: z
      .array(processTerminationModeSchema)
      .max(2)
      .refine((modes) => new Set(modes).size === modes.length, {
        message: "Termination modes must be unique.",
      }),
    blockedReason: processBlockedReasonSchema.nullable(),
  })
  .strict()
  .superRefine((row, context) => {
    if (
      (row.blockedReason === null) !==
      (row.allowedTerminationModes.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A process must have either allowed termination modes or a blocked reason.",
      });
    }
    // A missing identity always blocks termination, but a stronger safety
    // reason (elevation, system PID, or unverified ancestry) may take priority.
    if (row.identity === null && row.blockedReason === null) {
      context.addIssue({
        code: "custom",
        message: "A process without a lifetime identity cannot be actionable.",
      });
    }
  });

export type ProcessSortBy = z.infer<typeof processSortBySchema>;
export type ProcessTerminationMode = z.infer<
  typeof processTerminationModeSchema
>;
export type ProcessOwnerCategory = z.infer<typeof processOwnerCategorySchema>;
export type ProcessBlockedReason = z.infer<typeof processBlockedReasonSchema>;
export type ProcessRow = z.infer<typeof processRowSchema>;

const processPlatformSchema = z.enum(["linux", "darwin", "win32"]);

const hostProcessListSchema = z
  .object({
    sampledAtMs: timestampSchema,
    platform: processPlatformSchema,
    elevated: z.boolean(),
    totalCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    processes: z.array(processRowSchema).max(200),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.totalCount < result.processes.length) {
      context.addIssue({
        code: "custom",
        message: "The process total cannot be smaller than the returned page.",
      });
    }
    if (result.truncated !== (result.totalCount > result.processes.length)) {
      context.addIssue({
        code: "custom",
        message: "The process truncated flag must match the returned page.",
      });
    }
  });

const processTerminationCandidateSchema = z
  .object({
    pid: z.number().int().nonnegative(),
    name: z.string().min(1).max(120),
    identity: opaqueProcessIdentitySchema,
    mode: processTerminationModeSchema,
    cpuPercent: percentSchema,
    rssBytes: bytesSchema,
    memoryPercent: percentSchema,
    startedAtMs: timestampSchema.nullable(),
  })
  .strict();

const terminationBlockedSchema = z
  .object({
    outcome: z.literal("blocked"),
    reason: processBlockedReasonSchema,
    message: z.string().min(1).max(240),
  })
  .strict();

const terminationUnavailableSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("not-found"),
      message: z.string().min(1).max(240),
    })
    .strict(),
  z
    .object({
      outcome: z.literal("identity-changed"),
      message: z.string().min(1).max(240),
    })
    .strict(),
]);

const hostPrepareTerminationResultSchema = z.union([
  z
    .object({
      outcome: z.literal("ready"),
      process: processTerminationCandidateSchema,
    })
    .strict(),
  terminationBlockedSchema,
  terminationUnavailableSchema,
]);

const hostExecuteTerminationResultSchema = z.union([
  z
    .object({
      outcome: z.literal("signal-sent"),
      message: z.string().min(1).max(240),
    })
    .strict(),
  z
    .object({
      outcome: z.literal("still-running"),
      message: z.string().min(1).max(240),
    })
    .strict(),
  terminationBlockedSchema,
  terminationUnavailableSchema,
  z
    .object({
      outcome: z.literal("signal-failed"),
      message: z.string().min(1).max(240),
    })
    .strict(),
]);

export const hostContract = defineRpcContract({
  snapshot: {
    input: z
      .object({
        cpuSampleMs: z.number().int().min(100).max(1_000),
        extraDiskPaths: z
          .array(diskPathSchema)
          .max(MAX_EXTRA_DISK_PATHS)
          .optional(),
      })
      .strict(),
    output: machineSnapshotSchema,
  },
  listProcesses: {
    input: z
      .object({
        sortBy: processSortBySchema,
        limit: z.number().int().min(1).max(200),
      })
      .strict(),
    output: hostProcessListSchema,
  },
  inspectProcessTermination: {
    input: z
      .object({
        pid: z.number().int().nonnegative(),
        identity: opaqueProcessIdentitySchema,
        mode: processTerminationModeSchema,
      })
      .strict(),
    output: hostPrepareTerminationResultSchema,
  },
  terminateProcess: {
    input: z
      .object({
        pid: z.number().int().nonnegative(),
        identity: opaqueProcessIdentitySchema,
        mode: processTerminationModeSchema,
      })
      .strict(),
    output: hostExecuteTerminationResultSchema,
  },
});

export const hostSummarySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    status: z.enum(["connected", "disconnected"]),
    lastSeenAt: timestampSchema.nullable(),
  })
  .strict();

export const healthSchema = z.enum([
  "healthy",
  "attention",
  "critical",
  "offline",
  "unavailable",
]);

export const machineRowSchema = z
  .object({
    host: hostSummarySchema,
    snapshot: machineSnapshotSchema.nullable(),
    sampleState: z.enum(["fresh", "stale", "sampling", "error", "offline"]),
    health: healthSchema,
    error: z.string().nullable(),
    alert: z
      .object({
        metric: z.enum(["cpu", "memory", "disk"]),
        message: z.string().min(1),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const dashboardSchema = z
  .object({
    generatedAtMs: timestampSchema,
    refreshIntervalMs: z.number().int().positive(),
    thresholds: healthThresholdsSchema,
    machines: z.array(machineRowSchema),
  })
  .strict();

export type Dashboard = z.infer<typeof dashboardSchema>;
export type MachineRow = z.infer<typeof machineRowSchema>;

export const preferencesSchema = z
  .object({
    sidebarThresholdColors: z.boolean(),
    thresholds: healthThresholdsSchema,
  })
  .strict();

export type HostMonitorPreferences = z.infer<typeof preferencesSchema>;

const processListHostSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    status: z.literal("connected"),
    platform: processPlatformSchema,
  })
  .strict();

export const processListResultSchema = z.union([
  z
    .object({
      outcome: z.literal("ok"),
      host: processListHostSchema,
      sampledAtMs: timestampSchema,
      elevated: z.boolean(),
      totalCount: z.number().int().nonnegative(),
      truncated: z.boolean(),
      processes: z.array(processRowSchema).max(200),
    })
    .strict(),
  z
    .object({
      outcome: z.enum([
        "not-found",
        "offline",
        "unavailable",
        "unsupported",
      ]),
      message: z.string().min(1).max(240),
    })
    .strict(),
]);

const preparedTerminationHostSchema = z
  .object({ id: z.string().min(1), name: z.string().min(1) })
  .strict();

export const preparedTerminationSchema = z.union([
  z
    .object({
      outcome: z.literal("ready"),
      confirmationToken: z
        .string()
        .regex(/^[A-Za-z0-9_-]{43}$/u, "Invalid confirmation token."),
      expiresAtMs: timestampSchema,
      host: preparedTerminationHostSchema,
      process: processTerminationCandidateSchema,
    })
    .strict(),
  terminationBlockedSchema,
  terminationUnavailableSchema,
  z
    .object({
      outcome: z.literal("unavailable"),
      message: z.string().min(1).max(240),
    })
    .strict(),
]);

const executedProcessSchema = processTerminationCandidateSchema.pick({
  pid: true,
  name: true,
  mode: true,
});

export const executeTerminationResultSchema = z.union([
  z
    .object({
      outcome: z.literal("signal-sent"),
      host: preparedTerminationHostSchema,
      process: executedProcessSchema,
      message: z.string().min(1).max(240),
    })
    .strict(),
  z
    .object({
      outcome: z.literal("still-running"),
      host: preparedTerminationHostSchema,
      process: executedProcessSchema,
      message: z.string().min(1).max(240),
    })
    .strict(),
  terminationBlockedSchema,
  terminationUnavailableSchema,
  z
    .object({
      outcome: z.enum([
        "signal-failed",
        "confirmation-expired",
        "confirmation-invalid",
        "outcome-unknown",
      ]),
      message: z.string().min(1).max(240),
    })
    .strict(),
]);

export type ProcessListResult = z.infer<typeof processListResultSchema>;
export type PreparedTermination = z.infer<typeof preparedTerminationSchema>;
export type ExecuteTerminationResult = z.infer<
  typeof executeTerminationResultSchema
>;

export const rpcContract = defineRpcContract({
  claimNativeOpen: {
    input: z.null(),
    output: z
      .object({
        open: z.boolean(),
        hostId: z.string().min(1).max(128).nullable(),
      })
      .strict(),
  },
  getPreferences: {
    input: z.null(),
    output: preferencesSchema,
  },
  dashboard: {
    input: z.null(),
    output: dashboardSchema,
  },
  refresh: {
    input: z
      .object({
        hostId: z.string().min(1).nullable(),
      })
      .strict(),
    output: dashboardSchema,
  },
  listProcesses: {
    input: z
      .object({
        hostId: z.string().min(1),
        sortBy: processSortBySchema,
        limit: z.number().int().min(1).max(200),
      })
      .strict(),
    output: processListResultSchema,
  },
  prepareProcessTermination: {
    input: z
      .object({
        hostId: z.string().min(1),
        pid: z.number().int().nonnegative(),
        identity: opaqueProcessIdentitySchema,
        mode: processTerminationModeSchema,
      })
      .strict(),
    output: preparedTerminationSchema,
  },
  executeProcessTermination: {
    input: z
      .object({
        confirmationToken: z
          .string()
          .regex(/^[A-Za-z0-9_-]{43}$/u, "Invalid confirmation token."),
      })
      .strict(),
    output: executeTerminationResultSchema,
  },
});
