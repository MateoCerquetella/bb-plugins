# Activity Overview Dashboard

## Purpose

Provide a compact, local-first activity summary so BB users can scan their
contributions, review workload, and follow-up items from one native plugin
surface.

## ADDED Requirements

### Requirement: Local activity overview dashboard
The plugin MUST render a self-contained Overview dashboard with headline
activity metrics, trend details, a contribution calendar, and attention items.

#### Scenario: Dashboard opens with overview content
- **WHEN** a user opens New Thread
- **THEN** the dashboard appears below the composer through the homepage section
  without requiring a Settings or action-panel visit.
- **THEN** the Overview heading, four headline metrics, contribution heatmap,
  streak callouts, and needs-your-attention list are visible together.

### Requirement: Filtered dashboard summary
The plugin MUST expose period and repository selectors whose selected values
drive the displayed summary data.

#### Scenario: User changes the period
- **WHEN** a user selects a different period
- **THEN** the selected control updates and headline metric values and activity
  annotations refresh to the corresponding local dataset.

#### Scenario: User changes the repository
- **WHEN** a user selects a repository
- **THEN** the selected repository is reflected in the control and the visible
  summary is recalculated for that repository.

### Requirement: Accessible responsive presentation
The plugin MUST use labelled semantic controls, keyboard-visible focus states,
and a responsive layout that remains usable on narrow viewports.

#### Scenario: Keyboard navigation
- **WHEN** a user tabs through the dashboard
- **THEN** selectors and actionable attention items receive a visible focus
  indicator in a logical order.
