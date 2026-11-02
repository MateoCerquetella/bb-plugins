import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FactoryStatusPayloadSchema,
  FactoryTasksPayloadSchema,
  FactoryTicketsPayloadSchema,
  type FactoryStatusPayload,
  type TicketSummary,
  type TaskSummary,
} from "../contract.js";
import {
  AGENT_ORDER,
  agentColumn,
  deriveAgents,
  deriveSnapshot,
  displayAgentName,
  orderAgents,
  stageCounts,
  stageLabel,
} from "../lib/derive.js";

function status(bots: Record<string, number>, extras: Record<string, unknown> = {}): FactoryStatusPayload {
  return FactoryStatusPayloadSchema.parse({
    bots,
    tickets: 4,
    byStage: { triage: 1, implement: 2, review: 1 },
    storage: "/tmp/state.sqlite",
    startedAt: "2026-11-02T20:00:00.000Z",
    ...extras,
  });
}

const TICKETS: TicketSummary[] = FactoryTicketsPayloadSchema.parse({
  tickets: [
    {
      linearId: "FB-1",
      title: "Sieve ticket",
      stage: "triage",
      bot: "sieve",
      feature: null,
      conversationId: "101",
      labels: [],
    },
    {
      linearId: "FB-2",
      title: "Helm ticket",
      stage: "implement",
      bot: "helm",
      feature: null,
      conversationId: "201",
      labels: [],
    },
    {
      linearId: "FB-3",
      title: "Second Helm ticket",
      stage: "implement",
      bot: "helm",
      feature: null,
      conversationId: "202",
      labels: [],
    },
  ],
}).tickets;

const TASKS: TaskSummary[] = FactoryTasksPayloadSchema.parse({
  tasks: [
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
    {
      id: "904",
      kind: "pi.generation",
      status: "running",
      phase: "request",
      owner: null,
      conversationId: "101",
      blocked: null,
      background: false,
    },
  ],
}).tasks;

test("keeps the documented order but only for agents status returned", () => {
  const names = orderAgents(["lookback", "sieve", "ghost", "orchestrator", "audit"]);
  assert.deepEqual(names, ["orchestrator", "sieve", "audit", "lookback", "ghost"]);
  assert.equal(AGENT_ORDER.length, 7);
});

test("an absent agent is never invented", () => {
  const cards = deriveAgents({
    status: status({ orchestrator: 1, sieve: 7 }),
    tickets: TICKETS,
    tasks: TASKS,
    stopReasons: {},
  });
  assert.deepEqual(
    cards.map((card) => card.name),
    ["orchestrator", "sieve"],
  );
  assert.equal(cards.some((card) => card.name === "helm"), false);
});

test("cards carry name, conversation, documented column, and held ticket count", () => {
  const cards = deriveAgents({
    status: status({ sieve: 7, helm: 13 }),
    tickets: TICKETS,
    tasks: [],
    stopReasons: {},
  });
  const helm = cards.find((card) => card.name === "helm")!;
  assert.equal(helm.displayName, "Helm");
  assert.equal(helm.conversationId, "13");
  assert.equal(helm.column, "In Implementation");
  assert.equal(helm.ticketCount, 2);
  assert.equal(helm.status, "idle");
  assert.equal(agentColumn("unknown-agent"), "No column");
  assert.equal(displayAgentName("lookback"), "Lookback");
});

test("a ticket stopReason blocks its agent verbatim and outranks working", () => {
  const cards = deriveAgents({
    status: status({ sieve: 7 }),
    tickets: TICKETS,
    tasks: TASKS,
    stopReasons: { "FB-1": "attempt budget exhausted" },
  });
  const sieve = cards.find((card) => card.name === "sieve")!;
  assert.equal(sieve.status, "blocked");
  assert.equal(sieve.statusReason, "attempt budget exhausted");
  assert.equal(sieve.statusReasonCount, 1);
});

test("a task conversation names the agent as working and shows its ticket", () => {
  const cards = deriveAgents({
    status: status({ helm: 13 }),
    tickets: TICKETS,
    tasks: TASKS,
    stopReasons: {},
  });
  const helm = cards.find((card) => card.name === "helm")!;
  assert.equal(helm.status, "working");
  assert.equal(helm.taskCount, 1);
  assert.equal(helm.currentWork, "Helm ticket");
});

test("a blocked task reason wins over working and stays verbatim", () => {
  const tasks = FactoryTasksPayloadSchema.parse({
    tasks: [
      {
        id: "901",
        kind: "pi.generation",
        status: "running",
        phase: "tools",
        owner: null,
        conversationId: "202",
        blocked: "waiting on a credential",
        background: false,
      },
    ],
  }).tasks;
  const cards = deriveAgents({
    status: status({ helm: 13 }),
    tickets: TICKETS,
    tasks,
    stopReasons: {},
  });
  const helm = cards.find((card) => card.name === "helm")!;
  assert.equal(helm.status, "blocked");
  assert.equal(helm.statusReason, "waiting on a credential");
});

