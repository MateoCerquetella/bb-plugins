# Fix Taskboard Worker Launch For Rot 18 Replace The Competing

## Request

> Fix Taskboard worker launch for ROT-18: replace the competing Execute and Start agent actions with one preferred Start agent flow, keep the dedicated Worker page and kanban drag-to-in-progress launch behavior, and handle repositories with no initial commit so users are not blocked by the current raw validation error. Preserve existing uncommitted Taskboard work and verify the resulting UI and execution behavior.

## Goal

Starting work from an issue or Kanban card is a single action that opens the
new BB thread for the issue, attaches Taskboard in that thread's right panel,
and starts work without requiring the user to understand repository setup.
Taskboard retains a durable link between the issue and provisioned thread and
reconciles terminal thread outcomes into its internal work state.

## Acceptance Criteria

- [ ] [AC-1] Issue details expose one primary `Start agent` action instead of
  separate `Send to agent` and `Execute` actions.
- [ ] [AC-2] `Start agent`, a Kanban card play action, and moving a card into an
  in-progress column all create and open one BB thread with the issue-specific
  Taskboard panel attached, dispatching at most once.
- [ ] [AC-3] When the configured repository is valid but has no commits,
  one-click managed execution creates an empty initial commit without staging
  or changing working-tree files, then uses it as the base revision.
- [ ] [AC-4] When managed execution is disabled, `Start agent` retains the
  existing local composer handoff.
- [ ] [AC-5] Invalid or inaccessible repositories still produce actionable
  field-oriented errors.
- [ ] [AC-UI-1] [UI] The new thread opens as the primary work surface with the
  issue-specific Taskboard view attached in the standard right panel, so
  notifications do not cover the chat or its inputs.
- [ ] [AC-6] Provisioning persists a durable issue-to-thread link before
  returning success, including the project, source, locator, dispatch key, and
  thread identifier.
- [ ] [AC-7] A background reconciliation service observes linked native
  threads and records their current lifecycle state and terminal outcome
  idempotently after plugin reloads or transient failures.
- [ ] [AC-8] When a linked thread finishes successfully, Taskboard exposes that
  completion on the issue and advances its internal execution state instead of
  leaving the issue looking untouched.
- [ ] [AC-9] Failed or canceled linked threads remain linked and expose their
  terminal outcome without being reported as successfully completed.
- [ ] [AC-10] Starting a managed worker transitions the originating external
  issue to its configured in-progress status through the provider adapter.
- [ ] [AC-11] A structured successful worker outcome transitions the
  originating external issue to its configured done/completed status; failed
  or interrupted workers never transition to done.
- [ ] [AC-12] The worker handoff requires the target repository's initialized
  Empirical harness when present, explicitly attaches the originating
  Linear/Jira/GitHub ticket to the exact returned feature before tracker sync
  or material work, forbids replacement ticket creation, and shows attachment
  or provider-transition failures as actionable errors.
- [ ] [AC-UI-2] [UI] The issue-specific right panel shows the linked thread's
  running or terminal state and provides a direct way to return to that thread.

## Scope

- Taskboard issue-detail and Kanban launch controls.
- BB thread creation and issue-targeted right-panel attachment.
- Durable issue-to-thread lifecycle records and background reconciliation.
- Internal execution/tracker state shown in issue details and Kanban surfaces.
- Git default resolution for an unborn repository.
- Focused regression coverage and live plugin reload.

## Non-goals

- Automatically staging or committing user files.
- Changing external tracker status without the configured provider adapter and
  provider-native in-progress/done state mapping.
- Redesigning Symphony runtime internals or tracker synchronization.
- Changing external tracker status merely because an agent starts.
- Inferring successful work from assistant prose or commit messages.
- Treating a missing initialized Empirical harness as a verified managed run.

## Verification

- Run focused Taskboard tests for UI routing, one-click dispatch, repository
  bootstrap, durable lifecycle linkage, terminal outcome reconciliation,
  idempotency, and service lifecycle.
- Cover successful, failed, canceled, missing, and still-running native
  threads, including restart recovery.
- Verify the right panel renders the linked thread state and navigation.
- Run the plugin check/build command authorized by the verification matrix.
- Install/reload the local Taskboard plugin and confirm its services are
  running.

## Capability Deltas

See `deltas/taskboard-execution.md`.
