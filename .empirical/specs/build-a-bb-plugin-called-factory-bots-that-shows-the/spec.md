# Factory Bots

## Request

> Build a BB plugin called Factory Bots that shows the agents of an Empirical Factory as a live read-only board: header with factory health, one card per bot from factory_status with status dot and owned column, click-through to tickets, ticket detail with factory_ticket fields and factory_transcript, refresh every 5s with transcript refetch only when stage or conversation changed. Data only through the Factory MCP server (factory_status, factory_tickets, factory_ticket, factory_tasks, factory_transcript); handle factory-not-running and no-tickets as normal states.

## Goal

Add an installable BB plugin, Factory Bots, that renders the Empirical
Factory's seven agents as a live board. The plugin reads only through a
configured Factory MCP server over stdio, never opens the factory database, and
never calls a write endpoint. At a glance the operator sees which agent is idle,
working, or blocked, what each owns, and what it is doing; clicking through
shows the agent's tickets, one ticket's fields, and its live transcript.

## Acceptance Criteria

- [ ] [AC-1] The header shows the factory's agent count, total ticket count, and
  tickets per stage, all taken from `factory_status` (with the ticket list as a
  fallback only when `byStage` is absent).
- [ ] [AC-2] The board renders exactly one card per agent present in the
  `bots` map returned by `factory_status`: none is invented when absent, and
  the known order (orchestrator, sieve, helm, lens, warden, audit, lookback) is
  used with any additional returned agents after it.
- [ ] [AC-3] Each card shows the agent name, its conversation id, the column it
  owns, the number of tickets it holds (tickets whose `bot` names it), and a
  status dot whose visible label is idle, working, or blocked.
- [ ] [AC-4] `working` means a `factory_tasks` entry whose owner or conversation
  matches the agent or one of its held tickets. `blocked` means a held ticket
  carries a non-null `stopReason` or a matching task carries a non-null
  `blocked` reason; blocked outranks working and the card shows that reason
  verbatim.
- [ ] [AC-5] [UI] Clicking a card opens that agent's tickets. Clicking a ticket
  shows stage, attempts, stopReason, decisions, worktree, feature, labels, and
  the transcript, with the live tool call (Pi Durable `live.tools`) visually
  highlighted and its output available.
- [ ] [AC-6] The board refreshes every 5 seconds without overlapping requests,
  and a ticket transcript is fetched again only when that ticket's stage or
  conversation id changed; an unchanged ticket reuses the held transcript.
- [ ] [AC-7] All reads go through the configured Factory MCP command
  (`node <factory>/dist/main.js mcp` with `FACTORY_URL`) and only the five
  read-only tools `factory_status`, `factory_tickets`, `factory_ticket`,
  `factory_tasks`, `factory_transcript`. The plugin contains no POST, ticket
  creation, stage change, database path, or write tool call.
- [ ] [AC-8] A `fetch failed` answer from the MCP is a normal not-running state
  that names the resolved start command (`node <factory>/dist/main.js up`) and
  keeps polling, not an error wall. No tickets is also a normal, explained
  state, with zero-value health and idle cards.
- [ ] [AC-9] Malformed MCP output, a missing config, or a timeout produces a
  bounded, readable unavailable state instead of a crash or unhandled
  rejection.
- [ ] [AC-10] Focused typecheck, unit tests, and `bb plugin build` pass; the
  plugin is installed locally, its panel renders in the BB browser with live
  factory data, and a screenshot records the board plus a ticket detail view.

## Scope

- New `plugins/factory-bots` package: server, frontend panel, plain CSS, icon,
  MCP config, tests, README.
- A minimal stdio MCP JSON-RPC client with lifecycle, timeout, and disposal.
- Pure status/board derivation over the five read-only tool payloads.
- In-memory transcript cache keyed by ticket stage and conversation id.
- Root catalog registration (`.bb/plugins.json`, `README.md`).

## Non-goals

- Any factory write: creating or advancing tickets, moving stages, posting
  comments, or driving bots.
- Reading the factory SQLite database, its files, or its HTTP API directly.
- Per-agent token or cost figures. `factory_usage` is not exposed here and
  usage is not attributed per agent by the allowed tools, so none is shown.
- Starting, stopping, or supervising the factory process. The plugin shows the
  start command but never runs it.
- Historical analytics, alerting, mobile/Touch Bar surfaces, or a settings UI
  beyond the plugin-owned MCP config file.

## Verification

- `npm run check` in `plugins/factory-bots`: SDK type check, `tsc --noEmit`,
  focused `node --test` suite, and `bb plugin build`.
- Unit tests for ordering, agent filtering, idle/working/blocked derivation,
  verbatim reasons, ticket counts, not-running detection, no-tickets, malformed
  payloads, and transcript-cache refetch conditions.
- A raw stdio MCP transport test against a scripted fake MCP server, plus a
  direct call against the live Factory MCP read tools.
- Install with `bb plugin install ./plugins/factory-bots`, reload, open the
  panel in BB's browser, and capture the board and a ticket detail screenshot.

## Capability Deltas

- `deltas/factory-bots-board.md`
