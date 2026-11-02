# Factory Bots

A live, read-only board of an Empirical Factory inside BB.

Factory Bots shows the agents `factory_status` returns (up to seven) as one
card each: the column it owns, its conversation, how many tickets it holds, and
whether it is idle, working, or blocked. Click an agent to see its tickets; click a ticket to see
its stage, attempts, stop reason, decisions, worktree, and transcript with the
live tool call highlighted.

![Factory Bots board](assets/screenshots/board.png)

![An agent's ticket with stage, attempts, decisions, worktree, and transcript](assets/screenshots/ticket.png)

## Data source

Factory Bots reads through the Factory MCP server, never the factory database
and never a write endpoint. It calls only:

- `factory_status`
- `factory_tickets`
- `factory_ticket`
- `factory_tasks`
- `factory_transcript`

The connection lives in [`factory.mcp.json`](./factory.mcp.json):

```json
{
  "command": "node",
  "args": [
    "/home/dyaus/Developer/projects/GoEmpirical/empirical-factory/dist/main.js",
    "mcp"
  ],
  "env": {
    "FACTORY_URL": "http://127.0.0.1:8080"
  }
}
```

Move the factory checkout? Edit that file, or set
`FACTORY_BOTS_MCP_CONFIG` to an absolute path for another config. The offline
state's start command is derived from the same file (the `mcp` argument becomes
`up`), so it cannot drift from the connection in use.

The plugin never starts, stops, or drives the factory. There is no POST, no
ticket creation, no stage change, and no database access anywhere in it.

## Status rules

- **Blocked** when a ticket held by the agent has a `stopReason`, or a matching
  durable task has a `blocked` reason. Blocked outranks working and the reason
  is shown verbatim.
- **Working** when a `factory_tasks` entry matches the agent: its owner names
  the agent, or its conversation is the agent's root conversation or one of its
  held tickets' conversations.
- **Idle** otherwise.

Cards are built only from the `bots` map that `factory_status` returns. If the
factory does not return an agent, the board does not show one. The columns come
from the factory's documented ownership table; an unrecognized returned agent
shows `No column`.

Per-agent tokens and cost are intentionally omitted: the read tools this plugin
may use do not attribute usage per agent, so showing a number would be invented.

## Refresh and transcripts

One poll loop refreshes the board and then, when a ticket is selected, that
ticket — one request at a time, with the next 5-second tick scheduled only after
both settle. Ticket details are read every cycle so a stop reason cannot go
stale; if any detail read fails, the board reports the offline/unavailable
state instead of claiming to be Live with a possibly cleared blocked agent.

The transcript is different: it is fetched again only when that ticket's stage
or conversation id changed, and an unchanged ticket reuses the held transcript.

## Normal offline and empty states

- If the Factory MCP answers `fetch failed`, the panel shows **Factory is not
  running** with the resolved start command and keeps polling. Start the
  factory and the board reconnects on its own.

  ![The not-running state with the start command](assets/screenshots/not-running.png)
- A factory with no tickets shows zero health and seven idle cards. That is a
  normal starting state, not an error.
- Malformed payloads, a missing config, or a timeout show one bounded
  unavailable message; the panel keeps retrying.

## Install

From this repository:

```sh
bb plugin install ./plugins/factory-bots
bb plugin reload factory-bots
```

Then open **Factory Bots** from the BB sidebar.

## Development

```sh
cd plugins/factory-bots
npm run typecheck
npm test
npm run build
```

The test suite includes a scripted stdio MCP server, so the transport, the
status derivation, the offline classification, and the transcript-cache rule
are exercised without a running factory.

## Layout

- `contract.ts` — zod payload shapes and the two read-only RPCs.
- `server.ts` — plugin wiring and MCP lifecycle.
- `lib/config.ts` — `factory.mcp.json` loading and start-command derivation.
- `lib/mcp-client.ts` — newline-delimited JSON-RPC over stdio.
- `lib/derive.ts` — pure ordering, counts, and idle/working/blocked rules.
- `lib/service.ts` — board/ticket reads and the transcript cache.
- `lib/live.ts`, `lib/route.ts` — live-tool presentation and panel routes.
- `app.tsx`, `app.css` — the board, agent, and ticket views.
