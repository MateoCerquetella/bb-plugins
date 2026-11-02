# Decisions: Factory Bots

## D-001: Speak MCP over stdio directly

Status: Accepted

### Evidence

- The operator required the Factory MCP command rather than a database
  connection.
- A probe of `node dist/main.js mcp` confirmed newline-delimited JSON-RPC 2.0
  with `initialize`, `notifications/initialized`, and `tools/call`.
- The board needs five read-only tools and no other MCP capability.

### Options

1. Add `@modelcontextprotocol/sdk` and use its client.
2. Implement the small JSON-RPC subset inside the plugin.

### Chosen approach

Choose option 2. It adds no dependency beyond zod, gives explicit child
lifetime and timeout control, and ships no second protocol stack.

### Trade-offs and risks

Only the MCP subset this board uses is implemented. A future tool needing
sampling, resources, or notifications would extend the client.

### Verification

A transport test against a scripted stdio server plus a live call to the real
Factory MCP binary.

## D-002: The MCP command lives in `factory.mcp.json`

Status: Accepted

### Evidence

- The operator supplied exact `command`, `args`, and `env` values.
- The not-running state must show a start command that cannot drift from the
  connection settings.

### Options

1. Hard-code the command in `server.ts`.
2. Put it in a plugin-owned JSON config and derive both the MCP call and the
   displayed start command from it.

### Chosen approach

Choose option 2. The server reads `factory.mcp.json` from the source root or
the built `dist/`, validates the three keys, and swaps the trailing `mcp` arg
for `up` to render the start command. `FACTORY_BOTS_MCP_CONFIG` may point at
another file.

### Trade-offs and risks

Operators edit JSON rather than a UI setting. That is intentional: this plugin
observes and has no writable settings surface.

### Verification

Config parsing tests for valid, missing, and malformed files; live start
command output.

## D-003: Derive status on the server, keep the panel presentational

Status: Accepted

### Evidence

- Status combines `factory_status`, `factory_tickets`, and `factory_tasks`.
- The rules are the riskiest behavior and need direct tests.

### Options

1. Send raw payloads and compute status in React.
2. Compute complete agent cards in a pure module behind RPC.

### Chosen approach

Choose option 2. `lib/derive.ts` owns ordering, counts, matching, and blocked
precedence; the panel renders what it receives.

### Trade-offs and risks

The panel cannot recompute a stale card from partial data, which is desired:
one rule set, one test suite.

### Verification

Pure derivation tests for order, absent agents, counts, and all three statuses.

## D-004: Read ticket details every refresh; cache only transcripts

Status: Accepted

### Evidence

- `factory_tickets` omits `stopReason`, while a card must be blocked when a
  held ticket carries one.
- The contract permits transcript refetch only when stage or conversation
  changed.

### Options

1. Skip ticket detail and miss ticket-level blocked state.
2. Read `factory_ticket` for each listed ticket each cycle and cache
   transcripts by `(stage, conversationId)`.

### Chosen approach

Choose option 2 with bounded parallelism for details and a one-entry-per-ticket
transcript cache in `lib/service.ts`.

### Trade-offs and risks

N+3 loopback MCP reads per 5 seconds for N tickets. The alternative would show
stale blocked state, which violates the contract.

### Verification

A stub caller counts `factory_ticket` and `factory_transcript` calls across
unchanged and changed refreshes.

## D-005: Match tasks through the agent's held ticket conversations

Status: Accepted

### Evidence

- Live `factory_status` returned bot roots 1, 7, 13, … while live tasks carried
  ticket conversations 82 and 576 with `owner: null`.
- Comparing only against a bot root would leave every agent idle during real
  work.

### Options

1. Compare only `task.conversationId` to the bot root conversation.
2. Treat the bot root plus each held ticket's conversation as the agent's
   conversations, and also accept an `owner` naming the agent.

### Chosen approach

Choose option 2, which follows the contract's "owner or conversation matches"
and matches observed factory state.

### Trade-offs and risks

A task on a ticket momentarily reassigned to another agent could match both
during a refresh window; the ticket's `bot` remains authoritative for counts.

### Verification

Derivation tests cover root conversation, held ticket conversation, and owner
name matching.

## D-006: Columns come from the factory's own ownership table

Status: Accepted

### Evidence

- The factory README documents the column each agent owns.
- Inventing columns for `audit` and `lookback` would violate the observability
  contract.

### Options

1. Guess a column from ticket stages.
2. Show the documented column, or `No column` for an agent outside the table.

### Chosen approach

Choose option 2, and render only agents actually present in `factory_status`.

### Trade-offs and risks

If the factory changes ownership, the label must be updated with it; it never
invents an agent.

### Verification

Ordering/column tests, including an unknown returned agent.

## D-007: One nav panel with URL-owned drill-down

Status: Accepted

### Evidence

- BB's `navPanel` receives `subPath` and supports in-panel history.
- The operator expects card → tickets → ticket detail navigation.

### Options

1. Local component state only.
2. Encode board, agent, and ticket in `subPath`.

### Chosen approach

Choose option 2, with plain CSS using BB theme variables and no new frontend
dependencies. Status is always visible as text, not color alone.

### Trade-offs and risks

The URL shape becomes a small contract (`agent/<name>/ticket/<id>`), tested
through a route parser.

### Verification

Route parsing tests and a live browser drill-down with screenshots.
