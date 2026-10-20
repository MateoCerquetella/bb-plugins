# Design: Plugin releases and Aura title bar

## Source changes

1. Update the two Taskboard install commands from `^0.3.4` to `^0.3.5`.
2. Scope Aura's direct `.aura-capy-layer` child below
   `--bb-window-title-bar-height` when an ancestor has `data-framed`.
3. Add a lifecycle regression that exercises framed and unframed panels through
   Aura's public content-script mount.

Aura keeps the existing panel targets and effect lifecycle. The host already
owns both facts needed for the offset: `data-framed` identifies the framed
desktop layout, and `--bb-window-title-bar-height` identifies its title band.
The CSS rule changes no narrow or unframed layout because those layouts do not
have the framed ancestor.

## Verification and release order

1. Run the complete Action Topbar, Taskboard, and Aura focused checks.
2. Install and reload Aura locally. Use the dedicated BB Surf session to
   capture thread and new-thread evidence in framed and unframed layouts.
3. Commit the reviewed source and test changes.
4. Create `action-topbar/v0.1.2` and `taskboard/v0.3.5` only from the verified
   commit. Confirm each peeled tag, manifest version, and public GitHub release.
5. Update the Taskboard marketplace record without changing its id, source,
   subdirectory, range, or tag prefix. Validate the marketplace contribution
   and open or update its pull request.
6. Merge only exact reviewed heads with passing required checks. Close issue
   #92 only after the Aura fix merges.

## Failure boundaries

- A failed focused check blocks its plugin tag and release.
- Missing browser evidence blocks the Aura merge and issue closure.
- A moved review head requires a new review and verification.
- Marketplace PR #621 remains separate and open until a maintainer supplies
  its required `v1-change` label.
- Private plugins remain absent from marketplace changes.
