# Fix The Installed Taskboard Symphony Execution Flow Shown By The

## Request

> Fix the installed Taskboard Symphony execution flow shown by the user: the Review execution dialog fails Git validation with `symbolic-ref` when the repository field is empty or the source checkout is detached. Make repository and branch inference robust, show actionable validation errors, preserve Taskboard as workflow authority, add regression tests, verify the affected plugin, and reinstall/reload the corrected local Taskboard plugin in this BB installation.

## Goal

Taskboard opens the managed execution review with a usable repository, base
branch, and exact base revision even when BB's project source is a detached Git
checkout. Validation failures identify the field and corrective action instead
of exposing the failed Git subcommand.

## Acceptance Criteria

- [ ] [AC-1] A normal checkout uses its current branch and HEAD for execution
      defaults.
- [ ] [AC-2] A detached checkout retains the project repository and HEAD and
      infers a valid base branch from exact local refs, remote default metadata, or
      Git's configured initial branch.
- [ ] [AC-3] When no valid repository or base branch can be determined,
      Taskboard reports an actionable error without exposing `symbolic-ref`.
- [ ] [AC-4] Review-request validation names the invalid field and its
      correction.
- [ ] [AC-5] Taskboard remains the authority for scope, approval, verification,
      completion, and tracker synchronization.
- [ ] [AC-6] The corrected local plugin is reinstalled/reloaded and its live
      execution-defaults RPC no longer reports the observed failure.

## Scope

- Robust repository, revision, and base-branch defaults for managed execution.
- Actionable form and Git validation errors.
- Regression coverage for attached and detached project sources.
- Focused Taskboard checks and live local-plugin reload.

## Non-goals

- Changing execution routing, Symphony lifecycle, verification policy, tracker
  semantics, or task planning.
- Starting a real coding execution as an installation test.
- Publishing or changing the external tracker.

## Verification

- Run the focused Taskboard type, test, build, and metadata checks selected by
  Empirical.
- Exercise defaults against temporary attached and detached Git repositories.
- Reload the installed path plugin and confirm it is running without the prior
  `executionDefaults` error.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
