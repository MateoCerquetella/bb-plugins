# Taskboard Software Factory

## Purpose

Keep software work visible in Taskboard beside its native BB thread, preserving
tracker identity and separating agent activity from verified work acceptance.

## ADDED Requirements

### Requirement: Independent workflow authorities

Taskboard SHALL persist factory stage, native BB session status, verification
status, and external tracker status as separate values. No native thread event
or verification result SHALL directly mutate the external tracker.

#### Scenario: Agent turn ends before work is accepted

- GIVEN a work item is in Build with a linked native BB session
- WHEN BB reports `turn/completed`
- THEN Taskboard records the session outcome and keeps the factory item out of
  Done
- AND the external tracker status is unchanged.

#### Scenario: User completes reviewed work

- GIVEN the approved implementation revision has current passing evidence and an
  accepted review
- WHEN the user explicitly selects Move to Done
- THEN Taskboard may advance its factory stage to Done
- AND any external tracker move remains a separate explicit provider action.

### Requirement: Manual stage policy

Taskboard SHALL model Intake, Triage, Planning, Build, Review, and Done as
configurable stages whose transition policies default to manual.

#### Scenario: Default policy

- GIVEN a project has not enabled factory automation
- WHEN investigation, planning, build, or review produces an artifact
- THEN Taskboard waits for the corresponding explicit user action before
  advancing or dispatching another session.

#### Scenario: Opt-in policy

- GIVEN the user explicitly enables automation for one stage transition
- WHEN that transition's configured prerequisites are satisfied
- THEN Taskboard may perform only that transition
- AND other stages retain their existing policies.

### Requirement: Durable work identity

Taskboard SHALL attach one factory record to the existing project, source, and
locator identity and SHALL preserve tracker metadata, user-authored content,
plan revisions, approvals, session links, workspace identity, verification, and
PR evidence through restarts.

#### Scenario: Existing tracker item enters the factory

- WHEN the user opens factory work for a cached tracker item
- THEN Taskboard reuses that item's existing identity and connector
- AND does not create or copy a second tracker task.

#### Scenario: Plugin restart

- GIVEN a work item has linked investigation, build, or review sessions
- WHEN Taskboard restarts
- THEN it reloads those links and reconciles their BB status without dispatching
  duplicates.

### Requirement: Versioned plans and exact approval

Taskboard SHALL store immutable plan revisions and bind approval to the current
revision's canonical content digest.

#### Scenario: Plan is approved

- WHEN the user approves plan revision 3
- THEN Taskboard records revision 3 and its content digest
- AND Build can use only that approved revision.

#### Scenario: Approved scope changes

- GIVEN plan revision 3 is approved
- WHEN the title, scope, acceptance criteria, verification requirements, or plan
  body changes
- THEN Taskboard creates a new revision and clears the effective approval
- AND Build remains gated until the new revision is approved.

### Requirement: Native BB stage sessions

Taskboard SHALL use BB's native thread, execution-option, environment, worktree,
permission, event, send, and stop capabilities for investigation, build, and
review. It SHALL NOT introduce another provider credential or agent runtime.

#### Scenario: Investigation starts

- WHEN the user starts Investigate
- THEN Taskboard persists a dispatch identity before spawning one native BB
  session with the selected BB execution settings
- AND links the returned session to the work item and stage.

#### Scenario: Running work is steered

- GIVEN a linked session is running or waiting
- WHEN the user sends steering context in the native thread composer
- THEN BB handles it using its native thread send capability
- AND Taskboard continues to observe the same linked session.

#### Scenario: Running work is canceled

- GIVEN a linked session is active
- WHEN the user selects Cancel
- THEN Taskboard requests BB to stop the exact linked session
- AND records canceling/canceled independently from factory and tracker status.

### Requirement: Idempotent dispatch and bounded recovery

Taskboard SHALL enforce one session per dispatch identity, bound retry attempts,
and recover ambiguous starts without guessing.

#### Scenario: Duplicate start

- WHEN the same work item, stage, plan digest, and dispatch identity are started
  more than once
- THEN Taskboard returns the existing session link and spawns no additional
  thread.

#### Scenario: Crash during spawn

- GIVEN Taskboard persisted a starting dispatch but no thread ID
- WHEN Taskboard restarts
- THEN it marks the attempt as an actionable ambiguous failure
- AND requires an explicit bounded retry rather than auto-spawning.

#### Scenario: Retry limit reached

- GIVEN a stage has exhausted its configured retry allowance
- WHEN another retry is requested
- THEN Taskboard refuses the dispatch and explains the limit.

### Requirement: Evidence-bound implementation and review

Taskboard SHALL associate implementation evidence with the approved plan digest
and implementation revision, and SHALL support a separate review session linked
to the same work item.

#### Scenario: Verification evidence is stale

- GIVEN checks passed for implementation revision A
- WHEN the linked workspace advances to revision B or the approved plan changes
- THEN the prior checks are shown as stale and cannot satisfy review.

#### Scenario: Independent review

- GIVEN a current implementation revision and passing required evidence
- WHEN the user starts Review
- THEN Taskboard may spawn a distinct BB review session with the work item,
  approved plan, revision, changes, checks, and PR evidence
- AND review acceptance remains an explicit user decision.

### Requirement: Actionable factory UI

Taskboard SHALL expose the factory in the existing item detail experience with
clear gates, linked sessions, failures, evidence, and current actions on desktop
and mobile.

#### Scenario: User inspects active build

- WHEN an item in Build is opened
- THEN the UI separately labels factory stage, tracker status, native session
  status, plan approval, workspace, verification, and PR evidence
- AND offers only actions valid for the current durable state.

#### Scenario: Native operation fails

- WHEN spawn, send, stop, event reconciliation, or verification fails
- THEN the UI identifies the failed operation, preserves the work record, and
  shows the next safe action.

### Requirement: Existing Taskboard detail and tracker behavior

The existing Taskboard detail view SHALL incorporate factory controls without
regressing connector credentials, cache, browsing, filters, composer handoff,
issue creation, provider-native status controls, or installed preparation data.

#### Scenario: Factory is unused

- GIVEN a user has not started factory work for an item
- WHEN they browse, filter, open, compose from, create, or move tracker work
- THEN existing Taskboard behavior remains unchanged.

#### Scenario: Provider status is changed

- GIVEN a factory record exists
- WHEN the user uses the existing provider status control
- THEN Taskboard performs only that explicit provider transition
- AND does not infer factory acceptance from the provider response.

#### Scenario: Send to agent opens the working thread

- WHEN the user selects Send to agent
- THEN Taskboard starts or reuses the linked native thread and navigates to it
- AND the existing right panel opens focused on the originating item
- AND that association survives reload independently of browser local state.
