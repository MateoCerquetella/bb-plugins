# Taskboard Autonomous Factory Specification

## Purpose

Admit ready provider tickets into Taskboard's durable native-agent workflow
without per-ticket manual starts, while keeping capacity, recovery, and human
acceptance boundaries explicit.

## Requirements

### Requirement: Explicit project factory admission

The factory MUST remain disabled until explicitly enabled for a project's
selected issue provider. It MUST discover eligible todo tickets and persist
admission before starting a native worker.

#### Scenario: An enabled project receives a ready ticket

- GIVEN a configured provider and an enabled project factory with capacity
- WHEN a previously unclaimed ticket is eligible in the live provider
- THEN Taskboard starts its investigation without a per-ticket click
- AND records the ticket identity before native dispatch.

#### Scenario: Duplicate admission and restart

- GIVEN a ticket with a durable factory claim
- WHEN concurrent ticks or a restarted service discover that ticket
- THEN no second workflow is admitted
- AND an uncertain dispatch is never automatically retried.

#### Scenario: Claimed tickets fill the first provider page

- GIVEN more cached todo tickets than one bounded intake scan can inspect
- AND the first tickets already have durable claims
- WHEN the factory has available capacity
- THEN Taskboard excludes those claims before it applies the scan limit
- AND later eligible tickets can still be admitted.

### Requirement: One coordinator per ticket team

Each automatically admitted ticket MUST own one visible native coordinator
thread. Every new Investigation, Plan, Build, and Review session for that ticket
MUST be a native child of the coordinator. The existing factory record remains
the only workflow state machine.

#### Scenario: A ticket starts its agent team

- GIVEN a newly admitted ticket without a coordinator
- WHEN automatic work starts
- THEN Taskboard persists coordinator dispatch intent before the native call
- AND creates one visible coordinator thread
- AND creates the Investigation session as its child.

#### Scenario: Later stages and repair

- GIVEN a ticket with a linked coordinator
- WHEN planning, Build, Review, or a repair session starts
- THEN each new native session has the coordinator as its parent
- AND Build continuations still reuse the original Build child and worktree.

#### Scenario: Coordinator dispatch is ambiguous

- GIVEN Taskboard cannot prove whether the coordinator was created
- WHEN the service restarts or scans the ticket again
- THEN it does not create another coordinator or stage session
- AND it exposes a recovery action to link the existing native thread.

#### Scenario: Existing manual workflow

- GIVEN a manual factory record created before ticket coordinators existed
- WHEN a user inspects or continues that record
- THEN its existing runs remain readable and recoverable
- AND Taskboard does not silently reparent existing native threads.

### Requirement: Bounded and observable automation

The factory MUST enforce its autonomous workflow capacity in code and expose
project settings and status through RPC, CLI, and project Manage.

#### Scenario: Pause during work

- GIVEN an enabled factory with a running native thread
- WHEN the operator pauses the factory
- THEN the thread remains visible and is not forcibly stopped
- AND no new queue-owned stage or ticket starts until resumed.

#### Scenario: Provider truth cannot be established

- GIVEN a factory bound to one provider configuration
- WHEN the provider changes or a live read fails
- THEN automatic dispatch stops with an observable error
- AND cached eligibility alone does not authorize a new dispatch.

#### Scenario: One workflow is blocked after a healthy scan

- GIVEN provider candidate discovery succeeds
- AND a queue-owned ticket cannot complete a required live read
- WHEN the operator checks project factory status
- THEN the status reports blocked work and its reason
- AND the successful scan does not hide that workflow failure.

#### Scenario: Operator distinguishes idle, paused, and failed

- GIVEN an operator opens Project Manage
- WHEN the factory is healthy and idle, intentionally paused, missing required
  configuration, or blocked by a provider read failure
- THEN Taskboard shows a distinct state label and short reason
- AND shows persisted enablement, provider identity, intake policy, concurrency,
  queue and active counts, and last scan result
- AND cached counts are labeled as last known rather than current eligibility.

### Requirement: Preserve execution and acceptance boundaries

Queue-owned tickets MUST reuse the existing managed build and independent review
workflow. Automatic processing MUST NOT merge, deploy, or close tracker tickets.

#### Scenario: Review passes

