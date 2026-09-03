import { setTimeout as delay } from "node:timers/promises";

import type { BbPluginApi } from "@get-bb/plugin-sdk";

import {
  hostContract,
  rpcContract,
  type Fleet,
  type MachineRow,
  type MachineSnapshot,
} from "./contract.ts";
import {
  HostMonitorStore,
  hostMonitorMigrations,
  RETENTION_MS,
  SAMPLE_INTERVAL_MS,
} from "./store.ts";

const CPU_SAMPLE_MS = 300;
const HOST_CALL_TIMEOUT_MS = 5_000;
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
      if (hosts.length === 0) await listHosts();
      if (!hosts.some((host) => host.id === hostId)) {
        throw new Error("That enrolled machine no longer exists.");
      }
      const now = Date.now();
      return {
        hostId,
        rangeHours,
        points: store.history(hostId, now - rangeHours * 60 * 60_000, now),
      };
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
