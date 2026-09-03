import assert from "node:assert/strict";
import test from "node:test";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";

import plugin from "../server.ts";
import type { HostMonitorSnapshot } from "../rpc-contract.ts";

test("registers bounded local services, settings, and snapshot RPC", async (t) => {
  const fake = createFakePluginHost({ pluginId: "host-monitor" });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const registrations = fake.harness.inspection.registrations;
  assert.deepEqual(
    registrations.services.map((service) => service.name).sort(),
    ["host-monitor-core", "host-monitor-directories", "host-monitor-memory-pressure"],
  );
  assert.equal(registrations.settingsDescriptors.cpuWarningPercent?.default, "90");
  assert.equal(registrations.settingsDescriptors.ramWarningPercent?.default, "90");
  assert.equal(registrations.settingsDescriptors.diskWarningPercent?.default, "90");
  assert.equal(registrations.settingsDescriptors.showProcessDetails?.default, false);

  const snapshot = await fake.harness.behavior.callRpc("snapshot", { rangeHours: 24 }) as HostMonitorSnapshot;
  assert.equal(snapshot.hostName.length > 0, true);
  assert.deepEqual(snapshot.samples, []);
  assert.deepEqual(snapshot.collectorErrors, []);
  assert.equal(snapshot.processDetailsEnabled, false);
});