- GIVEN an implemented build and an independent passed review
- WHEN reconciliation observes the result
- THEN work remains awaiting human acceptance
- AND the ticket is not automatically closed.

#### Scenario: Ticket scope changes or closes

- GIVEN an automatically admitted ticket
- WHEN a live provider read reports changed scope or a terminal status
- THEN no subsequent automatic stage starts from the stale plan
- AND the ticket shows `Scope changed` or `Ticket closed` above its team with a
  short reason and no action that bypasses the blocker.

#### Scenario: Cached eligibility is unconfirmed

- GIVEN a queue-owned ticket was previously eligible
- WHEN a required live provider read fails
- THEN subsequent automatic dispatch remains blocked
- AND the ticket shows `Provider status stale` and the live-read reason above
  its team
- AND existing native threads remain openable
- AND no recovery action authorizes dispatch from cached eligibility.

### Requirement: Visible ticket team hierarchy

Taskboard MUST show the coordinator and its stage children as one ticket team.
Each row MUST show the role, current native state, and an action that opens the
native thread. The grouping MUST remain readable on desktop and mobile.

#### Scenario: Inspect an active ticket

- GIVEN a ticket with a coordinator and three stage sessions
- WHEN the user opens factory progress
- THEN one coordinator row contains the Investigation, Plan, and Build rows
- AND each row opens its exact native thread.

#### Scenario: Inspect on a narrow viewport

- GIVEN a mobile viewport
- WHEN the user opens factory progress
- THEN role and state remain visible
- AND actions remain reachable
- AND the page has no horizontal overflow.

#### Scenario: Long operator-facing content

- GIVEN a long ticket title, provider name, or blocker reason
- WHEN Project Manage or factory progress is viewed on a narrow viewport
- THEN titles and reasons wrap to readable lines
- AND provider identity wraps without obscuring controls
- AND role, native state, and actions retain readable rows
- AND the page has no horizontal overflow.

#### Scenario: Keyboard and refresh behavior

- GIVEN a user navigates factory progress by keyboard
- WHEN focus reaches a ticket disclosure or `Open thread` action
- THEN the control has a visible focus indicator and activates with its
  platform-standard keyboard action
- AND the disclosure exposes its expanded state to assistive technology
- AND a user-expanded or collapsed group retains that state across data refresh
  while that ticket remains present.

### Requirement: Explicit AI selection

The factory MUST expose one AI picker in project settings and the new-task
dialog. The picker MUST show provider logos and model names. A project policy
and a task MAY each persist an explicit AI choice: provider, model, reasoning
level, permission mode, and service tier. Manual Start task, coordinator
creation, and every new stage session MUST resolve execution as task choice,
then project policy choice, then native project defaults, and MUST pass an
explicit choice as caller-explicit inputs. The factory MUST fail with an
actionable picker message when no choice or default exists.

#### Scenario: Operator chooses the factory AI

- GIVEN a project factory with available BB providers
- WHEN the operator selects a provider, model, reasoning level, permission mode,
  and service tier and saves
- THEN Taskboard persists that choice for the project
- AND the next coordinator, Investigation, Plan, Build, or Review session is
  spawned with that exact execution and caller-explicit sources.

#### Scenario: New task overrides the project AI

- GIVEN a project policy with one AI choice
- WHEN the operator picks a different AI in the new-task dialog and chooses
  Start now
- THEN Taskboard persists the task-scoped choice
- AND that task's coordinator and stages use the task choice
- AND another ticket still uses the project policy choice.

#### Scenario: Provider and model presentation

- GIVEN a project with several available providers
- WHEN the picker opens in settings or the new-task dialog
- THEN each provider option shows its logo and display name
- AND the selected provider and model are summarized together
- AND a provider with no logo still has a readable fallback label.

#### Scenario: No explicit choice

- GIVEN no task choice and no saved factory policy choice
- WHEN a project has native execution defaults
- THEN a new session uses those defaults as before
- AND when the project has no defaults the action fails with a message that
  tells the operator to choose an AI in the picker.

#### Scenario: Changing the choice mid-workflow

- GIVEN an existing coordinator or stage session
- WHEN the operator saves a different project or task AI choice
- THEN the existing native session keeps its original execution
- AND only new sessions use the updated choice.

