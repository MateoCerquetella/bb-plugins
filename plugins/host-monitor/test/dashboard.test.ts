import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MachineSnapshot } from "../contract.ts";
import {
  buildDashboard,
  CPU_SUSTAINED_SAMPLES,
  deriveResourceHealth,
  deriveSampleState,
  mergeLastGoodRecords,
  type LastGoodMachineRecord,
  type MachineHost,
  type MachineSampleUpdate,
} from "../lib/dashboard.ts";

function capacity(usagePercent: number, totalBytes = 100 * 1024 ** 3) {
  const usedBytes = Math.round((usagePercent / 100) * totalBytes);
  return {
    totalBytes,
    usedBytes,
    availableBytes: totalBytes - usedBytes,
    usagePercent,
  };
}

function snapshot(
  overrides: {
    sampledAtMs?: number;
    cpuPercent?: number;
    memoryPercent?: number;
    swapPercent?: number | null;
    diskPercent?: number | null;
  } = {},
): MachineSnapshot {
  return {
    sampledAtMs: overrides.sampledAtMs ?? 10_000,
    durationMs: 250,
    system: {
      hostname: "host",
      osName: "Linux",
      platform: "linux",
      arch: "x64",
      kernelRelease: "6.12.0",
      kernelVersion: "#1",
      uptimeSeconds: 3_600,
      bootedAtMs: 1_000,
    },
    network: {
      primaryIpAddress: "192.0.2.10",
      receiveBytesPerSecond: 1_024,
      sendBytesPerSecond: 512,
    },
    cpu: {
      model: "Test CPU",
      logicalCores: 8,
      usagePercent: overrides.cpuPercent ?? 20,
      loadAverage: [0.5, 0.4, 0.3],
    },
    memory: capacity(overrides.memoryPercent ?? 40),
    swap:
      overrides.swapPercent === null
        ? null
        : capacity(overrides.swapPercent ?? 0, 8 * 1024 ** 3),
    disk:
      overrides.diskPercent === null
        ? null
        : { ...capacity(overrides.diskPercent ?? 30), path: "/" },
    issues: [],
  };
}

function host(
  id: string,
  options: {
    name?: string;
    status?: MachineHost["status"];
  } = {},
): MachineHost {
  return {
    id,
    name: options.name ?? id,
    status: options.status ?? "connected",
    lastSeenAt: 9_000,
  };
}

function record(
  value: MachineSnapshot | null,
  overrides: Partial<LastGoodMachineRecord> = {},
): LastGoodMachineRecord {
  return {
    snapshot: value,
    error: null,
    sampling: false,
    cpuHighStreak: 0,
    ...overrides,
  };
}

