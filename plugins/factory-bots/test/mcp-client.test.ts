import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { FactoryMcpClient } from "../lib/mcp-client.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/fake-mcp.mjs", import.meta.url));

function client(
  mode = "ok",
  timeoutMs = 5_000,
  extraEnv: Record<string, string> = {},
): FactoryMcpClient {
  return new FactoryMcpClient(
    {
      command: process.execPath,
      args: [FIXTURE],
      env: { FAKE_MCP_MODE: mode, ...extraEnv },
    },
    { timeoutMs },
  );
}

function marker(): string {
  return join(mkdtempSync(join(tmpdir(), "factory-bots-mcp-")), "hung");
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function parse(text: string): unknown {
  return JSON.parse(text) as unknown;
}

test("speaks the MCP handshake and reads the status tool", async () => {
  const mcp = client();
  try {
    const result = await mcp.callTool("factory_status");
    assert.equal(result.isError, false);
    const payload = parse(result.text) as { bots: Record<string, number> };
    assert.equal(payload.bots.sieve, 7);
  } finally {
    mcp.dispose();
  }
});

test("passes tool arguments and returns ticket JSON", async () => {
  const mcp = client();
  try {
    const result = await mcp.callTool("factory_ticket", { linearId: "FB-2" });
    assert.equal(result.isError, false);
    const payload = parse(result.text) as { linearId: string; worktree: string };
    assert.equal(payload.linearId, "FB-2");
    assert.match(payload.worktree, /fb-2/);
  } finally {
    mcp.dispose();
  }
});

test("surfaces fetch failed as an error answer, not a throw", async () => {
  const mcp = client("not-running");
  try {
    const result = await mcp.callTool("factory_status");
    assert.equal(result.isError, true);
    assert.equal(result.text, "fetch failed");
  } finally {
    mcp.dispose();
  }
});

test("surfaces an unknown tool as an error answer", async () => {
  const mcp = client();
  try {
    const result = await mcp.callTool("factory_not_a_tool", {});
    assert.equal(result.isError, true);
    assert.match(result.text, /Unknown tool/);
  } finally {
    mcp.dispose();
  }
});

test("the child gets a minimal environment plus the configured env", async () => {
  const previous = process.env.FACTORY_TEST_SENTINEL;
  process.env.FACTORY_TEST_SENTINEL = "should-not-reach-the-child";
  const mcp = client();
  try {
    const result = await mcp.callTool("debug_env");
    assert.equal(result.isError, false);
    const env = parse(result.text) as {
      sentinel: string | null;
      path: string | null;
      mode: string | null;
    };
    assert.equal(env.sentinel, null);
    assert.notEqual(env.path, null);
    assert.equal(env.mode, "ok");
  } finally {
    mcp.dispose();
    if (previous === undefined) delete process.env.FACTORY_TEST_SENTINEL;
    else process.env.FACTORY_TEST_SENTINEL = previous;
  }
});

test("concurrent first calls wait for the initialize handshake", async () => {
  const mcp = client("slow-init");
  try {
    const [status, tickets] = await Promise.all([
      mcp.callTool("factory_status"),
      mcp.callTool("factory_tickets"),
    ]);
    assert.equal(status.isError, false);
    assert.equal(tickets.isError, false);
    assert.match(tickets.text, /FB-2/);
  } finally {
    mcp.dispose();
  }
});

test("a timeout replaces the child and the next call recovers", async () => {
  const mcp = client("hang-once", 300, { FAKE_MCP_HANG_FILE: marker() });
  try {
    await assert.rejects(
      () => mcp.callTool("factory_status"),
      /did not answer tool factory_status within 300ms/,
    );
    const result = await mcp.callTool("factory_status");
    assert.equal(result.isError, false);
  } finally {
    mcp.dispose();
  }
});

test("an exited child is replaced on the next call", async () => {
  const mcp = client();
  try {
    const first = await mcp.callTool("factory_status");
    assert.equal(first.isError, false);
    const pid = mcp.childPid;
    assert.notEqual(pid, null);
    process.kill(pid!, "SIGKILL");
    for (let attempt = 0; attempt < 50 && mcp.childPid !== null; attempt += 1) {
      await sleep(20);
    }
    assert.equal(mcp.childPid, null);
    const again = await mcp.callTool("factory_status");
    assert.equal(again.isError, false);
    assert.notEqual(mcp.childPid, pid);
  } finally {
    mcp.dispose();
  }
});

test("dispose rejects later calls and clears the child", async () => {
  const mcp = client();
  const first = await mcp.callTool("factory_status");
  assert.equal(first.isError, false);
  const pid = mcp.childPid;
  assert.notEqual(pid, null);
  mcp.dispose();
  assert.equal(mcp.childPid, null);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      process.kill(pid!, 0);
      await sleep(20);
    } catch {
      return;
    }
  }
  assert.fail("the MCP child was still alive after dispose");
});

test("dispose rejects a call that is still in flight", async () => {
  const mcp = client("hang-once", 5_000, { FAKE_MCP_HANG_FILE: marker() });
  const pending = mcp.callTool("factory_status");
  await sleep(150);
  mcp.dispose();
  await assert.rejects(pending, /disposed|replaced|exited|stdin failed/);
  assert.equal(mcp.childPid, null);
});
