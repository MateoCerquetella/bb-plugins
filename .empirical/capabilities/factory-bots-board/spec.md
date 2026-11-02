# Factory Bots Board Specification

## Purpose

Let an operator observe the Empirical Factory's agents and tickets live from BB
through the read-only Factory MCP, without a database connection or any write
path into the factory.

## Requirements

### Requirement: Read-only Factory board

The plugin SHALL retry one failed ticket-detail read before declaring the board
not running or unavailable, and SHALL keep only a minimal environment on the
MCP child. The board snapshot SHALL NOT expose the factory storage path.

#### Scenario: A detail read fails once

- **WHEN** `factory_ticket` fails for one ticket during a board refresh
- **THEN** the plugin reads that ticket once more
- **AND** a successful retry keeps the board live with the correct stop reason

#### Scenario: A detail read keeps failing

- **WHEN** the retried `factory_ticket` read also fails
- **THEN** the board returns the corresponding not-running or unavailable state

#### Scenario: A custom factory URL

- **WHEN** `factory.mcp.json` sets a non-default `FACTORY_URL`
- **THEN** the offline start command includes that URL as a shell-quoted prefix
- **AND** the default loopback URL remains omitted

### Requirement: Derived agent status

The status rules are unchanged. The panel SHALL use one poll loop for its
lifetime, so changing routes cannot start a second concurrent board read.

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

A missing MCP script SHALL render an actionable configuration error naming the
missing path and `FACTORY_BOTS_MCP_CONFIG`; it SHALL NOT render the not-running
start command as if the script existed.

#### Scenario: The configured script is absent

- **WHEN** `factory.mcp.json` points at a path that does not exist
- **THEN** the panel explains that the script is missing
- **AND** it names the path and the config override

### Requirement: MCP client lifecycle

A stdout or stderr pipe failure SHALL reject pending calls and stop the child.
The child SHALL NOT inherit unrelated BB process secrets.

#### Scenario: The child's pipe fails

- **WHEN** stdout or stderr emits an error
- **THEN** pending calls reject and the child is replaced on the next call
- **AND** no unhandled error escapes the plugin