describe("resource health", () => {
  it("applies memory thresholds immediately at 85 and 95 percent", () => {
    assert.deepEqual(
      deriveResourceHealth(snapshot({ memoryPercent: 84.99 }), 0),
      { health: "healthy", alert: null },
    );

    const attention = deriveResourceHealth(
      snapshot({ memoryPercent: 85 }),
      0,
    );
    assert.equal(attention.health, "attention");
    assert.equal(attention.alert?.metric, "memory");
    assert.match(attention.alert?.message ?? "", /Memory pressure is high/u);

    const critical = deriveResourceHealth(
      snapshot({ memoryPercent: 95 }),
      0,
    );
    assert.equal(critical.health, "critical");
    assert.equal(critical.alert?.metric, "memory");
    assert.match(critical.alert?.message ?? "", /critical/u);
  });

  it("applies disk thresholds immediately and tolerates a missing disk", () => {
    const attention = deriveResourceHealth(
      snapshot({ diskPercent: 85 }),
      0,
    );
    assert.equal(attention.health, "attention");
    assert.equal(attention.alert?.metric, "disk");

    const critical = deriveResourceHealth(
      snapshot({ diskPercent: 95 }),
      0,
    );
    assert.equal(critical.health, "critical");
    assert.equal(critical.alert?.metric, "disk");

    assert.deepEqual(
      deriveResourceHealth(snapshot({ diskPercent: null }), 0),
      { health: "healthy", alert: null },
    );
  });

  it("applies disk thresholds to extra volumes and skips unavailable ones", () => {
    const base = snapshot({ diskPercent: 30 });
    assert.deepEqual(deriveResourceHealth(base, 0), {
      health: "healthy",
      alert: null,
    });

    const breached = deriveResourceHealth(
      {
        ...base,
        extraDisks: [
          { path: "/mnt/missing", capacity: null },
          { path: "/mnt/HC_Volume_106978058", capacity: capacity(96) },
        ],
      },
      0,
    );
    assert.equal(breached.health, "critical");
    assert.equal(breached.alert?.metric, "disk");
    assert.match(
      breached.alert?.message ?? "",
      /^Volume \/mnt\/HC_Volume_106978058 is nearly full/u,
    );

    assert.deepEqual(
      deriveResourceHealth(
        {
          ...base,
          extraDisks: [
            { path: "/mnt/missing", capacity: null },
            { path: "/srv", capacity: capacity(50) },
          ],
        },
        0,
      ),
      { health: "healthy", alert: null },
    );
  });

  it("requires a sustained CPU streak and never alerts on swap alone", () => {
    assert.deepEqual(
      deriveResourceHealth(
        snapshot({ cpuPercent: 99, swapPercent: 99 }),
        CPU_SUSTAINED_SAMPLES - 1,
      ),
      { health: "healthy", alert: null },
    );

    const attention = deriveResourceHealth(
      snapshot({ cpuPercent: 85, swapPercent: 100 }),
      CPU_SUSTAINED_SAMPLES,
    );
    assert.equal(attention.health, "attention");
    assert.equal(attention.alert?.metric, "cpu");

    const critical = deriveResourceHealth(
      snapshot({ cpuPercent: 95 }),
      CPU_SUSTAINED_SAMPLES,
    );
    assert.equal(critical.health, "critical");
    assert.equal(critical.alert?.metric, "cpu");
  });

  it("selects the most severe alert with a stable resource tie-break", () => {
    const mostSevere = deriveResourceHealth(
      snapshot({ cpuPercent: 99, memoryPercent: 85, diskPercent: 95 }),
      CPU_SUSTAINED_SAMPLES,
    );
    assert.equal(mostSevere.health, "critical");
    assert.equal(mostSevere.alert?.metric, "disk");

    const tied = deriveResourceHealth(
      snapshot({ cpuPercent: 99, memoryPercent: 95, diskPercent: 95 }),
      CPU_SUSTAINED_SAMPLES,
    );
    assert.equal(tied.health, "critical");
    assert.equal(tied.alert?.metric, "memory");
  });

  it("uses a supplied ordered threshold pair for health classification", () => {
    const thresholds = { attentionPercent: 70, criticalPercent: 90 };
    assert.equal(
      deriveResourceHealth(snapshot({ memoryPercent: 70 }), 0, thresholds)
        .health,
      "attention",
    );
    assert.equal(
      deriveResourceHealth(snapshot({ diskPercent: 90 }), 0, thresholds)
        .health,
      "critical",
    );
  });
});

describe("sample state", () => {
  it("prioritizes connectivity, active sampling, and errors", () => {
    const base = {
      snapshot: snapshot(),
      error: null,
      sampling: false,
      nowMs: 12_000,
      refreshIntervalMs: 1_000,
    } as const;

    assert.equal(
      deriveSampleState({ ...base, hostStatus: "disconnected" }),
      "offline",
    );
    assert.equal(
      deriveSampleState({ ...base, hostStatus: "connected", sampling: true }),
      "sampling",
    );
    assert.equal(
      deriveSampleState({
        ...base,
        hostStatus: "connected",
        error: "timed out",
      }),
      "error",
    );
    assert.equal(
      deriveSampleState({
        ...base,
        hostStatus: "connected",
        snapshot: null,
      }),
      "sampling",
    );
  });

  it("marks a reading stale only after two complete refresh intervals", () => {
    const reading = snapshot({ sampledAtMs: 10_000 });
    assert.equal(
      deriveSampleState({
        hostStatus: "connected",
        snapshot: reading,
        error: null,
        sampling: false,
        nowMs: 12_000,
        refreshIntervalMs: 1_000,
      }),
      "fresh",
    );
    assert.equal(
      deriveSampleState({
        hostStatus: "connected",
        snapshot: reading,
        error: null,
        sampling: false,
        nowMs: 12_001,
        refreshIntervalMs: 1_000,
      }),
      "stale",
    );
  });
});

