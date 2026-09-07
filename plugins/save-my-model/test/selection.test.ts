import test from "node:test";
import assert from "node:assert/strict";
import { resolveSupportedSelection, type ExecutionOptions } from "../lib/selection.ts";

const codexOptions: ExecutionOptions = {
  providers: [
    { id: "codex", available: true },
    { id: "claude", available: true },
  ],
  models: [{
    model: "gpt-6",
    isDefault: true,
    defaultReasoningEffort: "medium",
    supportedReasoningEfforts: [
      { reasoningEffort: "medium" },
      { reasoningEffort: "high" },
    ],
  }],
  modelLoadError: null,
};

test("preserves a supported host selection", async () => {
  const calls: unknown[] = [];
  const result = await resolveSupportedSelection({
    async executionOptions(args) { calls.push(args); return codexOptions; },
  }, "host-a", {
    providerId: "codex",
    model: "gpt-6",
    reasoningLevel: "high",
  });
  assert.deepEqual(result.selection, {
    providerId: "codex",
    model: "gpt-6",
    reasoningLevel: "high",
  });
  assert.deepEqual(calls, [{ hostId: "host-a", providerId: "codex" }]);
});

test("falls back from an unavailable provider and obsolete model", async () => {
  const calls: unknown[] = [];
  const result = await resolveSupportedSelection({
    async executionOptions(args) {
      calls.push(args);
      return args.providerId === "claude"
        ? { ...codexOptions, providers: [
            { id: "claude", available: false },
            { id: "codex", available: true },
          ], models: [] }
        : codexOptions;
    },
  }, "host-a", {
    providerId: "claude",
    model: "removed",
    reasoningLevel: "ultra",
  });
  assert.deepEqual(result.selection, {
    providerId: "codex",
    model: "gpt-6",
    reasoningLevel: "medium",
  });
  assert.deepEqual(calls, [
    { hostId: "host-a", providerId: "claude" },
    { hostId: "host-a", providerId: "codex" },
  ]);
});

test("returns bounded unavailable and thrown failure states", async () => {
  const unavailable = await resolveSupportedSelection({
    async executionOptions() {
      return { providers: [{ id: "codex", available: true }], models: [], modelLoadError: { code: "timeout", providerId: "codex" } };
    },
  }, "host-offline", null);
  assert.equal(unavailable.error?.code, "host-unavailable");

  const failed = await resolveSupportedSelection({
    async executionOptions() { throw new Error("x".repeat(500)); },
  }, "host-a", null);
  assert.equal(failed.error?.code, "failed");
  assert.ok((failed.error?.message.length ?? 0) <= 320);
});

test("reports no provider without inventing a selection", async () => {
  const result = await resolveSupportedSelection({
    async executionOptions() { return { providers: [], models: [], modelLoadError: null }; },
  }, "host-a", null);
  assert.equal(result.selection, null);
  assert.equal(result.error?.code, "no-providers");
});
