import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  factoryAttentionKey,
  factoryBoardSchema,
  factoryNeedsPerson,
  factoryQuestionFromComments,
  factoryTicketForAgent,
  type FactoryAgent,
  type FactoryBoardTicket,
} from "../lib/factory-bots.ts";

describe("Factory Bots read shape", () => {
  it("keeps the agent fields Dockside draws and drops board-only fields", () => {
    const board = factoryBoardSchema.parse({
      ok: true,
      fetchedAt: 1,
      snapshot: { bots: 1, tickets: 2, byStage: [], startedAt: null },
      tickets: [
        {
          linearId: "SDD-1",
          title: "Write the spec",
          bot: "sieve",
          stage: "triage",
        },
      ],
      tasks: [],
      agents: [
        {
          name: "sieve",
          displayName: "Sieve",
          conversationId: "7",
          column: "In Specification, Todo",
          ticketCount: 2,
          status: "working",
          statusReason: null,
          statusReasonCount: 0,
          currentWork: "Write the spec",
          taskCount: 1,
          ticketId: "SDD-1",
        },
      ],
    });
    assert.equal(board.ok, true);
    if (!board.ok) return;
    assert.deepEqual(board.agents, [
      {
        name: "sieve",
        displayName: "Sieve",
        conversationId: "7",
        column: "In Specification, Todo",
        ticketCount: 2,
        status: "working",
        statusReason: null,
        currentWork: "Write the spec",
      },
    ]);
  });

  it("preserves the factory's actionable failure message", () => {
    const board = factoryBoardSchema.parse({
      ok: false,
      reason: "not-running",
      message: "Factory is not running.",
      startCommand: "node /opt/factory/dist/main.js up",
      fetchedAt: 2,
    });
    assert.equal(board.ok, false);
    if (board.ok) return;
    assert.equal(board.reason, "not-running");
    assert.equal(board.message, "Factory is not running.");
  });
});

describe("Factory Bots attention", () => {
  const blocked: FactoryAgent = {
    name: "sieve",
    displayName: "Sieve",
    conversationId: "7",
    column: "In Specification, Todo",
    ticketCount: 1,
    status: "blocked",
    statusReason: "No feature is selected.",
    currentWork: null,
    ticketId: "SDD-1",
    ticketTitle: "Write the spec",
  };

  it("counts only agents blocked on a person", () => {
    assert.deepEqual(
      factoryNeedsPerson([
        blocked,
        { ...blocked, name: "helm", status: "working" },
        { ...blocked, name: "lens", status: "idle" },
      ]).map((agent) => agent.name),
      ["sieve"],
    );
  });

  it("alerts once per blocked episode even if the reason text changes", () => {
    assert.equal(factoryAttentionKey(blocked), factoryAttentionKey(blocked));
    assert.equal(
      factoryAttentionKey(blocked),
      factoryAttentionKey({ name: blocked.name }),
    );
  });

  it("opens the ticket named by the blocked reason, not the first ticket", () => {
    const tickets: FactoryBoardTicket[] = [
      { linearId: "SDD-21", title: "Find power users", bot: "sieve", feature: null },
      {
        linearId: "SDD-179",
        title: "Release still triggers on merges",
        bot: "sieve",
        feature: null,
      },
      {
        linearId: "SDD-89",
        title: "Speed up the test suite",
        bot: "helm",
        feature: "sdd-89",
      },
    ];
    const reason =
      "No feature is selected in /home/dyaus/projects/empirical-sdd-sdd-179. A person must say whether to start or attach the work.";
    assert.equal(
      factoryTicketForAgent(
        { ...blocked, statusReason: reason },
        tickets,
      )?.linearId,
      "SDD-179",
    );
    assert.equal(
      factoryTicketForAgent(
        {
          ...blocked,
          name: "helm",
          statusReason:
            "No feature is selected in /home/dyaus/projects/empirical-sdd-sdd-89.",
        },
        tickets,
      )?.linearId,
      "SDD-89",
    );
    assert.equal(
      factoryTicketForAgent(
        { ...blocked, status: "working", statusReason: null },
        tickets,
      )?.linearId,
      "SDD-21",
    );
  });
});

it("notification text uses the actual Linear question", () => {
  assert.equal(
    factoryQuestionFromComments([
      {
        body:
          "**SDD-170 needs a person.** \n\n**I need a person to answer which design ships (diff-based vs document-name), and whether acceptance #2 is deleted.**\n\nMore detail.",
      },
    ]),
    "I need a person to answer which design ships (diff-based vs document-name), and whether acceptance #2 is deleted. More detail.",
  );
});
