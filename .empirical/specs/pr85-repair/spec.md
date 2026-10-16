# Pr85 Repair

## Request

> Repair existing PR #85 in a fresh temporary worktree, rebase onto current origin/main preserving Taskboard behavior, run focused and root checks plus installed browser verification, push existing PR branch and mark ready, do not merge.

## Goal

PR #85 applies cleanly to current main and retains native Taskboard results, errors, header controls, and Empirical observation.

## Acceptance Criteria

- [ ] [AC-1] Rebase onto current origin/main without conflict markers or lost Taskboard functionality.
- [ ] [AC-2] Focused Taskboard checks and root checks pass, or concrete pre-existing blockers are recorded.
- [ ] [AC-UI-1] [UI] Browser verification shows Empirical phase transitions and retained offline progress.
- [ ] [AC-3] Push the existing PR branch with a lease; never merge; retain draft status unless verification supports readiness.

## Scope

PR #85, its Taskboard implementation and its rebase conflicts.

## Non-goals

No merging or unrelated plugin work.

## Verification

Taskboard tests, typecheck, build, root npm run check, and browser fixture on BB Surf.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
