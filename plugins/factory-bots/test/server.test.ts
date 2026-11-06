import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "../server.ts";

async function until<T>(read: () => Promise<T>, matches: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (matches(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Factory path status did not settle.");
}

test("Factory checkout setting switches connections, retains a working path on invalid input, and resets to default", async (t) => {
  const fake = createFakePluginHost({ pluginId: "factory-bots" });
  const checkout = await mkdtemp(join(tmpdir(), "factory-bots-checkout-"));
  await mkdir(join(checkout, "dist"));
  await writeFile(join(checkout, "dist", "main.js"), "");
  t.after(async () => {
    await fake.harness.lifecycle.dispose();
    await rm(checkout, { recursive: true, force: true });
  });

  await plugin(fake.bb);
  assert.deepEqual(fake.harness.inspection.registrations.settingsDescriptors, {
    factoryCheckoutPath: {
      type: "string",
      label: "Factory checkout path",
      description:
        "Absolute path to the Factory checkout containing dist/main.js. Changes apply immediately; leave empty to use the bundled factory.mcp.json default.",
      default: "",
    },
  });

  const readStatus = () => fake.harness.behavior.callRpc("getFactoryPathStatus", null);
  const initial = await readStatus();
  await fake.harness.behavior.setSettings({ factoryCheckoutPath: checkout });
  const switched = await until(readStatus, (status) => status.entryPoint === join(checkout, "dist", "main.js"));
  assert.equal(switched.error, null);

  await fake.harness.behavior.setSettings({ factoryCheckoutPath: "relative/path" });
  const rejected = await until(readStatus, (status) => status.error !== null);
  assert.equal(rejected.configuredPath, "relative/path");
  assert.equal(rejected.entryPoint, switched.entryPoint);

  await fake.harness.behavior.setSettings({ factoryCheckoutPath: "" });
  const reset = await until(readStatus, (status) => status.configuredPath === "" && status.error !== null || status.configuredPath === "" && status.entryPoint === initial.entryPoint);
  assert.equal(reset.entryPoint, initial.entryPoint);
});
