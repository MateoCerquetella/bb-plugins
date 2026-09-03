# Host Monitor Grafana Fleet

## Purpose

Define page-contained, Grafana-inspired observability for every BB machine with
a neutral sidebar summary and no notification or destructive-control surfaces.

## ADDED Requirements

### Requirement: Every enrolled machine is represented

Host Monitor SHALL enumerate every enrolled BB machine and preserve an
independent current state and bounded history for each machine.

#### Scenario: One machine is offline

- GIVEN several machines are enrolled and one is disconnected
- WHEN Host Monitor refreshes the fleet
- THEN every machine remains visible
- AND connected machines update without waiting for or being hidden by the
  disconnected machine.

### Requirement: Grafana-inspired in-page dashboard

Host Monitor SHALL render overview and per-machine telemetry as dense,
theme-safe panels within its nav page.

#### Scenario: Operator selects a machine

- GIVEN the fleet overview is open
- WHEN the operator selects one machine
- THEN the same page shows its current CPU, RAM, disk, load, uptime, network,
  and system facts plus bounded utilization/load/network history
- AND no popup or floating overlay opens.

### Requirement: Neutral sidebar presence

Host Monitor SHALL use its branded nav icon and a presentational connected/total
sidebar accessory that communicates no warning or notification state.

#### Scenario: Fleet connectivity changes

- WHEN a machine connects or disconnects
- THEN the accessory updates its connected/total text
- AND selecting the Host Monitor row navigates to the dashboard page.

### Requirement: Notification-free fleet monitoring

Host Monitor SHALL keep warnings and failures within page panels and SHALL NOT
emit or mount toast, browser, desktop, badge, banner, popup, or floating
notification surfaces.

#### Scenario: One host sample fails

- WHEN one connected host times out
- THEN that machine panel shows an inline error or stale state
- AND other panels remain current
- AND no out-of-page notification is created.
