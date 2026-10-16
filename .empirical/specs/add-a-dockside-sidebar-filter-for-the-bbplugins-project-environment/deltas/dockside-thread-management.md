# Dockside Thread Management Delta

## ADDED Requirements

### Requirement: Thread machine identity

Root and child rows MUST show the BB-provided host name even when a branch is
present, without inventing a machine name when host data is absent.

#### Scenario: Branch and host are available

- Given a thread on Jupiter with a branch
- When its root or child row appears
- Then both Jupiter and the branch are shown in the secondary metadata row.

## MODIFIED Requirements

### Requirement: Dockside filters its project-first hierarchy by intent

Dockside MUST offer compact All, Status, Working, Needs you, Unread, Quiet,
Quiet 1d+, and Quiet 7d+ presets. The same filter menu MUST list every project
represented in the active project groups. Selecting a project MUST keep only
that complete project group visible. Filtering MUST compose with host search
while preserving project order, root context for matching children, and
existing status styling. The filter trigger MUST visibly and accessibly name
the active preset or project.

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
