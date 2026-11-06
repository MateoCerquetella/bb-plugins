import assert from "node:assert/strict";
import { test } from "node:test";

import { FactoryService, type ToolCaller } from "../lib/service.js";

const ALLOWED_TOOLS = new Set([
  "factory_status",
  "factory_tickets",
  "factory_ticket",
  "factory_tasks",
  "factory_transcript",
]);

const BOTS = {
  orchestrator: 1,
  sieve: 7,
  helm: 13,
  lens: 19,
  warden: 25,
  audit: 31,
  lookback: 37,
};

const TICKETS = [
  {
    linearId: "FB-1",
    title: "Sieve is stopped",
    stage: "triage",
    bot: "sieve",
    feature: null,
    conversationId: "101",
    labels: [],
  },
  {
    linearId: "FB-2",
    title: "Helm is implementing",
    stage: "implement",
    bot: "helm",
    feature: null,
    conversationId: "201",
    labels: [],
  },
  {
    linearId: "FB-4",
    title: "Lens is waiting",
    stage: "review",
    bot: "lens",
    feature: null,
    conversationId: "301",
    labels: [],
  },
];

const TASKS = [
  {
    id: "900",
    kind: "pi.generation",
    status: "running",
    phase: "request",
    owner: null,
    conversationId: "201",
    blocked: null,
    background: false,
  },
];

function detail(overrides: Record<string, unknown> = {}) {
  return {
    ...TICKETS[1],
    worktree: "/tmp/worktrees/fb-2",
    attempts: 1,
    stageAttempts: 1,
    stopReason: null,
    decisions: ["spec accepted"],
    handoff: null,
    lineage: ["7", "201"],
    ...overrides,
  };
}

function transcript(overrides: Record<string, unknown> = {}) {
  return {
    linearId: "FB-2",
    conversationId: "201",
    entries: [{ kind: "factory.ticket.opened", text: "{}" }],
    live: {
      tools: [
        {
          callId: "call-1",
          name: "harness_status",
          status: "running",
          output: "reading\n",
        },
      ],
    },
    ...overrides,
  };
}

class StubCaller implements ToolCaller {
  readonly calls: { name: string; args: Record<string, unknown> }[] = [];

  constructor(
    private readonly handler: (
      name: string,
      args: Record<string, unknown>,
    ) => unknown,
  ) {}

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<{ isError: boolean; text: string }> {
    this.calls.push({ name, args });
    const value = this.handler(name, args);
    if (value instanceof Error) throw value;
    return { isError: false, text: JSON.stringify(value) };
  }

  count(name: string): number {
    return this.calls.filter((call) => call.name === name).length;
  }
}

function boardCaller(options: { tickets?: unknown[]; details?: (args: Record<string, unknown>) => unknown } = {}) {
  return new StubCaller((name, args) => {
    switch (name) {
      case "factory_status":
        return {
          ok: true,
          bots: BOTS,
          tickets: 3,
          byStage: { triage: 1, implement: 1, review: 1 },
          storage: "/tmp/state.sqlite",
          startedAt: "2026-11-02T20:00:00.000Z",
        };
      case "factory_tickets":
        return { tickets: options.tickets ?? TICKETS };
      case "factory_tasks":
        return { tasks: TASKS };
      case "factory_ticket":
        if (options.details !== undefined) return options.details(args);
        if (args.linearId === "FB-1") return detail({ ...TICKETS[0], stopReason: "attempt budget exhausted" });
        return detail();
      default:
        return new Error(`unexpected tool ${name}`);
    }
  });
}

test("the board is built only from the five read-only tools", async () => {
  const caller = boardCaller();
  const service = new FactoryService({
    caller,
    startCommand: "node /opt/factory/dist/main.js up",
    now: () => 1_000,
  });
  const board = await service.getBoard();
  assert.equal(board.ok, true);
  if (!board.ok) return;

  assert.equal(board.fetchedAt, 1_000);
  assert.equal(board.snapshot.bots, 3);
  assert.equal(board.snapshot.tickets, 3);
  assert.deepEqual(
    board.snapshot.byStage.map((stage) => stage.stage),
    ["triage", "implement", "review"],
  );

  const sieve = board.agents.find((agent) => agent.name === "sieve")!;
  assert.equal(sieve.status, "blocked");
  assert.equal(sieve.statusReason, "attempt budget exhausted");

  const helm = board.agents.find((agent) => agent.name === "helm")!;
  assert.equal(helm.status, "working");
  assert.equal(helm.currentWork, "Helm is implementing");

  assert.equal(
    caller.calls.every((call) => ALLOWED_TOOLS.has(call.name)),
    true,
  );
  assert.equal(caller.count("factory_ticket"), 3);
  assert.equal(caller.count("factory_usage"), 0);
});

