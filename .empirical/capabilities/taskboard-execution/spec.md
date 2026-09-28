# Taskboard Execution Specification

## Purpose

Run approved Taskboard work through optional execution infrastructure while retaining Taskboard authority over verification and external tracker state.

## Requirements

### Requirement: Optional execution infrastructure

Taskboard SHALL retain the existing local handoff by default and SHALL select Symphony only when explicitly configured for an approved delegated or structured execution request. Routing and backend selection SHALL remain separate.

#### Scenario: Existing user sends an issue to an agent

- WHEN Symphony is unconfigured
- THEN Send to agent opens the same BB composer with the existing sanitized task context.

#### Scenario: Approved delegated implementation

- WHEN the user executes an approved delegated request with Symphony enabled
- THEN Taskboard publishes one stable execution identity and Symphony runs only that request in an isolated workspace.

### Requirement: Durable execution lifecycle

Taskboard SHALL persist execution identity, approved scope, runtime metadata, and verification state. Runtime completion SHALL mean implementation_complete, never external tracker done.

#### Scenario: Duplicate start or Taskboard restart

- WHEN the same approved execution is dispatched again or Taskboard restarts
- THEN the existing Symphony execution is reconciled without spawning a duplicate agent.

#### Scenario: Failure or cancellation

- WHEN the runtime fails, exhausts retries, requests input, or observes cancellation
- THEN Taskboard shows the corresponding failure or blocked state and retains the execution context and workspace metadata.

### Requirement: Authoritative verification and tracker synchronization

Taskboard SHALL verify the implementation against approved acceptance criteria and verification requirements before advancing tracker workflow. Symphony SHALL NOT receive authority or credentials to change external tracker status.

#### Scenario: Agent finishes implementation

- WHEN Symphony reports implementation completion
- THEN Taskboard records implementation_complete and requires its verification before workflow advancement.

#### Scenario: Verification fails

- WHEN required verification fails
- THEN Taskboard retains the task scope and starts an explicit fix iteration; unaffected valid evidence may be reused only for unchanged check inputs.

### Requirement: Existing status experience

Taskboard SHALL expose execution route, engine, state, workspace, agent, Git metadata, errors, and verification through its existing task details and typed status interfaces.

#### Scenario: Inspect running implementation

- WHEN the user opens an executing task
- THEN the detail view shows runtime progress separately from verification and tracker state.
