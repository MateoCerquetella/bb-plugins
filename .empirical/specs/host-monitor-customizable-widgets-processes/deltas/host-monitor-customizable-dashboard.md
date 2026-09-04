# Host Monitor Customizable Dashboard

## Purpose

Define the BB-native multi-host dashboard, its persisted widget arrangement,
passive resource presentation, and its conservative selected-host process
inspection and control workflow.

## ADDED Requirements

### Requirement: Per-host dashboard configuration

Host Monitor SHALL persist a bounded catalog-backed widget order and visibility
configuration independently for each enrolled BB host, migrating the previous
panel configuration without losing supported entries.

#### Scenario: Operator customizes one host

- GIVEN two enrolled hosts have independent dashboards
- WHEN the operator hides a widget, reorders another, and saves on the first host
- THEN reload restores that arrangement on the first host and leaves the second
  host unchanged.

### Requirement: Native monitor presentation

Host Monitor SHALL render its dedicated page with BB visual and interaction
conventions and SHALL preserve explicit loading, empty, error, stale, and
disconnected states at narrow and wide viewport sizes.

#### Scenario: Disconnected host is selected

- GIVEN an enrolled host is disconnected
- WHEN its dashboard is selected
- THEN retained supported readings remain distinguishable from live data and
  widgets that require a connection present an explicit disconnected state.

### Requirement: Passive resource guides

Host Monitor SHALL keep resource guide evaluation passive and SHALL NOT expose
numeric threshold controls or numeric guide chips in its monitor surfaces.

#### Scenario: Resource exceeds its guide

- GIVEN a fresh resource value exceeds its configured internal guide
- WHEN the operator views the host
- THEN the value receives semantic passive emphasis without a notification,
  alert badge, or numeric threshold control.

## ADDED Requirements

### Requirement: Accessible widget arrangement

Host Monitor SHALL allow catalog widgets to be shown, hidden, and reordered by
pointer and keyboard-accessible controls, with changes saved explicitly per
host and a deterministic reset-to-default option.

#### Scenario: Operator reorders without dragging

- GIVEN dashboard customization mode is open
- WHEN the operator activates a widget's move-earlier or move-later control
- THEN the preview order changes identically to drag-and-drop and the update is
  announced to assistive technology.

### Requirement: Selected-host process operations

Host Monitor SHALL expose bounded process information and conservative,
identity-bound termination controls only for the explicitly selected connected
host, using BB's enrolled-host transport.

#### Scenario: Operator ends an actionable process

- GIVEN a same-user non-system process has a verified opaque lifetime identity
- WHEN the operator requests a supported termination mode, accepts the fresh
  confirmation, and the identity remains unchanged
- THEN the host worker sends only that fixed operating-system termination signal
  and the UI refreshes the bounded process list with an inline result.

#### Scenario: Process is protected

- GIVEN a process is the monitor, its ancestor, a system process, owned by a
  different user, unverified, or inspected from an elevated monitor session
- WHEN process rows render
- THEN the row explains its protected state and exposes no termination action.
