# Decisions

## D-001: One primary issue action

Status: Accepted

### Evidence

Issue detail currently renders `Send to agent` while the embedded execution
panel separately renders `Execute`.

### Options

Keep both controls, or render only `Start agent` with a configuration-aware
destination.

### Chosen approach

Render only `Start agent`; create and open a BB project thread with Taskboard
attached in its right panel when managed execution is enabled, and preserve
composer handoff otherwise.

### Trade-offs and risks

The advanced review dialog is no longer the default entry point.

### Verification

Source assertions and live issue-detail inspection.

## D-002: Explicit repository initialization

Status: Accepted

### Evidence

Managed worktrees require a commit, and `executionDefaults` rejects an unborn
repository.

### Options

Keep the error, commit user files, or create an empty commit.

### Chosen approach

Create an empty initial commit only for an explicit one-click start.

### Trade-offs and risks

The repository gains a commit. Disable hooks/signing, supply local commit
identity, never stage files, and assert index/working-tree state in tests.

### Verification

Focused tests using an unborn repository with untracked content.

## D-003: Use a native BB thread

Status: Accepted

### Evidence

The user explicitly preferred a new work thread with Taskboard attached on the
right over an internal Taskboard Worker page.

### Options

Keep the internal Worker route, or spawn a native project thread and attach an
issue-targeted Taskboard panel tab.

### Chosen approach

Spawn one project thread with the bounded issue handoff, persist the
issue-specific Taskboard panel tab, and navigate to that thread.

### Trade-offs and risks

Thread spawning becomes the dispatch boundary and must remain idempotent for a
single launch request.

### Verification

Focused thread-spawn, panel-attachment, UI, and live plugin reload checks.

## D-004: Persist native-thread lifecycle separately from provider status

Status: Accepted

### Evidence

The provisioned ROT-18 thread completed, but Taskboard retained no durable
issue-to-thread link and consumed no terminal thread event. The SDK exposes
structured `turn/completed` events with `completed`, `failed`, or `interrupted`
status.

### Options

Parse the assistant's final message, treat an idle thread as completed, update
the provider issue immediately, or persist a native-thread execution record and
reconcile structured terminal events.

### Chosen approach

Persist a dispatch-keyed native-thread link in Taskboard SQLite and reconcile
the latest structured `turn/completed` event in a background service. Map the
platform status to an internal running/completed/failed/canceled lifecycle,
publish realtime changes, and expose that state plus thread navigation in the
issue panel.

### Trade-offs and risks

Native BB threads are conversational and do not have a separate immutable
thread-completed status, so the initial dispatched turn is the completion
boundary for this one-click work request. Follow-up turns do not create another
Taskboard execution. A transient SDK failure remains retryable and visible as a
bounded reconciliation error.

### Verification

Store and service tests cover durable dispatch deduplication, completed,
failed, interrupted, missing, replayed, and still-running observations.
Contract/UI tests cover the lifecycle row and thread navigation. Live reload
proves the service starts and stops cleanly.

## D-005: Provider lifecycle and Empirical are part of managed execution

Status: Accepted

### Evidence

ROT-18's worker reported successful implementation while Linear remained
unchanged, and its handoff prompt did not require the target repository's
Empirical harness.

### Options

Keep provider updates manual, hard-code Linear state names, or resolve
provider-native in-progress/done states through the existing adapter and make
Empirical an explicit managed-worker instruction.

### Chosen approach

Resolve live provider status options by normalized state category, transition
to in-progress after durable launch, transition to done only after structured
successful completion, and persist exact-once receipts/errors in the linked
worker record. Require the target repository's initialized Empirical workflow
in the trusted handoff instructions.

### Trade-offs and risks

Providers with no available in-progress or done mapping cannot be updated
automatically; that is an actionable visible error, not silent success.
Structured worker completion proves the BB turn ended, while Empirical evidence
proves the requested workflow gates ran; both facts remain inspectable.

### Verification

Adapter fixtures prove mapping and exact-once behavior across reloads, failed
workers never close a ticket, transition failures retry visibly, and prompt
tests prove the Empirical instruction is trusted text outside tracker data.
