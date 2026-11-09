# Foreman

> Personal plugin: not listed in this repository's catalog or published. Install it from a local checkout.

Foreman is a control room for your Empirical software factories inside BB.
It reads any number of factories. Each one gets a live board of its bots and
tickets, the ticket transcripts, a soul editor, the capability toggles, and an
Orchestrator chat. The plugin id stays `factory-bots`, so the install and
each Dood's outfit carry over from the Factory Bots name. Orchestrator chat
history is now kept per factory, so history from before multiple factories is
not shown.

## Factories

Opening Foreman lands on **Factories**: one card per factory with its health
(Live, Not running, Unavailable), agents, open tickets, bots that need a
person, and uptime, refreshed every ten seconds. **Add factory** asks for a
name, the factory's URL (its `FACTORY_URL`), and an optional checkout path whose
`dist/main.js` serves MCP; empty uses the bundled checkout. Foreman starts that
checkout's MCP before saving, so a wrong path is reported and nothing is saved.
**Edit** restarts that factory's connection; **Remove** stops reading it (the
factory itself keeps running), and the last factory cannot be removed.

Every factory has its own MCP child, started on first use, and its own
Orchestrator chat history. A link to a factory that no longer exists lands on
Factories with a note.

## The floor

Inside a factory, one bar carries the Foreman mark, the factory switcher (every
factory plus **All factories**), the tabs **Threads**, **Bots**, **Souls**, and
**Capabilities**, and **New work**, which opens Dispatch and focuses its
composer. The Threads tab shows a red count when a blocker names an exact
ticket.

Threads and Bots open on four readings (agents, open tickets, bots that need a
person, uptime) and a pipeline strip of tickets per stage. **Threads** lists
every ticket as one thread, grouped into In motion, On call, and Settled, with
its owner's live Dood; the ticket a blocker names is marked **Needs answer**
with a red edge. **Bots** lists each agent with the column it owns, its
conversation, its tickets, and whether it is idle, working, or blocked, grouped
into In motion, Needs a person, and On call.

**Dispatch**, the Orchestrator chat, sits in the right rail with its own live
Dood. Drag the rail's left edge to resize it; **Hide** leaves an
**Orchestrator** button at the bottom right. Both choices are remembered.

Selecting a thread replaces the list with its ticket: one answer box at the
top, named for the owning bot and quoting the factory's actual blocker; a
collapsed **Linear issue** with **Description** and **Comments**; and the
conversation behind **Show conversation**. Answers go through the Orchestrator,
the only ticket-content write path, so on a ticket the rail points at the
answer box instead of offering a second composer.

**Souls** shows each bot's prose beside its live Dood, the tools
`factory_status` reports, the latest audit row, and a double-confirmation save.
**Capabilities** turns the Orchestrator, Sieve, and Helm on or off with a
confirmation that states the consequence; a disabled bot applies on the next
drive and the ticket records `capability disabled: <bot>`. The roster
intentionally excludes Lens, Warden, Audit, and Lookback.

