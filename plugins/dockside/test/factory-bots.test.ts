import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  factoryAttentionKey,
  factoryBoardSchema,
  factoryNeedsPerson,
  type FactoryAgent,
} from "../lib/factory-bots.ts";

describe("Factory Bots read shape", () => {
  it("keeps the agent fields Dockside draws and drops board-only fields", () => {
    const board = factoryBoardSchema.parse({
      ok: true,
      fetchedAt: 1,
      snapshot: { bots: 1, tickets: 2, byStage: [], startedAt: null },
      tickets: [{ linearId: "SDD-1", bot: "sieve", stage: "triage" }],
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

  it("treats a changed reason or ticket as a new attention event", () => {
    assert.equal(factoryAttentionKey(blocked), factoryAttentionKey(blocked));
    assert.notEqual(
      factoryAttentionKey(blocked),
      factoryAttentionKey({ ...blocked, statusReason: "Different answer" }),
    );
    assert.notEqual(
      factoryAttentionKey(blocked),
      factoryAttentionKey({ ...blocked, ticketId: "SDD-2" }),
    );
  });
});
