import assert from "node:assert/strict";
import test from "node:test";

import {
  ALLOWED_TOOLS,
  SoulService,
  extractToolsByBot,
  type ToolCaller,
} from "../lib/soul-service.ts";

interface Call {
  name: string;
  args: Record<string, unknown>;
}

class FakeCaller implements ToolCaller {
  readonly calls: Call[] = [];

  constructor(
    private readonly responses: Record<
      string,
      { isError: boolean; text: string } | (() => { isError: boolean; text: string })
    >,
  ) {}

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<{ isError: boolean; text: string }> {
    this.calls.push({ name, args });
    const response = this.responses[name];
    if (response === undefined) {
      return { isError: true, text: `unexpected tool ${name}` };
    }
    return typeof response === "function" ? response() : response;
  }
}

const souls = {
  souls: [
    { bot: "orchestrator", soul: "# Orchestrator\nRoute work." },
    { bot: "sieve", soul: "# Sieve\nSpecify." },
  ],
};

const audit = {
  entries: [
    {
      at: "2026-03-01T12:00:00Z",
      bot: "sieve",
      author: "Mateo",
      digest: "sha256:abc",
    },
  ],
};

function service(caller: ToolCaller): SoulService {
  return new SoulService({
    caller,
    startCommand: "node factory.js up",
    now: () => 42,
  });
}

test("has exactly the four allowed Factory MCP tools", () => {
  assert.deepEqual([...ALLOWED_TOOLS], [
    "factory_status",
    "factory_souls",
    "factory_soul_set",
    "factory_soul_audit",
  ]);
});

test("reads souls through factory_souls only", async () => {
  const caller = new FakeCaller({
    factory_souls: { isError: false, text: JSON.stringify(souls) },
  });
  const result = await service(caller).getSouls();
  assert.equal(result.ok, true);
  assert.deepEqual(caller.calls, [{ name: "factory_souls", args: {} }]);
  if (result.ok) assert.equal(result.souls[1]?.bot, "sieve");
});

test("returns no tools when factory_status does not report them", async () => {
  const caller = new FakeCaller({
    factory_status: {
      isError: false,
      text: JSON.stringify({
        ok: true,
        bots: { sieve: 7, lens: 19 },
        tickets: 12,
      }),
    },
  });
  const result = await service(caller).getStatus();
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.toolsByBot, null);
});

test("reads optional tool maps from factory_status", async () => {
  const caller = new FakeCaller({
    factory_status: {
      isError: false,
      text: JSON.stringify({
        bots: { sieve: 7 },
        toolsByBot: { sieve: ["Read", "Write"] },
      }),
    },
  });
  const result = await service(caller).getStatus();
  if (!result.ok) throw new Error(result.message);
  assert.deepEqual(result.toolsByBot, { sieve: ["Read", "Write"] });
});

test("derives tools only from a reported bots object", () => {
  assert.deepEqual(
    extractToolsByBot({
      bots: { sieve: { tools: ["Read"] }, helm: 13 },
    }),
    { sieve: ["Read"] },
  );
  assert.equal(
    extractToolsByBot({ bots: { sieve: 7, helm: 13 } }),
    null,
  );
});

test("saves the full soul with a trimmed author and returns the receipt", async () => {
  const caller = new FakeCaller({
    factory_soul_set: {
      isError: false,
      text: JSON.stringify({
        bot: "sieve",
        saved: true,
        author: "Mateo",
        digest: "sha256:stored",
      }),
    },
  });
  const result = await service(caller).saveSoul(
    "sieve",
    "# New soul\n",
    "  Mateo  ",
  );
  assert.equal(result.ok, true);
  assert.deepEqual(caller.calls, [
    {
      name: "factory_soul_set",
      args: { bot: "sieve", soul: "# New soul\n", author: "Mateo" },
    },
  ]);
  if (result.ok) assert.equal(result.digest, "sha256:stored");
});

test("rejects an empty author without calling the MCP", async () => {
  const caller = new FakeCaller({
    factory_soul_set: {
      isError: false,
      text: JSON.stringify({ saved: true }),
    },
  });
  const result = await service(caller).saveSoul("sieve", "soul", "   ");
  assert.equal(result.ok, false);
  assert.equal(caller.calls.length, 0);
  if (!result.ok) assert.match(result.message, /author/i);
});

test("does not retry a failed write and keeps the exact error", async () => {
  const caller = new FakeCaller({
    factory_soul_set: { isError: true, text: "factory refused the soul" },
  });
  const result = await service(caller).saveSoul("sieve", "soul", "Mateo");
  assert.equal(result.ok, false);
  assert.equal(caller.calls.length, 1);
  if (!result.ok) assert.match(result.message, /factory refused/);
});

test("reports a factory as not running and carries the start command", async () => {
  const caller = new FakeCaller({
    factory_souls: { isError: true, text: "fetch failed" },
  });
  const result = await service(caller).getSouls();
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "not-running");
    assert.equal(result.startCommand, "node factory.js up");
  }
});

test("reads the audit trail", async () => {
  const caller = new FakeCaller({
    factory_soul_audit: { isError: false, text: JSON.stringify(audit) },
  });
  const result = await service(caller).getAudit();
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.entries[0]?.author, "Mateo");
});

test("returns an explicit shape failure for malformed souls", async () => {
  const caller = new FakeCaller({
    factory_souls: { isError: false, text: JSON.stringify({ value: [] }) },
  });
  const result = await service(caller).getSouls();
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /expected shape/i);
});