test("a failed ticket detail read fails the board instead of clearing blocked state", async () => {
  let detailCalls = 0;
  const caller: ToolCaller = {
    async callTool(name) {
      if (name === "factory_status") {
        return {
          isError: false,
          text: JSON.stringify({
            bots: BOTS,
            tickets: 3,
            byStage: { triage: 1, implement: 1, review: 1 },
          }),
        };
      }
      if (name === "factory_tickets") {
        return { isError: false, text: JSON.stringify({ tickets: TICKETS }) };
      }
      if (name === "factory_tasks") {
        return { isError: false, text: JSON.stringify({ tasks: TASKS }) };
      }
      detailCalls += 1;
      return { isError: true, text: "fetch failed" };
    },
  };
  const service = new FactoryService({
    caller,
    startCommand: "node /opt/factory/dist/main.js up",
    now: () => 1,
  });
  const board = await service.getBoard();
  assert.equal(board.ok, false);
  if (board.ok) return;
  assert.equal(board.reason, "not-running");
  assert.equal(board.startCommand, "node /opt/factory/dist/main.js up");
  assert.equal(detailCalls, 6);
});

test("a first ticket-detail failure is retried once", async () => {
  let detailCalls = 0;
  let failedOnce = false;
  const byId: Record<string, (typeof TICKETS)[number] | undefined> = {
    "FB-1": TICKETS[0],
    "FB-2": TICKETS[1],
    "FB-4": TICKETS[2],
  };
  const caller: ToolCaller = {
    async callTool(name, args) {
      if (name === "factory_status") {
        return {
          isError: false,
          text: JSON.stringify({
            bots: BOTS,
            tickets: 3,
            byStage: { triage: 1, implement: 1, review: 1 },
          }),
        };
      }
      if (name === "factory_tickets") {
        return { isError: false, text: JSON.stringify({ tickets: TICKETS }) };
      }
      if (name === "factory_tasks") {
        return { isError: false, text: JSON.stringify({ tasks: TASKS }) };
      }
      detailCalls += 1;
      if (args?.linearId === "FB-2" && !failedOnce) {
        failedOnce = true;
        return { isError: true, text: "fetch failed" };
      }
      const ticket = byId[String(args?.linearId)];
      return {
        isError: false,
        text: JSON.stringify(detail(ticket === undefined ? {} : { ...ticket, stopReason: null })),
      };
    },
  };
  const service = new FactoryService({ caller, startCommand: null, now: () => 1 });
  const board = await service.getBoard();
  assert.equal(board.ok, true);
  if (!board.ok) return;
  assert.equal(failedOnce, true);
  assert.equal(detailCalls, 4);
  assert.equal(board.agents.find((agent) => agent.name === "helm")!.status, "working");
});

test("fetch failed is a normal not-running board with the start command", async () => {
  const service = new FactoryService({
    caller: {
      async callTool() {
        return { isError: true, text: "fetch failed" };
      },
    },
    startCommand: "node /opt/factory/dist/main.js up",
    now: () => 2_000,
  });
  const board = await service.getBoard();
  assert.equal(board.ok, false);
  if (board.ok) return;
  assert.equal(board.reason, "not-running");
  assert.equal(board.startCommand, "node /opt/factory/dist/main.js up");
  assert.equal(board.message.includes("fetch failed"), false);
});

test("a thrown fetch error is also classified as not-running", async () => {
  const service = new FactoryService({
    caller: {
      async callTool() {
        throw new Error("fetch failed");
      },
    },
    startCommand: null,
    now: () => 1,
  });
  const board = await service.getBoard();
  assert.equal(board.ok, false);
  if (board.ok) return;
  assert.equal(board.reason, "not-running");
});

test("non-JSON and wrong shapes become bounded unavailable states", async () => {
  const nonJson = new FactoryService({
    caller: {
      async callTool() {
        return { isError: false, text: "not json" };
      },
    },
    startCommand: null,
    now: () => 1,
  });
  const first = await nonJson.getBoard();
  assert.equal(first.ok, false);
  if (!first.ok) {
    assert.equal(first.reason, "unavailable");
    assert.match(first.message, /non-JSON/);
  }

  const wrongShape = new FactoryService({
    caller: {
      async callTool(name: string) {
        if (name === "factory_status") {
          return { isError: false, text: JSON.stringify({ bots: null }) };
        }
        return { isError: false, text: "{}" };
      },
    },
    startCommand: null,
    now: () => 1,
  });
  const second = await wrongShape.getBoard();
  assert.equal(second.ok, false);
  if (!second.ok) assert.match(second.message, /did not match the expected shape/);
});

test("no tickets keeps the three supported agents visible and idle", async () => {
  const caller = new StubCaller((name) => {
    if (name === "factory_status") {
      return { bots: BOTS, tickets: 0, byStage: {} };
    }
    if (name === "factory_tickets") return { tickets: [] };
    if (name === "factory_tasks") return { tasks: [] };
    return new Error(`unexpected tool ${name}`);
  });
  const service = new FactoryService({ caller, startCommand: null, now: () => 5 });
  const board = await service.getBoard();
  assert.equal(board.ok, true);
  if (!board.ok) return;
  assert.equal(board.snapshot.tickets, 0);
  assert.deepEqual(board.snapshot.byStage, []);
  assert.equal(board.agents.length, 3);
  assert.equal(board.agents.every((agent) => agent.status === "idle"), true);
  assert.equal(board.agents.every((agent) => agent.ticketCount === 0), true);
});

