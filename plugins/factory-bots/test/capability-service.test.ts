import assert from "node:assert/strict";
import test from "node:test";

import { CapabilityService } from "../lib/capability-service.js";

const CAPABILITIES = {
  bots: [
    { bot: "orchestrator", enabled: true },
    { bot: "lens", enabled: false },
  ],
  enabled: ["orchestrator"],
  disabled: ["lens"],
};

const AUDIT = {
  entries: [
    {
      at: "2026-11-03T20:00:00.000Z",
      bot: "lens",
      enabled: false,
      previous: true,
      author: "Mateo",
      digest: "sha256:abc",
    },
  ],
};

function caller(handler: (name: string, args: Record<string, unknown>) => unknown) {
  return {
    async callTool(name: string, args: Record<string, unknown> = {}) {
      return { isError: false, text: JSON.stringify(handler(name, args)) };
    },
  };
}

test("reads the live capability partition", async () => {
  const service = new CapabilityService({
    caller: caller(() => CAPABILITIES),
    startCommand: null,
  });
  const result = await service.getCapabilities();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.capabilities.disabled, ["lens"]);
});

test("sets one capability and returns the recorded author", async () => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const service = new CapabilityService({
    caller: caller((name, args) => {
      calls.push([name, args]);
      return {
        bot: "lens",
        enabled: true,
        previous: false,
        author: "Mateo",
        capabilities: {
          enabled: ["orchestrator", "lens"],
          disabled: [],
        },
      };
    }),
    startCommand: null,
  });
  const result = await service.setCapability("lens", true);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.author, "Mateo");
  assert.equal(result.previous, false);
  assert.deepEqual(calls, [["factory_capability_set", { bot: "lens", enabled: true }]]);
});

test("returns the capability audit and keeps failures explicit", async () => {
  const service = new CapabilityService({
    caller: caller((name) => (name === "factory_capability_audit" ? AUDIT : {})),
    startCommand: null,
  });
  const result = await service.getCapabilityAudit();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.entries[0]?.author, "Mateo");

  const offline = new CapabilityService({
    caller: {
      async callTool() {
        return { isError: true, text: "fetch failed" };
      },
    },
    startCommand: "node dist/main.js up",
  });
  const failed = await offline.getCapabilities();
  assert.equal(failed.ok, false);
  if (failed.ok) return;
  assert.equal(failed.reason, "not-running");
  assert.equal(failed.startCommand, "node dist/main.js up");
});
