import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activeLiveTool,
  isGenerating,
  readLiveTools,
} from "../lib/live.js";

test("reads model tools and nested calls in order", () => {
  const tools = readLiveTools({
    tools: [
      { callId: "call-1", name: "harness_status", status: "running", output: "x" },
      { callId: "call-2", name: "read", status: "done" },
    ],
    nestedTools: [
      {
        callId: "call-1/0",
        name: "bash",
        status: "pending",
        parentCallId: "call-1",
      },
    ],
  });
  assert.deepEqual(
    tools.map((tool) => [tool.name, tool.status, tool.nested]),
    [
      ["harness_status", "running", false],
      ["read", "done", false],
      ["bash", "pending", true],
    ],
  );
  assert.equal(tools[0]!.output, "x");
  assert.equal(tools[1]!.output, null);
});

test("the newest running call is the highlighted one", () => {
  const tools = readLiveTools({
    tools: [
      { callId: "a", name: "one", status: "done" },
      { callId: "b", name: "two", status: "running" },
      { callId: "c", name: "three", status: "running" },
    ],
  });
  assert.equal(activeLiveTool(tools)?.callId, "c");
});

test("without a running call the newest pending one is highlighted", () => {
  const tools = readLiveTools({
    tools: [
      { callId: "a", name: "one", status: "pending" },
      { callId: "b", name: "two", status: "done" },
    ],
  });
  assert.equal(activeLiveTool(tools)?.name, "one");
});

test("an empty or malformed live document is safe", () => {
  assert.deepEqual(readLiveTools({}), []);
  assert.deepEqual(readLiveTools(null), []);
  assert.deepEqual(readLiveTools({ tools: "nope" }), []);
  assert.deepEqual(
    readLiveTools({ tools: [{ name: "no-call-id" }] }),
    [],
  );
  assert.equal(activeLiveTool([]), null);
});

test("generation is detected before a tool starts", () => {
  assert.equal(isGenerating({ generation: { attempt: 1 } }), true);
  assert.equal(isGenerating({ run: { taskId: "1", inputs: [] } }), true);
  assert.equal(isGenerating({ tools: [] }), false);
  assert.equal(isGenerating(null), false);
});
