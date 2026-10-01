# Detached project checkout execution defaults

## MODIFIED Requirements

### Requirement: Optional execution infrastructure

Taskboard SHALL retain the existing local handoff by default and SHALL select
Symphony only when explicitly configured for an approved delegated or
structured execution request. Routing and backend selection SHALL remain
separate. Managed execution defaults SHALL preserve the configured project
repository and exact Git revision and SHALL infer a valid base branch for both
attached and detached project checkouts.

#### Scenario: Existing user sends an issue to an agent

- WHEN Symphony is unconfigured
- THEN Send to agent opens the same BB composer with the existing sanitized task context.

#### Scenario: Approved delegated implementation

- WHEN the user executes an approved delegated request with Symphony enabled
- THEN Taskboard publishes one stable execution identity and Symphony runs only that request in an isolated workspace.

#### Scenario: Detached project source

- WHEN the configured BB project checkout has a detached HEAD
- THEN Taskboard retains its repository and exact base revision and infers a
  valid base branch from repository metadata.

#### Scenario: Execution defaults cannot be determined

- WHEN the project source is missing, invalid, or has no usable branch metadata
- THEN Taskboard names the repository or base-branch correction required
  without exposing an internal Git subcommand failure.
