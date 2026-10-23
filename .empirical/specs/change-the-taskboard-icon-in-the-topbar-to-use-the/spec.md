# Change The Taskboard Icon In The Topbar To Use The

## Request

> Change the Taskboard icon in the topbar to use the actual Taskboard icon already used by the “Open in sidebar” action. Keep the change simple and localized.

## Goal

Show Taskboard in Action Topbar with the same target/dart visual identity used
by Taskboard's sidebar and panel actions.

## Acceptance Criteria

- [ ] [AC-1] Taskboard action and fallback tab icons in Action Topbar render as
  a target with a dart rather than a clipboard with a checkmark.
- [ ] [AC-UI-1] [UI] The Taskboard icon remains legible at the existing topbar
  icon size and inherits the surrounding control color.
- [ ] [AC-2] Opening, selecting, dragging, and closing Taskboard tabs retain
  their existing behavior.

## Scope

- Update Action Topbar's existing Taskboard icon geometry.
- Verify the focused Action Topbar tests and the rendered UI.

## Non-goals

- Changing Taskboard navigation, actions, labels, layout, or branding assets.
- Adding dependencies or introducing a new icon component.

## Verification

- Run the Action Topbar test suite.
- Install/reload the local Action Topbar plugin and inspect Taskboard in the
  topbar through BB Surf.
## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
