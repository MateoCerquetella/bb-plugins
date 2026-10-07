# Dockside Thread Management Specification

## Purpose

Define the compact project-level controls that let a Dockside user narrow a
large sidebar, start work in the correct project, and permanently remove
multiple quiet thread families without endangering active or unread work.

## Requirements

### Requirement: Dockside filters its project-first hierarchy by intent

Dockside MUST offer compact All, Working, Needs you, Unread, Quiet, Quiet 1d+,
and Quiet 7d+ presets. Filtering MUST compose with host search while preserving
project order, root context for matching children, and existing status styling.

#### Scenario: User narrows the sidebar to old quiet work

- **Given** projects contain working, unread, recent quiet, and old quiet roots
- **When** the user chooses `Quiet 7d+`
- **Then** only quiet families at least seven days old remain
- **And** their project and child hierarchy is unchanged
- **And** the Projects header shows that a filter is active

### Requirement: Bulk deletion is explicit and state-safe

During selection mode, the complete eligible root row MUST act as the native
checkbox selection target. Ordinary row click MUST toggle one family and set
the anchor. Shift+click MUST apply the target's intended selected state across
the inclusive visible eligible range. Checkbox clicks MUST retain identical
behavior. Protected row clicks MUST neither select nor navigate.

All preview, confirmation, one-use token, descendant binding, revalidation,
partial outcome, filter/search/order, and protected-family guarantees remain.

#### Scenario: User Shift-selects by clicking row titles

- **Given** selection mode shows eligible A, protected B, and eligible C
- **And** the user clicks anywhere on A's root row
- **When** the user Shift+clicks anywhere on C's root row
- **Then** A and C are selected
- **And** B remains disabled and unselected
- **And** no thread opens

### Requirement: Every project can start a native project-scoped thread

Each Dockside project header MUST expose an accessible `+` control that opens
BB's native New Thread composer with that project selected and prompt focus.
BB MUST remain responsible for resolving the project's configured
workspace/folder.

#### Scenario: User starts a thread from a project header

- **Given** a project has a configured default source/workspace
- **When** the user activates its `+` button
- **Then** BB opens the native New Thread composer
- **And** that project is selected
- **And** its normal workspace/folder context is used
- **And** compact/mobile sidebar navigation closes correctly

### Requirement: Real child-thread families default to an open connector tree

Dockside MUST expand a root family by default whenever BB reports one or more
real child threads, including when those children are completed and read. A
user MUST still be able to collapse or reopen the family during that mounted
session, and search MUST reveal matching descendants.

#### Scenario: Three dummy children finish

- **Given** a visible root has three visible BB child threads
- **And** all three children become idle and read
- **When** Dockside renders the family without a user override
- **Then** all three child rows remain visible below the root
- **And** the vertical/horizontal connector and row status presentation remain

### Requirement: Aggregate headers avoid duplicate status chrome

The child disclosure MUST use a numeric count and chevron without the words
`agent` or `agents`. Project headers MUST NOT stack needs-you, working, and
unread glyphs; they MUST retain their name, count, create action, chevron, and
accessible status summary while row-level status remains authoritative.

#### Scenario: Project contains working and unread roots

- **Given** one project has both a working root and an unread root
- **When** its project header renders
- **Then** no working/unread glyph pair is drawn in the project header
- **And** each root row still displays its own Working or Unread treatment

### Requirement: Rows show semantic pull-request context

Dockside MUST show one PR indicator per family on the root only. The root's
trailing column MUST show elapsed time first and `#number` plus semantic icon
directly beneath it. Child rows MUST NOT look up or render PR metadata.

#### Scenario: Root and three children share a branch PR

- **Given** an expanded root has three children on the same PR branch
- **When** Dockside renders the family
- **Then** the root shows one PR number/icon below elapsed time
- **And** no child repeats that PR metadata

### Requirement: Completed rows show only real bounded outcomes

Dockside MUST NOT show Done text or a completion/check icon on ordinary no-PR
roots or children and MUST NOT fetch final output for sidebar completion.

#### Scenario: No-PR thread has final output

- **Given** an ordinary thread is quiet and has final assistant output
- **When** Dockside renders it
- **Then** no check or Done completion metadata appears
- **And** the row retains status glyph, title, location, and age

### Requirement: Active child work has one family orchestration signal

