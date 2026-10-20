# Dockside Thread Management Delta

## MODIFIED Requirements

### Requirement: Dockside filters its project-first hierarchy by intent

Dockside MUST offer All, Working, Needs you, Failed, Unread, Quiet, Quiet 1d+,
and Quiet 7d+ filtering presets, and MUST let the user group the sidebar by
Projects, Status, or Environment. Filtering MUST compose with host search while
preserving project order, root context for matching children, and existing
status styling. Grouping by Environment MUST keep worktrees with the same name
on different hosts in separate sections and MUST show a stable section label.

#### Scenario: User narrows the sidebar to old quiet work

- **Given** projects contain working, unread, recent quiet, and old quiet roots
- **When** the user chooses `Quiet 7d+`
- **Then** only quiet families at least seven days old remain
- **And** their project and child hierarchy is unchanged
- **And** the Projects header shows that a filter is active

#### Scenario: User groups the sidebar by status or environment

- **Given** the sidebar contains working, failed, needs-you, and idle families
- **When** the user chooses the `Status` grouping
- **Then** families are grouped under their semantic status headings
- **And** choosing `Environment` groups families by execution environment
- **And** a same-named environment on another host stays in a separate section

#### Scenario: User isolates one project

- **Given** the sidebar shows several projects
- **When** the user chooses a single project filter
- **Then** only that project's families remain
- **And** clearing the filter restores the persisted project order
