# Taskboard Execution Delta

## MODIFIED Requirements

### Requirement: Optional execution infrastructure

Taskboard SHALL expose a single `Start agent` action for beginning work. When
managed execution is enabled, that action SHALL create and open one native BB
thread, attach the issue-specific Taskboard view in the thread's standard right
panel, and dispatch at most once. When it is disabled, the action SHALL use the
existing local composer handoff. Managed execution defaults SHALL preserve the
configured project repository and exact Git revision and SHALL infer a valid
base branch for attached, detached, and unborn project checkouts. Taskboard
SHALL durably associate every provisioned native BB thread with its originating
issue, reconcile the linked thread's lifecycle into Taskboard's internal
execution state, and show that lifecycle state in the issue-specific right
panel. Reconciliation SHALL be restart-safe and idempotent and SHALL not infer
success from free-form assistant output. External provider status SHALL change
only when an explicit completion policy authorizes that transition.

#### Scenario: One-click managed start

- WHEN a user selects `Start agent` for a task with managed execution enabled
- THEN Taskboard creates and opens one native BB thread, attaches the
  issue-specific right panel, and dispatches that task at most once.

#### Scenario: Existing local handoff

- WHEN managed execution is disabled
- THEN `Start agent` opens the BB composer with the existing sanitized task
  context.

#### Scenario: Unborn repository

- WHEN the configured repository is valid but has no commits
- THEN Taskboard creates one empty initial commit without staging working-tree
  files and uses that commit and the repository's configured branch as the
  managed execution base.

#### Scenario: Kanban work begins

- WHEN a user selects the card play action or moves a card from another state
  into an in-progress column
- THEN Taskboard opens the same native thread flow used by `Start agent`.

#### Scenario: Execution defaults cannot be determined

- WHEN the project source is missing or invalid
- THEN Taskboard names the repository correction required without exposing an
  internal Git subcommand failure.

#### Scenario: Provisioning persists the link

- WHEN Taskboard successfully provisions a native thread for an issue
- THEN it stores the project, source, locator, dispatch key, and thread ID
  before returning success to the UI.

#### Scenario: Linked thread is still active

- WHEN reconciliation observes that a linked thread is active
- THEN Taskboard records and exposes a running state without marking the work
  complete.

#### Scenario: Linked thread completes successfully

- WHEN reconciliation observes a platform-defined successful terminal outcome
  for a linked thread
- THEN Taskboard records that outcome idempotently and exposes the issue as
  internally completed rather than untouched.

#### Scenario: Linked thread fails or is canceled

- WHEN reconciliation observes a failed or canceled terminal outcome
- THEN Taskboard preserves the thread link and exposes that exact outcome
  without reporting successful completion.

#### Scenario: Plugin restarts after thread completion

- WHEN Taskboard restarts after a linked thread reached a terminal state
- THEN its reconciliation service discovers and persists the missed outcome
  without creating another thread or duplicating completion effects.

#### Scenario: External tracker authority is preserved

- WHEN a linked thread reaches a terminal outcome and no explicit external
  completion policy authorizes a provider transition
- THEN Taskboard updates only its internal execution record and leaves the
  provider-native issue status unchanged.

#### Scenario: User returns to linked work

- WHEN an issue has a linked native thread
- THEN its panel identifies whether the thread is running, completed, failed,
  or canceled and lets the user return to the linked thread.
