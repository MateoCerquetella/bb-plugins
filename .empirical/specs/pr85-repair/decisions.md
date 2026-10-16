# Decisions

## D-001: Preserve current main behavior during rebase

Status: Accepted

### Evidence

Main has newer pending native completion, structured results, ErrorNotice, and header visibility controls. The PR adds read-only Empirical snapshots.

### Options

1. Replace conflicting modules with the older PR implementations.
2. Combine host binding and observation with current main behavior.

### Chosen approach

Choose option 2 to retain both native behavior and the proposed observation feature.

### Trade-offs and risks

Conflict resolution must preserve event pagination and pending completion. Focused behavioral tests and browser checks cover this risk.

### Verification

Run Taskboard tests, typecheck, build, root checks, and the browser fixture.

- Resume the existing isolated repair worktree because its rebase targets current origin/main 4a45a4a1.
- Keep main's structured result cards, ErrorNotice, pendingCompletion, and header visibility wrapper. They represent newer user-visible behavior.
- Retain the PR's Empirical observer and host identity binding alongside native event pagination; do not restore the PR's older single-page native event code.
- Run focused and root checks. Browser evidence must use BB Surf; unresolved live verification keeps the PR draft.
