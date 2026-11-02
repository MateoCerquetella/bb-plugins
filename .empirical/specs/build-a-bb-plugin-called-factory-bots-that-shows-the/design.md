# Design

## Placement

Add one independently installable package at `plugins/factory-bots` following
the repository's package layout: `server.ts` RPC backend, `app.tsx` nav panel,
`app.css`, `contract.ts` (zod schemas and RPC contract), pure `lib/` modules,
`factory.mcp.json`, `assets/icon.svg`, tests, and README. Register it in
`.bb/plugins.json` and the root README catalog.

## Data path

```
BB panel ──RPC──> plugin server ──stdio JSON-RPC──> Factory MCP ──HTTP GET──> factory
```

- `lib/config.ts` reads `factory.mcp.json` (the exact command, args, and env
  the operator supplied), validates it, resolves it from either the source root
  or the built `dist/`, and derives the human start command by swapping the
  trailing `mcp` arg for `up`. An env override may point at another config.
- `lib/mcp-client.ts` owns one lazily spawned child process and speaks the
  newline-delimited JSON-RPC subset needed for MCP: `initialize`,
  `notifications/initialized`, and `tools/call`. Requests are correlated by id
  with a bounded timeout; a timeout kills the child and fails pending calls.
  `dispose()` kills the child on plugin unload. Nothing writes to stdin except
  protocol messages.
- `lib/service.ts` is the only reader. `getBoard` calls `factory_status`,
  `factory_tickets`, and `factory_tasks` in parallel, then `factory_ticket` for
  each listed ticket so card-level `stopReason` is truthful (the list tool does
  not include it), bounded to a small concurrency. `getTicket` calls
  `factory_ticket` and reuses an in-memory transcript only when
  `(stage, conversationId)` matches the previous fetch; otherwise it calls
  `factory_transcript` and replaces the entry.

## Derivation

`lib/derive.ts` is pure and holds the only status rules:

- Agents come from `Object.keys(factory_status.bots)` only, normalized to
  strings. Known names use the fixed order; unknown returned names follow.
- A ticket is held by an agent when `ticket.bot === agent`. Counts use that set.
- The agent's conversation set is its root `bots` conversation id plus every
  held ticket's `conversationId`; a task matches when `owner` or
  `conversationId` is in that set, or `owner` names the agent.
- Blocked outranks working. The first ticket `stopReason`, else the first task
  `blocked`, is surfaced verbatim (`reason` plus a `+N` indicator only when
  another exists; the full string remains in the element's title).
- Current work prefers the matching task's ticket title, then the task kind and
  phase, then `Idle`.
- Columns come from the factory's documented ownership table; a returned agent
  without a known column shows `No column` rather than a guessed one.

## Frontend

One `navPanel` (`path: "factory-bots"`, icon `Bot`) owns its route through
`subPath`: root board, `agent/<name>`, and
`agent/<name>/ticket/<linearId>`. The board is a responsive grid of buttons.
A 5-second chained `setTimeout` poll (never overlapping) refreshes the board;
the same loop refreshes the selected ticket. Ticket detail renders fields plus
the transcript: live `tools`/`nestedTools` are highlighted with a visible
RUNNING label and output, and entries are listed with kind and text. Plain CSS
uses BB theme variables, status is never color-only, and the panel is keyboard
navigable.

Offline and empty states are data, not exceptions: `{ok:false, reason:
"not-running"}` renders the start command; zero tickets render normal health
and idle cards; other payload failures render one bounded message and keep
polling.

## Read-only and privacy

The only tools referenced are the five read-only Factory tools. There is no
POST helper, no database module, no shell command runner, and the panel exposes
no control that mutates factory state. Per-agent tokens/costs are omitted
because the allowed reads do not attribute them.
