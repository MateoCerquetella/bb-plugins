import assert from "node:assert/strict";
import test from "node:test";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";

import { machineSnapshotSchema } from "../contract.ts";
import hostEntry from "../host.ts";

test("host worker returns bounded telemetry without IP or process fields", async (t) => {
  const harness = experimental_createHostEntryHarness(hostEntry);
  t.after(() => harness.experimental_dispose());
  const result = machineSnapshotSchema.parse(
    await harness.experimental_call("snapshot", { cpuSampleMs: 100 }),
  );
  assert.ok(result.cpu.logicalCores > 0);
  assert.ok(result.memory.totalBytes > 0);
  assert.deepEqual(Object.keys(result.network).sort(), [
    "receiveBytesPerSecond",
    "sendBytesPerSecond",
  ]);
  assert.equal("processes" in result, false);
});
