# Decisions: Disable Taskboard AI Drafting for v0.3.3

## D-001: Remove the helper instead of accepting Plan-mode residual authority

Status: Accepted

### Evidence

- BB plugin SDK `0.4.6` exposes only `accept-edits`, `auto`, and `full` for
  `threads.spawn`; it has no read-only filesystem/tool/network allowlist.
- Native Plan is provider behavior, not a BB-enforced capability boundary.
  Malicious repository content can influence in-sandbox workspace, subprocess,
  read, or network effects before Taskboard receives an interaction or output.
- The user explicitly stated they do not use AI drafting and selected disabling
  it rather than accepting the residual risk.

### Options

1. Retain native Plan and document/accept the residual ambient authority.
2. Remove model/helper execution and use the editable original prompt until BB
   exposes a genuinely restricted worker API.

### Chosen approach

Choose option 2. Composer capture stays useful but becomes synchronous and
manual. Remove the obsolete execution and disclosure surface rather than leave
dead or feature-flagged security-sensitive code.

### Trade-offs and risks

Repository-aware title/body generation is unavailable, but no user workflow
depends on it and manual capture retains the original prompt. Reintroduction
requires a future independently reviewed restricted-worker contract.

### Verification

- Static searches and source tests prove no helper/model/Plan spawn path remains.
- Browser and UI-source tests prove manual prompt capture and separate creation.

## D-002: Make the exact commit the authoritative release input

Status: Accepted

### Evidence

An overlay-capable consumer probe can pass with product files that a later tag
does not contain.

### Options

1. Use the same overlay behavior for development and release evidence.
2. Default to a clean committed-only clone with exact commit/tree comparison;
   keep an explicit overlay flag for non-authoritative development checks.

### Chosen approach

Choose option 2 and bind the release output to exact HEAD commit and tree IDs.

### Trade-offs and risks

Contributors must commit before the authoritative check. The explicit overlay
mode preserves fast pre-commit iteration without being accepted as release
evidence.

### Verification

- A dirty default invocation fails before release evidence is produced.
- The clean invocation clones matching commit/tree IDs and builds successfully.
