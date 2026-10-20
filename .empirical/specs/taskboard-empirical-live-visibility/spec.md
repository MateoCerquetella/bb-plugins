# Taskboard Empirical Live Visibility

## Request

> Implement live Empirical work visibility inside Taskboard from Start work through agent progress and durable completion, with a runnable end-to-end demo and UI tests. Preserve existing tracker workflows and display stale/offline state honestly.

## Goal

When a user starts a Taskboard ticket, they can follow its native BB agent
session and, for an initialized Empirical checkout, the durable Empirical
feature from first workflow transition to verified completion. The display
distinguishes agent activity, external ticket state, and Empirical's actual
phase and completion level.

## Acceptance Criteria

- [ ] [AC-1] Starting work from a ticket preserves the existing idempotent
  native dispatch and binds that run to the exact BB environment, host, and
  checkout used by its agent. Reopening the ticket finds the same run.
- [ ] [AC-2] In an initialized Empirical checkout, Taskboard displays the
  selected feature, revision, phase, status, next action, verification and
  highest durable completion level from a read-only Empirical snapshot. It
  never treats an idle native thread or a provider's Done status as Empirical
  completion.
- [ ] [AC-3] A change to Empirical's journal, state or checkout selection
  refreshes the open view promptly; reconnect and periodic reconciliation
  recover missed changes. Each observation carries host, checkout, and
  observed-at time. Offline, stale, invalid and uninitialized sources are
  visibly distinct from an empty or completed workflow.
- [ ] [AC-4] The ticket's native activity remains available, including
  investigation, plan, build, review and blocked input. A workflow revision
  displays as a separate fact, and the user can open its owning BB thread.
- [ ] [AC-5] A completed Empirical feature remains visible with its actual
  completion level and method. An implemented-only, verification-skipped,
  blocked, or merged-but-unclosed feature is not presented as verified Done.
- [ ] [AC-6] Worktrees and hosts cannot be conflated: snapshots from the
  wrong environment are rejected, duplicate feature owners are reported,
  and a disconnected host retains only a clearly stale last observation.
- [ ] [AC-7] A runnable fixture demonstrates Start task, live phase change,
  blocked/input, and durable completion in the actual Taskboard UI without
  launching paid agents or changing a real tracker. Focused backend and UI
  tests cover these transitions and reconnect/offline behavior.

## Scope

- Extend the current Taskboard factory progress surface and its host-routed
  read path. Keep the provider ticket and BB native session as separate
  authorities from Empirical.
- Observe initialized Empirical repositories only. Use its read-only
  projection or a versioned equivalent; do not write `.empirical` state.
- Link a started run to its exact workspace. Show the selected feature and
  any other relevant copy only when ownership can be established.

## Non-goals

- Reimplement Empirical transitions, silently start a feature, approve gates,
  merge, publish, or close an external issue.
- Claim that filesystem watching alone guarantees delivery across offline
  hosts, or that native command output proves verification.
- Replace Taskboard's tracker synchronization or BB's agent controls.

## Verification

- Unit tests for host selection, snapshot validation, freshness, conflict and
  completion classification.
- Native service integration test using an isolated Empirical fixture whose
  durable state changes while a ticket run is linked.
- Browser demo exercising the real Taskboard progress component through
  start, active, blocked, done, and disconnected states at panel widths.
- Run the Taskboard workspace check and BB plugin build/type checks. Verify
  the installed local plugin's human panel and CLI surface.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
