import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { setTimeout as delay } from "node:timers/promises";
import {
  hostContract,
  rpcContract,
  type Dashboard,
  type MachineSnapshot,
  type ProcessListResult,
  type ProcessSortBy,
  type ProcessTerminationMode,
} from "./contract.js";
import {
  buildDashboard,
  mergeLastGoodRecords,
  type LastGoodMachineRecord,
  type MachineHost,
  type MachineSampleUpdate,
} from "./lib/dashboard.js";
import {
  resolveHealthThresholds,
  sameHealthThresholds,
  type HealthThresholds,
} from "./lib/thresholds.js";
import {
  parseExtraDiskPaths,
  sameExtraDiskPaths,
} from "./lib/extra-disk-paths.js";
import { ProcessConfirmationStore } from "./lib/process-confirmations.js";
import {
  HostProcessOperationGate,
  ProcessOperationBusyError,
} from "./lib/process-operation-gate.js";

const REFRESH_INTERVAL_MS = 10_000;
const CPU_SAMPLE_MS = 300;
const HOST_CALL_TIMEOUT_MS = 5_000;
export const PROCESS_HOST_CALL_TIMEOUT_MS = 20_000;
export const PROCESS_TERMINATION_HOST_CALL_TIMEOUT_MS = 30_000;
const REALTIME_CHANNEL = "machines-changed";
const HOST_SNAPSHOT_LIMIT = 100;
const NATIVE_OPEN_REQUEST_TTL_MS = 15_000;

export function compactHostDashboard(current: Dashboard) {
  return {
    schemaVersion: 1 as const,
    generatedAtMs: current.generatedAtMs,
    thresholds: current.thresholds,
    hosts: current.machines.slice(0, HOST_SNAPSHOT_LIMIT).map((machine) => ({
      id: machine.host.id,
      name: machine.host.name,
      status: machine.host.status,
      sampleState: machine.sampleState,
      cpuPercent: machine.snapshot?.cpu.usagePercent ?? null,
      memoryPercent: machine.snapshot?.memory.usagePercent ?? null,
      diskPercent: machine.snapshot?.disk?.usagePercent ?? null,
      receiveBytesPerSecond:
        machine.snapshot?.network.receiveBytesPerSecond ?? null,
      sendBytesPerSecond:
        machine.snapshot?.network.sendBytesPerSecond ?? null,
    })),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || /timed?\s*out/iu.test(error.message))
  );
}

