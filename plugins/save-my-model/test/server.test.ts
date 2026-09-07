import test from "node:test";
import assert from "node:assert/strict";
import {
  createFakePluginHost,
  experimental_scanPublicSdkOnly,
} from "@get-bb/plugin-sdk/testing";
import plugin from "../server.ts";

test("lists BB hosts in connected-first order through the public SDK", async () => {
  const { bb, harness } = createFakePluginHost({
    pluginId: "save-my-model",
    sdk: {
      hosts: {
        list: async () => [
          { id: "host-b", name: "Beta", status: "disconnected" },
          { id: "host-a", name: "Alpha", status: "connected" },
        ] as never,
      },
    },
  });
  plugin(bb);
  const result = await harness.behavior.callRpc("listHosts", null) as {
    hosts: Array<{ id: string; name: string; status: string }>;
    error: string | null;
  };
  assert.deepEqual(result, {
    hosts: [
      { id: "host-a", name: "Alpha", status: "connected" },
      { id: "host-b", name: "Beta", status: "disconnected" },
    ],
    error: null,
  });
  await harness.lifecycle.dispose();
});

test("contains host-list failures", async () => {
  const { bb, harness } = createFakePluginHost({
    pluginId: "save-my-model",
    sdk: { hosts: { list: async () => { throw new Error("offline"); } } },
  });
  plugin(bb);
  const result = await harness.behavior.callRpc("listHosts", null) as {
    hosts: unknown[];
    error: string | null;
  };
  assert.deepEqual(result.hosts, []);
  assert.match(result.error ?? "", /offline/u);
  await harness.lifecycle.dispose();
});

test("imports only public SDK and declared package surfaces", () => {
  const result = experimental_scanPublicSdkOnly(
    new URL("..", import.meta.url).pathname,
    { allow: [/^react(?:\/.*)?$/u, /^@testing-library\/react$/u, /^vitest$/u] },
  );
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.privateDependencies, []);
});
