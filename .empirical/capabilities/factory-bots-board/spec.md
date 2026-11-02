# Factory Bots Board Specification

## Purpose

Let an operator observe the Empirical Factory's agents and tickets live from BB
through the read-only Factory MCP, without a database connection or any write
path into the factory.

## Requirements

### Requirement: Read-only Factory board

The plugin SHALL read Empirical Factory state only through the configured
Factory MCP server. It SHALL call only `factory_status`, `factory_tickets`,
`factory_ticket`, `factory_tasks`, and `factory_transcript`, and SHALL NOT issue
writes, open the factory database, or infer an agent that `factory_status` did
not return. The board snapshot SHALL NOT expose the factory storage path.

#### Scenario: The factory reports seven agents

- **WHEN** `factory_status` returns the seven known bots
- **THEN** the board shows one card for each, in the documented order
- **AND** each card shows its conversation id, owned column, and held ticket
  count

#### Scenario: An agent is absent from status

- **WHEN** `factory_status` omits an agent
- **THEN** no card for that agent is rendered

### Requirement: Derived agent status

An agent SHALL be `blocked` when one of its held tickets has a non-null
`stopReason` or a matching task has a non-null `blocked` reason, and the card
SHALL surface that reason verbatim. Otherwise it SHALL be `working` when a
`factory_tasks` entry matches its owner or conversation (including a held
ticket's conversation), and `idle` with no match. The panel SHALL use one poll
loop for its lifetime, so changing routes cannot start a second concurrent
board read.

#### Scenario: A ticket is stopped

- **WHEN** a held ticket carries `stopReason: "attempt budget exhausted"`
- **THEN** the card shows `blocked` and that exact reason
- **AND** a running task for the same agent does not downgrade it to working

#### Scenario: A task names a held conversation

- **WHEN** a task's `conversationId` equals a ticket held by the agent
- **THEN** the agent is `working`

#### Scenario: Navigating during a refresh

- **WHEN** the operator opens an agent or ticket while a board read is running
- **THEN** the existing loop finishes and the change is picked up in the same
  or next cycle
- **AND** no second loop starts

### Requirement: Ticket drill-down and live transcript

Clicking an agent SHALL list its tickets. Clicking a ticket SHALL show the
`factory_ticket` fields and its `factory_transcript`, highlighting the live tool
call. Transcripts SHALL be refetched only when the ticket's stage or conversation
id changed.

#### Scenario: Refresh on an unchanged ticket

- **WHEN** the panel refreshes and the selected ticket's stage and conversation
  id are unchanged
- **THEN** the held transcript is returned without calling
  `factory_transcript` again

#### Scenario: A ticket advances

- **WHEN** the ticket's stage or conversation id changes
- **THEN** the next refresh calls `factory_transcript` and replaces the held
  transcript

### Requirement: Normal offline and empty states

A `fetch failed` MCP answer SHALL render a not-running state with the resolved
start command and SHALL keep polling. A factory with no tickets SHALL render
normal zero health and idle cards. A missing MCP script SHALL render an
actionable configuration error naming the missing path and
`FACTORY_BOTS_MCP_CONFIG`; it SHALL NOT render the not-running start command as
if the script existed. A non-default `FACTORY_URL` SHALL appear on the displayed
start command.

#### Scenario: The factory process is down

- **WHEN** the MCP tool answers `fetch failed`
- **THEN** the panel shows "Factory is not running" and
  `node <factory>/dist/main.js up`
- **AND** no stack trace or JSON error payload is shown

#### Scenario: The factory has no tickets

- **WHEN** `factory_status` reports zero tickets
- **THEN** the header shows zero and each agent card remains visible and idle

#### Scenario: The configured script is absent

- **WHEN** `factory.mcp.json` points at a path that does not exist
- **THEN** the panel explains that the script is missing
- **AND** it names the path, the config override, and the reload step

#### Scenario: A custom factory URL

- **WHEN** `factory.mcp.json` sets a non-default `FACTORY_URL`
- **THEN** the offline start command includes that URL as a shell-quoted prefix
- **AND** the default loopback URL remains omitted

### Requirement: MCP client lifecycle

A stdout or stderr pipe failure SHALL reject pending calls and stop the child.
The child SHALL NOT inherit unrelated BB process secrets.

#### Scenario: The child's pipe fails

- **WHEN** stdout or stderr emits an error
- **THEN** pending calls reject and the child is replaced on the next call
- **AND** no unhandled error escapes the plugin

### Requirement: Ticket detail resilience

A failed ticket-detail read SHALL be retried once before the board reports a
not-running or unavailable state.

#### Scenario: A detail read fails once

- **WHEN** `factory_ticket` fails for one ticket during a board refresh
- **THEN** the plugin reads that ticket once more
- **AND** a successful retry keeps the board live with the correct stop reason

#### Scenario: A detail read keeps failing

- **WHEN** the retried `factory_ticket` read also fails
- **THEN** the board returns the corresponding not-running or unavailable state
