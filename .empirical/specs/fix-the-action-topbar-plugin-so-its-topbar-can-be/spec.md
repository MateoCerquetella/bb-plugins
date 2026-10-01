# Fix The Action Topbar Plugin So Its Topbar Can Be

## Request

> Fix the Action Topbar plugin so its topbar can be dragged again, and ensure the topbar and its opened component/menu stack above all other BB UI, including the right sidebar which currently obscures it.

## Goal

Keep Action Topbar tab and Action gestures active from pointer-down through
drop, and keep its launcher and drag feedback visible above BB's right sidebar
and other application chrome.

## Acceptance Criteria

- [ ] [AC-1] Pressing and moving a topbar tab beyond the drag threshold retains
  the pointer and starts the existing reorder/cross-pane drag flow.
- [ ] [AC-2] Ending or cancelling a topbar tab drag releases pointer capture and
  removes all transient drag state.
- [ ] [AC-3] Action rows in the launcher continue to invoke BB's host-owned
  Action split-drag API.
- [ ] [AC-UI-1] [UI] The Action launcher is rendered above the right sidebar
  and remains fully visible and interactive where their bounds overlap.
- [ ] [AC-UI-2] [UI] Topbar drag ghosts and drop overlays render above the
  launcher, right sidebar, and ordinary BB application chrome.
- [ ] [AC-UI-3] [UI] Topbar tab buttons suppress browser touch gestures so a
  pointer drag is not cancelled by native panning.

## Scope

- Pointer lifecycle for topbar tab dragging.
- Stacking levels for the topbar, launcher, drag ghost, and drop overlay.
- Focused contract tests covering pointer capture, touch suppression, and
  overlay ordering.

## Non-goals

- Changing BB's host-owned split-drag implementation or pane drop semantics.
- Changing which Actions or tabs appear in the launcher.
- Redesigning the topbar, launcher, or right sidebar.
- Publishing or releasing the plugin.

## Verification

- Run `npm run test --workspace=bb-plugin-action-topbar`.
- Run `npm run typecheck --workspace=bb-plugin-action-topbar`.
- Build and reload the local Action Topbar plugin, then exercise a tab drag and
  an Action drag with the right sidebar open.
- Capture browser evidence showing the launcher above the right sidebar.

## Capability Deltas

See `deltas/action-topbar-interaction.md`.