test("a task owner naming the agent is a match", () => {
  const tasks = FactoryTasksPayloadSchema.parse({
    tasks: [
      {
        id: "902",
        kind: "pi.generation",
        status: "running",
        phase: null,
        owner: "lens",
        conversationId: "999",
        blocked: null,
        background: false,
      },
    ],
  }).tasks;
  const cards = deriveAgents({
    status: status({ lens: 19 }),
    tickets: [],
    tasks,
    stopReasons: {},
  });
  const lens = cards.find((card) => card.name === "lens")!;
  assert.equal(lens.status, "working");
  assert.equal(lens.currentWork, "pi.generation");
});

test("a nested task follows its owner task's conversation", () => {
  const tasks = FactoryTasksPayloadSchema.parse({
    tasks: [
      {
        id: "902",
        kind: "pi.generation",
        status: "running",
        phase: null,
        owner: null,
        conversationId: "19",
        blocked: null,
        background: false,
      },
      {
        id: "903",
        kind: "pi.tool",
        status: "running",
        phase: "execute",
        owner: "902",
        conversationId: "999",
        blocked: null,
        background: false,
      },
    ],
  }).tasks;
  const cards = deriveAgents({
    status: status({ lens: 19 }),
    tickets: [],
    tasks,
    stopReasons: {},
  });
  const lens = cards.find((card) => card.name === "lens")!;
  assert.equal(lens.status, "working");
  assert.equal(lens.taskCount, 2);
});

test("the root bot conversation also matches a task", () => {
  const tasks = FactoryTasksPayloadSchema.parse({
    tasks: [
      {
        id: "903",
        kind: "pi.generation",
        status: "running",
        phase: null,
        owner: null,
        conversationId: "19",
        blocked: null,
        background: false,
      },
    ],
  }).tasks;
  const cards = deriveAgents({
    status: status({ lens: 19 }),
    tickets: [],
    tasks,
    stopReasons: {},
  });
  assert.equal(cards[0]!.status, "working");
});

test("ticket counts only include tickets whose bot names the agent", () => {
  const cards = deriveAgents({
    status: status({ sieve: 7, lens: 19 }),
    tickets: TICKETS,
    tasks: [],
    stopReasons: {},
  });
  assert.equal(cards.find((card) => card.name === "lens")!.ticketCount, 0);
  assert.equal(cards.find((card) => card.name === "sieve")!.ticketCount, 1);
});

test("snapshot counts agents and orders stages with labels", () => {
  const snapshot = deriveSnapshot(status({ orchestrator: 1, sieve: 7 }), TICKETS);
  assert.equal(snapshot.bots, 2);
  assert.equal(snapshot.tickets, 4);
  assert.deepEqual(
    snapshot.byStage.map((entry) => [entry.stage, entry.label, entry.count]),
    [
      ["triage", "Triage", 1],
      ["implement", "Implement", 2],
      ["review", "Review", 1],
    ],
  );
  assert.equal(stageLabel("some-custom_stage"), "Some Custom Stage");
  assert.equal("storage" in snapshot, false);
});

test("stage counts fall back to the ticket list when byStage is absent", () => {
  const bare = FactoryStatusPayloadSchema.parse({
    bots: { sieve: 7 },
    tickets: 3,
  });
  const counts = stageCounts({ implement: 2, triage: 1, extra: 4 });
  assert.deepEqual(
    counts.map((entry) => entry.stage),
    ["triage", "implement", "extra"],
  );
  assert.equal(deriveSnapshot(bare, TICKETS).byStage.length, 2);
});

test("no tickets is a normal snapshot with idle agents", () => {
  const empty = FactoryStatusPayloadSchema.parse({
    bots: { orchestrator: 1, sieve: 7, helm: 13, lens: 19, warden: 25, audit: 31, lookback: 37 },
    tickets: 0,
    byStage: {},
  });
  const snapshot = deriveSnapshot(empty, []);
  const cards = deriveAgents({
    status: empty,
    tickets: [],
    tasks: [],
    stopReasons: {},
  });
  assert.equal(snapshot.tickets, 0);
  assert.deepEqual(snapshot.byStage, []);
  assert.equal(cards.length, 7);
  assert.equal(cards.every((card) => card.status === "idle"), true);
  assert.equal(cards.every((card) => card.ticketCount === 0), true);
});
