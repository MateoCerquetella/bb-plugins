import assert from "node:assert/strict";
import test from "node:test";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";

import { type Fleet, type MachineSnapshot } from "../contract.ts";
import plugin from "../server.ts";

type HostRecord = Awaited<ReturnType<BbPluginApi["sdk"]["hosts"]["list"]>>[number];

function hostRecord(id: string, name: string, status: HostRecord["status"] = "connected"): HostRecord {
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

function capacity(usagePercent: number) {
  return { totalBytes: 100, usedBytes: usagePercent, availableBytes: 100 - usagePercent, usagePercent };
}

function snapshot(cpuPercent = 25): MachineSnapshot {
  const sampledAtMs = Date.now();
  return {
    sampledAtMs,
    durationMs: 300,
    system: {
      hostname: "fixture",
      osName: "Fixture Linux",
      platform: "linux",
      arch: "x64",
      kernelRelease: "6.0",
      kernelVersion: "fixture",
      uptimeSeconds: 3_600,
      bootedAtMs: sampledAtMs - 3_600_000,
    },
    network: { receiveBytesPerSecond: 8_192, sendBytesPerSecond: 2_048 },
    cpu: { model: "Fixture CPU", logicalCores: 8, usagePercent: cpuPercent, loadAverage: [0.5, 0.4, 0.3] },
    memory: capacity(50),
    swap: null,
    disk: { path: "/", ...capacity(45) },
    issues: [],
  };
}

test("refresh represents every host, samples connected hosts, and isolates failure", async (t) => {
  const machines = [
    hostRecord("host-alpha", "Alpha"),
    hostRecord("host-bravo", "Bravo"),
    hostRecord("host-charlie", "Charlie", "disconnected"),
  ];
  const fake = createFakePluginHost({
    pluginId: "host-monitor",
    sdk: { hosts: { list: async () => machines } },
    experimental_callHostRpc: ({ hostId }) => {
      if (hostId === "host-bravo") throw new Error("fixture failure");
      return snapshot(31);
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const fleet = await fake.harness.behavior.callRpc("refresh", { hostId: null }) as Fleet;
  assert.deepEqual(
    fake.harness.inspection.experimental_hostRpcCalls.map((call) => call.hostId),
    ["host-alpha", "host-bravo"],
  );
  assert.deepEqual(
    fleet.machines.map((machine) => [machine.host.id, machine.sampleState, machine.snapshot !== null]),
    [
      ["host-alpha", "fresh", true],
      ["host-bravo", "error", false],
      ["host-charlie", "offline", false],
    ],
  );
  assert.equal(fleet.connected, 2);
  assert.equal(fleet.total, 3);
  assert.equal("primaryIpAddress" in (fleet.machines[0]?.snapshot?.network ?? {}), false);
  assert.equal(fake.harness.inspection.realtimeSignals.at(-1)?.channel, "host-monitor-machines-changed");
});

test("simultaneous fleet refreshes coalesce host calls", async (t) => {
  let release!: (value: MachineSnapshot) => void;
  const pending = new Promise<MachineSnapshot>((resolve) => { release = resolve; });
  const fake = createFakePluginHost({
    pluginId: "host-monitor",
    sdk: { hosts: { list: async () => [hostRecord("host-alpha", "Alpha")] } },
    experimental_callHostRpc: () => pending,
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const first = fake.harness.behavior.callRpc("refresh", { hostId: null });
  const second = fake.harness.behavior.callRpc("refresh", { hostId: null });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fake.harness.inspection.experimental_hostRpcCalls.length, 1);
  release(snapshot());
  await Promise.all([first, second]);
  assert.equal(fake.harness.inspection.experimental_hostRpcCalls.length, 1);
});

test("sidebar summary lists hosts without starting samples", async (t) => {
  const fake = createFakePluginHost({
    pluginId: "host-monitor",
    sdk: {
      hosts: {
        list: async () => [
          hostRecord("host-alpha", "Alpha"),
          hostRecord("host-bravo", "Bravo", "disconnected"),
        ],
      },
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  assert.deepEqual(await fake.harness.behavior.callRpc("sidebarSummary", null), { connected: 1, total: 2 });
  assert.equal(fake.harness.inspection.experimental_hostRpcCalls.length, 0);
  assert.deepEqual(
    fake.harness.inspection.registrations.services.map((service) => service.name),
    ["machine-sampler"],
  );
});

test("settings are passive in-page threshold guides", async (t) => {
  const fake = createFakePluginHost({ pluginId: "host-monitor" });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);
  const descriptors = fake.harness.inspection.registrations.settingsDescriptors;
  assert.equal(descriptors.cpuWarningPercent?.default, "90");
  assert.equal(descriptors.ramWarningPercent?.default, "90");
  assert.equal(descriptors.diskWarningPercent?.default, "90");
  assert.match(descriptors.cpuWarningPercent?.description ?? "", /not a notification/u);
});