### Requirement: Software factory operator console

Taskboard MUST present ticket factory work as one operator console rather than
parallel team, phase, and global-session representations. The console MUST put
the current state, blocker, and primary action before evidence; expose one stage
rail with stage-scoped attempts; show one selected-run evidence pane; and keep
provider ticket context visible beside factory work on wide screens or one view
switch away on narrow screens. Coordinator recovery and Empirical status MUST
remain available in the workspace pane and move into the summary only when they
block work.

#### Scenario: Inspect active factory work

- GIVEN a ticket with a coordinator and multiple stage sessions
- WHEN the user opens factory progress
- THEN the first viewport shows the current stage, state, blocker, and primary
  action
- AND one stage rail shows Investigation, Plan, Build, and Review
- AND selecting a stage exposes only that stage's attempts
- AND selecting an attempt shows its activity, result, commands, updates,
  changed files, and full output in one evidence pane
- AND the selected native session has a direct thread action.

#### Scenario: Inspect ticket intent while diagnosing work

- GIVEN a factory ticket with provider metadata, description, acceptance
  criteria, and comments
- WHEN the user inspects factory evidence on a wide viewport
- THEN ticket context remains visible beside the operator console
- AND on a narrow viewport a keyboard-accessible Factory/Ticket switch keeps
  both surfaces reachable without duplicating the ticket heading.

#### Scenario: Refresh during historical inspection

- GIVEN the user explicitly selected a historical stage attempt
- WHEN factory polling returns a newer record
- THEN the historical selection remains selected while its run still exists
- AND an operator who did not explicitly choose history continues to follow the
  current run
- AND the current-state summary remains visible while history is inspected.

#### Scenario: Blocking workspace state

- GIVEN coordinator recovery, provider truth, or Empirical ownership prevents
  the next action
- WHEN the operator opens the ticket
- THEN the blocking reason and relevant recovery action appear in the summary
- AND non-blocking coordinator, plan, and Empirical detail remains in the
  workspace pane
- AND no duplicate lifecycle rail or team tree is rendered.

#### Scenario: Inspect on a narrow viewport

- GIVEN a mobile viewport
- WHEN the user opens factory progress
- THEN current stage and state remain visible
- AND the primary action remains above the evidence
- AND stage, attempt, Factory/Ticket, evidence, and thread actions remain
  reachable
- AND the page has no horizontal overflow.

#### Scenario: Long operator-facing content

- GIVEN a long ticket title, provider name, or blocker reason
- WHEN Project Manage or factory progress is viewed on a narrow viewport
- THEN titles and reasons wrap to readable lines
- AND provider identity wraps without obscuring controls
- AND stage labels, attempt controls, and actions retain readable rows
- AND the page has no horizontal overflow.

#### Scenario: Keyboard and refresh behavior

- GIVEN a user navigates factory progress by keyboard
- WHEN focus reaches a stage, attempt, evidence tab, disclosure, Factory/Ticket
  switch, or `Open thread` action
- THEN the control has a visible focus indicator and activates with its
  platform-standard keyboard action
- AND tabs and disclosures expose their selected or expanded state to assistive
  technology
- AND explicit historical selection and disclosure state remain stable across
  data refresh while their underlying records remain present.

### Requirement: Ticket drafting uses the selected AI and detail

Improve title & description MUST offer Concise and Detailed rewriting. The
hidden helper MUST use the AI selected in the new-task dialog, then the current
thread's execution, then project defaults. It MUST rewrite text only and MUST
NOT change the factory policy or the task's saved AI choice.

#### Scenario: Concise or detailed rewrite

- GIVEN a rough title and description and an available AI
- WHEN the operator chooses Concise or Detailed and selects Improve
- THEN the helper runs with the selected AI
- AND Concise returns a short actionable draft
- AND Detailed returns problem, outcome, scope, acceptance criteria, and risks
- AND the helper does not modify the repository or create a ticket.

#### Scenario: No task or thread choice

- GIVEN the new-task picker is empty and the current thread has no execution
- WHEN the operator improves the draft
- THEN the helper falls back to the project's native execution defaults
- AND when none exists it fails with an actionable model message.
