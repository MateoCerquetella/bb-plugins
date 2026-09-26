import assert from "node:assert/strict";
import test from "node:test";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import plugin, { rpcContract } from "../server.ts";

function harness(events: unknown[] = []) {
  const storage = new Map<string, unknown>();
  let handlers: Record<string, (args: any) => Promise<any>> = {};
  const api = {
    settings: { define: (schema: Record<string, { default: unknown }>) => ({
      get: async () => Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value.default])),
    }) },
    storage: { kv: {
      get: async (key: string) => storage.get(key),
      set: async (key: string, value: unknown) => { storage.set(key, value); },
      list: async () => [...storage.keys()],
    } },
    rpc: { register: (_contract: unknown, value: typeof handlers) => { handlers = value; } },
    sdk: { threads: {
      get: async () => ({ providerId: "pi" }),
      events: { list: async () => events },
    } },
  };
  plugin(api as unknown as BbPluginApi);
  return { handlers, storage };
}

test("custom colors persist independently for arbitrary model IDs", async () => {
  const { handlers, storage } = harness();
  await Promise.all([
    handlers.colors!({ model: "anthropic/Claude-Opus", color: "#123456" }),
    handlers.colors!({ model: "deepseek/v4", color: "#abcdef" }),
  ]);
  assert.deepEqual(await handlers.colors!({}), {
    "anthropic/claude-opus": "#123456", "deepseek/v4": "#abcdef",
  });
  assert.equal(storage.size, 2);
});

test("invalid colors and blank model IDs are rejected at the RPC boundary", () => {
  assert.equal(rpcContract.colors.input.safeParse({ model: " ", color: "#abcdef" }).success, false);
  assert.equal(rpcContract.colors.input.safeParse({ model: "opus", color: "url(example)" }).success, false);
});

test("manual model changes have no Jev switch history; polling never writes chat events", async () => {
  const { handlers, storage } = harness([
    { createdAt: 20, data: { providerId: "pi", execution: { model: "deepseek/v4" } } },
    { createdAt: 10, data: { providerId: "pi", execution: { model: "claude-opus" } } },
  ]);
  const first = await handlers.latest!({ threadId: "thr_test" });
  const second = await handlers.latest!({ threadId: "thr_test" });
  assert.equal(first.execution.model, "deepseek/v4");
  assert.equal(first.execution.reasoningLevel, "");
  assert.equal(first.switches.length, 0);
  assert.deepEqual(first.switches, second.switches);
  assert.equal(storage.size, 0);
});