function publicSampleError(error: unknown): string {
  return isTimeout(error)
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

function nextCpuHighStreak(
  previous: LastGoodMachineRecord | undefined,
  snapshot: MachineSnapshot,
  thresholds: HealthThresholds,
): number {
  return snapshot.cpu.usagePercent >= thresholds.attentionPercent
    ? Math.min((previous?.cpuHighStreak ?? 0) + 1, Number.MAX_SAFE_INTEGER)
    : 0;
}

export default async function hostMonitorPlugin(
  bb: BbPluginApi,
): Promise<void> {
  let nativeOpenRequest: {
    requestedAt: number;
    hostId: string | null;
  } | null = null;
  const settings = bb.settings.define({
    sidebarThresholdColors: {
      type: "boolean",
      label: "Threshold colors",
      description:
        "Color CPU, memory, and disk percentage values green, yellow, or red across the Host Monitor page, sidebar popover, and floating window.",
      default: true,
    },
    attentionThresholdPercent: {
      type: "string",
      label: "Yellow threshold (%)",
      description:
        "CPU, memory, and disk turn yellow at this usage percentage. Enter 1–99, below the red threshold; invalid values use 85%.",
      default: "85",
    },
    criticalThresholdPercent: {
      type: "string",
      label: "Red threshold (%)",
      description:
        "CPU, memory, and disk turn red at this usage percentage. Enter 2–100, above the yellow threshold; invalid values use 95%.",
      default: "95",
    },
    extraDiskPaths: {
      type: "string",
      label: "Extra volumes",
      description:
        "Absolute mount points to measure beside the system volume, one per line (for example /mnt/data). They use the disk thresholds. A path that is missing or not mounted on a host shows as unavailable.",
      experimental_multiline: true,
      default: "",
    },
  });
  const initialSettings = await settings.get();
  let sidebarThresholdColors = initialSettings.sidebarThresholdColors;
  let thresholds = resolveHealthThresholds(initialSettings);
  let extraDiskPaths = parseExtraDiskPaths(initialSettings.extraDiskPaths);
  const hostClient = bb.hosts.experimental_client({ contract: hostContract });
  const processConfirmations = new ProcessConfirmationStore();
  const processOperations = new HostProcessOperationGate();
  const processLifecycleController = new AbortController();
  const processListInFlight = new Map<string, Promise<ProcessListResult>>();
  bb.onDispose(() => {
    processLifecycleController.abort(
      new DOMException("Host Monitor is shutting down.", "AbortError"),
    );
    processOperations.close();
    processConfirmations.clear();
  });
  let hosts: MachineHost[] = [];
  let records = new Map<string, LastGoodMachineRecord>();
  let hostListInFlight: Promise<MachineHost[]> | null = null;
  let fullRefreshInFlight: Promise<void> | null = null;
  const sampleInFlight = new Map<string, Promise<void>>();
  let refreshRequested = true;
  let wakeWaiter: (() => void) | null = null;

  function dashboard(): Dashboard {
    return buildDashboard(
      hosts,
      records,
      Date.now(),
      REFRESH_INTERVAL_MS,
      thresholds,
    );
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

  settings.onChange((next) => {
    const nextThresholds = resolveHealthThresholds(next);
    const thresholdsChanged = !sameHealthThresholds(
      thresholds,
      nextThresholds,
    );
    const nextExtraDiskPaths = parseExtraDiskPaths(next.extraDiskPaths);
    const extraDiskPathsChanged = !sameExtraDiskPaths(
      extraDiskPaths,
      nextExtraDiskPaths,
    );
    sidebarThresholdColors = next.sidebarThresholdColors;
    thresholds = nextThresholds;
    extraDiskPaths = nextExtraDiskPaths;
    if (thresholdsChanged) {
      records = new Map(
        [...records].map(([hostId, record]) => [
          hostId,
          { ...record, cpuHighStreak: 0 },
        ]),
      );
    }
    if (thresholdsChanged || extraDiskPathsChanged) requestRefresh();
    publish(hosts.map((host) => host.id));
  });

  async function listHosts(signal?: AbortSignal): Promise<MachineHost[]> {
    if (hostListInFlight !== null) return hostListInFlight;
    const pending = bb.sdk.hosts
      .list(signal === undefined ? undefined : { signal })
      .then((availableHosts) => availableHosts.map(projectHost));
    hostListInFlight = pending;
    try {
      hosts = await pending;
      records = mergeLastGoodRecords(hosts, records, new Map());
      return hosts;
    } finally {
      if (hostListInFlight === pending) hostListInFlight = null;
    }
  }

  async function sampleHost(
    machine: MachineHost,
    signal?: AbortSignal,
  ): Promise<void> {
    if (machine.status !== "connected") return;
    const existing = sampleInFlight.get(machine.id);
    if (existing !== undefined) return existing;

    const timeoutSignal = AbortSignal.timeout(HOST_CALL_TIMEOUT_MS);
    const callSignal =
      signal === undefined
        ? timeoutSignal
        : AbortSignal.any([signal, timeoutSignal]);
    const pending = (async () => {
      try {
        const snapshot = await hostClient.call(
          "snapshot",
          extraDiskPaths.length === 0
            ? { cpuSampleMs: CPU_SAMPLE_MS }
            : { cpuSampleMs: CPU_SAMPLE_MS, extraDiskPaths },
          { hostId: machine.id, signal: callSignal },
        );
        const update: MachineSampleUpdate = {
          kind: "success",
          snapshot,
          cpuHighStreak: nextCpuHighStreak(
            records.get(machine.id),
            snapshot,
            thresholds,
          ),
        };
        records = mergeLastGoodRecords(
          hosts,
          records,
          new Map([[machine.id, update]]),
        );
      } catch (error) {
        if (signal?.aborted) return;
        bb.log.warn(
          `Could not sample host ${machine.id}: ${errorMessage(error)}`,
        );
        records = mergeLastGoodRecords(
          hosts,
          records,
          new Map([
            [
              machine.id,
              { kind: "error", error: publicSampleError(error) } as const,
            ],
          ]),
        );
      }
    })();
    sampleInFlight.set(machine.id, pending);
    try {
      await pending;
    } finally {
      if (sampleInFlight.get(machine.id) === pending) {
        sampleInFlight.delete(machine.id);
      }
    }
  }

  async function refreshAll(signal?: AbortSignal): Promise<void> {
    if (fullRefreshInFlight !== null) return fullRefreshInFlight;
    const pending = (async () => {
      const availableHosts = await listHosts(signal);
      await Promise.all(
        availableHosts.map((machine) => sampleHost(machine, signal)),
      );
      publish(availableHosts.map((machine) => machine.id));
    })();
    fullRefreshInFlight = pending;
    try {
      await pending;
    } finally {
      if (fullRefreshInFlight === pending) fullRefreshInFlight = null;
    }
  }

  async function refreshOne(hostId: string): Promise<void> {
    const availableHosts = await listHosts();
    const machine = availableHosts.find((candidate) => candidate.id === hostId);
    if (machine === undefined) return;
    await sampleHost(machine);
    publish([hostId]);
  }

  async function enrolledHost(hostId: string) {
    const signal = AbortSignal.any([
      AbortSignal.timeout(PROCESS_HOST_CALL_TIMEOUT_MS),
      processLifecycleController.signal,
    ]);
    const availableHosts = await bb.sdk.hosts.list({ signal });
    return availableHosts.find((host) => host.id === hostId) ?? null;
  }

  function processHostSignal(
    timeoutMs = PROCESS_HOST_CALL_TIMEOUT_MS,
  ): AbortSignal {
    return AbortSignal.any([
      AbortSignal.timeout(timeoutMs),
      processLifecycleController.signal,
    ]);
  }

  function processHostUnavailableMessage(): string {
    return "Process information is temporarily unavailable from this machine.";
  }

  function unsupportedProcessError(error: unknown): boolean {
    return /unsupported (?:on|operating system)|unsupported platform/iu.test(
      errorMessage(error),
    );
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
      machine = await enrolledHost(hostId);
    } catch (error) {
      bb.log.warn(
        `Could not resolve process host ${hostId}: ${errorMessage(error)}`,
      );
      return {
        outcome: "unavailable",
        message: processHostUnavailableMessage(),
      };
    }
    if (machine === null) {
      return {
        outcome: "not-found",
        message: "That enrolled machine no longer exists.",
      };
    }
    if (machine.status !== "connected") {
      return {
        outcome: "offline",
        message: "Connect this machine before inspecting its processes.",
      };
    }
    try {
      const result = await processOperations.run(hostId, () =>
        hostClient.call(
          "listProcesses",
          { sortBy, limit },
          { hostId, signal: processHostSignal() },
        ),
      );
      return {
        outcome: "ok",
        host: {
          id: machine.id,
          name: machine.name,
          status: "connected",
          platform: result.platform,
        },
        sampledAtMs: result.sampledAtMs,
        elevated: result.elevated,
        totalCount: result.totalCount,
        truncated: result.truncated,
        processes: result.processes,
      };
    } catch (error) {
      bb.log.warn(
        `Could not inspect processes on host ${hostId}: ${errorMessage(error)}`,
      );
      return unsupportedProcessError(error)
        ? {
            outcome: "unsupported",
            message:
              "Process inspection is unsupported on this operating system.",
          }
        : {
            outcome: "unavailable",
            message: processHostUnavailableMessage(),
          };
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
      if (processListInFlight.get(key) === pending) {
        processListInFlight.delete(key);
      }
    }
  }

  bb.rpc.register(rpcContract, {
    async claimNativeOpen() {
      const request = nativeOpenRequest;
      nativeOpenRequest = null;
      const open =
        request !== null &&
        Date.now() - request.requestedAt <= NATIVE_OPEN_REQUEST_TTL_MS;
      return {
        open,
        hostId: open ? request.hostId : null,
      };
    },
    async getPreferences() {
      return { sidebarThresholdColors, thresholds };
    },
    async dashboard() {
      if (hosts.length === 0) await listHosts();
      return dashboard();
    },
    async refresh({ hostId }) {
      if (hostId === null) await refreshAll();
      else await refreshOne(hostId);
      return dashboard();
    },
    listProcesses: coalescedProcessList,
    async prepareProcessTermination({ hostId, pid, identity, mode }) {
      let machine;
      try {
        machine = await enrolledHost(hostId);
      } catch (error) {
        bb.log.warn(
          `Could not resolve process host ${hostId}: ${errorMessage(error)}`,
        );
        return {
          outcome: "unavailable" as const,
          message: "The machine could not be reached for a safety check.",
        };
      }
      if (machine === null) {
        return {
          outcome: "not-found" as const,
          message: "That enrolled machine no longer exists.",
        };
      }
      if (machine.status !== "connected") {
        return {
          outcome: "unavailable" as const,
          message: "Reconnect the machine before stopping a process.",
        };
      }

      try {
        const inspected = await processOperations.run(hostId, () =>
          hostClient.call(
            "inspectProcessTermination",
            { pid, identity, mode },
            { hostId, signal: processHostSignal() },
          ),
        );
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
        bb.log.warn(
          `Could not prepare process ${pid} on host ${hostId}: ${errorMessage(error)}`,
        );
        return {
          outcome: "unavailable" as const,
          message: "The process could not be rechecked on this machine.",
        };
      }
    },
    async executeProcessTermination({ confirmationToken }) {
      const consumed = processConfirmations.consume(confirmationToken);
      if (consumed.outcome === "invalid") {
        return {
          outcome: "confirmation-invalid" as const,
          message:
            "This confirmation has already been used or is no longer valid.",
        };
      }
      if (consumed.outcome === "expired") {
        return {
          outcome: "confirmation-expired" as const,
          message: "This confirmation expired. Recheck the process and try again.",
        };
      }
      const { confirmation } = consumed;
      let machine;
      try {
        machine = await enrolledHost(confirmation.hostId);
      } catch (error) {
        bb.log.warn(
          `Could not resolve confirmed process host ${confirmation.hostId}: ${errorMessage(error)}`,
        );
        bb.log.warn(
          `Process control host=${confirmation.hostId} pid=${confirmation.pid} mode=${confirmation.mode} outcome=preflight-failed`,
        );
        return {
          outcome: "signal-failed" as const,
          message:
            "The machine could not be reached, so no stop request was sent.",
        };
      }
      if (machine === null || machine.status !== "connected") {
        bb.log.warn(
          `Process control host=${confirmation.hostId} pid=${confirmation.pid} mode=${confirmation.mode} outcome=preflight-offline`,
        );
        return {
          outcome: "signal-failed" as const,
          message:
            "The machine is offline, so no stop request was sent.",
        };
      }

      const input: {
        pid: number;
        identity: string;
        mode: ProcessTerminationMode;
      } = {
        pid: confirmation.pid,
        identity: confirmation.identity,
        mode: confirmation.mode,
      };
      try {
        const result = await processOperations.run(confirmation.hostId, () =>
          hostClient.call(
            "terminateProcess",
            input,
            {
              hostId: confirmation.hostId,
              signal: processHostSignal(
                PROCESS_TERMINATION_HOST_CALL_TIMEOUT_MS,
              ),
            },
          ),
        );
        const auditMessage = `Process control host=${confirmation.hostId} pid=${confirmation.pid} mode=${confirmation.mode} outcome=${result.outcome}`;
        if (
          result.outcome === "signal-sent" ||
          result.outcome === "still-running"
        ) {
          bb.log.info(auditMessage);
        } else {
          bb.log.warn(auditMessage);
        }
        if (
          result.outcome === "signal-sent" ||
          result.outcome === "still-running"
        ) {
          return {
            ...result,
            host: { id: confirmation.hostId, name: confirmation.hostName },
            process: {
              pid: confirmation.pid,
              name: confirmation.name,
              mode: confirmation.mode,
            },
          };
        }
        return result;
      } catch (error) {
        if (error instanceof ProcessOperationBusyError) {
          bb.log.warn(
            `Process control host=${confirmation.hostId} pid=${confirmation.pid} mode=${confirmation.mode} outcome=busy`,
          );
          return {
            outcome: "signal-failed" as const,
            message:
              "This machine is busy with another process operation. Refresh and try again.",
          };
        }
        bb.log.warn(
          `Process stop outcome is unknown for PID ${confirmation.pid} on host ${confirmation.hostId}: ${errorMessage(error)}`,
        );
        return {
          outcome: "outcome-unknown" as const,
          message:
            "The connection dropped during the stop request. Refresh before trying again.",
        };
      }
    },
  });

  bb.cli.register({
    name: "host-monitor",
    summary: "Open Host Monitor or read its cached resource snapshot",
    commands: [
      {
        name: "open",
        summary: "Open Host Monitor or one enrolled host in the BB desktop app",
        usage: "bb host-monitor open [host-id]",
      },
      {
        name: "snapshot",
        summary: "Print bounded CPU, memory, disk, and network JSON",
        usage: "bb host-monitor snapshot [--pretty]",
      },
    ],
    async run(argv, context) {
      const [command, ...args] = argv;
      if (command === "open" && args.length <= 1) {
        const hostId = args[0] ?? null;
        if (hostId !== null) {
          if (hosts.length === 0) await listHosts();
          if (!hosts.some((host) => host.id === hostId)) {
            return {
              exitCode: 1,
              stderr: `Unknown enrolled host: ${hostId}`,
            };
          }
        }
        nativeOpenRequest = { requestedAt: Date.now(), hostId };
        return {
          exitCode: 0,
          stdout: hostId === null
            ? "Host Monitor open requested.\n"
            : `Host Monitor open requested for ${hostId}.\n`,
        };
      }
      if (
        command !== "snapshot" ||
        args.some((argument) => argument !== "--pretty")
      ) {
        return {
          exitCode: 1,
          stderr:
            "Usage: bb host-monitor open [host-id] | bb host-monitor snapshot [--pretty]",
        };
      }
      if (hosts.length === 0) await refreshAll(context.signal);
      const projected = compactHostDashboard(dashboard());
      return {
        exitCode: 0,
        stdout: args.includes("--pretty")
          ? JSON.stringify(projected, null, 2)
          : JSON.stringify(projected),
      };
    },
  });

  async function waitForRefresh(signal: AbortSignal): Promise<void> {
    if (signal.aborted || refreshRequested) return;
    const wakeController = new AbortController();
    const wake = (): void => wakeController.abort();
    wakeWaiter = wake;
    try {
      await delay(REFRESH_INTERVAL_MS, undefined, {
        signal: AbortSignal.any([signal, wakeController.signal]),
      });
    } catch (error) {
      if (!signal.aborted && !wakeController.signal.aborted) throw error;
    } finally {
      if (wakeWaiter === wake) wakeWaiter = null;
    }
  }

  const unsubscribeWorkerExit = hostClient.experimental_onWorkerExit(
    ({ hostId }) => {
      bb.log.warn(
        `Host Monitor worker exited unexpectedly on host ${hostId}; the next poll will restart it`,
      );
    },
  );
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
          if (event.state === "connected" && event.reconnected) {
            requestRefresh();
          }
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
