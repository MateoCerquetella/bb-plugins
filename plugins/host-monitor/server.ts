import os from "node:os";

import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { bucketSizeFor, collectDirectorySamples, collectMemoryDiagnostics, collectSample, DIRECTORY_SAMPLE_INTERVAL_MS, MAX_MEMORY_DIAGNOSTICS_SNAPSHOTS, MEMORY_DIAGNOSTICS_INTERVAL_MS, MEMORY_DIAGNOSTICS_RETENTION_MS, MEMORY_PRESSURE_CAPTURE_MS, MEMORY_PRESSURE_INTERVAL_MS, memoryPressureActive, MONITORED_DIRECTORIES, RETENTION_MS, SAMPLE_INTERVAL_MS, type CpuCounters, type MemoryDiagnosticState } from "./monitor.ts";
import { rpcContract } from "./rpc-contract.ts";
import { HostMonitorStore, hostMonitorMigrations } from "./store.ts";

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const done = () => { signal.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(done, ms);
    const abort = () => { clearTimeout(timer); done(); };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export default function hostMonitorPlugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    cpuWarningPercent: {
      type: "select" as const,
      label: "CPU warning threshold",
      description: "Warn when the rolling five-minute CPU average reaches this percentage. Short agent bursts do not alert.",
      options: ["70", "80", "90", "95"],
      default: "90",
    },
    ramWarningPercent: {
      type: "select" as const,
      label: "RAM warning threshold",
      description: "Warn when memory in use reaches this percentage; Linux cache remains available memory.",
      options: ["70", "80", "90", "95"],
      default: "90",
    },
    diskWarningPercent: {
      type: "select" as const,
      label: "Root disk warning threshold",
      description: "Warn when the root filesystem reaches this percentage. Cache-directory size trends remain diagnostics only.",
      options: ["70", "80", "90", "95"],
      default: "90",
    },
    showProcessDetails: {
      type: "boolean" as const,
      label: "Show process attribution",
      description: "Show local process names, PIDs, and inferred workloads in Memory pressure. Keep this off when panel readers should not see deployment-host workload details.",
      default: false,
    },
  });
  const db = bb.storage.database();
  bb.storage.migrate(db, hostMonitorMigrations);
  const store = new HostMonitorStore(db);
  let cpu: CpuCounters | null = null;
  let memoryState: MemoryDiagnosticState | null = null;
  let lastError: string | null = null;
  let processDetailsEnabled = false;
  void settings.get().then((configured) => { processDetailsEnabled = configured.showProcessDetails; });

  const percentage = (used: number | null, total: number | null) => used == null || total == null || total <= 0 ? null : used / total * 100;
  const configuredThresholds = async () => {
    const configured = await settings.get();
    return {
      cpu: Number(configured.cpuWarningPercent),
      ram: Number(configured.ramWarningPercent),
      disk: Number(configured.diskWarningPercent),
      showProcessDetails: configured.showProcessDetails,
    };
  };
  const withRollingCpu = <T extends { collectedAt: number; cpuPercent: number | null }>(samples: T[]) => {
    const window: T[] = [];
    let total = 0;
    return samples.map((sample) => {
      window.push(sample);
      if (sample.cpuPercent != null) total += sample.cpuPercent;
      while (window[0] != null && window[0].collectedAt < sample.collectedAt - 5 * 60_000) {
        const removed = window.shift()!;
        if (removed.cpuPercent != null) total -= removed.cpuPercent;
      }
      const count = window.reduce((sum, entry) => sum + (entry.cpuPercent == null ? 0 : 1), 0);
      return { ...sample, cpu5mPercent: count === 0 ? null : total / count };
    });
  };

  const snapshot = async (rangeHours: number) => {
    const now = Date.now();
    const since = now - rangeHours * 60 * 60_000;
    const samples = withRollingCpu(store.history(since, now));
    const cpuAverage = store.averageCpuSince(now - 5 * 60_000);
    const { showProcessDetails, ...thresholds } = await configuredThresholds();
    const latest = store.latest();
    const diskSamples = samples.filter((sample): sample is typeof sample & { diskUsedBytes: number } => sample.diskUsedBytes != null);
    const contiguousDiskSamples: Array<typeof diskSamples[number]> = [];
    const maxGap = bucketSizeFor(now - since) * 3;
    for (let index = diskSamples.length - 1; index >= 0; index -= 1) {
      const sample = diskSamples[index]!;
      const newest = contiguousDiskSamples[0];
      if (newest != null && newest.collectedAt - sample.collectedAt > maxGap) break;
      contiguousDiskSamples.unshift(sample);
    }
    const first = contiguousDiskSamples[0];
    const last = contiguousDiskSamples.at(-1);
    const diskGrowthBytesPerDay = first == null || last == null || last.collectedAt <= first.collectedAt
      ? null : (last.diskUsedBytes! - first.diskUsedBytes!) / (last.collectedAt - first.collectedAt) * 86_400_000;
    const labels = new Map<string, string>(MONITORED_DIRECTORIES.map((entry) => [entry.id, entry.label]));
    const memoryDiagnostics = store.latestMemoryDiagnostics();
    return {
      hostName: os.hostname(),
      platform: `${os.platform()} ${os.release()} (${os.arch()})`,
      uptimeSeconds: Math.round(os.uptime()),
      latest: latest == null ? null : { ...latest, cpu5mPercent: cpuAverage },
      samples,
      thresholds,
      diskGrowthBytesPerDay,
      directories: store.directorySummary(since, now).map((entry) => ({
        id: entry.location,
        label: labels.get(entry.location) ?? entry.location,
        bytes: entry.bytes,
        growthBytesPerDay: entry.firstCollectedAt >= entry.collectedAt ? null : (entry.bytes - entry.firstBytes) / (entry.collectedAt - entry.firstCollectedAt) * 86_400_000,
      })),
      memoryDiagnostics: memoryDiagnostics == null || showProcessDetails ? memoryDiagnostics : { ...memoryDiagnostics, processes: [] },
      processDetailsEnabled: showProcessDetails,
      lastError,
    };
  };

  bb.rpc.register(rpcContract, { snapshot: ({ rangeHours }) => snapshot(rangeHours) });
  settings.onChange(async () => {
    processDetailsEnabled = (await settings.get()).showProcessDetails;
    bb.realtime.publish("host-monitor-sample", { settingsChanged: true });
  });

  bb.background.service("host-monitor-core", {
    start: async (signal) => {
      while (!signal.aborted) {
        const startedAt = Date.now();
        try {
          const result = await collectSample(cpu, startedAt);
          cpu = result.cpu;
          store.insert(result.sample);
          store.prune(startedAt - RETENTION_MS);
          lastError = null;
          bb.realtime.publish("host-monitor-sample", { collectedAt: startedAt });
        } catch (cause) {
          lastError = cause instanceof Error ? cause.message : String(cause);
          bb.log.warn(`Could not collect local machine health: ${lastError}`);
          bb.realtime.publish("host-monitor-sample", { collectedAt: startedAt, error: true });
        }
        await wait(Math.max(0, SAMPLE_INTERVAL_MS - (Date.now() - startedAt)), signal);
      }
    },
  });

  bb.background.service("host-monitor-directories", {
    start: async (signal) => {
      while (!signal.aborted) {
        const startedAt = Date.now();
        try {
          store.insertDirectories(await collectDirectorySamples(startedAt, signal));
          store.prune(startedAt - RETENTION_MS);
          bb.realtime.publish("host-monitor-directories", { collectedAt: startedAt });
        } catch (cause) {
          if (signal.aborted) break;
          bb.log.warn(`Could not collect local directory usage: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
        await wait(Math.max(0, DIRECTORY_SAMPLE_INTERVAL_MS - (Date.now() - startedAt)), signal);
      }
    },
  });

  bb.background.service("host-monitor-memory-pressure", {
    start: async (signal) => {
      let captureUntil = 0;
      let lastProcessRankingAt = 0;
      let nextPruneAt = 0;
      while (!signal.aborted) {
        const startedAt = Date.now();
        try {
          const includeProcesses = startedAt - lastProcessRankingAt >= MEMORY_DIAGNOSTICS_INTERVAL_MS;
          const result = await collectMemoryDiagnostics(memoryState, startedAt, signal, { includeProcesses, includeProcessDetails: processDetailsEnabled });
          memoryState = result.state;
          if (includeProcesses) lastProcessRankingAt = startedAt;
          store.insertMemoryDiagnostics(result.diagnostics);
          if (startedAt >= nextPruneAt) {
            store.pruneMemoryDiagnostics(startedAt - MEMORY_DIAGNOSTICS_RETENTION_MS, MAX_MEMORY_DIAGNOSTICS_SNAPSHOTS);
            nextPruneAt = startedAt + 5 * 60_000;
          }
          if (memoryPressureActive(result.diagnostics)) captureUntil = Math.max(captureUntil, startedAt + MEMORY_PRESSURE_CAPTURE_MS);
          bb.realtime.publish("host-monitor-memory", { collectedAt: startedAt });
        } catch (cause) {
          if (signal.aborted) break;
          bb.log.warn(`Could not collect memory-pressure diagnostics: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
        const interval = Date.now() < captureUntil ? MEMORY_PRESSURE_INTERVAL_MS : MEMORY_DIAGNOSTICS_INTERVAL_MS;
        await wait(Math.max(1_000, interval - (Date.now() - startedAt)), signal);
      }
    },
  });
}