While a child works, Dockside MUST show one primary activity icon on the root
and tint the existing connector. The child MUST rely on its existing left
status glyph and MUST NOT add a second live-status word or icon.

#### Scenario: One child starts work

- **Given** an expanded family has one working child
- **When** Dockside renders it
- **Then** the root shows one accessible activity icon
- **And** the connector is tinted
- **And** no Agents working or Working text is added

### Requirement: Semantic presentation is persistently customizable

Dockside MUST derive one readable family state with precedence Failed, Needs
you, Working, Unread, Stale, then Inactive. Stale means a quiet family whose
latest member update is at least seven days old. Each state MUST retain a
distinct icon shape, accessible label, hover/focus explanation, and customizable
effective color. Inactive and Stale MUST use separate muted roles and visually
recede. Ordinary threads MUST NOT be labelled Done.

#### Scenario: Old quiet family recedes

- **Given** a read family has no live work, failure, or pending interaction
- **And** its latest member update was at least seven days ago
- **When** Dockside renders it
- **Then** its state is Stale with the dim stale icon/badge and muted copy
- **And** it is not called Done

#### Scenario: Custom stale color is invalid

- **Given** Custom palette is selected
- **When** the stale field is not a six-digit hex color
- **Then** Dockside uses the safe stale default
- **And** Settings previews the same effective fallback

### Requirement: Dockside coexists with the current plugin workspace

Dockside MUST remain an independently installable plugin in the repository's
current npm workspace while Taskboard and every other plugin retained by main
remain present under their own identities. The obsolete t3sidebar identity
MUST NOT reappear, and resolving shared rename history MUST NOT change
Dockside's verified sidebar behavior or persisted settings.

#### Scenario: The Dockside branch incorporates current main

- **Given** main renamed the common t3sidebar ancestor to Taskboard
- **And** the feature branch renamed that ancestor to Dockside
- **When** the histories are reconciled
- **Then** both `plugins/taskboard` and `plugins/dockside` are installable
- **And** `plugins/t3sidebar` is absent
- **And** main's npm workspace checks pass
- **And** Dockside's verified thread-management behavior is unchanged

### Requirement: Root family cards have exactly two semantic rows

Every root MUST render exactly two compact fixed rows. Row one MUST contain the
family state/activity icon, truncated title, and far-right elapsed time. Row two
MUST contain truncated branch text and one shrink-resistant right cluster with
the readable state badge, root-only PR metadata, and child disclosure/count plus
provider identity. Children MUST never render PR metadata. Ambiguous icons MUST
offer hover and keyboard-focus help.

#### Scenario: Narrow multi-child PR family

- **Given** a root has a long title, long branch, a PR, and multiple children
- **When** the sidebar is narrow
- **Then** title and branch truncate before metadata
- **And** PR appears only on the root
- **And** the card remains exactly two rows without clipping

### Requirement: Root family order is durable and project-local

Dockside MUST let a user move an entire root/descendant family within its own
project using drag or keyboard controls. It MUST validate an exact permutation
of the project's visible canonical root IDs, preserve the pinned-leading
partition, persist the order in bounded versioned browser storage, ignore
malformed records safely, and announce keyboard outcomes. Reordering MUST be
disabled whenever selection mode, a non-All filter, or host search makes visible
order incomplete. Cross-project and stale/incomplete requests MUST fail closed.

#### Scenario: Keyboard move survives reload

- **Given** the unfiltered project list is complete
- **When** a keyboard user moves family C above family B
- **Then** C and all descendants move together
- **And** an accessible announcement describes the move
- **And** the order is restored after reload

#### Scenario: Search blocks reorder

- **Given** host search hides one family
- **When** the user attempts drag or keyboard reorder
- **Then** no order is stored or changed
- **And** accessible help explains that search must be cleared

### Requirement: Projects remain reachable before their first thread

Dockside MUST list known projects even when they contain no threads, and MUST
preserve an empty project's launcher when its project name matches search.

#### Scenario: A project has no threads

- **GIVEN** BB reports a project with no visible threads
- **WHEN** Dockside groups the inbox by project
- **THEN** the project appears with an empty family list
- **AND** its new-thread action remains available

#### Scenario: Search matches an empty project

- **GIVEN** an empty project appears in Dockside
- **WHEN** the user searches for part of the project name
- **THEN** Dockside keeps the project group in the results
- **AND** its family list remains empty
