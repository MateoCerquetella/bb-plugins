#!/usr/bin/env node
// A minimal Factory MCP server used to prove which checkout the plugin runs.
// Its identity is its own checkout directory, so two checkouts answer apart,
// and it records its lifetime there so a disposed child is observable.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const checkout = dirname(dirname(fileURLToPath(import.meta.url)));
const lifetimeFile = join(checkout, "lifetime.txt");
writeFileSync(lifetimeFile, "running");
const stop = () => {
  try {
    writeFileSync(lifetimeFile, "stopped");
  } catch {
    // The checkout directory may already be removed.
  }
};
process.on("exit", stop);
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    stop();
    process.exit(0);
  });
}

const payloads = {
  factory_status: {
    ok: true,
    bots: { orchestrator: checkout },
    tickets: 0,
    byStage: {},
    storage: null,
    startedAt: null,
  },
  factory_tickets: { tickets: [] },
  factory_tasks: { tasks: [] },
};

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function handle(message) {
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "fake-checkout", version: "0.0.0" },
      },
    });
    return;
  }
  if (message.method === "notifications/initialized") return;
  if (message.method === "tools/call") {
    const payload = payloads[message.params?.name];
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: payload === undefined
        ? {
            isError: true,
            content: [{ type: "text", text: `Unknown tool ${message.params?.name}.` }],
          }
        : { content: [{ type: "text", text: JSON.stringify(payload) }] },
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
