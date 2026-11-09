import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import type { BoardResult, Factory, SaveFactoryResult } from "../contract.ts";
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
    const value = await read().catch(() => undefined as T);
    if (value !== undefined && matches(value)) return value;
    if (Date.now() > deadline) throw new Error("The Factory connection did not settle.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test("each factory reads its own checkout; edits and removals retire the old child", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "factory-bots-server-"));
  const bundled = await checkout(root, "bundled");
  const alpha = await checkout(root, "alpha");
  const beta = await checkout(root, "beta");
  const gamma = await checkout(root, "gamma");
  const configPath = join(root, "factory.mcp.json");
  await writeFile(configPath, JSON.stringify({
    command: process.execPath,
    args: [join(bundled, "dist", "main.js"), "mcp"],
    env: { FACTORY_URL: "http://127.0.0.1:9191" },
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
  const call = fake.harness.behavior.callRpc;

  await plugin(fake.bb);
  assert.deepEqual(fake.harness.inspection.registrations.settingsDescriptors, {});
  const seeded = [{ id: "local", name: "Local", url: "http://127.0.0.1:9191", checkoutPath: "" }];
  assert.deepEqual(await call("listFactories", null), { factories: seeded });
  assert.deepEqual(await fake.bb.storage.kv.get("factories:v1"), seeded);

  const save = async (input: Record<string, unknown>) => (await call("saveFactory", input)) as SaveFactoryResult;
  assert.deepEqual(await save({ name: "Alpha", url: "http://10.0.0.1:8080", checkoutPath: alpha }), {
    ok: true,
    factory: { id: "alpha", name: "Alpha", url: "http://10.0.0.1:8080", checkoutPath: alpha },
  });
  assert.deepEqual(await save({ name: "Alpha", url: "http://10.0.0.2:8080", checkoutPath: beta }), {
    ok: true,
    factory: { id: "alpha-2", name: "Alpha", url: "http://10.0.0.2:8080", checkoutPath: beta },
  });
  const rejected = await save({ name: "Missing", url: "http://10.0.0.3:8080", checkoutPath: join(root, "missing") });
  assert.equal(rejected.ok, false);
  assert.match(rejected.ok ? "" : rejected.message, /No readable Factory MCP script/);
  const ids = async () =>
    ((await call("listFactories", null)) as { factories: Factory[] }).factories.map((entry) => entry.id);
  assert.deepEqual(await ids(), ["local", "alpha", "alpha-2"]);
  assert.equal(
    fake.harness.inspection.realtimeSignals.filter((signal) => signal.channel === "factory-bots:factories").length,
    2,
  );

  /** The board names the checkout that actually answered the MCP call. */
  const liveCheckout = async (factoryId: string): Promise<string | null> => {
    const board = (await call("getBoard", { factoryId })) as BoardResult;
    return board.ok ? board.agents[0]?.conversationId ?? null : null;
  };
  const [first, second] = await Promise.all([liveCheckout("alpha-2"), liveCheckout("alpha-2")]);
  assert.equal(first, beta);
  assert.equal(second, beta);
  assert.equal(await readFile(join(beta, "spawns.log"), "utf8"), "spawn\n");
  assert.equal(await liveCheckout("local"), bundled);
  assert.equal(await liveCheckout("alpha"), alpha);

  await assert.rejects(call("getBoard", { factoryId: "nope" }), /Unknown factory nope/);

  assert.equal(
    (await save({ id: "alpha-2", name: "Beta", url: "http://10.0.0.2:8080", checkoutPath: gamma })).ok,
    true,
  );
  assert.equal(await liveCheckout("alpha-2"), gamma);
  await settle(() => readFile(join(beta, "lifetime.txt"), "utf8"), (value) => value === "stopped");

  assert.deepEqual(await call("removeFactory", { id: "alpha" }), {
    factories: [
      seeded[0],
      { id: "alpha-2", name: "Beta", url: "http://10.0.0.2:8080", checkoutPath: gamma },
    ],
  });
  await settle(() => readFile(join(alpha, "lifetime.txt"), "utf8"), (value) => value === "stopped");
  await assert.rejects(call("getBoard", { factoryId: "alpha" }), /Unknown factory alpha/);

  await call("removeFactory", { id: "local" });
  await assert.rejects(call("removeFactory", { id: "alpha-2" }), /Keep at least one factory/);
  assert.deepEqual(await ids(), ["alpha-2"]);
});
