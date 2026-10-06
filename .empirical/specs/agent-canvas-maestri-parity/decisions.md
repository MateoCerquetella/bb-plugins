# Decisions: Agent Canvas Maestri Parity

## D-001: Continue the installed baseline in this feature checkout
Status: Accepted
### Evidence

`bb plugin list` resolves Agent Canvas to another checkout at e4f7122ad; this checkout lacks plugins/agent-canvas. The source plugin has no uncommitted code changes. Its existing native live chat, bounded graph and capture authorization should be retained.
### Options

modify the old checkout; import its tracked plugin files into the selected feature checkout.
### Chosen approach

import only tracked plugin files during implementation, leaving the original checkout and unrelated Empirical journal changes untouched.
### Trade-offs and risks

baseline plugin SDK 0.5.29 is newer than root 0.4.29. Pin each plugin to its bb-app release and verify root checks; do not vendor declarations.
### Verification

independent plugin build/types/tests, root checks and installed UI/CLI.

## D-002: Observable parity with real BB behavior
Status: Accepted
### Evidence

the reference exposes a native application through screenshots and documentation, not a browser-hosted app. Feature screenshots show a square grid, central insertion pill, compact headers, curved cables, sticky notes and bottom-right controls.
### Options

build a cosmetic mock; implement real portable behavior on BB APIs.
### Chosen approach

implement real portable behavior and keep a comprehensive parity inventory; retain Agent Canvas branding. Native-only capabilities require documented API assessment and explicit gaps.
### Trade-offs and risks

actual parity is substantially broader than restyling; portable gaps remain outstanding until verified. Platform claims cannot be copied.
### Verification

acceptance-specific tests and real browser scenarios, not screenshot-only completion.

## D-003: Preserve one parity contract and continue autonomously
Status: Accepted
### Evidence

User approved the preview and said "go please dont ask me anything". The current checkout is already an isolated feature branch. Empirical's size decision retained one feature.
### Options

create another feature/worktree; continue in this selected checkout.
### Chosen approach

continue here, use judgment on reversible implementation choices, and retain all portable parity requirements. Do not create the unrelated worktree proposed from the approval message.
### Trade-offs and risks

broad work needs incremental validation, with unfinished requirements left visible.
### Verification

evidence for each acceptance criterion and full parity inventory before final completion.

## D-004: Separate pure authored documents from live snapshots
Status: Accepted
### Evidence

The baseline snapshot represents real BB identities and recorded parent/browser ownership. Notes, templates and authored links require persistent user data independent of that snapshot.
### Options

synthesize fake threads into snapshots; use a validated document beside the live graph.
### Chosen approach

a versioned pure document with presentation metadata and authored links; retain recorded relationships without mutation. History operates on documents, not execution.
### Trade-offs and risks

mapping live thread identity to presentation requires stale identity handling and bounded persistence.
### Verification

pure model invariants, explicit launch tests, authorization tests and reload scenarios.
