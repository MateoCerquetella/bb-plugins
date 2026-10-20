# Decisions: Plugin Release And Aura Titlebar

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

- Issue #92 reports that BB now places both Aura target panels at the window top
  in the framed macOS layout.
- Aura's `.aura-capy-layer` is a direct child of each target and uses
  `position:absolute; inset:0`.
- BB's framed layout exposes an ancestor `data-framed` attribute and sets
  `--bb-window-title-bar-height` from desktop window geometry.
- Taskboard's distribution test expects `^0.3.5`; both install examples still
  use `^0.3.4`.

### Options

1. Detect desktop geometry in TypeScript and write an inline top offset.
2. Use the host's framed attribute and title-bar CSS variable in Aura's scoped
   layer rule.
3. Add a fixed 44px offset to every Aura panel.

### Chosen approach

Use option 2. It consumes BB's existing layout contract, keeps Aura's effect
lifecycle unchanged, and applies only when the host marks the layout framed.
Update only the stale Taskboard install versions.

### Trade-offs and risks

Aura now depends on two public host layout signals already used by BB's framed
shell. A future host rename could remove the offset, so the regression test
covers both signals together. The rule intentionally does not offset unframed
or narrow layouts.

Release tags are immutable external writes. Create them only after focused
checks and exact-head review pass. Keep marketplace work separate from PR #621
so its maintainer-only label remains visible and unmodified.

### Verification

- The lifecycle test proves that framed layers start at the CSS variable and
  unframed layers retain `inset:0`.
- Aura's full check proves type, unit, and build behavior.
- BB Surf screenshots prove thread and new-thread placement in the running app.
- Plugin focused checks, peeled-tag inspection, manifest inspection, and GitHub
  release inspection prove the two releases.
- Marketplace validation and pull-request checks prove the public metadata
  change without claiming publication before merge.
