# Add A Dockside Sidebar Filter For The Bbplugins Project Environment

## Request

> Add a Dockside sidebar filter for the bbplugins project/environment, matching Cursor-style project filtering and the grouped sidebar shown in the supplied screenshots. Preserve existing status and inactivity filters. The filter must narrow visible thread groups to the selected project, expose the active selection in the filter control, and include behavioral tests for filtering and UI contract coverage.

## Goal

Let a Dockside user narrow the sidebar to one BB project from the existing
workspace filter menu. The project list comes from BB's current project data,
so a `bbplugins` project appears without a hard-coded repository name.

## Acceptance Criteria

- [ ] [AC-1] The workspace filter lists every project currently represented in
  Dockside's active project groups.
- [ ] [AC-2] Selecting a project keeps only that project's thread family group
  visible while retaining its normal row order and hierarchy.
- [ ] [AC-3] Existing All, Status, status-state, and inactivity presets retain
  their current behavior.
- [ ] [AC-UI-1] [UI] The filter trigger shows the selected project's name and
  its accessible label names that active project.
- [ ] [AC-UI-2] [UI] Selecting All restores every project group.

## Scope

- The Dockside project-first active inbox.
- The existing workspace filter menu and trigger.
- Pure thread-group filtering and its behavioral tests.
- Source contract coverage for the project section and active label.

## Non-goals

- Hard-coding `bbplugins` or any other project name.
- Persisting the filter across reloads.
- Filtering Snoozed or Settled shelves.
- Adding a second toolbar control or changing project grouping.

## Verification

- Run Dockside's thread-management behavioral tests.
- Run Dockside's complete test and typecheck scripts.
- Install and reload the local Dockside plugin.
- Verify in BB that selecting the `bbplugins` project shows only that project,
  the trigger names it, and All restores the complete list.
## Capability Deltas

- `deltas/dockside-thread-management.md`
