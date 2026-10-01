import type {
  Dashboard,
  MachineRow,
  MachineSnapshot,
} from "../contract.ts";
import {
  DEFAULT_HEALTH_THRESHOLDS,
  type HealthThresholds,
} from "./thresholds.ts";

export const ATTENTION_PERCENT = DEFAULT_HEALTH_THRESHOLDS.attentionPercent;
export const CRITICAL_PERCENT = DEFAULT_HEALTH_THRESHOLDS.criticalPercent;
export const CPU_SUSTAINED_SAMPLES = 3;
export const STALE_AFTER_INTERVALS = 2;

export type MachineHost = MachineRow["host"];
export type MachineAlert = MachineRow["alert"];
export type ResourceHealth = Exclude<
  MachineRow["health"],
  "offline" | "unavailable"
>;

export interface ResourceHealthResult {
  health: ResourceHealth;
  alert: MachineAlert;
}

/**
 * Server-owned state for one enrolled host. `snapshot` is deliberately the
 * last successful sample: a failed refresh changes `error`, not the useful
 * reading the UI can continue to show as stale context.
 */
export interface LastGoodMachineRecord {
  snapshot: MachineSnapshot | null;
  error: string | null;
  sampling: boolean;
  cpuHighStreak: number;
}

export type MachineSampleUpdate =
  | { kind: "sampling" }
  | {
      kind: "success";
      snapshot: MachineSnapshot;
      cpuHighStreak: number;
    }
  | { kind: "error"; error: string };

export interface SampleStateInput {
  hostStatus: MachineHost["status"];
  snapshot: MachineSnapshot | null;
  error: string | null;
  sampling: boolean;
  nowMs: number;
  refreshIntervalMs: number;
}

interface AlertCandidate {
  health: Exclude<ResourceHealth, "healthy">;
  alert: NonNullable<MachineAlert>;
}

const healthRank: Readonly<Record<MachineRow["health"], number>> = {
  critical: 0,
  attention: 1,
  healthy: 2,
  unavailable: 3,
  offline: 4,
};

const resourceRank: Readonly<
  Record<NonNullable<MachineAlert>["metric"], number>
> = {
  memory: 0,
  disk: 1,
  cpu: 2,
};

