# Dockside Thread Management Delta

## MODIFIED Requirements

### Requirement: Dockside filters its project-first hierarchy by intent

Dockside MUST offer compact All, Working, Needs you, Unread, Quiet, Quiet 1d+,
and Quiet 7d+ presets plus a Status view from the Workspaces header. Status MUST
replace project sections with ordered semantic Failed, Needs you, Working,
Unread, Inactive, and Stale sections while selected. Empty sections MUST be
omitted and each family MUST occur exactly once. The filter menu MUST group
status-oriented and inactivity-oriented choices, explain each choice, and mark
the current selection. A non-All selection MUST remain apparent when the menu
is closed. Filtering MUST compose with host search while preserving project
order, root context for matching children, and existing status styling.

#### Scenario: User narrows the sidebar to old quiet work

- **Given** workspaces contain working, unread, recent quiet, and old quiet roots
- **When** the user opens `Filter workspaces` and chooses `Quiet 7d+`
- **Then** only quiet families at least seven days old remain
- **And** their project and child hierarchy is unchanged
- **And** the closed Workspaces header shows `Quiet 7d+` as active

#### Scenario: User inspects available filters

- **Given** the All filter is active
- **When** the user opens the Workspaces filter menu
- **Then** Working, Needs you, and Unread appear in the Status group
- **And** Quiet, Quiet 1d+, and Quiet 7d+ appear in the Inactivity group
- **And** each option explains which families it includes
- **And** All is visibly selected

#### Scenario: User groups the sidebar by status

- **Given** workspaces contain needs-you, working, unread, inactive, and stale families
- **When** the user chooses `Status`
- **Then** project headers are replaced by semantic status section headers
- **And** each family appears once beneath its resolved family status
- **And** the status icon, label, count, row interactions, children, and search behavior remain available
