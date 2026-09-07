# Dockside Filter Rework

## Request

> Update the Dockside plugin by reworking its thread filter system into a compact, reference-inspired workspace filter control: replace the current preset-only select with a clearer filter experience accessible from the filter icon beside Workspaces, preserving existing filtering behavior and matching Dockside/BB visual conventions. Add focused tests and verify the plugin UI.

## Goal

Make Dockside's thread filters change how the sidebar is organized, not merely
which project groups remain. The Workspaces header exposes a compact filter
button with a new Status view that groups families under visible semantic
status headings like the supplied reference.

## Acceptance Criteria

- [ ] [AC-1] The sidebar section is labelled `Workspaces` and retains the
  current visible-workspace count, selection action, and compact filter action.
- [ ] [AC-2] Activating the filter action opens a menu titled `Filter
  workspaces` whose options are grouped into `Status` and `Inactivity` and
  describe what each option includes.
- [ ] [AC-3] All, Working, Needs you, Unread, Quiet, Quiet 1d+, and Quiet 7d+
  retain their current matching, ordering, hierarchy, and search-composition
  behavior.
- [ ] [AC-4] The selected option has a visible check state, the trigger has an
  accessible label naming the selected filter, and a non-All selection leaves
  a compact active-filter label beside the icon.
- [ ] [AC-5] Choosing All removes the active label and restores parked shelves
  and reorder eligibility exactly as before.
- [ ] [AC-6] Choosing Status replaces project sections with ordered semantic
  sections for Failed, Needs you, Working, Unread, Inactive, and Stale; empty
  sections are omitted and every family appears exactly once.
- [ ] [AC-7] Status sections show the existing semantic icon/color, label, and
  family count, preserve row interactions and child expansion, and compose with
  host search without changing the underlying family status rules.
- [ ] [AC-UI-1] [UI] The closed and open controls are legible in BB's sidebar,
  keyboard operable, token-themed, and remain compact at narrow width.

<!-- Acceptance contract refined above.
-->

## Scope

- Dockside's project/workspace section header and filter-menu presentation.
- Static metadata for grouping and describing the seven existing presets.
- Focused behavioral/contract tests and a live plugin UI check.

## Non-goals

- Combining or persisting filter selections.
- Replacing project view permanently; Status is a selectable alternate view.
- Changing thread lifecycle, bulk deletion, search, ordering, settings, or
  backend APIs.

## Verification

- Run Dockside's focused thread-management and filter UI contract tests.
- Run Dockside typecheck/build and the repository check suite.
- Install/reload the local Dockside plugin and capture browser screenshot
  evidence of the filter control in the BB sidebar.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
