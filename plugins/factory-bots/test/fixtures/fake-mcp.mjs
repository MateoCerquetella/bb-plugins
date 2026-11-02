#!/usr/bin/env node
// A scripted Factory MCP server for transport tests. It speaks the same
// newline-delimited JSON-RPC subset as the real factory MCP and never touches
// the network.

import { existsSync, writeFileSync } from "node:fs";

const mode = process.env.FAKE_MCP_MODE ?? "ok";
const strict = mode === "strict" || mode === "slow-init";
const initDelayMs = mode === "slow-init" ? 250 : 0;
let initialized = false;
let firstToolCall = true;

const status = {
  ok: true,
  rootId: "1",
  bots: {
    orchestrator: 1,
    sieve: 7,
    helm: 13,
    lens: 19,
    warden: 25,
    audit: 31,
    lookback: 37,
  },
  tickets: 5,
  byStage: { triage: 1, implement: 2, review: 1, staging: 1 },
  storage: "/tmp/factory/state.sqlite",
  startedAt: "2026-11-02T20:00:00.000Z",
};

const tickets = [
  {
    linearId: "FB-1",
    title: "Sieve is waiting for a missing answer",
    stage: "triage",
    bot: "sieve",
    feature: null,
    conversationId: "101",
    labels: ["factory:auto"],
  },
  {
    linearId: "FB-2",
    title: "Implement the board refresh",
    stage: "implement",
    bot: "helm",
    feature: "factory-bots-board",
    conversationId: "201",
    labels: [],
  },
  {
    linearId: "FB-3",
    title: "Implement the ticket detail",
    stage: "implement",
    bot: "helm",
    feature: "factory-bots-detail",
    conversationId: "202",
    labels: ["factory:auto"],
  },
  {
    linearId: "FB-4",
    title: "Review the factory board",
    stage: "review",
    bot: "lens",
    feature: "factory-bots-board",
    conversationId: "301",
    labels: [],
  },
  {
    linearId: "FB-5",
    title: "Release the factory board",
    stage: "staging",
    bot: "warden",
    feature: "factory-bots-board",
    conversationId: "401",
    labels: [],
  },
];

const details = {
  "FB-1": {
    ...tickets[0],
    worktree: null,
    attempts: 3,
    stageAttempts: 3,
    stopReason: "attempt budget exhausted",
    decisions: ["opened FB-1"],
    handoff: null,
    lineage: ["101"],
  },
  "FB-2": {
    ...tickets[1],
    worktree: "/tmp/factory/worktrees/fb-2",
    attempts: 1,
    stageAttempts: 1,
    stopReason: null,
    decisions: ["spec accepted", "moved to implement"],
    handoff: { from: "sieve", to: "helm", reason: "spec is observable" },
    lineage: ["7", "201"],
  },
  "FB-3": {
    ...tickets[2],
    worktree: "/tmp/factory/worktrees/fb-3",
    attempts: 2,
    stageAttempts: 2,
    stopReason: null,
    decisions: ["spec accepted"],
    handoff: null,
    lineage: ["7", "202"],
  },
  "FB-4": {
    ...tickets[3],
    worktree: "/tmp/factory/worktrees/fb-4",
    attempts: 1,
    stageAttempts: 1,
    stopReason: null,
    decisions: [],
    handoff: { from: "helm", to: "lens", reason: "change is committed" },
    lineage: ["7", "301"],
  },
  "FB-5": {
    ...tickets[4],
    worktree: "/tmp/factory/worktrees/fb-5",
    attempts: 1,
    stageAttempts: 1,
    stopReason: null,
    decisions: [],
    handoff: { from: "lens", to: "warden", reason: "review passed" },
    lineage: ["7", "401"],
  },
};

const tasks = [
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
    id: "901",
    kind: "pi.generation",
    status: "running",
    phase: "tools",
    owner: null,
    conversationId: "202",
    blocked: "waiting on a credential",
    background: false,
  },
];

function transcript(linearId) {
  const ticket = details[linearId] ?? details["FB-2"];
  return {
    linearId,
    conversationId: ticket.conversationId,
    entries: [
      { kind: "factory.ticket.opened", text: `{"linearId":"${linearId}"}` },
      { kind: "factory.handoff", text: `{"to":"${ticket.bot}"}` },
    ],
    live: {
      tools: [
        {
          callId: "call-1",
          name: "harness_status",
          status: "running",
          output: "reading the harness\n",
        },
      ],
      nestedTools: [],
      generation: { attempt: 1 },
    },
  };
}

function payloadFor(name, args) {
  switch (name) {
    case "factory_status":
      return status;
    case "factory_tickets":
      return { tickets };
    case "factory_tasks":
      return { tasks };
    case "debug_env":
      return {
        sentinel: process.env.FACTORY_TEST_SENTINEL ?? null,
        path: process.env.PATH ?? null,
        mode: process.env.FAKE_MCP_MODE ?? null,
      };
    case "factory_ticket": {
      const detail = details[args.linearId];
      if (detail === undefined) {
        return { error: `unknown ticket ${args.linearId}` };
      }
      return detail;
    }
    case "factory_transcript": {
      if (details[args.linearId] === undefined) {
        return { error: `unknown ticket ${args.linearId}` };
      }
      return transcript(args.linearId);
    }
    default:
      return null;
  }
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function handle(message) {
  if (message.method === "initialize") {
    setTimeout(() => {
      initialized = true;
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "fake-factory", version: "0.0.0" },
        },
      });
    }, initDelayMs);
    return;
  }
  if (message.method === "notifications/initialized") return;
  if (message.method === "tools/call") {
    const name = message.params?.name;
    const args = message.params?.arguments ?? {};

    if (strict && !initialized) {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          isError: true,
          content: [{ type: "text", text: "Server not initialized" }],
        },
      });
      return;
    }

    if (mode === "exit-on-tool") {
      setTimeout(() => process.exit(1), 10);
      return;
    }

    if (mode === "hang-once" && firstToolCall) {
      firstToolCall = false;
      const marker = process.env.FAKE_MCP_HANG_FILE;
      if (marker !== undefined && !existsSync(marker)) {
        writeFileSync(marker, "hung");
        return;
      }
    }

    if (mode === "pipe-error-once" && firstToolCall) {
      firstToolCall = false;
      const marker = process.env.FAKE_MCP_PIPE_FILE;
      if (marker !== undefined && !existsSync(marker)) {
        writeFileSync(marker, "errored");
        setTimeout(() => process.stdout.destroy(new Error("stdout boom")), 10);
        return;
      }
    }

    if (mode === "not-running") {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          isError: true,
          content: [{ type: "text", text: "fetch failed" }],
        },
      });
      return;
    }
    const payload = payloadFor(name, args);
    if (payload === null) {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          isError: true,
          content: [{ type: "text", text: `Unknown tool ${name}.` }],
        },
      });
      return;
    }
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        content: [
          {
            type: "text",
            text:
              mode === "malformed"
                ? "this is not json"
                : JSON.stringify(payload, null, 2),
          },
        ],
      },
    });
    return;
  }
  send({
    jsonrpc: "2.0",
    id: message.id,
    error: { code: -32601, message: `Unknown method ${message.method}` },
  });
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline = buffer.indexOf("\n");
  while (newline >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    newline = buffer.indexOf("\n");
    if (line === "") continue;
    try {
      handle(JSON.parse(line));
    } catch {
      // Ignore malformed client lines, as a real server would.
    }
  }
});
