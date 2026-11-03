import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { factoryBoardSchema } from "../lib/factory-bots.ts";

describe("Factory Bots read shape", () => {
  it("keeps the agent fields Dockside draws and drops board-only fields", () => {
    const board = factoryBoardSchema.parse({
      ok: true,
      fetchedAt: 1,
      snapshot: { bots: 1, tickets: 2, byStage: [], startedAt: null },
      tickets: [],
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
