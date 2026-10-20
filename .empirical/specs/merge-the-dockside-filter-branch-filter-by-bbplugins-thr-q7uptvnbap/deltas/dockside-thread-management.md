# Dockside Thread Management Delta

## MODIFIED Requirements

### Requirement: Dockside filters its project-first hierarchy by intent

Dockside MUST offer compact All, Status, Working, Needs you, Unread, Quiet,
Quiet 1d+, and Quiet 7d+ presets. The same filter menu MUST list every project
represented in the active project groups. Selecting a project MUST keep only
that complete project group visible. Dockside MUST also offer a Failed preset
and MUST let the user group families by Projects, Status, or Environment.
Environment grouping MUST keep same-named environments on different hosts in
separate sections with a stable label. Filtering MUST compose with host search
while preserving project order, root context for matching children, and
existing status styling. The filter trigger MUST visibly and accessibly name the
active preset or project.

#### Scenario: User narrows the sidebar to the bbplugins project

- **Given** the active inbox contains `bbplugins` and another project
- **When** the user selects `bbplugins` in the workspace filter
- **Then** only the `bbplugins` project group remains visible
- **And** its thread families retain their order and hierarchy
- **And** the filter trigger displays `bbplugins`

#### Scenario: User restores every project

- **Given** the workspace filter is scoped to one project
- **When** the user selects All
- **Then** every active project group is visible again

#### Scenario: User narrows the sidebar to old quiet work

- **Given** projects contain working, unread, recent quiet, and old quiet roots
- **When** the user chooses `Quiet 7d+`
- **Then** only quiet families at least seven days old remain
- **And** their project and child hierarchy is unchanged

#### Scenario: User groups the sidebar by status or environment

- **Given** the sidebar contains working, failed, needs-you, and idle families
- **When** the user chooses the `Status` grouping
- **Then** families are grouped under their semantic status headings
- **And** the `Failed` preset selects only families with a failed run
- **And** choosing `Environment` groups families by execution environment
- **And** a same-named environment on another host stays in a separate section
