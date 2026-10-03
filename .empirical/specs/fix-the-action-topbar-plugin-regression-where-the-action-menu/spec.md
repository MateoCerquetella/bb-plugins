# Fix The Action Topbar Plugin Regression Where The Action Menu

## Request

> Fix the Action Topbar plugin regression where the action menu opens with “Search open tabs or actions…” but actions cannot be dragged and instead show “Reload BB to load Action dragging support.” Restore working action dragging from the topbar menu, add regression coverage, and verify the plugin UI and relevant checks.

## Goal

Restore Action Topbar's Action-row drag workflow on the installed BB 0.45.0
client by porting the previously shipped host Action-pane integration, while
keeping the plugin's launcher, pane ownership, and drag-only interaction
semantics intact.

## Acceptance Criteria

- [ ] [AC-1] BB 0.45.0 supplies Action Topbar's content script with a bounded
  Action split-drag callback for the initiating thread, Action, source element,
  and pointer coordinates.
- [ ] [AC-2] Dragging an Action row from the topbar launcher engages after the
  existing movement threshold and opens or moves the requested host-owned
  Action pane at a valid workspace split target.
- [ ] [AC-3] Pointer release, cancellation, Escape, plugin reload, and invalid
  requests clean up drag state without leaving an overlay, ghost, captured
  pointer, or partially persisted pane.
- [ ] [AC-4] The topbar no longer reports "Reload BB to load Action dragging
  support." on the repaired BB 0.45.0 client.
- [ ] [AC-5] Existing BB 0.45.0 thread panes, secondary-panel tabs, terminal
  lifecycle, plugin panel actions, and split persistence continue to work.
- [ ] [AC-UI-1] [UI] In the installed BB client, the Action Topbar launcher
  opens above host chrome and an Action can be visibly dragged to a pane target.

## Scope

- Port the preserved 0.44.0 Action-pane and content-script drag integration to
  the exact BB 0.45.0 source used by the installed client.
- Add or update focused core and plugin regression coverage for the bridge,
  Action pane lifecycle, pointer cleanup, and missing-support message.
- Build an isolated 0.45.0 client, back up the installed client assets, install
  the verified frontend, and reload the Action Topbar plugin when required.

## Non-goals

- Publishing BB, the plugin, or a marketplace release.
- Replacing host-rendered Action content with plugin-owned panel replicas.
- Changing unrelated BB 0.45.0 behavior or adopting unreleased upstream main.
- Removing the plugin's compatibility guard for genuinely unsupported clients.

## Verification

- Run focused BB tests covering the plugin frontend context, Action split drag,
  Action pane renderer, split persistence/navigation, and terminal lifecycle.
- Run BB app and Plugin SDK typechecks for the ported source.
- Run Action Topbar typecheck, tests, and build against the pinned workspace
  toolchain.
- Build the exact BB 0.45.0 frontend and compare or validate installed assets.
- Use the bound Steel browser session for a live drag and screenshot check
  after installation and reload.

## Risks

- BB 0.45.0 changed split-pane, plugin SDK, and frontend lifecycle code after
  the 0.44.0 patch; a mechanical carry-over could corrupt pane persistence or
  terminal cleanup.
- Replacing installed frontend assets can interrupt open clients, so the exact
  original asset directory must be backed up and the replacement must be
  reversible.
- The patch is local to this BB installation and can be overwritten by a future
  BB upgrade unless it is later upstreamed or repackaged.

## Capability Deltas

See `deltas/action-topbar-distribution.md`.
