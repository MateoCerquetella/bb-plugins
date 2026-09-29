import assert from "node:assert/strict";
import test from "node:test";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { dashboardSchema, type MachineSnapshot } from "../contract.ts";
import plugin from "../server.ts";

type HostRecord = Awaited<
  ReturnType<BbPluginApi["sdk"]["hosts"]["list"]>
>[number];

function hostRecord(
  id: string,
  name: string,
  status: HostRecord["status"] = "connected",
): HostRecord {
  return {
    id,
    name,
    type: "persistent",
    status,
    maxPermissionMode: "full",
    lastSeenAt: Date.now(),
    lastRejectedProtocolVersion: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

function capacity(usagePercent: number, totalBytes = 16 * 1024 ** 3) {
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
    cpuPercent?: number;
    memoryPercent?: number;
    sampledAtMs?: number;
  } = {},
): MachineSnapshot {
  const sampledAtMs = overrides.sampledAtMs ?? Date.now();
  return {
    sampledAtMs,
    durationMs: 300,
    system: {
      hostname: "fixture-host",
      osName: "Fixture Linux",
      platform: "linux",
      arch: "x86_64",
      kernelRelease: "6.12.0",
      kernelVersion: "fixture",
      uptimeSeconds: 3_600,
      bootedAtMs: sampledAtMs - 3_600_000,
    },
    network: {
      primaryIpAddress: "192.0.2.20",
      receiveBytesPerSecond: 8_192,
      sendBytesPerSecond: 2_048,
    },
    cpu: {
      model: "Fixture CPU",
      logicalCores: 8,
      usagePercent: overrides.cpuPercent ?? 25,
      loadAverage: [0.5, 0.4, 0.3],
    },
    memory: capacity(overrides.memoryPercent ?? 50),
    swap: capacity(20, 4 * 1024 ** 3),
    disk: { path: "/", ...capacity(45, 256 * 1024 ** 3) },
    issues: [],
  };
}

test("refresh fans out only to connected hosts and isolates one failure", async (t) => {
  const machines = [
    hostRecord("host-alpha", "Alpha"),
    hostRecord("host-bravo", "Bravo"),
    hostRecord("host-charlie", "Charlie", "disconnected"),
  ];
  const fake = createFakePluginHost({
    pluginId: "host-monitor",
    sdk: { hosts: { list: async () => machines } },
    experimental_callHostRpc: ({ hostId }) => {
      if (hostId === "host-bravo") throw new Error("fixture host failure");
      return snapshot();
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const result = dashboardSchema.parse(
    await fake.harness.behavior.callRpc("refresh", { hostId: null }),
  );

  assert.deepEqual(
    fake.harness.inspection.experimental_hostRpcCalls.map((call) => call.hostId),
    ["host-alpha", "host-bravo"],
  );
  assert.deepEqual(
    result.machines.map((machine) => [
      machine.host.id,
      machine.health,
      machine.sampleState,
      machine.snapshot !== null,
    ]),
    [
      ["host-alpha", "healthy", "fresh", true],
      ["host-bravo", "unavailable", "error", false],
      ["host-charlie", "offline", "offline", false],
    ],
  );
  const projectedHost = result.machines.find(
    (machine) => machine.host.id === "host-alpha",
  )?.host;
  assert.ok(projectedHost);
  assert.deepEqual(Object.keys(projectedHost).sort(), [
    "id",
    "lastSeenAt",
    "name",
    "status",
  ]);
  const projectedNetwork = result.machines.find(
    (machine) => machine.host.id === "host-alpha",
  )?.snapshot?.network;
  assert.deepEqual(projectedNetwork, {
    primaryIpAddress: "192.0.2.20",
    receiveBytesPerSecond: 8_192,
    sendBytesPerSecond: 2_048,
  });
  assert.deepEqual(Object.keys(projectedNetwork ?? {}).sort(), [
    "primaryIpAddress",
    "receiveBytesPerSecond",
    "sendBytesPerSecond",
  ]);
  assert.equal(fake.harness.inspection.realtimeSignals.at(-1)?.channel, "machines-changed");
});

test("CLI exposes the bounded cached dashboard used by Touch Bar", async (t) => {
  const fake = createFakePluginHost({
    pluginId: "host-monitor",
    sdk: { hosts: { list: async () => [hostRecord("host-alpha", "Alpha")] } },
    experimental_callHostRpc: () => snapshot({ cpuPercent: 31, memoryPercent: 62 }),
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const result = await fake.harness.behavior.runCli(["snapshot"]);
  assert.equal(result.exitCode, 0);
  const parsed = JSON.parse(result.stdout ?? "") as {
    schemaVersion: number;
    thresholds: { attentionPercent: number; criticalPercent: number };
    hosts: Array<Record<string, unknown>>;
  };
  assert.equal(parsed.schemaVersion, 1);
  assert.deepEqual(parsed.thresholds, {
    attentionPercent: 85,
    criticalPercent: 95,
  });
  assert.deepEqual(parsed.hosts, [
    {
      id: "host-alpha",
      name: "Alpha",
      status: "connected",
      sampleState: "fresh",
      cpuPercent: 31,
      memoryPercent: 62,
      diskPercent: 45,
      receiveBytesPerSecond: 8_192,
      sendBytesPerSecond: 2_048,
    },
  ]);
});

test("CLI open request is claimed exactly once by the desktop app", async (t) => {
  const fake = createFakePluginHost({ pluginId: "host-monitor" });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const requested = await fake.harness.behavior.runCli(["open"]);
  assert.equal(requested.exitCode, 0);
  assert.deepEqual(
    await fake.harness.behavior.callRpc("claimNativeOpen", null),
    { open: true, hostId: null },
  );
  assert.deepEqual(
    await fake.harness.behavior.callRpc("claimNativeOpen", null),
    { open: false, hostId: null },
  );
});

test("CLI opens one validated enrolled host and rejects unknown ids", async (t) => {
  const fake = createFakePluginHost({
    pluginId: "host-monitor",
    sdk: { hosts: { list: async () => [hostRecord("host-alpha", "Alpha")] } },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const requested = await fake.harness.behavior.runCli(["open", "host-alpha"]);
  assert.equal(requested.exitCode, 0);
  assert.deepEqual(
    await fake.harness.behavior.callRpc("claimNativeOpen", null),
    { open: true, hostId: "host-alpha" },
  );

  const unknown = await fake.harness.behavior.runCli(["open", "missing"]);
  assert.equal(unknown.exitCode, 1);
  assert.match(unknown.stderr ?? "", /Unknown enrolled host/u);
});

test("a failed refresh preserves the last good reading", async (t) => {
  let shouldFail = false;
  const fake = createFakePluginHost({
    pluginId: "host-monitor",
    sdk: {
      hosts: { list: async () => [hostRecord("host-alpha", "Alpha")] },
    },
    experimental_callHostRpc: () => {
      if (shouldFail) throw new Error("fixture disconnect");
      return snapshot({ sampledAtMs: Date.now() });
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const first = dashboardSchema.parse(
    await fake.harness.behavior.callRpc("refresh", { hostId: null }),
  );
  const lastGood = first.machines[0]?.snapshot;
  assert.ok(lastGood);

  shouldFail = true;
  const second = dashboardSchema.parse(
    await fake.harness.behavior.callRpc("refresh", { hostId: null }),
  );
  assert.deepEqual(second.machines[0]?.snapshot, lastGood);
  assert.equal(second.machines[0]?.sampleState, "error");
  assert.equal(second.machines[0]?.health, "unavailable");
});

test("CPU health uses configurable thresholds after three high samples", async (t) => {
  const fake = createFakePluginHost({
    pluginId: "host-monitor",
    settings: {
      attentionThresholdPercent: "60",
      criticalThresholdPercent: "70",
    },
    sdk: {
      hosts: { list: async () => [hostRecord("host-alpha", "Alpha")] },
    },
    experimental_callHostRpc: () => snapshot({ cpuPercent: 71 }),
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  for (let sampleIndex = 0; sampleIndex < 2; sampleIndex += 1) {
    const result = dashboardSchema.parse(
      await fake.harness.behavior.callRpc("refresh", { hostId: null }),
    );
    assert.equal(result.machines[0]?.health, "healthy");
  }
  const sustained = dashboardSchema.parse(
    await fake.harness.behavior.callRpc("refresh", { hostId: null }),
  );
  assert.equal(sustained.machines[0]?.health, "critical");
  assert.equal(sustained.machines[0]?.alert?.metric, "cpu");

  await fake.harness.behavior.setSettings({
    attentionThresholdPercent: "80",
    criticalThresholdPercent: "90",
  });
  const reset = dashboardSchema.parse(
    await fake.harness.behavior.callRpc("dashboard", null),
  );
  assert.equal(reset.machines[0]?.health, "healthy");
});

test("threshold settings keep the toggle key and expose effective percentages", async (t) => {
  const fake = createFakePluginHost({ pluginId: "host-monitor" });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  assert.deepEqual(
    fake.harness.inspection.registrations.settingsDescriptors,
    {
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
    },
  );

  assert.deepEqual(
    await fake.harness.behavior.callRpc("getPreferences", null),
    {
      sidebarThresholdColors: true,
      thresholds: { attentionPercent: 85, criticalPercent: 95 },
    },
  );

  await fake.harness.behavior.setSettings({
    sidebarThresholdColors: false,
    attentionThresholdPercent: "70",
    criticalThresholdPercent: "90",
  });
  assert.deepEqual(
    await fake.harness.behavior.callRpc("getPreferences", null),
    {
      sidebarThresholdColors: false,
      thresholds: { attentionPercent: 70, criticalPercent: 90 },
    },
  );
  assert.equal(
    fake.harness.inspection.realtimeSignals.at(-1)?.channel,
    "machines-changed",
  );

  await fake.harness.behavior.setSettings({
    attentionThresholdPercent: "99",
    criticalThresholdPercent: "80",
  });
  assert.deepEqual(
    await fake.harness.behavior.callRpc("getPreferences", null),
    {
      sidebarThresholdColors: false,
      thresholds: { attentionPercent: 85, criticalPercent: 95 },
    },
  );
});

test("settings changes immediately recompute dashboard health", async (t) => {
  const fake = createFakePluginHost({
    pluginId: "host-monitor",
    settings: {
      attentionThresholdPercent: "40",
      criticalThresholdPercent: "60",
    },
    sdk: {
      hosts: { list: async () => [hostRecord("host-alpha", "Alpha")] },
    },
    experimental_callHostRpc: () => snapshot({ memoryPercent: 65 }),
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const first = dashboardSchema.parse(
    await fake.harness.behavior.callRpc("refresh", { hostId: null }),
  );
  assert.deepEqual(first.thresholds, {
    attentionPercent: 40,
    criticalPercent: 60,
  });
  assert.equal(first.machines[0]?.health, "critical");

  await fake.harness.behavior.setSettings({
    attentionThresholdPercent: "70",
    criticalThresholdPercent: "90",
  });
  const updated = dashboardSchema.parse(
    await fake.harness.behavior.callRpc("dashboard", null),
  );
  assert.deepEqual(updated.thresholds, {
    attentionPercent: 70,
    criticalPercent: 90,
  });
  assert.equal(updated.machines[0]?.health, "healthy");
});

test("sends no extra volume paths by default", async (t) => {
  const fake = createFakePluginHost({
    pluginId: "host-monitor",
    sdk: { hosts: { list: async () => [hostRecord("host-alpha", "Alpha")] } },
    experimental_callHostRpc: () => snapshot(),
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  await fake.harness.behavior.callRpc("refresh", { hostId: null });
  assert.deepEqual(
    fake.harness.inspection.experimental_hostRpcCalls.map((call) => call.input),
    [{ cpuSampleMs: 300 }],
  );
});

test("samples configured extra volumes and alerts on their threshold", async (t) => {
  const volume = "/mnt/HC_Volume_106978058";
  const fake = createFakePluginHost({
    pluginId: "host-monitor",
    sdk: { hosts: { list: async () => [hostRecord("host-alpha", "Alpha")] } },
    experimental_callHostRpc: ({ input }) => ({
      ...snapshot(),
      extraDisks: ((input as { extraDiskPaths?: string[] }).extraDiskPaths ?? [])
        .map((path) => ({ path, capacity: capacity(96, 100 * 1024 ** 3) })),
    }),
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  await fake.harness.behavior.setSettings({
    extraDiskPaths: `${volume}\nnot-absolute\n`,
  });
  const result = dashboardSchema.parse(
    await fake.harness.behavior.callRpc("refresh", { hostId: null }),
  );

  assert.deepEqual(
    fake.harness.inspection.experimental_hostRpcCalls.at(-1)?.input,
    { cpuSampleMs: 300, extraDiskPaths: [volume] },
  );
  assert.equal(result.machines[0]?.health, "critical");
  assert.equal(result.machines[0]?.alert?.metric, "disk");
  assert.match(result.machines[0]?.alert?.message ?? "", /HC_Volume_106978058/u);
});
