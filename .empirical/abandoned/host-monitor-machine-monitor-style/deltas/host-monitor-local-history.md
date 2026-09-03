# Host Monitor Local History

## Purpose

Define the local, historical, notification-free Host Monitor experience and the
fleet/process-control surfaces that are intentionally absent from it.

## ADDED Requirements

### Requirement: Local historical telemetry

Host Monitor SHALL persist bounded samples for the BB server machine and return
downsampled history for the selected supported range.

#### Scenario: Operator changes the history range

- GIVEN Host Monitor has retained local samples
- WHEN the operator selects 7 days
- THEN the utilization and load charts show that period with no more than 720
  points per chart and preserve visible gaps in collection.

### Requirement: Cache and pressure diagnostics

Host Monitor SHALL present bounded cache/directory growth and Linux kernel memory
pressure diagnostics, with process attribution disabled unless explicitly
enabled in plugin settings.

#### Scenario: Attribution is disabled

- GIVEN process attribution is disabled
- WHEN memory diagnostics are available
- THEN pressure counters remain visible and workload names and PIDs are not
  collected or displayed.

### Requirement: Notification-free feedback

Host Monitor SHALL communicate current values, warnings, failures, and missing
data within its panel without emitting notifications or mounting a notification
accessory.

#### Scenario: A collector read fails

- GIVEN the local collector reports an error
- WHEN the panel refreshes
- THEN the error is shown as inline text and no toast, desktop notification,
  sidebar warning dot, or alert banner is created.

## ADDED Requirements

### Requirement: Host Monitor scope

Host Monitor SHALL monitor the BB server machine rather than enumerate all
enrolled execution hosts, while retaining the Host Monitor install identity.

#### Scenario: Plugin opens

- GIVEN Host Monitor is installed
- WHEN the operator opens `/plugins/host-monitor/host-monitor`
- THEN the panel identifies the local deployment machine and shows compact
  current and historical telemetry under the Host Monitor navigation item.

## ADDED Requirements

### Requirement: Fleet controls and destructive process actions

Host Monitor SHALL NOT expose the former fleet matrix, floating overlay, IP
reveal, enrolled-host worker, or process-stop workflow.

#### Scenario: Operator inspects local diagnostics

- GIVEN the new Host Monitor panel is open
- WHEN process diagnostics are enabled
- THEN the operator can read the bounded ranking but cannot request graceful or
  forced process termination from the plugin.
