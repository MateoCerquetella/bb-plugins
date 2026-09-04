# Host Monitor Bottom Icon Surface

## Purpose

Define the sole native BB entry point and dense plugin-detail presentation for
the existing Host Monitor fleet dashboard.

## ADDED Requirements

### Requirement: Bottom icon is the sole main-sidebar presence

Host Monitor SHALL register one host-rendered bottom sidebar action that calls
`openSettings()` and SHALL NOT register a `navPanel`, sidebar accessory,
sidebar replacement, or content script.

#### Scenario: Operator views the main BB sidebar

- GIVEN Host Monitor is enabled
- THEN one accessible Host Monitor Activity icon appears in the bottom actions
- AND no Host Monitor page row appears among BB's main sidebar pages
- AND every unrelated BB sidebar item remains unchanged.

### Requirement: Icon opens the complete monitor surface

Host Monitor SHALL render its existing fleet dashboard through a native
`settingsSection` in the plugin detail reached by the bottom action.

#### Scenario: Operator activates the icon

- WHEN the Host Monitor bottom icon is activated
- THEN BB opens the Host Monitor plugin detail
- AND the same surface exposes all enrolled hosts, selected-host metrics,
  historical charts, system facts, and per-host panel configuration.

### Requirement: Dense reference-aligned presentation

The monitor SHALL use BB theme tokens and the supplied Machine Monitor
reference's dense chart-and-card hierarchy without copying its branding.

#### Scenario: Operator uses a narrow viewport

- GIVEN the monitor is open at 390px
- THEN charts and editor controls stack into one readable column
- AND the document has no horizontal overflow
- AND all controls remain keyboard-addressable.

### Requirement: Notification-free icon surface

The bottom action and monitor SHALL NOT create a popup, floating window,
notification, alert banner, warning badge, IP reveal, or process-control action.

#### Scenario: A host or configuration request fails

- WHEN an RPC returns an error
- THEN the failure is rendered inline in the monitor surface
- AND no out-of-surface notification appears.