function normalizedStreak(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"] as const;
  let value = bytes / 1_024;
  let unit: (typeof units)[number] = units[0];
  for (let index = 1; index < units.length && value >= 1_024; index += 1) {
    value /= 1_024;
    unit = units[index];
  }
  const digits = value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${unit}`;
}

function capacityCandidate(
  metric: "memory" | "disk",
  usagePercent: number,
  availableBytes: number,
  thresholds: HealthThresholds,
  volumePath: string | null = null,
): AlertCandidate | null {
  if (usagePercent < thresholds.attentionPercent) return null;
  const health =
    usagePercent >= thresholds.criticalPercent ? "critical" : "attention";
  if (metric === "memory") {
    return {
      health,
      alert: {
        metric,
        message:
          health === "critical"
            ? `Memory pressure is critical — ${formatBytes(availableBytes)} available.`
            : `Memory pressure is high — ${formatBytes(availableBytes)} available.`,
      },
    };
  }
  const volume = volumePath === null ? "System disk" : `Volume ${volumePath}`;
  return {
    health,
    alert: {
      metric,
      message:
        health === "critical"
          ? `${volume} is nearly full — ${formatBytes(availableBytes)} free.`
          : `${volume} is filling up — ${formatBytes(availableBytes)} free.`,
    },
  };
}

function cpuCandidate(
  usagePercent: number,
  cpuHighStreak: number,
  thresholds: HealthThresholds,
): AlertCandidate | null {
  const streak = normalizedStreak(cpuHighStreak);
  if (
    usagePercent < thresholds.attentionPercent ||
    streak < CPU_SUSTAINED_SAMPLES
  ) {
    return null;
  }
  const health =
    usagePercent >= thresholds.criticalPercent ? "critical" : "attention";
  return {
    health,
    alert: {
      metric: "cpu",
      message: `CPU has stayed high — ${formatPercent(usagePercent)} for ${streak} samples.`,
    },
  };
}

function compareCandidates(left: AlertCandidate, right: AlertCandidate): number {
  const severity = healthRank[left.health] - healthRank[right.health];
  if (severity !== 0) return severity;
  return resourceRank[left.alert.metric] - resourceRank[right.alert.metric];
}

/**
 * Derive resource health from one successful snapshot. Memory, the system
 * disk, and every measured extra volume react immediately at the configured
 * percentages; CPU reacts only after the caller-provided streak is sustained.
 * Swap is intentionally absent: swap
 * occupancy alone is not evidence of current memory pressure.
 */
export function deriveResourceHealth(
  snapshot: MachineSnapshot,
  cpuHighStreak: number,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
): ResourceHealthResult {
  const candidates = [
    capacityCandidate(
      "memory",
      snapshot.memory.usagePercent,
      snapshot.memory.availableBytes,
      thresholds,
    ),
    snapshot.disk === null
      ? null
      : capacityCandidate(
          "disk",
          snapshot.disk.usagePercent,
          snapshot.disk.availableBytes,
          thresholds,
        ),
    ...(snapshot.extraDisks ?? []).map((extraDisk) =>
      extraDisk.capacity === null
        ? null
        : capacityCandidate(
            "disk",
            extraDisk.capacity.usagePercent,
            extraDisk.capacity.availableBytes,
            thresholds,
            extraDisk.path,
          ),
    ),
    cpuCandidate(snapshot.cpu.usagePercent, cpuHighStreak, thresholds),
  ].filter((candidate): candidate is AlertCandidate => candidate !== null);

  candidates.sort(compareCandidates);
  const selected = candidates[0];
  return selected === undefined
    ? { health: "healthy", alert: null }
    : { health: selected.health, alert: selected.alert };
}

function assertClockInput(nowMs: number, refreshIntervalMs: number): void {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new RangeError("nowMs must be a non-negative finite number");
  }
  if (
    !Number.isInteger(refreshIntervalMs) ||
    refreshIntervalMs <= 0
  ) {
    throw new RangeError("refreshIntervalMs must be a positive integer");
  }
}

export function deriveSampleState({
  hostStatus,
  snapshot,
  error,
  sampling,
  nowMs,
  refreshIntervalMs,
}: SampleStateInput): MachineRow["sampleState"] {
  assertClockInput(nowMs, refreshIntervalMs);
  if (hostStatus === "disconnected") return "offline";
  if (sampling) return "sampling";
  if (error !== null) return "error";
  if (snapshot === null) return "sampling";
  return nowMs - snapshot.sampledAtMs >
    refreshIntervalMs * STALE_AFTER_INTERVALS
    ? "stale"
    : "fresh";
}

function emptyRecord(host: MachineHost): LastGoodMachineRecord {
  return {
    snapshot: null,
    error: null,
    sampling: host.status === "connected",
    cpuHighStreak: 0,
  };
}

/**
 * Merge one poll's updates into the last-good state and drop records for hosts
 * no longer enrolled. Error and sampling updates preserve the prior snapshot.
 */
export function mergeLastGoodRecords(
  hosts: readonly MachineHost[],
  previous: ReadonlyMap<string, LastGoodMachineRecord>,
  updates: ReadonlyMap<string, MachineSampleUpdate>,
): Map<string, LastGoodMachineRecord> {
  const merged = new Map<string, LastGoodMachineRecord>();
  const seen = new Set<string>();
  for (const host of hosts) {
    if (seen.has(host.id)) {
      throw new Error(`duplicate machine host id "${host.id}"`);
    }
    seen.add(host.id);
    const prior = previous.get(host.id) ?? emptyRecord(host);
    const update = updates.get(host.id);
    let next: LastGoodMachineRecord;
    if (update?.kind === "success") {
      next = {
        snapshot: update.snapshot,
        error: null,
        sampling: false,
        cpuHighStreak: normalizedStreak(update.cpuHighStreak),
      };
    } else if (update?.kind === "error") {
      next = {
        ...prior,
        error: update.error,
        sampling: false,
      };
    } else if (update?.kind === "sampling") {
      next = {
        ...prior,
        error: null,
        sampling: true,
      };
    } else {
      next = { ...prior };
    }
    if (host.status === "disconnected") next.sampling = false;
    merged.set(host.id, next);
  }
  return merged;
}

function compareText(left: string, right: string): number {
  const foldedLeft = left.toLowerCase();
  const foldedRight = right.toLowerCase();
  if (foldedLeft < foldedRight) return -1;
  if (foldedLeft > foldedRight) return 1;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function compareMachineRows(left: MachineRow, right: MachineRow): number {
  const health = healthRank[left.health] - healthRank[right.health];
  if (health !== 0) return health;
  const name = compareText(left.host.name, right.host.name);
  return name !== 0 ? name : compareText(left.host.id, right.host.id);
}

function machineRow(
  host: MachineHost,
  record: LastGoodMachineRecord,
  nowMs: number,
  refreshIntervalMs: number,
  thresholds: HealthThresholds,
): MachineRow {
  const sampleState = deriveSampleState({
    hostStatus: host.status,
    snapshot: record.snapshot,
    error: record.error,
    sampling: record.sampling,
    nowMs,
    refreshIntervalMs,
  });
  if (sampleState === "offline") {
    return {
      host,
      snapshot: record.snapshot,
      sampleState,
      health: "offline",
      error: null,
      alert: null,
    };
  }
  if (sampleState === "error" || record.snapshot === null) {
    return {
      host,
      snapshot: record.snapshot,
      sampleState,
      health: "unavailable",
      error: sampleState === "error" ? record.error : null,
      alert: null,
    };
  }
  const resource = deriveResourceHealth(
    record.snapshot,
    record.cpuHighStreak,
    thresholds,
  );
  return {
    host,
    snapshot: record.snapshot,
    sampleState,
    health: resource.health,
    error: null,
    alert: resource.alert,
  };
}

/** Build the JSON-safe, deterministically ordered dashboard sent to the app. */
export function buildDashboard(
  hosts: readonly MachineHost[],
  records: ReadonlyMap<string, LastGoodMachineRecord>,
  nowMs: number,
  refreshIntervalMs: number,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
): Dashboard {
  assertClockInput(nowMs, refreshIntervalMs);
  const machines = hosts.map((host) =>
    machineRow(
      host,
      records.get(host.id) ?? emptyRecord(host),
      nowMs,
      refreshIntervalMs,
      thresholds,
    ),
  );
  machines.sort(compareMachineRows);
  return {
    generatedAtMs: Math.trunc(nowMs),
    refreshIntervalMs,
    thresholds: { ...thresholds },
    machines,
  };
}
