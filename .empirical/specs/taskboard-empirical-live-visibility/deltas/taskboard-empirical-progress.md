## Purpose

Show the progress of a Taskboard-started agent and its Empirical feature in
one place while preserving the separate authority of BB, Empirical and the
external ticket provider.

## ADDED Requirements

### Requirement: Taskboard shows authoritative Empirical progress for a started task

After Start task confirms its native BB dispatch, Taskboard SHALL associate
the task run with its exact host and checkout and SHALL display a read-only
Empirical workflow snapshot when that checkout is initialized. The snapshot
SHALL identify its observed time, feature, owner, revision, phase, status,
next action, verification and durable completion level. Native agent activity
and external tracker status SHALL remain separately labeled facts.

#### Scenario: Agent is active while Empirical awaits a decision

- **WHEN** the linked BB thread is running and the selected Empirical feature
  is awaiting human input
- **THEN** the panel shows the active agent and Empirical's awaiting-human
  state independently
- **AND** it does not advance or complete the Empirical feature.

#### Scenario: Durable completion follows implementation

- **WHEN** an Empirical revision reaches implemented and later verified Done
- **THEN** the panel updates to each durable level in turn
- **AND** it never infers verified Done from a finished agent turn or ticket.

### Requirement: Live observation has explicit freshness and recovery

Taskboard SHALL refresh observations after local Empirical changes and SHALL
reconcile after reconnect or missed notifications. It SHALL present stale,
offline, invalid and uninitialized observations distinctly. A snapshot from
another host or checkout SHALL NOT replace the linked run's snapshot.

#### Scenario: Host disconnects during a running task

- **WHEN** the owning host disconnects after a valid observation
- **THEN** Taskboard retains its last snapshot marked stale with its timestamp
- **AND** it does not report the feature as completed or absent.

#### Scenario: Two worktrees select the same feature

- **WHEN** the repository overview reports conflicting owners
- **THEN** the panel identifies the conflict and both checkout roots
- **AND** does not silently choose one as the authoritative owner.