Every Dood comes from [do.computer](https://do.computer), grown from the
agent's name, and falls back to a static blob without WebGL. Feed it the
cookie, open the gift that arrives every six hours, and dress it from the
wardrobe; each agent's treats, gifts, and outfit are kept on this machine.

## Look

The Control Room look redefines BB's theme tokens inside the panel: near-black
surfaces, one amber accent for actions and the active tab, monospace uppercase
labels and readings, and 4px corners. Green, red, and grey dots carry factory
health everywhere.

## Data source

Foreman reads through the Factory MCP server and never opens the factory
database. The board calls the five read tools:

- `factory_status`
- `factory_tickets`
- `factory_ticket`
- `factory_tasks`
- `factory_transcript`

The Capabilities view calls `factory_capabilities`,
`factory_capability_audit`, and `factory_capability_set`. The Orchestrator chat
calls `factory_message`; the capability view calls `factory_capability_set`.
Those are the only writes: one message through the Orchestrator, and one live
capability state plus its audit. The plugin never creates a ticket, moves a
stage, or calls a factory HTTP write endpoint itself.

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

Each factory has a name, a
`FACTORY_URL`, and an optional checkout path; the list is stored in the
plugin's key-value storage under `factories:v1`. The first load seeds one
**Local** factory with the bundled config's `FACTORY_URL` and its entry point.
A factory with a checkout path launches `<checkout>/dist/main.js mcp`; an empty
path keeps the bundled entry point. Every factory gets its own MCP child,
started on first use, restarted when the factory is edited, and stopped when it
is removed. Saving a factory first loads its MCP config, so a checkout without
a readable `dist/main.js` is reported instead of saved. Panel URLs start with the
factory id (`local`, `local/souls`, `local/agent/helm/ticket/FB-2`), and each
factory keeps its own Orchestrator chat history. For a completely different MCP
command, edit `factory.mcp.json` or set `FACTORY_BOTS_MCP_CONFIG` to an absolute
path to another config. The offline state's start command is derived from the
same MCP configuration (the `mcp` argument becomes `up`); the `VAR=value` prefix
is POSIX shell syntax.

The MCP child gets only a small runtime environment (paths, locale, timezone)
plus the config's `env`; it does not inherit BB's provider credentials.

The plugin never starts or stops the factory, never creates or advances a
ticket itself, and never opens the database. The chat's one write tool is the
only path that can change factory state, and the Orchestrator owns it.

If the MCP does not expose `factory_message`, the chat shows an actionable
message; rebuild and restart the factory so the tool is present.

## Status rules

- **Blocked** when a ticket held by the agent has a `stopReason`, or a matching
  durable task has a `blocked` reason. Blocked outranks working and the reason
  is shown verbatim.
- **Working** when a `factory_tasks` entry matches the agent: its owner names
  the agent, or its conversation is the agent's root conversation or one of its
  held tickets' conversations.
- **Idle** otherwise.

Rows are built only from the `bots` map that `factory_status` returns. If the
factory does not return an agent, the board does not show one. The columns come
from the factory's documented ownership table; an unrecognized returned agent
shows `No column`.

Per-agent tokens and cost are intentionally omitted: the read tools this plugin
may use do not attribute usage per agent, so showing a number would be invented.

## Talk to the Orchestrator

The Orchestrator chat is always in the right rail. Type a request there; the
chat keeps the conversation across navigation and reloads, shows the
Orchestrator's answer, and links the tickets it created in the thread and in the
rail. A model turn can take minutes; the message box stays disabled with a
working state until the answer arrives.

The composer carries BB's provider and model picker, like the new-thread
composer. The Orchestrator keeps using the factory's default model until **Use
this model** is checked; from then on the selected provider, model, and reasoning
level are sent with the next message and applied to the Orchestrator
conversation. The picker is BB's catalog, so choose a provider and model the
factory itself can reach.

The Orchestrator decides whether a request is agent-implementable. It can file
a ticket and hand it to the stage that owns it; the board then shows the normal
stage, task, and transcript updates.

## Refresh and transcripts

One poll loop refreshes the board and then, when a ticket is selected, that
ticket — one request at a time, with the next 5-second tick scheduled only after
both settle. Ticket details are read every cycle so a stop reason cannot go
stale. A detail read that fails is retried once; if it fails again, the board
reports the offline/unavailable state instead of claiming to be Live with a
possibly cleared blocked agent.

The transcript is different: it is fetched again only when that ticket's stage
or conversation id changed, and an unchanged ticket reuses the held transcript.

## Normal offline and empty states

- If the Factory MCP answers `fetch failed`, the panel shows **Factory is not
  running** with the resolved start command and keeps polling. Start the
  factory and the board reconnects on its own.

  ![The not-running state with the start command](assets/screenshots/not-running.png)
- A factory with no tickets shows zero health and seven idle bots under **Bots**;
  **Threads** shows its empty state. That is a
  normal starting state, not an error.
- Malformed payloads, a missing config, or a timeout show one bounded
  unavailable message; the panel keeps retrying.

## Install

From this repository:

```sh
bb plugin install ./plugins/factory-bots
bb plugin reload factory-bots
```

Then open **Foreman** from the BB sidebar.

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

- `contract.ts` — zod payload shapes and the panel RPCs.
- `server.ts` — plugin wiring and MCP lifecycle.
- `lib/config.ts` — `factory.mcp.json` loading and start-command derivation.
- `lib/mcp-client.ts` — newline-delimited JSON-RPC over stdio.
- `lib/derive.ts` — pure ordering, counts, and idle/working/blocked rules.
- `lib/service.ts` — board/ticket reads and the transcript cache.
- `lib/live.ts`, `lib/route.ts` — live-tool presentation and panel routes.
- `lib/factories.ts` — the stored factory list: schema, seed, and unique ids.
- `lib/shell.tsx`, `lib/foreman.css` — the Foreman bar, factory switcher, tabs, and board pulse.
- `lib/factories-view.tsx` — the Factories home: health cards, add, edit, and remove.
- `app.tsx`, `app.css` — the board, agent, and ticket views, and the Control Room tokens.