test("a missing config reports unavailable instead of crashing", async () => {
  const service = new FactoryService({
    caller: null,
    startCommand: null,
    configError: "No factory.mcp.json found.",
    now: () => 1,
  });
  const board = await service.getBoard();
  assert.equal(board.ok, false);
  if (board.ok) return;
  assert.equal(board.reason, "unavailable");
  assert.match(board.message, /factory\.mcp\.json/);
});

test("the transcript is refetched only after a stage or conversation change", async () => {
  let current = detail();
  const caller = new StubCaller((name) => {
    if (name === "factory_ticket") return current;
    if (name === "factory_transcript") return transcript();
    return new Error(`unexpected tool ${name}`);
  });
  const service = new FactoryService({ caller, startCommand: null, now: () => 1 });

  const first = await service.getTicket("FB-2");
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.transcriptRefetched, true);
  assert.equal(first.transcript?.entries.length, 1);
  assert.equal(caller.count("factory_transcript"), 1);
  assert.deepEqual(caller.calls.at(-1)?.args, { linearId: "FB-2", limit: 50 });

  const second = await service.getTicket("FB-2");
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.transcriptRefetched, false);
  assert.equal(caller.count("factory_transcript"), 1);

  current = detail({ stage: "review", stageAttempts: 1 });
  const advanced = await service.getTicket("FB-2");
  assert.equal(advanced.ok, true);
  if (!advanced.ok) return;
  assert.equal(advanced.transcriptRefetched, true);
  assert.equal(caller.count("factory_transcript"), 2);

  current = detail({ stage: "review", conversationId: "777" });
  const forked = await service.getTicket("FB-2");
  assert.equal(forked.ok, true);
  if (!forked.ok) return;
  assert.equal(forked.transcriptRefetched, true);
  assert.equal(caller.count("factory_transcript"), 3);
});

test("a ticket still renders when its transcript alone fails", async () => {
  let transcriptAttempts = 0;
  const caller = new StubCaller((name) => {
    if (name === "factory_ticket") return detail();
    if (name === "factory_transcript") {
      transcriptAttempts += 1;
      return new Error("Factory MCP did not answer factory_transcript within 15000ms.");
    }
    return new Error(`unexpected tool ${name}`);
  });
  const service = new FactoryService({ caller, startCommand: null, now: () => 1 });
  const result = await service.getTicket("FB-2");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.transcript, null);
  assert.match(result.transcriptError ?? "", /did not answer/);
  assert.equal(result.transcriptRefetched, true);

  await service.getTicket("FB-2");
  assert.equal(transcriptAttempts, 2);
});

test("sends a message to the Orchestrator through factory_message", async () => {
  const caller = new StubCaller((name) => {
    if (name === "factory_message") return { answer: "Filed it.", created: ["FB-9"] };
    return new Error(`unexpected tool ${name}`);
  });
  const service = new FactoryService({ caller, startCommand: null, now: () => 7 });
  const result = await service.sendMessage("make the export button red");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.answer, "Filed it.");
  assert.deepEqual(result.created, ["FB-9"]);
  assert.deepEqual(caller.calls[0], {
    name: "factory_message",
    args: { message: "make the export button red" },
  });
});

test("sends the selected provider, model, and reasoning with the message", async () => {
  const caller = new StubCaller((name) => {
    if (name === "factory_message") return { answer: "On it.", created: [] };
    return new Error(`unexpected tool ${name}`);
  });
  const service = new FactoryService({ caller, startCommand: null, now: () => 8 });
  await service.sendMessage("use the strong model", {
    provider: "deepseek",
    model: "deepseek-v4-pro",
    reasoningLevel: "high",
  });
  assert.deepEqual(caller.calls[0], {
    name: "factory_message",
    args: {
      message: "use the strong model",
      provider: "deepseek",
      model: "deepseek-v4-pro",
      reasoningLevel: "high",
    },
  });
});

test("an MCP without factory_message is an actionable unavailable state", async () => {
  const service = new FactoryService({
    caller: {
      async callTool() {
        return { isError: true, text: "Unknown tool factory_message." };
      },
    },
    startCommand: null,
    now: () => 1,
  });
  const result = await service.sendMessage("hello");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "unavailable");
  assert.match(result.message, /factory_message/);
  assert.match(result.message, /Rebuild and restart/);
});

test("a ticket read while the factory is down is not-running", async () => {
  const service = new FactoryService({
    caller: {
      async callTool() {
        return { isError: true, text: "connect ECONNREFUSED 127.0.0.1:8080" };
      },
    },
    startCommand: "node /opt/factory/dist/main.js up",
    now: () => 9,
  });
  const result = await service.getTicket("FB-2");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "not-running");
  assert.equal(result.startCommand, "node /opt/factory/dist/main.js up");
});
