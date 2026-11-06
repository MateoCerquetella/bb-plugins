import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import type { BoardResult, FactoryPathStatus } from "../contract.ts";
import plugin from "../server.ts";

const FIXTURE = fileURLToPath(new URL("./fixtures/fake-checkout-mcp.mjs", import.meta.url));

/** A checkout whose dist/main.js answers with its own path, like the factory. */
async function checkout(root: string, name: string): Promise<string> {
  const path = join(root, name);
  await mkdir(join(path, "dist"), { recursive: true });
  await copyFile(FIXTURE, join(path, "dist", "main.js"));
  return path;
}

async function settle<T>(read: () => Promise<T>, matches: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const value = await read();
    if (matches(value)) return value;
    if (Date.now() > deadline) throw new Error("The Factory connection did not settle.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test("the Factory checkout setting switches the live connection, keeps it on an invalid path, and resets", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "factory-bots-server-"));
  const bundled = await checkout(root, "bundled");
  const chosen = await checkout(root, "chosen");
  const configPath = join(root, "factory.mcp.json");
  await writeFile(configPath, JSON.stringify({
    command: process.execPath,
    args: [join(bundled, "dist", "main.js"), "mcp"],
    env: { FACTORY_URL: "http://127.0.0.1:8080" },
  }));

  const previousConfigEnv = process.env.FACTORY_BOTS_MCP_CONFIG;
  process.env.FACTORY_BOTS_MCP_CONFIG = configPath;
  const fake = createFakePluginHost({ pluginId: "factory-bots" });
  t.after(async () => {
    await fake.harness.lifecycle.dispose();
    if (previousConfigEnv === undefined) delete process.env.FACTORY_BOTS_MCP_CONFIG;
    else process.env.FACTORY_BOTS_MCP_CONFIG = previousConfigEnv;
    await rm(root, { recursive: true, force: true });
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

  const status = async (): Promise<FactoryPathStatus> =>
    (await fake.harness.behavior.callRpc("getFactoryPathStatus", null)) as FactoryPathStatus;
  /** The board names the checkout that actually answered the MCP call. */
  const liveCheckout = async (): Promise<string | null> => {
    const board = (await fake.harness.behavior.callRpc("getBoard", null)) as BoardResult;
    return board.ok ? board.agents[0]?.conversationId ?? null : null;
  };

  assert.equal(await liveCheckout(), bundled);
  assert.equal((await status()).entryPoint, join(bundled, "dist", "main.js"));

  await fake.harness.behavior.setSettings({ factoryCheckoutPath: chosen });
  await settle(status, (value) => value.entryPoint === join(chosen, "dist", "main.js"));
  assert.equal(await liveCheckout(), chosen);
  await settle(
    () => readFile(join(bundled, "lifetime.txt"), "utf8"),
    (value) => value === "stopped",
  );

  await fake.harness.behavior.setSettings({ factoryCheckoutPath: join(root, "missing") });
  const rejected = await settle(status, (value) => value.error !== null);
  assert.match(rejected.error ?? "", /No readable Factory MCP script/);
  assert.equal(rejected.entryPoint, join(chosen, "dist", "main.js"));
  assert.equal(await liveCheckout(), chosen);

  await fake.harness.behavior.setSettings({ factoryCheckoutPath: "" });
  await settle(status, (value) => value.entryPoint === join(bundled, "dist", "main.js"));
  assert.equal(await liveCheckout(), bundled);
});
