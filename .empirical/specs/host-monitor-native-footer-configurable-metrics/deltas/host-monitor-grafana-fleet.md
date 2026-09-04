# Host Monitor Grafana Fleet

## Purpose

Define native BB access and safe per-host dashboard customization on top of the
existing notification-free Host Monitor fleet telemetry capability.

## ADDED Requirements

### Requirement: Native bottom-left access

Host Monitor SHALL register a host-rendered BB sidebar footer action whose
semantic Activity icon and accessible label open the plugin's monitor
`settingsSection` through the host-provided `openSettings()` action. It SHALL
NOT register a `navPanel` or sidebar accessory.

#### Scenario: Operator opens Host Monitor from the sidebar footer

- GIVEN BB's sidebar is visible
- WHEN the operator activates the Host Monitor footer icon
- THEN BB navigates to the Host Monitor plugin detail containing the dashboard
- AND no Host Monitor page row, popup, floating dashboard, or notification is
  present.

### Requirement: Per-host dashboard configuration

Host Monitor SHALL persist one bounded, strictly validated ordered panel list
per enrolled BB host id and SHALL resolve a documented default when no valid
configuration exists.

#### Scenario: Two hosts use different dashboards

- GIVEN two machines are enrolled in BB
- WHEN the operator saves different panel lists for each machine
- THEN selecting either machine renders its own panel list
- AND reloading the plugin preserves both independent configurations.

### Requirement: Accessible in-page panel editing

Host Monitor SHALL provide page-contained controls to add, remove, reorder,
and choose supported visualizations for metric panels.

#### Scenario: Operator customizes an offline host

- GIVEN an enrolled host is disconnected
- WHEN the operator enters edit mode, adds a supported metric panel, and saves
- THEN the configuration persists for that host
- AND the page represents unavailable live values without blocking the edit.

### Requirement: Grafana-inspired in-page dashboard

Host Monitor SHALL render fleet overview and per-machine telemetry as dense,
theme-safe panels inside BB's host-owned plugin-detail shell, and the selected
machine's dashboard SHALL follow its persisted configuration.

#### Scenario: Realtime telemetry arrives during editing

- GIVEN the operator is editing one host's dashboard
- WHEN realtime telemetry causes fleet and history data to refresh
- THEN current panel values may update
- AND the unsaved ordered panel draft and selected host remain unchanged.

### Requirement: Notification-free fleet monitoring

Host Monitor SHALL keep sampling, configuration, and persistence failures
inline within the page and SHALL NOT emit or mount toast, browser, desktop,
badge, banner, popup, popover, or floating notification surfaces.

#### Scenario: Saving a dashboard fails

- WHEN the dashboard configuration RPC fails
- THEN edit mode remains available with the user's draft intact
- AND an inline status explains that the configuration was not saved
- AND no out-of-page notification is created.
