import assert from "node:assert/strict";
import test from "node:test";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "./server.ts";

test("only the selected universal Control thread can send bounded UI commands", async () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "agent-canvas", sdk: {
    threads: { get: async () => makeThreadResponse({ id: "control" }), updatePluginMetadata: async () => ({}) },
  } });
  await plugin(bb);
  try {
    await harness.behavior.callRpc("selectControl", { threadId: "control" });
    await assert.rejects(harness.behavior.callAgentTool("agent_canvas_control", { action: "fit" }, { threadId: "other" }));
    const unavailable = await harness.behavior.callAgentTool("agent_canvas_control", { action: "fit" }, { threadId: "control" });
    assert.match(String(unavailable), /No mounted/);
    await harness.behavior.callRpc("presence", {
      clientId: "canvas-a", workspaceId: null, focusedThreadId: null, zoom: 1, visible: true,
    });
    const pending = harness.behavior.callAgentTool("agent_canvas_control", { action: "zoom", value: .8 }, { threadId: "control" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const signal = harness.realtimeSignals.find((item) => item.channel === "ui-command");
    assert.ok(signal);
    const { requestId } = signal.payload as { requestId: string };
    const rejected = await harness.behavior.callRpc("acknowledge", { clientId: "wrong", requestId, applied: true, detail: "wrong client" });
    assert.deepEqual(rejected, { ok: false });
    await harness.behavior.callRpc("acknowledge", { clientId: "canvas-a", requestId, applied: true, detail: "Zoom updated." });
    assert.equal(await pending, "Zoom updated.");
    assert.equal(harness.inspection.sdk.callsTo("threads.spawn").length, 0);
  } finally { await harness.lifecycle.dispose(); }
});

test("capture rejects browser ownership from a different host", async () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "agent-canvas", sdk: {
    threads: { get: async () => makeThreadResponse({ id: "owner", environmentId: "env" }) },
    environments: { get: async () => ({ hostId: "expected-host" }) },
  } });
  await plugin(bb);
  try {
    await assert.rejects(harness.behavior.callRpc("captureBrowser", {
      threadId: "owner", hostId: "other-host", tabId: "tab", instanceId: "instance", generation: "generation",
    }));
    assert.equal(harness.inspection.sdk.callsTo("experimental_desktopBrowsers.captureTab").length, 0);
  } finally { await harness.lifecycle.dispose(); }
});