describe("last-good record merging", () => {
  it("keeps useful snapshots through sampling, errors, and disconnection", () => {
    const first = snapshot({ sampledAtMs: 10_000, memoryPercent: 40 });
    const next = snapshot({ sampledAtMs: 20_000, memoryPercent: 50 });
    const hosts = [host("alpha"), host("beta")];
    const previous = new Map<string, LastGoodMachineRecord>([
      ["alpha", record(first, { cpuHighStreak: 2 })],
      ["deleted", record(first)],
    ]);
    const sampling = new Map<string, MachineSampleUpdate>([
      ["alpha", { kind: "sampling" }],
    ]);

    const whileSampling = mergeLastGoodRecords(hosts, previous, sampling);
    assert.equal(whileSampling.get("alpha")?.snapshot, first);
    assert.equal(whileSampling.get("alpha")?.sampling, true);
    assert.equal(whileSampling.get("alpha")?.cpuHighStreak, 2);
    assert.equal(whileSampling.get("beta")?.sampling, true);
    assert.equal(whileSampling.has("deleted"), false);

    const failed = mergeLastGoodRecords(
      hosts,
      whileSampling,
      new Map([["alpha", { kind: "error", error: "worker exited" }]]),
    );
    assert.equal(failed.get("alpha")?.snapshot, first);
    assert.equal(failed.get("alpha")?.sampling, false);
    assert.equal(failed.get("alpha")?.error, "worker exited");

    const recovered = mergeLastGoodRecords(
      hosts,
      failed,
      new Map([
        [
          "alpha",
          { kind: "success", snapshot: next, cpuHighStreak: 3 } as const,
        ],
      ]),
    );
    assert.equal(recovered.get("alpha")?.snapshot, next);
    assert.equal(recovered.get("alpha")?.error, null);
    assert.equal(recovered.get("alpha")?.cpuHighStreak, 3);

    const disconnected = mergeLastGoodRecords(
      [host("alpha", { status: "disconnected" })],
      recovered,
      new Map([["alpha", { kind: "sampling" }]]),
    );
    assert.equal(disconnected.get("alpha")?.snapshot, next);
    assert.equal(disconnected.get("alpha")?.sampling, false);
  });

  it("rejects duplicate enrolled host ids", () => {
    assert.throws(
      () =>
        mergeLastGoodRecords(
          [host("duplicate"), host("duplicate")],
          new Map(),
          new Map(),
        ),
      /duplicate machine host id/u,
    );
  });
});

describe("dashboard construction", () => {
  it("sorts by health then case-insensitive name and keeps stale health", () => {
    const hosts = [
      host("offline", { name: "Zulu", status: "disconnected" }),
      host("unavailable", { name: "Echo" }),
      host("healthy-b", { name: "beta" }),
      host("attention", { name: "Delta" }),
      host("critical", { name: "Charlie" }),
      host("healthy-a", { name: "Alpha" }),
    ];
    const records = new Map<string, LastGoodMachineRecord>([
      ["offline", record(snapshot())],
      ["unavailable", record(snapshot(), { error: "timed out" })],
      ["healthy-b", record(snapshot({ sampledAtMs: 1_000 }))],
      ["healthy-a", record(snapshot())],
      ["attention", record(snapshot({ memoryPercent: 85 }))],
      ["critical", record(snapshot({ diskPercent: 95 }))],
    ]);

    const dashboard = buildDashboard(hosts, records, 10_000, 1_000);
    assert.deepEqual(
      dashboard.machines.map((machine) => [
        machine.host.id,
        machine.health,
        machine.sampleState,
      ]),
      [
        ["critical", "critical", "fresh"],
        ["attention", "attention", "fresh"],
        ["healthy-a", "healthy", "fresh"],
        ["healthy-b", "healthy", "stale"],
        ["unavailable", "unavailable", "error"],
        ["offline", "offline", "offline"],
      ],
    );
    assert.equal(dashboard.machines[3]?.snapshot?.sampledAtMs, 1_000);
    assert.equal(dashboard.generatedAtMs, 10_000);
    assert.deepEqual(dashboard.thresholds, {
      attentionPercent: 85,
      criticalPercent: 95,
    });
  });

  it("exposes custom thresholds and classifies every machine with them", () => {
    const dashboard = buildDashboard(
      [host("custom")],
      new Map([
        ["custom", record(snapshot({ memoryPercent: 75, diskPercent: 91 }))],
      ]),
      10_000,
      1_000,
      { attentionPercent: 70, criticalPercent: 90 },
    );
    assert.deepEqual(dashboard.thresholds, {
      attentionPercent: 70,
      criticalPercent: 90,
    });
    assert.equal(dashboard.machines[0]?.health, "critical");
    assert.equal(dashboard.machines[0]?.alert?.metric, "disk");
  });

  it("represents a connected machine without a sample as sampling/unavailable", () => {
    const machine = buildDashboard(
      [host("new")],
      new Map(),
      10_000,
      1_000,
    ).machines[0];
    assert.equal(machine?.sampleState, "sampling");
    assert.equal(machine?.health, "unavailable");
    assert.equal(machine?.snapshot, null);
  });
});
