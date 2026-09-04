import { setTimeout as delay } from "node:timers/promises";

import type { BbPluginApi } from "@get-bb/plugin-sdk";

import {
  hostContract,
  rpcContract,
  type Fleet,
  type MachineRow,
  type MachineSnapshot,
  type ProcessListResult,
  type ProcessSortBy,
  type ProcessTerminationMode,
} from "./contract.ts";
import { ProcessConfirmationStore } from "./lib/process-confirmations.ts";
import {
  HostProcessOperationGate,
  ProcessOperationBusyError,
} from "./lib/process-operation-gate.ts";
import {
  HostMonitorStore,
  hostMonitorMigrations,
  RETENTION_MS,
  SAMPLE_INTERVAL_MS,
} from "./store.ts";

const CPU_SAMPLE_MS = 300;
const HOST_CALL_TIMEOUT_MS = 5_000;
export const PROCESS_HOST_CALL_TIMEOUT_MS = 20_000;
export const PROCESS_TERMINATION_HOST_CALL_TIMEOUT_MS = 30_000;
const REALTIME_CHANNEL = "host-monitor-machines-changed";
const STALE_AFTER_INTERVALS = 2;

type MachineHost = MachineRow["host"];
type MachineRecord = {
  snapshot: MachineSnapshot | null;
  receivedAtMs: number | null;
  error: string | null;
  sampling: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function publicSampleError(error: unknown): string {
  return error instanceof Error &&
    (error.name === "TimeoutError" || /timed?\s*out/iu.test(error.message))
    ? "Sampling timed out. The machine may be busy or reconnecting."
    : "Could not collect metrics from this machine.";
}

function projectHost(host: {
  id: string;
  name: string;
  status: "connected" | "disconnected";
  lastSeenAt: number | null;
}): MachineHost {
  return {
    id: host.id,
    name: host.name,
    status: host.status,
    lastSeenAt: host.lastSeenAt,
  };
}

function emptyRecord(host: MachineHost): MachineRecord {
  return { snapshot: null, receivedAtMs: null, error: null, sampling: host.status === "connected" };
}

function compareHosts(left: MachineHost, right: MachineHost): number {
  const status = Number(right.status === "connected") - Number(left.status === "connected");
  if (status !== 0) return status;
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
    left.id.localeCompare(right.id);
}

export default async function hostMonitorPlugin(bb: BbPluginApi): Promise<void> {
  const settings = bb.settings.define({
    cpuWarningPercent: {
      type: "select" as const,
      label: "CPU guide",
      description: "Highlight CPU panels at this percentage. This is an in-page visual guide, not a notification.",
      options: ["70", "80", "90", "95"],
      default: "90",
    },
    ramWarningPercent: {
      type: "select" as const,
      label: "RAM guide",
      description: "Highlight RAM panels at this percentage. This is an in-page visual guide, not a notification.",
      options: ["70", "80", "90", "95"],
      default: "90",
    },
    diskWarningPercent: {
      type: "select" as const,
      label: "Disk guide",
      description: "Highlight root-disk panels at this percentage. This is an in-page visual guide, not a notification.",
      options: ["70", "80", "90", "95"],
      default: "90",
    },
  });

  const db = bb.storage.database();
  bb.storage.migrate(db, hostMonitorMigrations);
  const store = new HostMonitorStore(db);
  const hostClient = bb.hosts.experimental_client({ contract: hostContract });
  const processConfirmations = new ProcessConfirmationStore();
  const processOperations = new HostProcessOperationGate();
  const processLifecycleController = new AbortController();
  const processListInFlight = new Map<string, Promise<ProcessListResult>>();
  bb.onDispose(() => {
    processLifecycleController.abort(new DOMException("Host Monitor is shutting down.", "AbortError"));
    processOperations.close();
    processConfirmations.clear();
  });

  let thresholds = await readThresholds();
  let hosts: MachineHost[] = [];
  let records = new Map<string, MachineRecord>();
  let hostListInFlight: Promise<MachineHost[]> | null = null;
  let fullRefreshInFlight: Promise<void> | null = null;
  const sampleInFlight = new Map<string, Promise<void>>();
  let refreshRequested = true;
  let wakeWaiter: (() => void) | null = null;

  async function readThresholds() {
    const configured = await settings.get();
    return {
      cpu: Number(configured.cpuWarningPercent),
      ram: Number(configured.ramWarningPercent),
      disk: Number(configured.diskWarningPercent),
    };
  }

  function publish(hostIds: readonly string[]): void {
    bb.realtime.publish(REALTIME_CHANNEL, {
      hostIds: [...hostIds],
      generatedAtMs: Date.now(),
    });
  }

  function requestRefresh(): void {
    refreshRequested = true;
    wakeWaiter?.();
  }

  settings.onChange(async () => {
    thresholds = await readThresholds();
    publish(hosts.map((host) => host.id));
  });

  function fleet(): Fleet {
    const now = Date.now();
    const machines = [...hosts].sort(compareHosts).map((host): MachineRow => {
      const record = records.get(host.id) ?? emptyRecord(host);
      const sampleState: MachineRow["sampleState"] =
        host.status === "disconnected"
          ? "offline"
          : record.sampling
            ? "sampling"
            : record.error !== null
              ? "error"
              : record.snapshot === null
                ? "sampling"
                : record.receivedAtMs === null || now - record.receivedAtMs > SAMPLE_INTERVAL_MS * STALE_AFTER_INTERVALS
                  ? "stale"
                  : "fresh";
      return {
        host,
        sampleState,
        snapshot: record.snapshot,
        receivedAtMs: record.receivedAtMs,
        error: record.error,
      };
    });
    return {
      generatedAtMs: now,
      refreshIntervalMs: SAMPLE_INTERVAL_MS,
      refreshing: fullRefreshInFlight !== null || sampleInFlight.size > 0,
      connected: machines.filter((machine) => machine.host.status === "connected").length,
      total: machines.length,
      thresholds: { ...thresholds },
      machines,
    };
  }

  async function listHosts(signal?: AbortSignal): Promise<MachineHost[]> {
    if (hostListInFlight !== null) return hostListInFlight;
    const pending = bb.sdk.hosts
      .list(signal === undefined ? undefined : { signal })
      .then((available) => available.map(projectHost));
    hostListInFlight = pending;
    try {
      hosts = await pending;
      const enrolled = new Set(hosts.map((host) => host.id));
      records = new Map([...records].filter(([hostId]) => enrolled.has(hostId)));
      for (const host of hosts) {
        if (!records.has(host.id)) records.set(host.id, emptyRecord(host));
      }
      return hosts;
    } finally {
      if (hostListInFlight === pending) hostListInFlight = null;
    }
  }

  async function sampleHost(host: MachineHost, signal?: AbortSignal): Promise<void> {
    if (host.status !== "connected") return;
    const existing = sampleInFlight.get(host.id);
    if (existing !== undefined) return existing;

    const previous = records.get(host.id) ?? emptyRecord(host);
    records.set(host.id, { ...previous, sampling: true, error: null });

    const timeoutSignal = AbortSignal.timeout(HOST_CALL_TIMEOUT_MS);
    const callSignal = signal === undefined
      ? timeoutSignal
      : AbortSignal.any([signal, timeoutSignal]);
    const pending = (async () => {
      try {
        const snapshot = await hostClient.call(
          "snapshot",
          { cpuSampleMs: CPU_SAMPLE_MS },
          { hostId: host.id, signal: callSignal },
        );
        const receivedAtMs = Date.now();
        store.insert(host.id, snapshot, receivedAtMs);
        records.set(host.id, { snapshot, receivedAtMs, error: null, sampling: false });
      } catch (error) {
        if (signal?.aborted) return;
        bb.log.warn(`Could not sample host ${host.id}: ${errorMessage(error)}`);
        records.set(host.id, {
          snapshot: previous.snapshot,
          receivedAtMs: previous.receivedAtMs,
          error: publicSampleError(error),
          sampling: false,
        });
      }
    })();

    sampleInFlight.set(host.id, pending);
    try {
      await pending;
    } finally {
      if (sampleInFlight.get(host.id) === pending) sampleInFlight.delete(host.id);
    }
  }

  async function refreshAll(signal?: AbortSignal): Promise<void> {
    if (fullRefreshInFlight !== null) return fullRefreshInFlight;
    const pending = (async () => {
      const available = await listHosts(signal);
      const samples = available.map((host) => sampleHost(host, signal));
      publish(available.map((host) => host.id));
      await Promise.all(samples);
      store.prune(Date.now() - RETENTION_MS);
      publish(available.map((host) => host.id));
    })();
    fullRefreshInFlight = pending;
    try {
      await pending;
    } finally {
      if (fullRefreshInFlight === pending) fullRefreshInFlight = null;
    }
  }

  async function refreshOne(hostId: string): Promise<void> {
    const available = await listHosts();
    const host = available.find((candidate) => candidate.id === hostId);
    if (host === undefined) throw new Error("That enrolled machine no longer exists.");
    const sample = sampleHost(host);
    publish([host.id]);
    await sample;
    publish([host.id]);
  }

  async function requireEnrolledHost(hostId: string): Promise<void> {
    const available = await listHosts();
    if (!available.some((host) => host.id === hostId)) {
      throw new Error("That enrolled machine no longer exists.");
    }
  }

  async function enrolledProcessHost(hostId: string) {
    const signal = AbortSignal.any([
      AbortSignal.timeout(PROCESS_HOST_CALL_TIMEOUT_MS),
      processLifecycleController.signal,
    ]);
    const availableHosts = await bb.sdk.hosts.list({ signal });
    return availableHosts.find((host) => host.id === hostId) ?? null;
  }

  function processHostSignal(timeoutMs = PROCESS_HOST_CALL_TIMEOUT_MS): AbortSignal {
    return AbortSignal.any([
      AbortSignal.timeout(timeoutMs),
      processLifecycleController.signal,
    ]);
  }

  function unsupportedProcessError(error: unknown): boolean {
    return /unsupported (?:on|operating system)|unsupported platform/iu.test(errorMessage(error));
  }

  async function loadProcessList({
    hostId,
    sortBy,
    limit,
  }: {
    hostId: string;
    sortBy: ProcessSortBy;
    limit: number;
  }): Promise<ProcessListResult> {
    let machine;
    try {
      machine = await enrolledProcessHost(hostId);
    } catch (error) {
      bb.log.warn(`Could not resolve process host ${hostId}: ${errorMessage(error)}`);
      return { outcome: "unavailable", message: "Process information is temporarily unavailable from this machine." };
    }
    if (machine === null) return { outcome: "not-found", message: "That enrolled machine no longer exists." };
    if (machine.status !== "connected") {
      return { outcome: "offline", message: "Connect this machine before inspecting its processes." };
    }
    try {
      const result = await processOperations.run(hostId, () => hostClient.call(
        "listProcesses",
        { sortBy, limit },
        { hostId, signal: processHostSignal() },
      ));
      return {
        outcome: "ok",
        host: { id: machine.id, name: machine.name, status: "connected", platform: result.platform },
        sampledAtMs: result.sampledAtMs,
        elevated: result.elevated,
        totalCount: result.totalCount,
        truncated: result.truncated,
        processes: result.processes,
      };
    } catch (error) {
      bb.log.warn(`Could not inspect processes on host ${hostId}: ${errorMessage(error)}`);
      return unsupportedProcessError(error)
        ? { outcome: "unsupported", message: "Process inspection is unsupported on this operating system." }
        : { outcome: "unavailable", message: "Process information is temporarily unavailable from this machine." };
    }
  }

  async function coalescedProcessList(input: {
    hostId: string;
    sortBy: ProcessSortBy;
    limit: number;
  }): Promise<ProcessListResult> {
    const key = `${input.hostId}\0${input.sortBy}\0${input.limit}`;
    const existing = processListInFlight.get(key);
    if (existing !== undefined) return existing;
    const pending = loadProcessList(input);
    processListInFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      if (processListInFlight.get(key) === pending) processListInFlight.delete(key);
    }
  }

  bb.rpc.register(rpcContract, {
    async fleet() {
      if (hosts.length === 0) await listHosts();
      return fleet();
    },
    async sidebarSummary() {
      if (hosts.length === 0) await listHosts();
      return {
        connected: hosts.filter((host) => host.status === "connected").length,
        total: hosts.length,
      };
    },
    async machineHistory({ hostId, rangeHours }) {
      await requireEnrolledHost(hostId);
      const now = Date.now();
      return {
        hostId,
        rangeHours,
        points: store.history(hostId, now - rangeHours * 60 * 60_000, now),
      };
    },
    async dashboardConfig({ hostId }) {
      await requireEnrolledHost(hostId);
      return store.dashboardConfig(hostId);
    },
    async saveDashboardConfig({ hostId, config }) {
      await requireEnrolledHost(hostId);
      const saved = store.saveDashboardConfig(hostId, config);
      publish([hostId]);
      return saved;
    },
    listProcesses: coalescedProcessList,
    async prepareProcessTermination({ hostId, pid, identity, mode }) {
      let machine;
      try {
        machine = await enrolledProcessHost(hostId);
      } catch (error) {
        bb.log.warn(`Could not resolve process host ${hostId}: ${errorMessage(error)}`);
        return { outcome: "unavailable" as const, message: "The machine could not be reached for a safety check." };
      }
      if (machine === null) return { outcome: "not-found" as const, message: "That enrolled machine no longer exists." };
      if (machine.status !== "connected") {
        return { outcome: "unavailable" as const, message: "Reconnect the machine before stopping a process." };
      }
      try {
        const inspected = await processOperations.run(hostId, () => hostClient.call(
          "inspectProcessTermination",
          { pid, identity, mode },
          { hostId, signal: processHostSignal() },
        ));
        if (inspected.outcome !== "ready") return inspected;
        const challenge = processConfirmations.issue({
          hostId,
          hostName: machine.name,
          pid: inspected.process.pid,
          name: inspected.process.name,
          identity: inspected.process.identity,
          mode: inspected.process.mode,
        });
        return {
          outcome: "ready" as const,
          ...challenge,
          host: { id: machine.id, name: machine.name },
          process: inspected.process,
        };
      } catch (error) {
        bb.log.warn(`Could not prepare process ${pid} on host ${hostId}: ${errorMessage(error)}`);
        return { outcome: "unavailable" as const, message: "The process could not be rechecked on this machine." };
      }
    },
    async executeProcessTermination({ confirmationToken }) {
      const consumed = processConfirmations.consume(confirmationToken);
      if (consumed.outcome === "invalid") {
        return { outcome: "confirmation-invalid" as const, message: "This confirmation has already been used or is no longer valid." };
      }
      if (consumed.outcome === "expired") {
        return { outcome: "confirmation-expired" as const, message: "This confirmation expired. Recheck the process and try again." };
      }
      const { confirmation } = consumed;
      let machine;
      try {
        machine = await enrolledProcessHost(confirmation.hostId);
      } catch (error) {
        bb.log.warn(`Could not resolve confirmed process host ${confirmation.hostId}: ${errorMessage(error)}`);
        bb.log.warn(`Process control host=${confirmation.hostId} pid=${confirmation.pid} mode=${confirmation.mode} outcome=preflight-failed`);
        return { outcome: "signal-failed" as const, message: "The machine could not be reached, so no stop request was sent." };
      }
      if (machine === null || machine.status !== "connected") {
        bb.log.warn(`Process control host=${confirmation.hostId} pid=${confirmation.pid} mode=${confirmation.mode} outcome=preflight-offline`);
        return { outcome: "signal-failed" as const, message: "The machine is offline, so no stop request was sent." };
      }
      const input: { pid: number; identity: string; mode: ProcessTerminationMode } = {
        pid: confirmation.pid,
        identity: confirmation.identity,
        mode: confirmation.mode,
      };
      try {
        const result = await processOperations.run(confirmation.hostId, () => hostClient.call(
          "terminateProcess",
          input,
          { hostId: confirmation.hostId, signal: processHostSignal(PROCESS_TERMINATION_HOST_CALL_TIMEOUT_MS) },
        ));
        const auditMessage = `Process control host=${confirmation.hostId} pid=${confirmation.pid} mode=${confirmation.mode} outcome=${result.outcome}`;
        if (result.outcome === "signal-sent" || result.outcome === "still-running") bb.log.info(auditMessage);
        else bb.log.warn(auditMessage);
        if (result.outcome === "signal-sent" || result.outcome === "still-running") {
          return {
            ...result,
            host: { id: confirmation.hostId, name: confirmation.hostName },
            process: { pid: confirmation.pid, name: confirmation.name, mode: confirmation.mode },
          };
        }
        return result;
      } catch (error) {
        if (error instanceof ProcessOperationBusyError) {
          bb.log.warn(`Process control host=${confirmation.hostId} pid=${confirmation.pid} mode=${confirmation.mode} outcome=busy`);
          return { outcome: "signal-failed" as const, message: "This machine is busy with another process operation. Refresh and try again." };
        }
        bb.log.warn(`Process stop outcome is unknown for PID ${confirmation.pid} on host ${confirmation.hostId}: ${errorMessage(error)}`);
        return { outcome: "outcome-unknown" as const, message: "The connection dropped during the stop request. Refresh before trying again." };
      }
    },
    async refresh({ hostId }) {
      if (hostId === null) await refreshAll();
      else await refreshOne(hostId);
      return fleet();
    },
  });

  async function waitForRefresh(signal: AbortSignal): Promise<void> {
    if (signal.aborted || refreshRequested) return;
    const wakeController = new AbortController();
    const wake = (): void => wakeController.abort();
    wakeWaiter = wake;
    try {
      await delay(SAMPLE_INTERVAL_MS, undefined, {
        signal: AbortSignal.any([signal, wakeController.signal]),
      });
    } catch (error) {
      if (!signal.aborted && !wakeController.signal.aborted) throw error;
    } finally {
      if (wakeWaiter === wake) wakeWaiter = null;
    }
  }

  const unsubscribeWorkerExit = hostClient.experimental_onWorkerExit(({ hostId }) => {
    const previous = records.get(hostId);
    if (previous !== undefined) {
      records.set(hostId, {
        ...previous,
        sampling: false,
        error: "The machine monitor worker stopped; the next refresh will restart it.",
      });
      publish([hostId]);
    }
  });
  bb.onDispose(unsubscribeWorkerExit);

  bb.background.service("machine-sampler", {
    async start(signal) {
      const unsubscribeHost = bb.sdk.subscribe({
        event: "host:changed",
        callback: requestRefresh,
      });
      const unsubscribeRealtime = bb.sdk.subscribe({
        event: "realtime:connection",
        callback: (event) => {
          if (event.state === "connected" && event.reconnected) requestRefresh();
        },
      });
      try {
        while (!signal.aborted) {
          refreshRequested = false;
          try {
            await refreshAll(signal);
          } catch (error) {
            if (!signal.aborted) {
              bb.log.warn(`Could not refresh machines: ${errorMessage(error)}`);
            }
          }
          if (signal.aborted) break;
          if (refreshRequested) continue;
          await waitForRefresh(signal);
        }
      } finally {
        unsubscribeRealtime();
        unsubscribeHost();
        wakeWaiter?.();
        wakeWaiter = null;
      }
    },
  });
}
